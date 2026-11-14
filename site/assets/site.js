// Renders the whole page from data/stats.json, which is regenerated whenever new games are added.
const ROLES = [["all", "All"], ["flank", "Flank"], ["pocket", "Pocket"]];

let D, gamesById, category, role = "all";   // role: the players table's filter
let PG;                             // every player in every game: who, which game, civ, role, won
const refresh = [];                 // redraws that depend on the players table's role or civs

fetch("data/stats.json", { cache: "no-cache" })
  .then((r) => r.json())
  .then((data) => {
    D = data;
    gamesById = Object.fromEntries(D.games.map((g) => [g.tag, g]));
    PG = D.pg.map(([p, g, civ, role, w]) => ({ p, g, civ, role, w: !!w }));
    D.boards.list.forEach((b) => { if (b.civs) cardCivs[b.id] = { mode: b.civs.mode, civs: new Set(b.civs.civs) }; });
    soloCopy();
    links();
    summary();
    groups();
    bracket();
    replaySection();
    roleSwitches();
    categories();
    teamTable();
    playerTable();
    civRows();
    curveSection();
    headToHead();
    stripes();
  })
  .catch((e) => {
    document.querySelectorAll(".loading").forEach((el) => (el.textContent = "The data could not be loaded. Try reloading the page."));
    console.error(e);
  });

// ---------------------------------------------------------------- helpers

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const team = (k) => (D.teams[k] ? D.teams[k].name : k);
const teamOf = (p) => (D.meta.solo ? "" : `${esc(team(D.people[p].team))} · `);   // "<team> · ", nothing in a 1v1
const player = (id) => (D.people[id] ? D.people[id].name : id);
// the in-game name, where it differs from the Liquipedia name shown
const alias = (id) => (D.people[id] && D.people[id].ingame !== D.people[id].name ? D.people[id].ingame : "");
const aliasNote = (id) => (alias(id) ? ` (in game: ${esc(alias(id))})` : "");

function emblem(civ) {
  const src = D.emblems[civ];
  return src ? `<img class="emblem" src="${esc(src)}" alt="" width="18" height="18" loading="lazy">` : "";
}
const civTag = (civ) => `<span class="civ">${emblem(civ)}${esc(civ)}</span>`;

function time(s) {
  if (s == null) return "–";
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function value(v, fmt) {
  if (v == null) return "–";
  if (fmt === "time") return time(v);
  if (fmt === "pct") return `${v.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  if (fmt === "dec1") return v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (fmt === "dec2") return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (fmt === "kres") {
    // CaptureAge rounds this above 10,000, so it is shown the way CaptureAge shows it
    if (v < 10000) return Math.round(v).toLocaleString("en-US");
    return (v < 100000 ? (v / 1000).toFixed(1).replace(/\.0$/, "") : Math.round(v / 1000)) + "K";
  }
  return Math.round(v).toLocaleString("en-US");
}

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

// a 1v1's two players with their civs
function sidesHtml(tag) {
  const g = gamesById[tag];
  return [g.a, g.b].map((s) => `${esc(player(g.teams[s][0].p))} ${civTag(g.teams[s][0].civ)}`).join(" v ");
}

// alternate sections on white, from the first one shown (the groups, or the records where there are none)
function stripes() {
  document.querySelectorAll("main > .section:not([hidden]):not(.replays):not(.about)").forEach((s, i) => s.classList.toggle("band", i % 2 === 0));
}

// a 1v1 collection's own wording, where the page's is about teams: [data-solo] holds the 1v1 text
function soloCopy() {
  if (!D.meta.solo) return;
  document.querySelectorAll("[data-solo]").forEach((el) => (el.textContent = el.dataset.solo));
  document.querySelectorAll("[data-solo-placeholder]").forEach((el) => (el.placeholder = el.dataset.soloPlaceholder));
}

function gameLabel(tag) {
  const g = gamesById[tag];
  return g ? `${team(g.a)} v ${team(g.b)} G${g.n}` : tag;
}

// where in the event a game was played: the playoff stage's name, else its round (and group, if any)
function gameStage(tag) {
  const g = gamesById[tag];
  if (!g) return "";
  return g.stage || `Round ${g.round}${g.group ? ` · Group ${g.group}` : ""}`;
}

function links() {
  document.querySelectorAll("[data-link]").forEach((a) => {
    const href = D.meta[a.dataset.link];
    if (href) a.href = href;
    else (a.closest("[data-link-wrap]") || a).hidden = true;     // a collection with no Liquipedia or Discord
  });
}

// ---------------------------------------------------------------- header

function summary() {
  const millions = (D.meta.data_points / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 });
  document.getElementById("data-points").textContent = `${millions} million data points from ${D.meta.games} games`;
  const date = new Date(D.meta.updated + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const cells = [
    [D.meta.games, "games captured"],
    [D.meta.registered, "players"],
    [date, "last update"],
  ];
  document.getElementById("summary").innerHTML = cells
    .map(([v, l]) => `<div><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`)
    .join("");
}

// ---------------------------------------------------------------- groups and results

function groups() {
  if (!Object.keys(D.groups).length) {          // not a tournament: no standings
    document.getElementById("groups").hidden = true;
    document.querySelectorAll('a[href="#groups"]').forEach((a) => (a.hidden = true));
    return;
  }
  const swiss = D.meta.format === "swiss";       // a Swiss stage: Median-Buchholz, and no team-by-team grid
  document.getElementById("group-tables").innerHTML = Object.entries(D.groups)
    .map(([g, { table, grid }]) => {
      const rows = table
        .map(
          (r, i) => `<tr class="${i === D.meta.advance - 1 ? "cut" : ""}">
            <td>${i + 1}</td>
            <td class="team">${esc(team(r.team))}</td>
            <td>${r.played}</td>
            <td>${r.sets_w}–${r.sets_l}</td>
            <td>${r.games_w}–${r.games_l}</td>
            <td class="${r.diff > 0 ? "pos" : r.diff < 0 ? "neg" : ""}">${r.diff > 0 ? "+" : ""}${r.diff}</td>
            ${swiss ? `<td>${r.buchholz}</td>` : ""}
          </tr>`
        )
        .join("");
      const order = table.map((r) => r.team);
      const cross = swiss ? "" : `<div class="crosstab-wrap"><table class="crosstab" aria-label="Group ${g} results by pairing">
        <thead><tr><th></th>${order.map((t) => `<th scope="col">${esc(team(t))}</th>`).join("")}</tr></thead>
        <tbody>${order
          .map(
            (a) => `<tr><th scope="row">${esc(team(a))}</th>${order
              .map((b) => {
                if (a === b) return `<td class="self" aria-label="same team"></td>`;
                const s = grid[`${a}|${b}`];
                if (!s) return `<td class="todo">–</td>`;
                const id = D.series.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)).id;
                return `<td class="${s[0] > s[1] ? "won" : "lost"}"><a href="#series-${id}" data-series="${id}">${s[0]}–${s[1]}</a></td>`;
              })
              .join("")}</tr>`
          )
          .join("")}</tbody></table></div>`;
      return `<div class="group">
        <h3>Group ${g}</h3>
        <table class="standings">
          <thead><tr><th></th><th>Team</th><th title="Series played">P</th><th title="Series won–lost">Series</th><th title="Games won–lost">Games</th><th title="Game difference">+/–</th>${swiss ? '<th title="Median-Buchholz: the series won by the team\'s opponents, leaving out the best and the worst">MB</th>' : ""}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="advance-note"><i></i>Top ${D.meta.advance} advance to the playoffs</p>
        ${cross}
        <div class="group-series">${D.series
          .filter((x) => x.group === g)
          .sort((x, y) => y.round - x.round)
          .map(seriesRow)
          .join("")}</div>
      </div>`;
    })
    .join("");
  // a score in the grid opens that series below it
  document.getElementById("group-tables").addEventListener("click", (e) => {
    const a = e.target.closest("a[data-series]");
    if (!a) return;
    e.preventDefault();
    const row = document.getElementById(`series-${a.dataset.series}`);
    row.open = true;
    row.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

// the playoffs: one column per stage, each series opening its games below
function bracket() {
  const el = document.getElementById("bracket");
  if (!D.bracket.length) return el.remove();
  const byId = Object.fromEntries(D.series.map((s) => [s.id, s]));
  const side = (s, t, w) => `<div class="slot ${s.winner === t ? "won" : ""}"><span>${esc(team(t))}</span><b>${w}</b></div>`;
  el.innerHTML = `<h3>Playoffs</h3>
    <div class="bracket-grid">${D.bracket
      .map(
        (st) => `<div class="stage"><p class="section-label">${esc(st.stage)}</p><div class="matches">${st.series
          .map((id) => byId[id])
          .map((s) => `<a class="match" href="#series-${s.id}" data-series="${s.id}">${side(s, s.a, s.score[0])}${side(s, s.b, s.score[1])}</a>`)
          .join("")}</div></div>`
      )
      .join("")}</div>
    <div class="group-series">${D.bracket
      .flatMap((st) => st.series)
      .map((id) => seriesRow(byId[id]))
      .join("")}</div>`;
  el.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-series]");
    if (!a) return;
    e.preventDefault();
    const row = document.getElementById(`series-${a.dataset.series}`);
    row.open = true;
    row.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

// a tournament captured without per-object positions has no replays
function replaySection() {
  if (D.meta.replays.length) return;
  document.getElementById("replays").remove();
  document.querySelector('nav a[href="#replays"]').remove();
}

// one series: a single line until opened, then each game with its civs
function seriesRow(s) {
  const games = s.games
    .map((tag) => {
      const g = gamesById[tag];
      const side = (t) =>
        `<div class="lineup ${g.winner === t ? "w" : ""}"><b>${esc(team(t))}</b>${g.teams[t]
          .map((p) => `<span title="${esc(player(p.p))}${aliasNote(p.p)}, ${p.role}">${emblem(p.civ)}${esc(p.civ)}</span>`)
          .join("")}</div>`;
      return `<div class="game">
        <b>G${g.n}</b>
        <span class="winner">${esc(team(g.winner))} won${g.parts > 1 ? " · restored once" : ""}${
          D.meta.replays.includes(g.tag) ? `<a class="watch" href="#replay-${g.tag}">Watch replay</a>` : ""
        }</span>
        <span class="len">${time(g.length)}</span>
        <div class="civs">${side(g.a)}${side(g.b)}</div>
      </div>`;
    })
    .join("");
  const [wa, wb] = s.score;
  return `<details class="series" id="series-${s.id}">
    <summary>
      <b><span class="${s.winner === s.b ? "lost" : ""}">${esc(team(s.a))}</span> ${wa}–${wb} <span class="${s.winner === s.a ? "lost" : ""}">${esc(team(s.b))}</span></b>
      <span>${esc(s.stage || `Round ${s.round}`)}</span>
    </summary>
    ${games}
  </details>`;
}

// ---------------------------------------------------------------- role filter (players table)

function roleSwitches() {
  if (D.meta.solo) {                            // 1v1: no flanks or pockets, and every player is a team
    document.querySelectorAll(".role-switch").forEach((el) => (el.parentElement.hidden = true));
    document.querySelectorAll("[data-teams]").forEach((el) => (el.hidden = true));
  }
  const el = document.querySelector("#players .role-switch");
  el.innerHTML = ROLES.map(([k, l]) => `<button type="button" data-role="${k}" aria-pressed="${k === role}">${l}</button>`).join("");
  el.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    role = btn.dataset.role;
    el.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.role === role));
    refresh.forEach((f) => f());
  });
}

// ---------------------------------------------------------------- records

// Every board ships its whole ranked list. Each card keeps its own role, civs and direction, and
// shows the rows that match, scrolling; a row's player-game says who, which game, civ and role.
const cardRole = {};
const cardCivs = {};               // card id -> {mode: "only" | "except", civs: Set}
const cardFlip = new Set();        // cards showing the other end of their list
const cardView = {};               // card id -> "alt" where a card with two views shows its other one

// the card as it shows now: its other view (one game against all games, or total against per game)
// laid over it when chosen; the other view brings its own order buttons, or none
function viewOf(b) {
  return b.alt && cardView[b.id] === "alt" ? { ...b, label: undefined, least: undefined, ...b.alt } : b;
}
let civPop = null;                 // the card (or "players") whose civ list is open
const views = {};                  // card id -> the rows it shows now, and how many are drawn
const FIRST_DRAWN = 40, MORE_DRAWN = 80;

const roleOk = (r, role) => r === "all" || role === r;
const civOk = (sel, civ) => !sel || !sel.civs.size || (sel.mode === "only") === sel.civs.has(civ);

function categories() {
  const sw = document.getElementById("category-switch");
  const cats = D.boards.categories.filter((c) => D.boards.list.some((b) => b.cat === c.id));
  if (D.awards.length) cats.push({ id: "awards", title: "Awards", blurb: "The awards published after the final." });
  sw.innerHTML = cats
    .map((c, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-cat="${c.id}">${esc(c.title)}</button>`)
    .join("");
  sw.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    sw.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", b === btn));
    category = btn.dataset.cat;
    civPop = null;
    showCategory();
    toTabTop();
  });
  const boards = document.getElementById("boards");
  boards.addEventListener("click", cardClick);
  boards.addEventListener("change", civTicked);
  boards.addEventListener("scroll", drawMore, true);    // scroll does not bubble; listen as it goes down
  document.addEventListener("click", closeCivsOutside);
  document.addEventListener("keydown", (e) => e.key === "Escape" && civPop && closeCivs(true));
  category = cats[0].id;
  showCategory();
}

// A tab opens at its top: from far down a long tab, a short one would otherwise leave the page
// showing whatever comes after it. Only when scrolled past the tab's start, under the sticky tab bar.
function toTabTop() {
  const bar = document.querySelector(".category-bar"), start = document.getElementById("category-blurb");
  const y = start.getBoundingClientRect().top + window.scrollY - bar.offsetHeight;
  if (window.scrollY > y) window.scrollTo({ top: y, behavior: "auto" });
}

// ---- which rows a card shows

const decoded = new Map();          // a board's shipped rows -> the same rows as objects, made once
function rowsOf(b, rows) {
  if (!decoded.has(rows))
    decoded.set(rows, b.scope === "match"
      ? rows.map(([g, v]) => ({ g, v }))
      : rows.map(([i, v, d, txt, o]) => ({ ...PG[i], v, d, txt, o })));
  return decoded.get(rows);
}

// each player's total (or average) over the games in view, ranked
function playerTotals(spec, r, sel, asc) {
  const inView = (x) => roleOk(r, x.role) && civOk(sel, x.civ);
  const played = new Map();
  for (const x of PG) if (inView(x)) played.set(x.p, (played.get(x.p) || 0) + 1);
  const acc = new Map();
  for (const [i, v, parts] of spec.vals) {
    if (!inView(PG[i])) continue;
    const a = acc.get(PG[i].p) || { sum: 0, n: 0, parts: [], never: 0 };
    if (v === null) {               // a game it never happened in: not in the average, but said on the row
      a.never += 1;
      acc.set(PG[i].p, a);
      continue;
    }
    a.sum += v;
    a.n += 1;
    if (parts !== undefined) a.parts.push(parts);
    acc.set(PG[i].p, a);
  }
  const out = [];
  for (const [p, a] of acc) {
    const n = spec.agg.avg ? a.n : played.get(p);
    if (!a.n || n < spec.agg.min) continue;
    if (spec.agg.ratio !== undefined) {
      // the totals' ratio (all kills over all deaths), not the average of each game's; none lost is ∞,
      // ranked above every finite ratio by a value no real one reaches
      const top = a.parts.reduce((s, x) => s + x[0], 0), bottom = a.parts.reduce((s, x) => s + x[1], 0);
      if (top < spec.agg.ratio) continue;
      out.push({ p, n, v: bottom ? Math.round((top / bottom) * 100) / 100 : 1e6 + top, txt: bottom ? null : "∞",
                 d: `${Math.round(top)} kills, ${Math.round(bottom)} deaths` });
      continue;
    }
    const never = a.never ? `never in ${a.never} game${a.never === 1 ? "" : "s"}` : null;
    out.push({ p, n, v: Math.round(((spec.agg.avg ? a.sum / a.n : a.sum) * 100)) / 100,
               d: [totalsDetail(spec.agg.detail, a.parts), never].filter(Boolean).join(" · ") || null });
  }
  return out.sort((x, y) => (asc ? x.v - y.v : y.v - x.v));
}

// "2× Wolf, 1× Boar" from counts, or "3 own, 1 allied" from named numbers
function totalsDetail(kind, parts) {
  if (!kind || !parts.length) return null;
  if (kind === "counter") {
    const count = new Map();
    for (const part of parts) for (const [k, n] of Object.entries(part)) count.set(k, (count.get(k) || 0) + n);
    const items = [...count].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    return items.length ? items.map(([k, n]) => `${n}× ${k}`).join(", ") : null;
  }
  const named = kind.map((label, j) => [Math.round(parts.reduce((s, p) => s + p[j], 0)), label]).filter(([n]) => n);
  return named.length ? named.map(([n, label]) => `${n} ${label}`).join(", ") : null;
}

function cardRows(b) {
  const r = cardRole[b.id] || "all", sel = cardCivs[b.id], flip = cardFlip.has(b.id);
  const side = flip && b.least ? b.least : b;
  let rows = side.rows.agg
    ? playerTotals(side.rows, r, sel, side.asc ?? b.asc)
    : rowsOf(b, side.rows).filter((x) => b.scope === "match" || (roleOk(r, x.role) && civOk(sel, x.civ)));
  if (b.one) {
    const seen = new Set();
    rows = rows.filter((x) => !seen.has(x.o) && seen.add(x.o));
  }
  if (flip && !b.least) rows = rows.slice().reverse();
  if (b.cap) rows = rows.slice(0, b.cap);
  return { side, rows };
}

// the civs a card's rows come from, for its civ list
function civsOf(b) {
  const civs = new Set();
  const add = (rows) => {
    if (!rows) return;
    if (rows.agg) rows.vals.forEach(([i]) => civs.add(PG[i].civ));
    else rowsOf(b, rows).forEach((x) => civs.add(x.civ));
  };
  if (b.scope === "war") D.war.forEach((x) => civs.add(x.a.civ).add(x.b.civ));
  else add(b.rows), b.least && add(b.least.rows);
  return [...civs].sort((a, c) => a.localeCompare(c));
}

// ---- drawing a card

// a row: the name (with the civ beside it), then one short line each for the game and any detail
function who(b, r) {
  if (b.scope === "match") return { main: gameLabel(r.g), lines: [D.meta.solo ? sidesHtml(r.g) : esc(gameStage(r.g))] };
  if (b.scope === "object")
    return { main: r.o, lines: [`${esc(player(r.p))} ${civTag(r.civ)}`, esc(gameLabel(r.g))] };
  if (b.scope === "player")
    return { main: player(r.p), lines: [`${teamOf(r.p)}${r.n} game${r.n === 1 ? "" : "s"}`, r.d ? esc(r.d) : ""] };
  return { main: player(r.p), civ: r.civ, lines: [esc(gameLabel(r.g)), r.d ? esc(r.d) : ""] };
}

const SCOPES = { game: "One game", player: "All games", object: "One unit or building, one game", match: "Whole game" };
const CIV_SCOPES = new Set(["game", "player", "object", "war"]);

function controls(b, r) {
  const shown = cardView[b.id] || "main";
  const scopes = b.switch
    ? `<span class="seg" role="group" aria-label="Games">${b.switch
        .map(([k, l]) => `<button type="button" data-act="view" data-view="${k}" aria-pressed="${shown === k}">${esc(l)}</button>`)
        .join("")}</span>`
    : "";
  const roles = b.scope === "match" || b.scope === "war" || D.meta.solo ? "" : `<span class="seg" role="group" aria-label="Player role">${ROLES.map(
    ([k, l]) => `<button type="button" data-act="role" data-role="${k}" aria-pressed="${k === r}">${l}</button>`
  ).join("")}</span>`;
  const flip = cardFlip.has(b.id);
  const order = b.least
    ? `<span class="seg" role="group" aria-label="Order">${[["top", b.label, !flip], ["least", b.least.label, flip]]
        .map(([k, l, on]) => `<button type="button" data-act="side" data-side="${k}" aria-pressed="${on}">${esc(l)}</button>`)
        .join("")}</span>`
    : b.cap || b.scope === "war" || b.scope === "units"
      ? ""
      : `<button type="button" class="flip" data-act="flip" aria-pressed="${flip}" title="Turn the list round">Reverse</button>`;
  const civs = CIV_SCOPES.has(b.scope) ? civButton(b.id) + (civPop === b.id ? civPopup(b.id, civsOf(b)) : "") : "";
  return scopes || roles || order || civs ? `<div class="card-controls">${scopes}${roles}${order}${civs}</div>` : "";
}

function civButton(id) {
  const sel = cardCivs[id], n = sel ? sel.civs.size : 0;
  const named = n === 1 ? [...sel.civs][0] : `${n} civs`;
  const label = !n ? "All civs" : sel.mode === "only" ? named : `Exclude ${named}`;
  return `<button type="button" class="civ-btn${n ? " on" : ""}" data-act="civs" aria-haspopup="dialog" aria-expanded="${civPop === id}">${esc(label)}</button>`;
}

function civPopup(id, civs) {
  const sel = cardCivs[id] || { mode: "only", civs: new Set() };
  return `<div class="civ-pop" role="dialog" aria-label="Choose civs">
    <div class="civ-pop-head">
      <span class="seg" role="group" aria-label="Show">${[["only", "Include"], ["except", "Exclude"]]
        .map(([m, l]) => `<button type="button" data-act="civmode" data-mode="${m}" aria-pressed="${sel.mode === m}">${l}</button>`)
        .join("")}</span>
      <button type="button" class="civ-clear" data-act="civclear"${sel.civs.size ? "" : " disabled"}>Clear</button>
      <button type="button" class="civ-close" data-act="civclose" aria-label="Close">×</button>
    </div>
    <ul class="civ-list">${civs
      .map((c) => `<li><label><input type="checkbox" data-civ="${esc(c)}"${sel.civs.has(c) ? " checked" : ""}>${emblem(c)}<span>${esc(c)}</span></label></li>`)
      .join("")}</ul>
  </div>`;
}

function boardCard(card) {
  const b = viewOf(card);           // one game or all games, whichever the card shows now
  const r = cardRole[b.id] || "all";
  if (b.scope === "war") return warCard(b, r);
  if (b.scope === "units") return unitsCard(b, r);
  const { side, rows } = cardRows(b);
  views[b.id] = { b, rows, drawn: Math.min(rows.length, FIRST_DRAWN) };
  // No subtitle: the note is the title's tooltip, so switching views never moves the card around.
  // The scope line stays only where it says more than the switch or the title would.
  const note = side.note ?? b.note;
  const scope = b.kind ? `One ${b.kind}, one game` : b.scope === "match" ? SCOPES.match : "";
  return `<article class="board" id="board-${b.id}" data-id="${b.id}">
    ${scope ? `<div class="board-top"><span class="scope">${scope}</span></div>` : ""}
    <h3${note ? ` title="${esc(note)}"` : ""}>${esc(side.title)}</h3>
    ${controls(b, r)}
    ${rows.length ? `<ol class="board-list" data-id="${b.id}">${rowsHtml(b, rows, 0, views[b.id].drawn)}</ol>` : `<p class="empty">${emptyText(b, r)}</p>`}
  </article>`;
}

function emptyText(b, r) {
  const sel = cardCivs[b.id];
  if (sel && sel.civs.size) return `Nothing for ${sel.mode === "only" ? "the civs included" : "the civs left"}${r === "all" ? "" : ` as ${r}`}.`;
  return `No ${r === "all" ? "" : r + " "}games yet.`;
}

// ties share a rank
function rowsHtml(b, rows, from, to) {
  let out = "";
  for (let i = from; i < to; i++) {
    const x = rows[i];
    let rank = i + 1;
    while (rank > 1 && rows[rank - 2].v === x.v && rows[rank - 2].txt === x.txt) rank--;
    const w = who(b, x);
    const result = x.w === undefined ? "" : x.w ? "won" : "lost";
    out += `<li class="${result}">
      <span class="rank">${rank}</span>
      <span class="who"><span class="main" title="${esc(w.main)}${aliasNote(x.p)}">${esc(w.main)}${w.civ ? ` ${civTag(w.civ)}` : ""}</span>${w.lines
        .filter(Boolean)
        .map((l) => `<small>${l}</small>`)
        .join("")}</span>
      <span class="val">${x.txt ? esc(x.txt) : value(x.v, b.fmt)}</span>
    </li>`;
  }
  return out;
}

// a long list is drawn as it is scrolled
function drawMore(e) {
  const ol = e.target;
  if (!ol.classList || !ol.classList.contains("board-list")) return;
  const v = views[ol.dataset.id];
  if (!v || v.drawn >= v.rows.length || ol.scrollTop + ol.clientHeight < ol.scrollHeight - 400) return;
  const to = Math.min(v.rows.length, v.drawn + MORE_DRAWN);
  ol.insertAdjacentHTML("beforeend", rowsHtml(v.b, v.rows, v.drawn, to));
  v.drawn = to;
}

// ---- the card's buttons

function cardClick(e) {
  const btn = e.target.closest("button[data-act]");
  const card = btn && btn.closest(".board");
  if (!card) return;
  const id = card.dataset.id, act = btn.dataset.act;
  if (act === "role") cardRole[id] = btn.dataset.role;
  if (act === "view") (cardView[id] = btn.dataset.view), cardFlip.delete(id);     // each view opens on its best
  if (act === "side") btn.dataset.side === "least" ? cardFlip.add(id) : cardFlip.delete(id);
  if (act === "flip") cardFlip.has(id) ? cardFlip.delete(id) : cardFlip.add(id);
  if (act === "civs") civPop = civPop === id ? null : id;
  if (act === "civmode") (cardCivs[id] ||= { mode: "only", civs: new Set() }).mode = btn.dataset.mode;
  if (act === "civclear") delete cardCivs[id];
  if (act === "civclose") civPop = null;
  const focus = act === "civs" && civPop === id ? ".civ-pop input"
    : act === "civclose" ? '[data-act="civs"]'
    : `[data-act="${act}"]${btn.dataset.role ? `[data-role="${btn.dataset.role}"]` : ""}${btn.dataset.view ? `[data-view="${btn.dataset.view}"]` : ""}${btn.dataset.side ? `[data-side="${btn.dataset.side}"]` : ""}${btn.dataset.mode ? `[data-mode="${btn.dataset.mode}"]` : ""}`;
  redraw(id, focus);
}

function civTicked(e) {
  const box = e.target.closest("input[data-civ]");
  const card = box && box.closest(".board");
  if (!card) return;
  const sel = (cardCivs[card.dataset.id] ||= { mode: "only", civs: new Set() });
  box.checked ? sel.civs.add(box.dataset.civ) : sel.civs.delete(box.dataset.civ);
  redraw(card.dataset.id, `input[data-civ="${CSS.escape(box.dataset.civ)}"]`);
}

function closeCivsOutside(e) {
  if (civPop && !e.target.closest(".civ-pop") && !e.target.closest('[data-act="civs"]')) closeCivs(false);
}

function closeCivs(refocus) {
  const id = civPop;
  civPop = null;
  if (id === "players") return playerCivs(refocus ? '[data-act="civs"]' : null);
  if (id === "curves") return curveCivs(refocus ? '[data-act="civs"]' : null);
  if (document.getElementById(`board-${id}`)) redraw(id, refocus ? '[data-act="civs"]' : null);
}

// redraw one card in place, keeping the civ list where it was scrolled and the focus on the button pressed
function redraw(id, focus) {
  if (id === "players") return playerCivs(focus);
  const old = document.getElementById(`board-${id}`);
  const list = old.querySelector(".civ-list");
  const scrolled = list ? list.scrollTop : 0;
  const b = D.boards.list.find((x) => x.id === id);
  const box = document.createElement("div");
  box.innerHTML = boardCard(b);
  old.replaceWith(box.firstElementChild);
  if (b.scope === "war") warTable();
  if (b.scope === "units") unitsTable();
  const card = document.getElementById(`board-${id}`);
  const newList = card.querySelector(".civ-list");
  if (newList) newList.scrollTop = scrolled;
  const target = focus && card.querySelector(focus);
  if (target) target.focus({ preventScroll: true });
}

function showCategory() {
  if (category === "awards") return showAwards();
  const cat = D.boards.categories.find((c) => c.id === category);
  document.getElementById("category-blurb").innerHTML =
    `${esc(cat.blurb)} <span class="legend"><i class="won"></i>team won that game <i class="lost"></i>lost</span>`;
  const boards = D.boards.list.filter((b) => b.cat === category);
  const main = boards.filter((b) => !b.minor), minor = boards.filter((b) => b.minor);
  const el = document.getElementById("boards");
  let group = null;
  el.innerHTML =
    main
      .map((b) => {
        const head = b.group && b.group !== group ? `<h3 class="board-group">${esc(b.group)}</h3>` : "";
        group = b.group;
        return head + boardCard(b);
      })
      .join("") +
    (minor.length
      ? `<details class="minor"><summary>More: ${minor.map((b) => esc(b.title.replace(/^Most /, ""))).join(", ")}</summary><div class="board-grid">${minor
          .map(boardCard)
          .join("")}</div></details>`
      : "");
  if (el.querySelector("#war-table")) warTable();
  if (el.querySelector("#units-table")) unitsTable();
}

// the award graphics, each opening at full size
function showAwards() {
  document.getElementById("category-blurb").textContent = "The awards published after the final.";
  document.getElementById("boards").innerHTML = `<div class="award-gallery">${D.awards
    .map(
      (a) => `<figure class="award"><a href="${esc(a.image)}" target="_blank" rel="noopener">
        <img src="${esc(a.image)}" alt="${esc(a.title)}" width="${a.width}" height="${a.height}" loading="lazy"></a>
        <figcaption>${esc(a.title)}</figcaption></figure>`
    )
    .join("")}</div>`;
}

// ---------------------------------------------------------------- Dark Age villager war

function warCard(b, r) {
  return `<article class="board war" id="board-${b.id}" data-id="${b.id}">
    <div class="board-top"><span class="scope">One game · flank against the flank facing them</span></div>
    <h3>${esc(b.title)}</h3>
    ${controls(b, r)}
    <div class="table-shell war-shell"><table class="war-table" id="war-table"><thead></thead><tbody></tbody></table></div>
  </article>`;
}

// one row per war, the winner first; each side's figures are for the fight window
function warTable() {
  const sel = cardCivs.villager_wars;
  const rows = D.war.filter((x) => civOk(sel, x.a.civ) || civOk(sel, x.b.civ));
  const who = (s) => `<span title="${esc(player(s.p))}${aliasNote(s.p)}">${esc(player(s.p))}</span>${D.meta.solo ? "" : `<small>${esc(team(s.team))}</small>`}<small>${civTag(s.civ)}</small><small>Feudal click ${time(s.click)}</small>`;
  const pair = (x, y, f) => `${f(x)} <span class="vs-sep">/</span> ${f(y)}`;
  const part = (v) => (v > 0 ? `+${v.toFixed(1)}` : v < 0 ? `−${(-v).toFixed(1)}` : "0");
  const cols = [
    { key: "game", label: "Game", cls: "name wrap", html: (r) => esc(gameLabel(r.g)), sort: (r) => r.g, asc: true },
    { key: "won", label: "Won by", cls: "name", html: (r) => who(r.a), sort: (r) => player(r.a.p).toLowerCase(), asc: true },
    { key: "lost", label: "Against", cls: "name", html: (r) => who(r.b), sort: (r) => player(r.b.p).toLowerCase(), asc: true },
    { key: "margin", label: "Result", html: (r) => `<b>${r.margin.toFixed(1)}</b> villagers<small>kills ${part(r.parts.kills)} · scouts ${part(r.parts.scouts)}</small><small>made ${part(r.parts.made)} · off work ${part(r.parts.off)}</small>`,
      sort: (r) => r.margin, title: "The result in villagers, and where it came from" },
    { key: "vills", label: "Villagers", text: (r) => `${r.vk}–${r.vl}`, sort: (r) => r.vk - r.vl, title: "Villagers each side killed of the other during the fight, winner first" },
    { key: "scouts", label: "Scouts", text: (r) => `${r.sk}–${r.sl}`, sort: (r) => r.sk - r.sl, title: "Scouts each side killed of the other in the Dark Age, winner first" },
    { key: "idle", label: "Idle TC", html: (r) => pair(r.a, r.b, (s) => time(s.idle)), sort: (r) => r.b.idle - r.a.idle, title: "Town Center idle time during the fight, winner / the other" },
    { key: "off", label: "Off work, min", html: (r) => pair(r.a, r.b, (s) => Math.round(s.off)), sort: (r) => r.b.off - r.a.off,
      title: "Villager-minutes spent idle, walking or fighting instead of gathering during the fight, winner / the other" },
  ];
  sortable("war-table", cols, rows, "margin");
}

// ---------------------------------------------------------------- units made

function unitsCard(b, r) {
  return `<article class="board war" id="board-${b.id}" data-id="${b.id}">
    <div class="board-top"><span class="scope">All games · by unit line</span></div>
    <h3>${esc(b.title)}</h3>
    ${controls(b, r)}
    <div class="table-shell war-shell"><table class="war-table" id="units-table"><thead></thead><tbody></tbody></table></div>
  </article>`;
}

function unitsTable() {
  const cols = [
    { key: "unit", label: "Unit", cls: "name", text: (r) => r.unit, sort: (r) => r.unit, asc: true },
    { key: "made", label: "Made", text: (r) => value(r.made), sort: (r) => r.made },
    { key: "players", label: "Players", text: (r) => r.players, sort: (r) => r.players },
    { key: "top", label: "Made most", cls: "team", text: (r) => player(r.top), sort: (r) => player(r.top).toLowerCase(), asc: true },
    { key: "top_n", label: "Their count", text: (r) => value(r.top_n), sort: (r) => r.top_n },
  ];
  sortable("units-table", cols, D.units[cardRole.units_made || "all"], "made");
}

// ---------------------------------------------------------------- tables

function sortable(tableId, cols, rows, initial, searchId) {
  const table = document.getElementById(tableId);
  let key = initial, dir = -1, query = "";
  table.querySelector("thead").innerHTML =
    "<tr>" + cols.map((c) => `<th data-key="${c.key}" scope="col"${c.title ? ` title="${esc(c.title)}"` : ""}><button type="button">${esc(c.label)}</button></th>`).join("") + "</tr>";
  const cell = (c, r) => {
    const tone = c.tone ? (c.tone(r) > 0 ? " pos" : c.tone(r) < 0 ? " neg" : "") : "";
    return `<td class="${c.cls || "num"}${tone}">${c.html ? c.html(r) : esc(c.text(r))}</td>`;
  };
  function draw() {
    const col = cols.find((c) => c.key === key);
    const shown = rows
      .filter((r) => !query || cols.some((c) => c.search && String(c.text(r)).toLowerCase().includes(query)))
      .sort((a, b) => {
        const x = col.sort(a), y = col.sort(b);
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir;
      });
    table.querySelectorAll("th").forEach((th) =>
      th.setAttribute("aria-sort", th.dataset.key === key ? (dir > 0 ? "ascending" : "descending") : "none")
    );
    table.querySelector("tbody").innerHTML = shown.length
      ? shown.map((r) => `<tr class="${r.w === undefined ? "" : r.w ? "won" : "lost"}">` + cols.map((c) => cell(c, r)).join("") + "</tr>").join("")
      : `<tr><td class="loading" colspan="${cols.length}">Nothing matches.</td></tr>`;
  }
  table.querySelector("thead").onclick = (e) => {
    const th = e.target.closest("th");
    if (!th) return;
    const col = cols.find((c) => c.key === th.dataset.key);
    if (key === col.key) dir = -dir;
    else (key = col.key), (dir = col.asc ? 1 : -1);
    draw();
  };
  if (searchId)
    document.getElementById(searchId).oninput = (e) => {
      query = e.target.value.trim().toLowerCase();
      draw();
    };
  draw();
  return (newRows) => {
    rows = newRows;
    draw();
  };
}

function playerTable() {
  const roleText = (r) => (r.flank && r.pocket ? `${r.flank} flank, ${r.pocket} pocket` : r.flank ? "Flank" : "Pocket");
  const cols = [
    { key: "name", label: "Player", cls: "name", text: (r) => `${player(r.p)} ${alias(r.p)}`, html: (r) => esc(player(r.p)), sort: (r) => player(r.p).toLowerCase(), asc: true, search: true },
    { key: "team", label: "Team", cls: "team", text: (r) => team(r.team), sort: (r) => team(r.team).toLowerCase(), asc: true, search: true },
    { key: "role", label: "Role", cls: "team", text: roleText, sort: (r) => r.flank - r.pocket, search: true },
    { key: "games", label: "Games", text: (r) => r.games, sort: (r) => r.games },
    { key: "wins", label: "Won", text: (r) => r.wins, sort: (r) => r.wins },
    { key: "length", label: "Avg game", text: (r) => time(r.length), sort: (r) => r.length, title: "Average length of the player's games" },
    { key: "kills", label: "Kills", text: (r) => value(r.kills), sort: (r) => r.kills, title: "Units killed per game" },
    { key: "deaths", label: "Deaths", text: (r) => value(r.deaths), sort: (r) => r.deaths, title: "Units lost per game" },
    { key: "kd", label: "K/D", text: (r) => value(r.kd, "dec2"), sort: (r) => r.kd },
    { key: "eapm", label: "eAPM", text: (r) => value(r.eapm, "dec1"), sort: (r) => r.eapm },
    { key: "feudal", label: "Feudal", text: (r) => time(r.feudal), sort: (r) => r.feudal, asc: true },
    { key: "castle", label: "Castle", text: (r) => time(r.castle), sort: (r) => r.castle, asc: true },
    { key: "imperial", label: "Imperial", text: (r) => time(r.imperial), sort: (r) => r.imperial, asc: true },
    { key: "idle_feudal", label: "Idle TC to Feudal", text: (r) => time(r.idle_feudal), sort: (r) => r.idle_feudal, asc: true },
    { key: "idle_castle", label: "Idle TC to Castle", text: (r) => time(r.idle_castle), sort: (r) => r.idle_castle, asc: true },
    { key: "res", label: "Res / game", text: (r) => value(r.res), sort: (r) => r.res },
    { key: "walls", label: "Walls / game", text: (r) => value(r.walls), sort: (r) => r.walls },
  ];
  if (D.meta.solo) {          // 1v1: no teams or roles, and how much of the workforce stood still
    cols.splice(0, cols.length, ...cols.filter((c) => c.key !== "team" && c.key !== "role"));
    cols.splice(cols.findIndex((c) => c.key === "res"), 0,
      { key: "housed", label: "Housed / game", text: (r) => time(r.housed), sort: (r) => r.housed, asc: true },
      { key: "idle_share", label: "Villager time idle", text: (r) => value(r.idle_share, "pct"), sort: (r) => r.idle_share, asc: true },
      { key: "gather_rate", label: "Res / villager-min", text: (r) => value(r.gather_rate, "dec1"), sort: (r) => r.gather_rate });
  }
  const update = sortable("player-table", cols, playerRows(), "kills", "player-search");
  refresh.push(() => update(playerRows()));
  const box = document.getElementById("players-civs");
  box.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "civs") civPop = civPop === "players" ? null : "players";
    if (act === "civmode") (cardCivs.players ||= { mode: "only", civs: new Set() }).mode = btn.dataset.mode;
    if (act === "civclear") delete cardCivs.players;
    if (act === "civclose") civPop = null;
    playerCivs(act === "civs" && civPop ? ".civ-pop input" : act === "civclose" ? '[data-act="civs"]' : `[data-act="${act}"]${btn.dataset.mode ? `[data-mode="${btn.dataset.mode}"]` : ""}`);
  });
  box.addEventListener("change", (e) => {
    const civ = e.target.dataset.civ;
    if (!civ) return;
    const sel = (cardCivs.players ||= { mode: "only", civs: new Set() });
    e.target.checked ? sel.civs.add(civ) : sel.civs.delete(civ);
    playerCivs(`input[data-civ="${CSS.escape(civ)}"]`);
  });
  playerCivs();
}

// the players table's civ button and list, and the table under them
function playerCivs(focus) {
  const box = document.getElementById("players-civs");
  const list = box.querySelector(".civ-list");
  const scrolled = list ? list.scrollTop : 0;
  const civs = [...new Set(PG.map((x) => x.civ))].sort((a, c) => a.localeCompare(c));
  box.innerHTML = civButton("players") + (civPop === "players" ? civPopup("players", civs) : "");
  const newList = box.querySelector(".civ-list");
  if (newList) newList.scrollTop = scrolled;
  const target = focus && box.querySelector(focus);
  if (target) target.focus({ preventScroll: true });
  refresh.forEach((f) => f());
}

// each player's totals and averages over their games in view (role and civs)
function playerRows() {
  const sel = cardCivs.players, col = D.pg_stats, games = new Map();
  PG.forEach((x, i) => {
    if (roleOk(role, x.role) && civOk(sel, x.civ)) games.set(x.p, [...(games.get(x.p) || []), i]);
  });
  return [...games].map(([p, idx]) => {
    const avg = (c) => {
      if (!col[c]) return null;
      const v = idx.map((i) => col[c][i]).filter((x) => x != null);
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
    };
    const tot = (c) => Math.round(idx.reduce((s, i) => s + (col[c][i] || 0), 0));
    const kills = tot("unit_kills"), deaths = tot("unit_deaths");
    return {
      p, team: D.people[p].team, games: idx.length, wins: idx.filter((i) => PG[i].w).length,
      length: idx.reduce((s, i) => s + gamesById[PG[i].g].length, 0) / idx.length,
      flank: idx.filter((i) => PG[i].role === "flank").length, pocket: idx.filter((i) => PG[i].role === "pocket").length,
      // per game, like the other columns; K/D is the totals' ratio, which per-game averages give too
      kills: kills / idx.length, deaths: deaths / idx.length,
      kd: deaths ? Math.round((kills / deaths) * 100) / 100 : kills ? Infinity : null,      // none lost: ∞
      eapm: avg("total_real_eapgm"), feudal: avg("feudal"), castle: avg("castle"), imperial: avg("imperial"),
      idle_feudal: avg("idle_feudal"), idle_castle: avg("idle_castle"), res: avg("total_collected_res"), walls: avg("walls"),
      housed: avg("housed"), idle_share: avg("idle_share"), gather_rate: avg("gather_rate"),
    };
  });
}

function teamTable() {
  if (D.meta.solo) return;                      // 1v1: every player is a team, and the table is hidden
  const per = (k) => ({ text: (r) => value(r[k]), sort: (r) => r[k] });
  const cols = [
    { key: "team", label: "Team", cls: "name", text: (r) => team(r.team), sort: (r) => team(r.team).toLowerCase(), asc: true },
    { key: "group", label: "Group", cls: "team", text: (r) => (D.teams[r.team] || {}).group || "–", sort: (r) => (D.teams[r.team] || {}).group || "", asc: true },
    { key: "games", label: "Games", text: (r) => r.games, sort: (r) => r.games },
    { key: "wins", label: "Won", text: (r) => r.wins, sort: (r) => r.wins },
    { key: "length", label: "Avg game", text: (r) => time(r.length), sort: (r) => r.length, title: "Average length of the team's games" },
    { key: "unit_kills", label: "Kills", ...per("unit_kills") },
    { key: "eco_kills", label: "Eco kills", ...per("eco_kills") },
    { key: "building_razes", label: "Razed", ...per("building_razes") },
    { key: "total_collected_res", label: "Resources", ...per("total_collected_res") },
    { key: "trade_profit", label: "Trade", ...per("trade_profit"), title: "Trade profit per game" },
    { key: "walls", label: "Walls", ...per("walls"), title: "Wall pieces per game" },
    { key: "towers", label: "Towers", ...per("towers") },
    { key: "castles", label: "Castles", ...per("castles") },
  ];
  const lengths = (t) => D.games.filter((g) => g.a === t || g.b === t).map((g) => g.length);
  const rows = D.team_rows.map((r) => {
    const l = lengths(r.team);
    return { ...r, length: l.length ? l.reduce((a, b) => a + b, 0) / l.length : null };
  });
  sortable("team-table", cols, rows, "wins");
}

// Every civ in a ranked row: how often it was picked, and its games won and lost. Rows instead of a
// scatter plot, so every civ is named and nothing overlaps however long the event runs. Sorted by
// picks, or by win rate (ties: the more picked first).
const CIV_SORTS = [["picks", "Most picked"], ["rate", "Win rate"]];
let civSort = "picks";

function civRows() {
  const fig = document.getElementById("civ-plot");
  const rate = (c) => c.wins / c.picks;
  const rows = [...D.civs].sort(civSort === "rate"
    ? (a, b) => rate(b) - rate(a) || b.picks - a.picks || a.civ.localeCompare(b.civ)
    : (a, b) => b.picks - a.picks || rate(b) - rate(a) || a.civ.localeCompare(b.civ));
  const most = Math.max(...D.civs.map((c) => c.picks));
  const pct = (c) => Math.round(100 * rate(c));
  const seg = `<div class="seg civ-sort" role="group" aria-label="Sort civs">${CIV_SORTS.map(([k, label]) =>
    `<button type="button" data-sort="${k}" aria-pressed="${civSort === k}">${label}</button>`).join("")}</div>`;
  const head = `<li class="civ-row civ-row-head" aria-hidden="true"><span></span><span>Picks</span><span>Won · lost</span><span>Win rate</span></li>`;
  const body = rows.map((c) => {
    const lost = c.picks - c.wins;
    return `<li class="civ-row" title="${esc(`${c.civ}: ${c.picks} pick${c.picks === 1 ? "" : "s"}, ${c.wins} won, ${lost} lost`)}">
      ${civTag(c.civ)}
      <span class="civ-picks"><span class="civ-bar" style="width:${(100 * c.picks) / most}%"></span><b>${c.picks}</b></span>
      <span class="civ-wl" aria-label="${c.wins} won, ${lost} lost"><span class="civ-won" style="width:${100 * rate(c)}%"></span></span>
      <span class="civ-pct">${pct(c)}%</span>
    </li>`;
  }).join("");
  fig.innerHTML = `${seg}<ol class="civ-rows">${head}${body}</ol>`;
  fig.querySelector(".civ-sort").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || btn.dataset.sort === civSort) return;
    civSort = btn.dataset.sort;
    civRows();
    fig.querySelector(`.civ-sort [data-sort="${civSort}"]`).focus();
  });
}

// ---------------------------------------------------------------- over time

// data/curves.json: every player-game's [resources, population, eco, army] every `step` seconds, in
// PG's order, and in a 1v1 collection also [idle TC, housed, eAPM over the last minute, resources
// banked]. A player's line is the average over their games in view still going, except for what only
// ever grows (resources, idle TC, time housed): a game that has ended counts with its final total, so
// the line never drops, and at the end of the whole game it is the player's average total.
const CURVE_METRICS = [
  { label: "Resources collected", unit: "res", grows: true },
  { label: "Population", unit: "units" },
  { label: "Eco population", unit: "units" },
  { label: "Military population", unit: "units" },
];
const SOLO_METRICS = [
  { label: "Idle TC", unit: "idle", grows: true, fmt: "time", low: true },     // low: the list ranks the least first
  { label: "Housed", unit: "housed", grows: true, fmt: "time", low: true },
  { label: "eAPM", unit: "eAPM over the minute before" },
  { label: "Unspent", unit: "res banked", low: true },
];
let curvesLoad = null;
const curves = () => (curvesLoad ||= fetch("data/curves.json", { cache: "no-cache" }).then((r) => r.json()));
const CURVE_PRESETS = [20, 30, 45, 60];
const PIN_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const OT = { data: null, metric: 0, role: "all", from: 0, to: 60, max: 60, last: 0, pinned: [], hover: null, hoverJ: null, geo: null, lines: [] };
const curveEnd = () => Math.min(Math.round((OT.to * 60) / OT.data.step), OT.last);   // the window's last step with data

const pinOf = (p) => OT.pinned.find((x) => x[0] === p);
const pinColor = (p) => { const x = pinOf(p); return x ? (x[1] >= 0 ? PIN_COLORS[x[1]] : "var(--ink)") : null; };
const curveValue = (v, k = OT.metric) => (v == null ? "–" : CURVE_METRICS[k].fmt === "time" ? time(v) : Math.round(v).toLocaleString("en-US"));
const curveTick = (v, k = OT.metric) => (CURVE_METRICS[k].fmt === "time" ? time(v) : v >= 1000 ? `${v / 1000}k` : String(v));

function pressed(el, key, val) {
  el.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[key] === String(val))));
}

function curveSection() {
  if (D.meta.solo) CURVE_METRICS.push(...SOLO_METRICS);
  const metricEl = document.getElementById("curve-metric");
  metricEl.innerHTML = CURVE_METRICS.map(({ label: l }, i) => `<button type="button" data-i="${i}" aria-pressed="${i === OT.metric}">${l}</button>`).join("");
  metricEl.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    OT.metric = +b.dataset.i;
    pressed(metricEl, "i", OT.metric);
    curveUpdate();
  });
  const roleEl = document.getElementById("curve-role");
  roleEl.innerHTML = ROLES.map(([k, l]) => `<button type="button" data-role="${k}" aria-pressed="${k === OT.role}">${l}</button>`).join("");
  roleEl.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    OT.role = b.dataset.role;
    pressed(roleEl, "role", OT.role);
    curveUpdate();
  });

  const box = document.getElementById("curve-civs");
  box.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "civs") civPop = civPop === "curves" ? null : "curves";
    if (act === "civmode") (cardCivs.curves ||= { mode: "only", civs: new Set() }).mode = btn.dataset.mode;
    if (act === "civclear") delete cardCivs.curves;
    if (act === "civclose") civPop = null;
    curveCivs(act === "civs" && civPop ? ".civ-pop input" : act === "civclose" ? '[data-act="civs"]' : `[data-act="${act}"]${btn.dataset.mode ? `[data-mode="${btn.dataset.mode}"]` : ""}`);
  });
  box.addEventListener("change", (e) => {
    const civ = e.target.dataset.civ;
    if (!civ) return;
    const sel = (cardCivs.curves ||= { mode: "only", civs: new Set() });
    e.target.checked ? sel.civs.add(civ) : sel.civs.delete(civ);
    curveCivs(`input[data-civ="${CSS.escape(civ)}"]`);
  });
  curveCivs();

  const presets = document.getElementById("curve-presets"), from = document.getElementById("curve-from"), to = document.getElementById("curve-to");
  presets.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    OT.from = 0;
    OT.to = b.dataset.m === "all" ? OT.max : Math.min(+b.dataset.m, OT.max);
    curveWindow();
  });
  from.addEventListener("input", () => { OT.from = Math.min(+from.value, OT.max - 5); OT.to = Math.max(OT.to, OT.from + 5); curveWindow(); });
  to.addEventListener("input", () => { OT.to = Math.max(+to.value, 5); OT.from = Math.min(OT.from, OT.to - 5); curveWindow(); });

  const svg = document.getElementById("curve-svg");
  svg.addEventListener("pointermove", (e) => {
    const hit = curveHit(e);
    const p = hit ? hit.p : null, j = hit ? hit.j : null;
    if (p !== OT.hover || j !== OT.hoverJ) { OT.hover = p; OT.hoverJ = j; curveDraw(); curveMarkList(); }
    curveTip(hit);
  });
  svg.addEventListener("pointerleave", () => { OT.hover = null; OT.hoverJ = null; curveTip(null); curveDraw(); curveMarkList(); });
  svg.addEventListener("click", (e) => { const hit = curveHit(e); if (hit && hit.p) curvePin(hit.p); });

  const list = document.getElementById("curve-list");
  list.addEventListener("click", (e) => { const b = e.target.closest("button[data-p]"); if (b) curvePin(b.dataset.p); });
  list.addEventListener("pointerover", (e) => {
    const b = e.target.closest("button[data-p]"), p = b ? b.dataset.p : null;
    if (p !== OT.hover) { OT.hover = p; OT.hoverJ = null; curveDraw(); curveMarkList(); }
  });
  list.addEventListener("pointerleave", () => { OT.hover = null; curveDraw(); curveMarkList(); });

  const load = () => curves()
    .then((d) => {
      OT.data = d;
      OT.last = Math.max(...d.series.filter(Boolean).map((s) => s[0].length - 1));
      OT.max = Math.ceil((OT.last * d.step) / 60);
      OT.to = Math.min(60, OT.max);
      presets.innerHTML = CURVE_PRESETS.filter((m) => m < OT.max).map((m) => `<button type="button" data-m="${m}">0–${m}</button>`).join("")
        + `<button type="button" data-m="all">Whole game</button>`;
      from.max = OT.max - 5;
      to.max = OT.max;
      document.getElementById("curve-loading").hidden = true;
      new ResizeObserver(() => curveDraw()).observe(document.getElementById("curve-chart"));
      curveUpdate();
      curveWindow();
    })
    .catch((e) => { document.getElementById("curve-loading").textContent = "The chart data could not be loaded. Try reloading the page."; console.error(e); });
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: "900px 0px" });
    io.observe(document.getElementById("curves"));
  } else load();
}

// the chart's civ button and list
function curveCivs(focus) {
  const box = document.getElementById("curve-civs");
  const list = box.querySelector(".civ-list");
  const scrolled = list ? list.scrollTop : 0;
  const civs = [...new Set(PG.map((x) => x.civ))].sort((a, c) => a.localeCompare(c));
  box.innerHTML = civButton("curves") + (civPop === "curves" ? civPopup("curves", civs) : "");
  const newList = box.querySelector(".civ-list");
  if (newList) newList.scrollTop = scrolled;
  const target = focus && box.querySelector(focus);
  if (target) target.focus({ preventScroll: true });
  curveUpdate();
}

function curvePin(p) {
  if (pinOf(p)) OT.pinned = OT.pinned.filter((x) => x[0] !== p);
  else {
    const used = new Set(OT.pinned.map((x) => x[1]));
    OT.pinned.push([p, PIN_COLORS.findIndex((_, i) => !used.has(i))]);
  }
  curveDraw();
  curveList();
}

function curveWindow() {
  document.getElementById("curve-from").value = OT.from;
  document.getElementById("curve-to").value = OT.to;
  document.getElementById("curve-span").textContent = `${OT.from}–${OT.to} min`;
  document.querySelectorAll("#curve-presets button").forEach((b) =>
    b.setAttribute("aria-pressed", String(OT.from === 0 && (b.dataset.m === "all" ? OT.to === OT.max : +b.dataset.m === OT.to))));
  curveDraw();
  curveList();
}

// each player's line over their games in view (n: how many of them are still going)
function curveUpdate() {
  if (!OT.data) return;
  const sel = cardCivs.curves, k = OT.metric, per = new Map();
  const add = (a, v) => {
    a.games++;
    for (let j = 0, len = CURVE_METRICS[k].grows ? OT.last + 1 : v.length; j < len; j++) {
      a.n[j] = (a.n[j] || 0) + 1;
      a.sum[j] = (a.sum[j] || 0) + v[Math.min(j, v.length - 1)];
    }
  };
  PG.forEach((x, i) => {
    const s = OT.data.series[i];
    if (!s || !roleOk(OT.role, x.role) || !civOk(sel, x.civ)) return;
    if (!per.has(x.p)) per.set(x.p, { p: x.p, games: 0, sum: [], n: [] });
    add(per.get(x.p), s[k]);
  });
  OT.lines = [...per.values()].map((a) => ({ p: a.p, games: a.games, n: a.n, y: a.sum.map((s, j) => s / a.n[j]) }));
  curveDraw();
  curveList();
}

// round steps up to `max`: in seconds (15 s, 30 s, a minute...) when the values are times
function niceTicks(max, want, secs) {
  if (!(max > 0)) return { top: secs ? 60 : 1, ticks: secs ? [0, 60] : [0, 1] };
  const raw = max / want, pow = 10 ** Math.floor(Math.log10(raw));
  const step = secs ? [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].find((s) => s >= raw) || 3600
    : [1, 2, 2.5, 5, 10].map((f) => f * pow).find((s) => s >= raw);
  const top = Math.ceil(max / step - 1e-9) * step, ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { top, ticks };
}

function curveDraw() {
  const svg = document.getElementById("curve-svg"), wrap = document.getElementById("curve-chart");
  if (!OT.data) return;
  const W = Math.max(280, wrap.clientWidth - 24), narrow = W < 560, H = narrow ? 300 : 420;
  const m = { l: 44, r: 12, t: 14, b: 34 }, iw = W - m.l - m.r, ih = H - m.t - m.b, step = OT.data.step;
  const j0 = Math.round((OT.from * 60) / step), j1 = curveEnd();
  const x = (j) => m.l + ((j - j0) / (j1 - j0)) * iw;
  let ymax = 0;
  OT.lines.forEach((L) => { for (let j = j0; j <= Math.min(j1, L.y.length - 1); j++) if (L.y[j] > ymax) ymax = L.y[j]; });
  const { top, ticks } = niceTicks(ymax, narrow ? 4 : 5, CURVE_METRICS[OT.metric].fmt === "time");
  const y = (v) => m.t + ih - (v / top) * ih;
  let h = "";
  ticks.forEach((t) => {
    h += `<line x1="${m.l}" x2="${m.l + iw}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="1"/>`;
    h += `<text x="${m.l - 7}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${curveTick(t)}</text>`;
  });
  const span = OT.to - OT.from, mstep = [1, 2, 5, 10, 15, 20, 30].find((s) => span / s <= (narrow ? 5 : 9)) || 30;
  for (let mm = Math.ceil(OT.from / mstep) * mstep; (mm * 60) / step <= j1; mm += mstep) {
    const px = x((mm * 60) / step);
    h += `<line x1="${px}" x2="${px}" y1="${m.t + ih}" y2="${m.t + ih + 5}" stroke="var(--muted)" stroke-width="1"/>`;
    const anchor = px > m.l + iw - 24 ? "end" : px < m.l + 24 ? "start" : "middle";
    h += `<text x="${px}" y="${m.t + ih + 19}" text-anchor="${anchor}" font-size="11" fill="var(--muted)">${time(mm * 60)}</text>`;
  }
  if (OT.hoverJ !== null) h += `<line x1="${x(OT.hoverJ)}" x2="${x(OT.hoverJ)}" y1="${m.t}" y2="${m.t + ih}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="2 3"/>`;
  const path = (L) => {
    let d = "";
    for (let j = j0; j <= Math.min(j1, L.y.length - 1); j++) d += `${j === j0 ? "M" : "L"}${x(j).toFixed(1)},${y(L.y[j]).toFixed(1)}`;
    return d;
  };
  const busy = OT.hover !== null || OT.pinned.length > 0;
  OT.lines.forEach((L) => {
    if (pinOf(L.p) || L.p === OT.hover) return;
    const d = path(L);
    if (d) h += `<path d="${d}" fill="none" stroke="#bcc1b6" stroke-width="1.25" stroke-linejoin="round" opacity="${busy ? 0.55 : 1}"/>`;
  });
  const labels = [];
  const strong = (L, color, w) => {
    const d = path(L);
    if (!d) return;
    h += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
    const last = Math.min(j1, L.y.length - 1);
    labels.push({ x: x(last), y: y(L.y[last]), text: player(L.p) });
  };
  OT.pinned.forEach(([p]) => { const L = OT.lines.find((x2) => x2.p === p); if (L && p !== OT.hover) strong(L, pinColor(p), 2.4); });
  const hov = OT.hover && OT.lines.find((L) => L.p === OT.hover);
  if (hov) strong(hov, pinColor(hov.p) || "var(--ink)", 2.8);
  if (OT.hoverJ !== null && hov && OT.hoverJ < hov.y.length)
    h += `<circle cx="${x(OT.hoverJ)}" cy="${y(hov.y[OT.hoverJ])}" r="4.5" fill="${pinColor(hov.p) || "var(--ink)"}" stroke="var(--white)" stroke-width="2"/>`;
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 14) labels[i].y = labels[i - 1].y + 14;
  labels.forEach((l) => {
    h += `<text x="${l.x - 4}" y="${l.y - 7}" text-anchor="end" font-size="12" font-weight="650" fill="var(--ink)" stroke="var(--white)" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${esc(l.text)}</text>`;
  });
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("height", H);
  svg.innerHTML = h;
  OT.geo = { m, iw, ih, x, y, j0, j1, W, H };
}

function curveHit(e) {
  const g = OT.geo, svg = document.getElementById("curve-svg");
  if (!g) return null;
  const box = svg.getBoundingClientRect();
  const sx = ((e.clientX - box.left) * g.W) / box.width, sy = ((e.clientY - box.top) * g.H) / box.height;
  if (sx < g.m.l - 4 || sx > g.m.l + g.iw + 4) return null;
  const j = Math.max(g.j0, Math.min(g.j1, Math.round(g.j0 + ((sx - g.m.l) / g.iw) * (g.j1 - g.j0))));
  let best = null, bd = 14;
  OT.lines.forEach((L) => {
    if (j >= L.y.length) return;
    const d = Math.abs(g.y(L.y[j]) - sy);
    if (d < bd) { bd = d; best = L; }
  });
  return { j, p: best ? best.p : null, L: best, box };
}

function curveTip(hit) {
  const tip = document.getElementById("curve-tip");
  if (!hit || !hit.L) { tip.hidden = true; return; }
  const L = hit.L, j = hit.j, g = OT.geo;
  const sub = `${teamOf(L.p)}${L.games} game${L.games === 1 ? "" : "s"}`;
  tip.innerHTML = `<b>${esc(player(L.p))}</b><span class="tv">${curveValue(L.y[j])} <small>${CURVE_METRICS[OT.metric].unit} at ${time(j * OT.data.step)}</small></span><small>${sub}</small>`;
  tip.hidden = false;
  const wrap = document.getElementById("curve-chart").getBoundingClientRect(), b = hit.box;
  const px = b.left - wrap.left + (g.x(j) * b.width) / g.W, py = b.top - wrap.top + (g.y(L.y[j]) * b.height) / g.H;
  let left = px + 14, topPx = py - tip.offsetHeight - 10;
  if (left + tip.offsetWidth > wrap.width - 6) left = px - tip.offsetWidth - 14;
  if (topPx < 4) topPx = py + 14;
  tip.style.left = `${Math.max(4, left)}px`;
  tip.style.top = `${topPx}px`;
}

// players ranked by their value at the end of the window; players whose games had all ended by then follow
function curveList() {
  const list = document.getElementById("curve-list"), head = document.getElementById("curve-side-head");
  if (!OT.data) return;
  const j1 = curveEnd(), at = time(j1 * OT.data.step);
  const dir = CURVE_METRICS[OT.metric].low ? -1 : 1;
  const live = OT.lines.filter((L) => j1 < L.y.length).sort((a, b) => dir * (b.y[j1] - a.y[j1]));
  const over = OT.lines.filter((L) => j1 >= L.y.length).sort((a, b) => b.y.length - a.y.length);
  head.textContent = `${CURVE_METRICS[OT.metric].label} at ${at}`;
  const row = (L, rank, val, note) => {
    const c = pinColor(L.p);
    return `<li><button type="button" data-p="${esc(L.p)}" aria-pressed="${!!c}" class="${L.p === OT.hover ? "hl" : ""}">
      <span class="rk">${rank}</span>${c ? `<i class="sw" style="--c:${c}"></i>` : `<i class="dash"></i>`}
      <span class="nm">${esc(player(L.p))}<small>${teamOf(L.p)}${note}</small></span>
      <span class="val">${val}</span></button></li>`;
  };
  let html = live.map((L, i) => row(L, i + 1, curveValue(L.y[j1]), `${L.games} game${L.games === 1 ? "" : "s"}`)).join("");
  if (over.length) {
    html += `<li class="sub">Every game over before ${at}</li>`;
    html += over.map((L) => row(L, "", "–", `ended by ${time((L.y.length - 1) * OT.data.step)}`)).join("");
  }
  list.innerHTML = html || `<li class="sub">No games for these filters.</li>`;
}

function curveMarkList() {
  document.querySelectorAll("#curve-list button[data-p]").forEach((b) => b.classList.toggle("hl", b.dataset.p === OT.hover));
}

// ---------------------------------------------------------------- head to head (1v1 collections)

// one game's two players side by side. A row marks the better of the two where better is plain:
// earlier (1 = more is better, -1 = less is better); eAPM, the market and walls are told, not judged
const H2H_ROWS = [
  ["Ages", [["feudal", "Feudal Age", "time", -1], ["castle", "Castle Age", "time", -1], ["imperial", "Imperial Age", "time", -1],
    ["idle_feudal", "Idle TC to Feudal", "time", -1], ["idle_castle", "Idle TC to Castle", "time", -1], ["housed", "Housed", "time", -1]]],
  ["Economy techs", [["loom", "Loom", "time", -1], ["dba", "Double-Bit Axe", "time", -1], ["wheelbarrow", "Wheelbarrow", "time", -1],
    ["horse_collar", "Horse Collar", "time", -1], ["gold_mining", "Gold Mining", "time", -1], ["bow_saw", "Bow Saw", "time", -1],
    ["hand_cart", "Hand Cart", "time", -1]]],
  ["Military techs", [["fletching", "Fletching", "time", -1], ["bloodlines", "Bloodlines", "time", -1], ["ballistics", "Ballistics", "time", -1]]],
  ["Economy", [["vills10", "Villagers at 10:00", null, 1], ["vills15", "Villagers at 15:00", null, 1], ["vills20", "Villagers at 20:00", null, 1],
    ["res10", "Gathered by 10:00", null, 1], ["res20", "Gathered by 20:00", null, 1], ["total_collected_res", "Gathered in all", null, 1],
    ["gather_rate", "Res per villager-minute, to 20:00", "dec1", 1], ["idle_share", "Villager time idle", "pct", -1],
    ["float_avg", "Unspent on average, from 5:00", null, -1]]],
  ["Speed", [["total_real_eapgm", "eAPM", "dec1", 0], ["eapm_dark", "eAPM in the Dark Age", "dec1", 0], ["eapm_feudal", "eAPM in Feudal", "dec1", 0],
    ["eapm_castle", "eAPM in Castle and after", "dec1", 0], ["eapm_peak5", "eAPM, busiest five minutes", "dec1", 0]]],
  ["Fighting", [["unit_kills", "Units killed", null, 1], ["unit_deaths", "Units lost", null, -1], ["kd", "K/D", "dec2", 1],
    ["eco_kills", "Villagers killed", null, 1], ["first_vill_kill", "First villager killed", "time", -1]]],
  ["Market and map", [["market_clicks", "Market clicks", null, 0], ["market_net", "Gold from the market", "signed", 0],
    ["explored10", "Map seen by 10:00", "pct", 1], ["walls", "Wall pieces", null, 0]]],
];
const COUNTS = new Set(["unit_kills", "unit_deaths", "eco_kills", "market_clicks", "market_net", "walls"]);   // none means 0
// curves.json's series charted per game: [index, title]
const H2H_CHARTS = [[0, "Resources collected"], [2, "Eco population"], [3, "Military population"], [4, "Idle TC"], [6, "eAPM"], [7, "Unspent"]];
const H2H_COLORS = ["#2a78d6", "#eb6834"];
const H2H_PRESETS = [10, 20, 30];
const H2H = { tag: null, j: null, curves: null, to: null };     // to: the charts' last minute, null for the whole game

function headToHead() {
  if (!D.meta.solo) return;
  document.getElementById("h2h").hidden = false;
  document.querySelector('nav a[href="#h2h"]').hidden = false;
  const sel = document.getElementById("h2h-game");
  const order = [...D.games].sort((a, b) => a.n - b.n);
  sel.innerHTML = order.map((g) => `<option value="${esc(g.tag)}">${esc(gameLabel(g.tag))}</option>`).join("");
  H2H.tag = order[0].tag;
  sel.addEventListener("change", () => { H2H.tag = sel.value; H2H.j = null; h2hDraw(); });
  document.getElementById("h2h-window").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    H2H.to = b.dataset.m === "all" ? null : +b.dataset.m;
    H2H.j = null;
    h2hWindow();
  });
  document.getElementById("h2h-replay").addEventListener("click", () => {
    const rs = document.getElementById("game-select");
    if (!rs) return;
    rs.value = H2H.tag;
    rs.dispatchEvent(new Event("change"));
  });
  const charts = document.getElementById("h2h-charts");
  charts.innerHTML = H2H_CHARTS.map(([k, t]) => `<figure class="h2h-chart" data-k="${k}"><figcaption><span class="t">${t}</span><span class="v"></span></figcaption><svg role="img" aria-label="${t}, both players"></svg></figure>`).join("");
  charts.addEventListener("pointermove", (e) => {
    const svg = e.target.closest("svg"), g = svg && svg.__geo;
    if (!g) return;
    const box = svg.getBoundingClientRect(), sx = ((e.clientX - box.left) * g.W) / box.width;
    const j = Math.max(0, Math.min(g.n - 1, Math.round(((sx - g.l) / g.iw) * (g.n - 1))));
    if (j !== H2H.j) { H2H.j = j; h2hCharts(); }
  });
  charts.addEventListener("pointerleave", () => { H2H.j = null; h2hCharts(); });
  new ResizeObserver(() => h2hCharts()).observe(charts);
  h2hDraw();
  const load = () => curves().then((d) => { H2H.curves = d; h2hCharts(); })
    .catch((e) => { charts.insertAdjacentHTML("beforebegin", `<p class="loading">The chart data could not be loaded. Try reloading the page.</p>`); console.error(e); });
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: "900px 0px" });
    io.observe(charts);
  } else load();
}

// the picked game's two players: [{p, civ, w, i (their index in PG)}], side a first
function h2hSides() {
  const g = gamesById[H2H.tag];
  return [g.a, g.b].map((s) => {
    const { p, civ } = g.teams[s][0];
    const i = PG.findIndex((x) => x.g === g.tag && x.p === p);
    return { p, civ, w: g.winner === s, i };
  });
}

function h2hDraw() {
  const g = gamesById[H2H.tag], sides = h2hSides(), col = D.pg_stats;
  document.getElementById("h2h-game").value = H2H.tag;
  document.getElementById("h2h-replay").hidden = !D.meta.replays.includes(H2H.tag) || !document.getElementById("game-select");
  document.getElementById("h2h-head").innerHTML = sides.map((s, n) => `<div class="h2h-side ${n ? "b" : "a"}">
      <i class="sw" style="--c:${H2H_COLORS[n]}"></i>
      <div><b>${esc(player(s.p))}</b>${civTag(s.civ)}</div>
      <span class="pill ${s.w ? "won" : "lost"}">${s.w ? "Won" : "Lost"}</span></div>`).join(`<div class="h2h-mid">G${g.n}<small>${time(g.length)}</small></div>`);
  const val = (key, i) => {
    if (key === "kd") return (col.unit_kills[i] || 0) / Math.max(col.unit_deaths[i] || 0, 1);
    const v = col[key] ? col[key][i] : null;
    return v == null && COUNTS.has(key) ? 0 : v;
  };
  const show = (v, fmt) => (fmt === "signed" ? (v == null ? "–" : signed(Math.round(v)).replace(/\d+/, (d) => (+d).toLocaleString("en-US"))) : value(v, fmt));
  let h = "";
  H2H_ROWS.forEach(([group, rows]) => {
    const body = rows.map(([key, label, fmt, dir]) => {
      const [a, b] = sides.map((s) => val(key, s.i));
      if (a == null && b == null) return "";
      const r = (v) => (v == null ? v : Math.round(v * (fmt === "dec2" ? 100 : fmt === "dec1" || fmt === "pct" ? 10 : 1)));   // as shown
      const better = dir && a != null && b != null && r(a) !== r(b) ? ((a - b) * dir > 0 ? 0 : 1) : null;
      const cell = (v, n) => `<td class="${n ? "b" : "a"}${better === n ? " best" : ""}" style="--c:${H2H_COLORS[n]}">${show(v, fmt)}</td>`;
      return `<tr>${cell(a, 0)}<th scope="row">${label}</th>${cell(b, 1)}</tr>`;
    }).join("");
    if (body) h += `<tbody><tr class="grp"><th colspan="3" scope="colgroup">${group}</th></tr>${body}</tbody>`;
  });
  document.getElementById("h2h-table").innerHTML =
    `<thead><tr>${sides.map((s, n) => `<th scope="col" class="${n ? "b" : "a"}">${esc(player(s.p))}</th>`).join('<th scope="col"><span class="sr">Measure</span></th>')}</tr></thead>${h}`;
  h2hWindow();
}

// the charts' minute presets: those shorter than the game, and the whole game
function h2hWindow() {
  const mins = gamesById[H2H.tag].length / 60, shown = H2H_PRESETS.filter((m) => m < mins);
  if (!shown.includes(H2H.to)) H2H.to = null;
  const el = document.getElementById("h2h-window");
  el.innerHTML = shown.map((m) => `<button type="button" data-m="${m}" aria-pressed="${H2H.to === m}">0–${m}</button>`).join("")
    + `<button type="button" data-m="all" aria-pressed="${H2H.to === null}">Whole game</button>`;
  h2hCharts();
}

// the small charts: both players' lines over the game, one shared time under the pointer
function h2hCharts() {
  const d = H2H.curves;
  if (!d || !H2H.tag) return;
  const sides = h2hSides(), series = sides.map((s) => d.series[s.i]);
  const end = H2H.to === null ? Infinity : Math.round((H2H.to * 60) / d.step) + 1;      // steps shown
  document.querySelectorAll("#h2h-charts .h2h-chart").forEach((fig) => {
    const k = +fig.dataset.k, svg = fig.querySelector("svg"), lines = series.map((s) => (s ? s[k].slice(0, end) : []));
    const n = Math.max(...lines.map((v) => v.length)), secs = k === 4 || k === 5;
    const W = Math.max(240, svg.clientWidth || fig.clientWidth - 28), H = 150, l = 40, r = 10, t = 8, b = 22, iw = W - l - r, ih = H - t - b;
    const ymax = Math.max(0, ...lines.flat());
    const { top, ticks } = niceTicks(ymax, 3, secs);
    const x = (j) => l + (j / Math.max(n - 1, 1)) * iw, y = (v) => t + ih - (v / top) * ih;
    const fmt = (v) => (v == null ? "–" : secs ? time(v) : Math.round(v).toLocaleString("en-US"));
    let h = ticks.map((v) => `<line x1="${l}" x2="${l + iw}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/>`
      + `<text x="${l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)">${secs ? time(v) : v >= 1000 ? `${v / 1000}k` : v}</text>`).join("");
    const mins = (n - 1) * d.step / 60, mstep = [2, 5, 10, 15, 20, 30].find((s) => mins / s <= (W < 400 ? 3 : 5)) || 30;
    for (let mm = 0; mm * 60 <= (n - 1) * d.step; mm += mstep) {
      const px = x((mm * 60) / d.step);
      h += `<text x="${px}" y="${H - 6}" text-anchor="${mm === 0 ? "start" : px > W - 30 ? "end" : "middle"}" font-size="10.5" fill="var(--muted)">${mm}:00</text>`;
    }
    const j = H2H.j;
    if (j !== null) h += `<line x1="${x(j)}" x2="${x(j)}" y1="${t}" y2="${t + ih}" stroke="var(--muted)" stroke-dasharray="2 3"/>`;
    lines.forEach((v, s) => {
      if (!v.length) return;
      h += `<path d="${v.map((yv, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(yv).toFixed(1)}`).join("")}" fill="none" stroke="${H2H_COLORS[s]}" stroke-width="2" stroke-linejoin="round"/>`;
      if (j !== null && j < v.length) h += `<circle cx="${x(j)}" cy="${y(v[j])}" r="3.5" fill="${H2H_COLORS[s]}" stroke="var(--white)" stroke-width="1.5"/>`;
    });
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("height", H);
    svg.innerHTML = h;
    svg.__geo = { W, l, iw, n };
    fig.querySelector(".v").innerHTML = lines.map((v, s) =>
      `<span><i class="sw" style="--c:${H2H_COLORS[s]}"></i>${fmt(v[j === null ? v.length - 1 : Math.min(j, v.length - 1)])}</span>`).join("")
      + `<small>${j === null ? (H2H.to === null ? "at the end" : `at ${time((n - 1) * d.step)}`) : `at ${time(j * d.step)}`}</small>`;
  });
}
