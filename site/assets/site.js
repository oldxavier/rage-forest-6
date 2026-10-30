// Renders the whole page from data/stats.json, which is regenerated whenever new games are added.
const ROWS_SHOWN = 5;
const ROLES = [["all", "All"], ["flank", "Flank"], ["pocket", "Pocket"]];

let D, gamesById, category, role = "all";   // role: the players table's filter
const flipped = new Set();          // boards showing their "least" side
const refresh = [];                 // redraws that depend on the players table's role

fetch("data/stats.json", { cache: "no-cache" })
  .then((r) => r.json())
  .then((data) => {
    D = data;
    gamesById = Object.fromEntries(D.games.map((g) => [g.tag, g]));
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

// each card keeps its own role and its own top / bottom choice
const cardRole = {};
const cardOpen = new Set();

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
    showCategory();
  });
  document.getElementById("boards").addEventListener("click", cardClick);
  category = cats[0].id;
  showCategory();
}

function cardClick(e) {
  const btn = e.target.closest("button[data-act]");
  const card = btn && btn.closest(".board");
  if (!card) return;
  const id = card.dataset.id;
  if (btn.dataset.act === "role") cardRole[id] = btn.dataset.role;
  if (btn.dataset.act === "side") btn.dataset.side === "least" ? flipped.add(id) : flipped.delete(id);
  const closing = btn.dataset.act === "more" && cardOpen.has(id);
  if (btn.dataset.act === "more") closing ? cardOpen.delete(id) : cardOpen.add(id);
  redrawCard(id, btn.dataset.act + (btn.dataset.role || btn.dataset.side || ""));
  if (closing) backToCard(id);
}

// after a long list closes, bring the card's top back into view below the category tabs
function backToCard(id) {
  const below = document.querySelector(".category-bar").getBoundingClientRect().height + 12;
  const top = document.getElementById(`board-${id}`).getBoundingClientRect().top;
  if (top < below) {
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: window.scrollY + top - below, behavior: smooth ? "smooth" : "auto" });
  }
}

function redrawCard(id, focus) {
  const old = document.getElementById(`board-${id}`);
  const b = D.boards.list.find((x) => x.id === id);
  const box = document.createElement("div");
  box.innerHTML = boardCard(b);
  old.replaceWith(box.firstElementChild);
  if (b.scope === "war") warTable();
  if (b.scope === "units") unitsTable();
  const target = [...document.querySelectorAll(`#board-${id} button[data-act]`)].find(
    (x) => x.dataset.act + (x.dataset.role || x.dataset.side || "") === focus
  );
  if (target) target.focus();
}

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

function controls(b, r) {
  const roles = b.scope === "match" ? "" : `<span class="seg" role="group" aria-label="Player role">${ROLES.map(
    ([k, l]) => `<button type="button" data-act="role" data-role="${k}" aria-pressed="${k === r}">${l}</button>`
  ).join("")}</span>`;
  const least = flipped.has(b.id);
  const sides = b.least
    ? `<span class="seg" role="group" aria-label="Order">${[["top", b.label, !least], ["least", b.least.label, least]]
        .map(([k, l, on]) => `<button type="button" data-act="side" data-side="${k}" aria-pressed="${on}">${esc(l)}</button>`)
        .join("")}</span>`
    : "";
  return roles || sides ? `<div class="card-controls">${roles}${sides}</div>` : "";
}

function boardCard(b) {
  const r = cardRole[b.id] || "all";
  if (b.scope === "war") return warCard(b, r);
  if (b.scope === "units") return unitsCard(b, r);
  const least = flipped.has(b.id) && b.least;
  const side = least ? b.least : b;
  const rows = side.rows[r] || [];
  const open = cardOpen.has(b.id);
  const items = rows
    .map((x, i) => {
      const w = who(b, x);
      const rank = rows.findIndex((y) => y.v === x.v) + 1;      // ties share a rank
      const result = x.w === undefined ? "" : x.w ? "won" : "lost";
      return `<li class="${i >= ROWS_SHOWN && !open ? "extra" : ""} ${result}">
        <span class="rank">${rank}</span>
        <span class="who"><span class="main" title="${esc(w.main)}${aliasNote(x.p)}">${esc(w.main)}${w.civ ? ` ${civTag(w.civ)}` : ""}</span>${w.lines
          .filter(Boolean)
          .map((l) => `<small>${l}</small>`)
          .join("")}</span>
        <span class="val">${x.txt ? esc(x.txt) : value(x.v, b.fmt)}</span>
      </li>`;
    })
    .join("");
  // shown only once someone has actually skipped it
  const skipped = (b.never || []).filter((x) => r === "all" || x.role === r);
  const never = skipped.length
    ? `<div class="never"><b>${esc(b.never_title)}</b><ul>${skipped
        .map((x) => `<li>${esc(player(x.p))} <small>${civTag(x.civ)} · ${esc(gameLabel(x.g))}</small></li>`)
        .join("")}</ul></div>`
    : "";
  const note = side.note ?? b.note;
  const roleWord = { all: "", flank: "flank ", pocket: "pocket " }[r];
  return `<article class="board" id="board-${b.id}" data-id="${b.id}">
    <div class="board-top"><span class="scope">${SCOPES[b.scope]}</span></div>
    <h3>${esc(side.title)}</h3>
    ${note ? `<p class="note">${esc(note)}</p>` : ""}
    ${controls(b, r)}
    ${never}
    ${rows.length ? `<ol>${items}</ol>` : `<p class="empty">No ${roleWord}games yet.</p>`}
    ${rows.length > ROWS_SHOWN
      ? `<button type="button" class="more" data-act="more" aria-expanded="${open}">${open ? "Show top 5" : `Show top ${rows.length}`}</button>`
      : ""}
  </article>`;
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
  const rows = D.war.filter((x) => r === "all" || x.role === r);
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
  const update = sortable("player-table", cols, D.players[role], "kills", "player-search");
  refresh.push(() => update(D.players[role]));
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
