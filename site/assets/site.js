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
    links();
    summary();
    groups();
    bracket();
    replaySection();
    roleSwitches();
    categories();
    teamTable();
    playerTable();
    civTable();
  })
  .catch((e) => {
    document.querySelectorAll(".loading").forEach((el) => (el.textContent = "The data could not be loaded. Try reloading the page."));
    console.error(e);
  });

// ---------------------------------------------------------------- helpers

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const team = (k) => (D.teams[k] ? D.teams[k].name : k);
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

function gameLabel(tag) {
  const g = gamesById[tag];
  return g ? `${team(g.a)} v ${team(g.b)} G${g.n}` : tag;
}

function links() {
  document.querySelectorAll("[data-link]").forEach((a) => {
    const href = D.meta[a.dataset.link];
    if (href) a.href = href;
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
    const a = acc.get(PG[i].p) || { sum: 0, n: 0, parts: [] };
    a.sum += v;
    a.n += 1;
    if (parts !== undefined) a.parts.push(parts);
    acc.set(PG[i].p, a);
  }
  const out = [];
  for (const [p, a] of acc) {
    const n = spec.agg.avg ? a.n : played.get(p);
    if (n < spec.agg.min) continue;
    out.push({ p, n, v: Math.round(((spec.agg.avg ? a.sum / a.n : a.sum) * 100)) / 100, d: totalsDetail(spec.agg.detail, a.parts) });
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
  return kind.map((label, j) => `${Math.round(parts.reduce((s, p) => s + p[j], 0))} ${label}`).join(", ");
}

function cardRows(b) {
  const r = cardRole[b.id] || "all", sel = cardCivs[b.id], flip = cardFlip.has(b.id);
  const side = flip && b.least ? b.least : b;
  let rows = side.rows.agg
    ? playerTotals(side.rows, r, sel, side.asc ?? b.asc)
    : rowsOf(b, side.rows).filter((x) => b.scope === "match" || (roleOk(r, x.role) && civOk(sel, x.civ)));
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
  if (b.scope === "war") D.war.forEach((x) => civs.add(x.civ));
  else add(b.rows), b.least && add(b.least.rows);
  return [...civs].sort((a, c) => a.localeCompare(c));
}

// ---- drawing a card

// a row: the name (with the civ beside it), then one short line each for the game and any detail
function who(b, r) {
  if (b.scope === "match") return { main: gameLabel(r.g), lines: [esc(`Round ${gamesById[r.g].round} · Group ${gamesById[r.g].group}`)] };
  if (b.scope === "object")
    return { main: r.o, lines: [`${esc(player(r.p))} ${civTag(r.civ)}`, esc(gameLabel(r.g))] };
  if (b.scope === "player")
    return { main: player(r.p), lines: [`${esc(team(D.people[r.p].team))} · ${r.n} game${r.n === 1 ? "" : "s"}`, r.d ? esc(r.d) : ""] };
  return { main: player(r.p), civ: r.civ, lines: [esc(gameLabel(r.g)), r.d ? esc(r.d) : ""] };
}

const SCOPES = { game: "One game", player: "All games", object: "One unit or building, one game", match: "Whole game" };
const CIV_SCOPES = new Set(["game", "player", "object", "war"]);

function controls(b, r) {
  const roles = b.scope === "match" ? "" : `<span class="seg" role="group" aria-label="Player role">${ROLES.map(
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
  return roles || order || civs ? `<div class="card-controls">${roles}${order}${civs}</div>` : "";
}

function civButton(id) {
  const sel = cardCivs[id], n = sel ? sel.civs.size : 0;
  const named = n === 1 ? [...sel.civs][0] : `${n} civs`;
  const label = !n ? "All civs" : sel.mode === "only" ? named : `All but ${named}`;
  return `<button type="button" class="civ-btn${n ? " on" : ""}" data-act="civs" aria-haspopup="dialog" aria-expanded="${civPop === id}">${esc(label)}</button>`;
}

function civPopup(id, civs) {
  const sel = cardCivs[id] || { mode: "only", civs: new Set() };
  return `<div class="civ-pop" role="dialog" aria-label="Choose civs">
    <div class="civ-pop-head">
      <span class="seg" role="group" aria-label="Show">${[["only", "Only these"], ["except", "All but these"]]
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

function boardCard(b) {
  const r = cardRole[b.id] || "all";
  if (b.scope === "war") return warCard(b, r);
  if (b.scope === "units") return unitsCard(b, r);
  const { side, rows } = cardRows(b);
  views[b.id] = { b, rows, drawn: Math.min(rows.length, FIRST_DRAWN) };
  const note = side.note ?? b.note;
  return `<article class="board" id="board-${b.id}" data-id="${b.id}">
    <div class="board-top"><span class="scope">${SCOPES[b.scope]}</span></div>
    <h3>${esc(side.title)}</h3>
    ${note ? `<p class="note">${esc(note)}</p>` : ""}
    ${controls(b, r)}
    ${rows.length ? `<ol class="board-list" data-id="${b.id}">${rowsHtml(b, rows, 0, views[b.id].drawn)}</ol>` : `<p class="empty">${emptyText(b, r)}</p>`}
  </article>`;
}

function emptyText(b, r) {
  const sel = cardCivs[b.id];
  if (sel && sel.civs.size) return `Nothing for ${sel.mode === "only" ? "these civs" : "the other civs"}${r === "all" ? "" : ` as ${r}`}.`;
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
  if (act === "side") btn.dataset.side === "least" ? cardFlip.add(id) : cardFlip.delete(id);
  if (act === "flip") cardFlip.has(id) ? cardFlip.delete(id) : cardFlip.add(id);
  if (act === "civs") civPop = civPop === id ? null : id;
  if (act === "civmode") (cardCivs[id] ||= { mode: "only", civs: new Set() }).mode = btn.dataset.mode;
  if (act === "civclear") delete cardCivs[id];
  if (act === "civclose") civPop = null;
  const focus = act === "civs" && civPop === id ? ".civ-pop input"
    : act === "civclose" ? '[data-act="civs"]'
    : `[data-act="${act}"]${btn.dataset.role ? `[data-role="${btn.dataset.role}"]` : ""}${btn.dataset.side ? `[data-side="${btn.dataset.side}"]` : ""}${btn.dataset.mode ? `[data-mode="${btn.dataset.mode}"]` : ""}`;
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
    <div class="board-top"><span class="scope">One game · per player</span></div>
    <h3>${esc(b.title)}</h3>
    ${controls(b, r)}
    <div class="table-shell war-shell"><table class="war-table" id="war-table"><thead></thead><tbody></tbody></table></div>
  </article>`;
}

function warTable() {
  const r = cardRole.dark_age_war || "all";
  const rows = D.war.filter((x) => roleOk(r, x.role) && civOk(cardCivs.dark_age_war, x.civ));
  const cols = [
    { key: "name", label: "Player", cls: "name", html: (r) => `<span title="${esc(player(r.p))}${aliasNote(r.p)}">${esc(player(r.p))}</span><small>${civTag(r.civ)} · ${esc(gameLabel(r.g))}</small>`, sort: (r) => player(r.p).toLowerCase(), asc: true },
    { key: "vs", label: "Against", cls: "team", html: (r) => r.vs.map((p) => esc(player(p))).join(", "), sort: (r) => player(r.vs[0]).toLowerCase(), asc: true },
    { key: "killed", label: "Killed", text: (r) => r.killed, sort: (r) => r.killed },
    { key: "lost", label: "Lost", text: (r) => r.lost, sort: (r) => r.lost },
    { key: "net", label: "Net", text: (r) => signed(r.net), sort: (r) => r.net * 1000 + r.killed + r.lost, tone: (r) => r.net },
    { key: "idle", label: "Idle TC", text: (r) => time(r.idle), sort: (r) => r.idle, asc: true },
    { key: "opp", label: "Their idle TC", text: (r) => time(r.opp_idle), sort: (r) => r.opp_idle },
    { key: "econ", label: "Balance", text: (r) => signed(r.econ), sort: (r) => r.econ, tone: (r) => r.econ, title: D.meta.balance_note },
  ];
  sortable("war-table", cols, rows, "econ");
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
    { key: "kills", label: "Kills", text: (r) => value(r.kills), sort: (r) => r.kills },
    { key: "deaths", label: "Deaths", text: (r) => value(r.deaths), sort: (r) => r.deaths },
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
      const v = idx.map((i) => col[c][i]).filter((x) => x != null);
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
    };
    const tot = (c) => Math.round(idx.reduce((s, i) => s + (col[c][i] || 0), 0));
    const kills = tot("unit_kills"), deaths = tot("unit_deaths");
    return {
      p, team: D.people[p].team, games: idx.length, wins: idx.filter((i) => PG[i].w).length,
      flank: idx.filter((i) => PG[i].role === "flank").length, pocket: idx.filter((i) => PG[i].role === "pocket").length,
      kills, deaths, kd: Math.round((kills / Math.max(deaths, 1)) * 100) / 100,
      eapm: avg("total_real_eapgm"), feudal: avg("feudal"), castle: avg("castle"), imperial: avg("imperial"),
      idle_feudal: avg("idle_feudal"), idle_castle: avg("idle_castle"), res: avg("total_collected_res"), walls: avg("walls"),
    };
  });
}

function teamTable() {
  const per = (k) => ({ text: (r) => value(r[k]), sort: (r) => r[k] });
  const cols = [
    { key: "team", label: "Team", cls: "name", text: (r) => team(r.team), sort: (r) => team(r.team).toLowerCase(), asc: true },
    { key: "group", label: "Group", cls: "team", text: (r) => D.teams[r.team].group, sort: (r) => D.teams[r.team].group, asc: true },
    { key: "games", label: "Games", text: (r) => r.games, sort: (r) => r.games },
    { key: "wins", label: "Won", text: (r) => r.wins, sort: (r) => r.wins },
    { key: "unit_kills", label: "Kills", ...per("unit_kills") },
    { key: "eco_kills", label: "Eco kills", ...per("eco_kills") },
    { key: "building_razes", label: "Razed", ...per("building_razes") },
    { key: "total_collected_res", label: "Resources", ...per("total_collected_res") },
    { key: "trade_profit", label: "Trade profit", ...per("trade_profit") },
    { key: "walls", label: "Wall pieces", ...per("walls") },
    { key: "towers", label: "Towers", ...per("towers") },
    { key: "castles", label: "Castles", ...per("castles") },
  ];
  sortable("team-table", cols, D.team_rows, "wins");
}

function civTable() {
  const cols = [
    { key: "civ", label: "Civ", cls: "name", html: (r) => civTag(r.civ), sort: (r) => r.civ, asc: true },
    { key: "picks", label: "Picks", text: (r) => r.picks, sort: (r) => r.picks },
    { key: "wins", label: "Won", text: (r) => r.wins, sort: (r) => r.wins },
    { key: "rate", label: "Win %", text: (r) => (r.picks >= 3 ? Math.round((100 * r.wins) / r.picks) + "%" : "–"), sort: (r) => (r.picks >= 3 ? r.wins / r.picks : null) },
    { key: "kills", label: "Kills", text: (r) => value(r.kills), sort: (r) => r.kills },
  ];
  sortable("civ-table", cols, D.civs, "picks");
}
