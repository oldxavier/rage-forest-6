// A fast replay of one game on an AoE-style diamond map, from replay/<game>.json: unit positions
// every ~10 s (drawn moving smoothly in between), buildings from the snapshot they stand in to the
// one they are gone from, deaths as brief flashes, and the starting forest and mines.
// It lives in the stats page's Replays section and loads a game only when the section comes into
// view or a "Watch replay" link (#replay-<game>) is followed, so the page itself stays as fast.
(() => {
const COLORS = {
  gameBlue: "#2f6fe0", gameRed: "#e0412f", gameGreen: "#3c9f49", gameYellow: "#e8c22a",
  gameTeal: "#25b3b3", gamePink: "#9d4fd6", gameGrey: "#a5a5a5", gameOrange: "#f08a24",
};
const SPEEDS = [[30, "30×"], [60, "60×"], [120, "120×"], [240, "240×"]];
const FLASH = 30;                       // seconds of game time a death stays visible

let S, R, gamesById, speed = 60, playing = false, time = 0, last = null;
let canvas, ctx, ground, W, H;

let started = false;
const linked = () => (location.hash.startsWith("#replay-") ? location.hash.slice(8) : null);

function start() {
  if (started) return;
  started = true;
  fetch("data/stats.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((data) => {
      if (!data.meta.replays.length) return;      // a tournament without replays
      S = data;
      gamesById = Object.fromEntries(S.games.map((g) => [g.tag, g]));
      canvas = document.getElementById("map");
      ctx = canvas.getContext("2d");
      pickers();
      window.addEventListener("resize", () => R && (layout(), draw()));
      open(linked() || S.meta.replays[S.meta.replays.length - 1]);
    });
}

// a "Watch replay" link opens that game; otherwise a game loads when the section comes into view
window.addEventListener("hashchange", () => {
  if (!linked()) return;
  document.getElementById("replays").scrollIntoView({ behavior: "smooth" });
  S ? open(linked()) : start();          // while loading, start() opens the linked game itself
});
if (linked()) start();
// the stats above are drawn after their data arrives; until then this section sits near the top
function watchSection() {
  if (!document.querySelector("#group-tables .group")) return setTimeout(watchSection, 200);
  if (!document.getElementById("replays")) return;      // no replays in this tournament
  new IntersectionObserver((seen, obs) => {
    if (seen.some((e) => e.isIntersecting)) {
      start();
      obs.disconnect();
    }
  }).observe(document.getElementById("replays"));
}
watchSection();

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const team = (k) => (S.teams[k] ? S.teams[k].name : k);
const person = (id) => (S.people[id] ? S.people[id].name : id);
const label = (g) => `${team(g.a)} v ${team(g.b)} G${g.n}`;

function clock(s) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function bytes(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------- controls

function pickers() {
  const sel = document.getElementById("game-select");
  sel.innerHTML = S.series
    .filter((s) => s.games.some((tag) => S.meta.replays.includes(tag)))
    .map((s) => `<optgroup label="${esc(s.stage || `Round ${s.round}`)} · ${esc(team(s.a))} v ${esc(team(s.b))}">${s.games
      .filter((tag) => S.meta.replays.includes(tag))
      .map((tag) => `<option value="${tag}">G${gamesById[tag].n} · ${esc(team(gamesById[tag].winner))} won</option>`)
      .join("")}</optgroup>`)
    .join("");
  sel.addEventListener("change", () => open(sel.value));
  const sp = document.getElementById("speed");
  sp.innerHTML = SPEEDS.map(([v, l]) => `<button type="button" data-speed="${v}" aria-pressed="${v === speed}">${l}</button>`).join("");
  sp.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    speed = +b.dataset.speed;
    sp.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
  });
  document.getElementById("play").addEventListener("click", () => (playing ? pause() : play()));
  document.getElementById("scrub").addEventListener("input", (e) => {
    time = +e.target.value;
    draw();
  });
}

function play() {
  if (time >= R.end) time = 0;
  playing = true;
  last = null;
  document.getElementById("play").textContent = "Pause";
  requestAnimationFrame(tick);
}

function pause() {
  playing = false;
  document.getElementById("play").textContent = "Play";
}

function tick(now) {
  if (!playing) return;
  if (last !== null) time = Math.min(R.end, time + ((now - last) / 1000) * speed);
  last = now;
  draw();
  if (time >= R.end) return pause();
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- loading a game

let wanted = null;                      // the game last asked for: only it is drawn

function open(tag) {
  if (!S.meta.replays.includes(tag)) tag = S.meta.replays[S.meta.replays.length - 1];
  wanted = tag;
  pause();
  document.getElementById("game-select").value = tag;
  const g = gamesById[tag];
  document.getElementById("replay-title").textContent = label(g);
  fetch(`replay/${tag}.json`)
    .then((r) => r.json())
    .then((data) => {
      if (tag !== wanted) return;
      R = decode(data, g);
      time = 0;
      const scrub = document.getElementById("scrub");
      scrub.max = R.end;
      layout();
      draw();
    });
}

function decode(d, g) {
  const units = bytes(d.units), raw = bytes(d.frames);
  const words = new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
  const frames = [];
  for (let i = 0; i < words.length; ) {
    const n = words[i++];
    frames.push(words.subarray(i, i + 2 * n));
    i += 2 * n;
  }
  const trees = bytes(d.trees);
  return { ...d, g, frames, owner: (i) => units[2 * i], army: (i) => units[2 * i + 1] === 1, trees, end: d.t[d.t.length - 1], next: null, nextFor: -1 };
}

// ---------------------------------------------------------------- drawing

// the map as the game's minimap: a diamond twice as wide as it is tall
function layout() {
  const box = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  W = Math.min(box.width, 980);
  H = W / 2 + 8;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ground = document.createElement("canvas");
  ground.width = W * dpr;
  ground.height = H * dpr;
  const gc = ground.getContext("2d");
  gc.setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = R.size;
  diamond(gc, 0, 0, n, n, "#cdd3a6");
  gc.fillStyle = "#4f7343";
  for (let i = 0; i < R.trees.length; i += 2) cell(gc, R.trees[i], R.trees[i + 1], 1);
  for (const [x, y, k] of R.mines) {
    gc.fillStyle = k === "g" ? "#d9b23a" : "#8d8d86";
    cell(gc, x, y, 1);
  }
}

function at(x, y) {
  const n = R.size;
  return [((x + y) / (2 * n)) * W, ((n - x + y) / (2 * n)) * (H - 8) + 4];
}

function diamond(c, x, y, w, h, fill) {
  const p = [at(x, y), at(x + w, y), at(x + w, y + h), at(x, y + h)];
  c.beginPath();
  c.moveTo(...p[0]);
  p.slice(1).forEach((q) => c.lineTo(...q));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

function cell(c, x, y, size) {
  const [sx, sy] = at(x, y);
  const w = (size / (2 * R.size)) * W;
  c.fillRect(sx, sy - w / 4, w * 1.05, w / 2 + 0.6);
}

function frameAt(t) {
  let lo = 0, hi = R.t.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (R.t[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function nextPositions(k) {
  if (R.nextFor === k) return R.next;
  const m = new Map(), f = R.frames[k + 1] || [];
  for (let i = 0; i < f.length; i += 2) m.set(f[i], f[i + 1]);
  R.next = m;
  R.nextFor = k;
  return m;
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(ground, 0, 0, W, H);
  const k = frameAt(time);
  const span = (R.t[k + 1] ?? R.t[k] + 1) - R.t[k];
  const a = Math.min(1, Math.max(0, (time - R.t[k]) / span));
  const color = (pid) => COLORS[(R.players[pid] || {}).color] || "#666";

  for (const [x2, y2, pid, fp, first, lastF] of R.buildings) {
    if (first > k || lastF < k) continue;
    ctx.fillStyle = color(pid);
    const x = x2 / 2 - fp / 2, y = y2 / 2 - fp / 2;
    diamondPath(x, y, fp);
    ctx.fill();
    if (fp > 1) {
      ctx.strokeStyle = "rgba(20,25,20,.55)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  const frame = R.frames[k], next = nextPositions(k), count = {};
  for (let i = 0; i < frame.length; i += 2) {
    const idx = frame[i], xy = frame[i + 1];
    let x = xy >> 8, y = xy & 255;
    const nx = next.get(idx);
    if (nx !== undefined) {
      x += ((nx >> 8) - x) * a;
      y += ((nx & 255) - y) * a;
    }
    const pid = R.owner(idx), army = R.army(idx);
    count[pid] = (count[pid] || 0) + 1;
    const [sx, sy] = at(x + 0.5, y + 0.5);
    ctx.fillStyle = color(pid);
    ctx.beginPath();
    ctx.arc(sx, sy, army ? 2.3 : 1.5, 0, Math.PI * 2);
    ctx.fill();
    if (army) {
      ctx.strokeStyle = "rgba(255,255,255,.7)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  // a death: a widening ring in the colour of the player who lost the unit
  for (const [t, x, y, pid] of R.deaths) {
    if (t > time || t < time - FLASH) continue;
    const fade = 1 - (time - t) / FLASH;
    const [sx, sy] = at(x + 0.5, y + 0.5);
    const r = 2 + (1 - fade) * 4;
    ctx.globalAlpha = 0.9 * fade;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(20,25,20,.8)";
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.strokeStyle = color(pid);
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  document.getElementById("clock").textContent = `${clock(time)} / ${clock(R.end)}`;
  document.getElementById("scrub").value = Math.round(time);
  legend(count);
}

function diamondPath(x, y, s) {
  const p = [at(x, y), at(x + s, y), at(x + s, y + s), at(x, y + s)];
  ctx.beginPath();
  ctx.moveTo(...p[0]);
  p.slice(1).forEach((q) => ctx.lineTo(...q));
  ctx.closePath();
}

// players by team with their colour, civ and units on the map right now
function legend(count) {
  const g = R.g;
  const html = [g.a, g.b]
    .map((t) => {
      const rows = Object.entries(R.players)
        .filter(([, p]) => p.team === t)
        .map(([pid, p]) => {
          const em = S.emblems[p.civ] ? `<img class="emblem" src="${esc(S.emblems[p.civ])}" alt="" width="16" height="16">` : "";
          return `<li><i style="background:${COLORS[p.color] || "#666"}"></i><span>${esc(person(p.p))}<small>${em}${esc(p.civ)}</small></span><b>${count[pid] || 0}</b></li>`;
        })
        .join("");
      return `<div class="legend-team ${g.winner === t ? "won" : ""}"><h3>${esc(team(t))}${g.winner === t ? " <span>won</span>" : ""}</h3><ul>${rows}</ul></div>`;
    })
    .join("");
  const el = document.getElementById("legend");
  if (el.dataset.html !== html) {
    el.innerHTML = html;
    el.dataset.html = html;
  }
}
})();
