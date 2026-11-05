"use strict";

// CONFIG
const DISCORD_ID = "1016846998021873714";

const PROJECTS = [
  // {
  //   title: "Project One",
  //   description: "One sentence on what it does and why it's interesting.",
  //   tags: ["TypeScript", "NestJS"],
  //   url: "https://github.com/your-username/project-one",
  // },
  // {
  //   title: "Project Two",
  //   description: "Another project. Mention the problem it solves.",
  //   tags: ["C++", "Qt"],
  //   url: "https://github.com/your-username/project-two",
  // },
  // {
  //   title: "Project Three",
  //   description: "A third one. Swap these out for your real work.",
  //   tags: ["Java", "Fabric"],
  //   url: "https://github.com/your-username/project-three",
  // },
];

// Live project feed from GitHub. Leave as the placeholder to use PROJECTS above.
const GITHUB_USER = "RedMeansWar";
const FEATURED_REPOS = [
  "JRPC",
  "DiscordBot-TypeScript-Template",
  "TempClean",
  "WinUtils",
  "Tweeny",
  "FiveM-Scripts"
]; // optional: ["repo-a", "repo-b"] to show specific repos
const MAX_REPOS = 6; // max number is 6 repositories

const $ = (id) => document.getElementById(id);
// localStorage can throw (private mode, blocked storage), so wrap it.
function storeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

const root = document.documentElement;
const themeBtn = $("theme-toggle");
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function activeTheme() {
  const saved = storeGet("theme");
  if (saved === "light" || saved === "dark") return saved;
  return systemDark.matches ? "dark" : "light";
}

function syncThemeButton() {
  const theme = activeTheme();
  themeBtn.textContent = theme === "dark" ? "Light mode" : "Dark mode";
  themeBtn.setAttribute("aria-pressed", String(theme === "dark"));
}

themeBtn.addEventListener("click", () => {
  const next = activeTheme() === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  storeSet("theme", next);
  syncThemeButton();
});

// If the user never chose manually, follow OS changes live.
systemDark.addEventListener("change", () => {
  if (!storeGet("theme")) syncThemeButton();
});
syncThemeButton();

async function fetchRepos() {
  const cacheKey = "ghRepos:" + GITHUB_USER;

  // Cache for 10 minutes: unauthenticated GitHub API calls are limited to 60/hour per IP
  try {
    const cached = JSON.parse(storeGet(cacheKey) || "null");
    if (cached && Date.now() - cached.time < 10 * 60 * 1000) return cached.items;
  } catch { /* ignore bad cache */ }

  const res = await fetch(`https://api.github.com/users/${GITHUB_USER}/repos?sort=pushed&per_page=100`);
  if (!res.ok) throw new Error("GitHub responded " + res.status);
  const repos = await res.json();

  let list = repos.filter((r) => !r.fork && !r.archived);
  if (FEATURED_REPOS.length) list = list.filter((r) => FEATURED_REPOS.includes(r.name));

  const items = list.slice(0, MAX_REPOS).map((r) => ({
    title: r.name,
    description: r.description || "No description yet.",
    tags: [r.language, ...(r.topics || []).slice(0, 2)].filter(Boolean),
    url: r.html_url,
    stars: r.stargazers_count,
  }));

  storeSet(cacheKey, JSON.stringify({ time: Date.now(), items }));
  return items;
}

async function loadProjects() {
  let items = PROJECTS; // fallback if GitHub isn't configured or fails
  if (GITHUB_USER && GITHUB_USER !== "your-github-username") {
    try {
      const live = await fetchRepos();
      if (live.length) items = live;
    } catch { /* keep fallback */ }
  }
  renderProjects(items);
}

function renderProjects(items) {
  const grid = $("project-grid");
  grid.replaceChildren();
  for (const p of items) {
    const card = document.createElement("article");
    card.className = "card project";

    const h3 = document.createElement("h3");
    h3.textContent = p.title;

    const desc = document.createElement("p");
    desc.textContent = p.description;

    const tags = document.createElement("ul");
    tags.className = "tags";
    for (const t of p.tags) {
      const li = document.createElement("li");
      li.textContent = t;
      tags.append(li);
    }

    const link = document.createElement("a");
    link.href = p.url;
    link.textContent = "View on GitHub →";
    link.rel = "noopener";

    const foot = document.createElement("div");
    foot.className = "project-foot";
    foot.append(link);
    if (p.stars) {
      const stars = document.createElement("span");
      stars.className = "stars";
      stars.textContent = "★ " + p.stars;
      foot.append(stars);
    }

    card.append(h3, desc, tags, foot);
    grid.append(card);
  }
}

const STATUS_LABEL = {
  online: "Online",
  idle: "Idle",
  dnd: "Do not disturb",
  offline: "Offline",
};

let activityStart = null;
let spotifyRange = null;   // { start, end } in ms while a track is playing

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function activityImageUrl(activity) {
  const img = activity.assets && activity.assets.large_image;
  if (!img) return null;
  // Rich presence images can be proxied external images ("mp:external/...")
  if (img.startsWith("mp:external/")) {
    return "https://media.discordapp.net/external/" + img.slice("mp:external/".length);
  }
  if (img.startsWith("mp:")) return null;
  return `https://cdn.discordapp.com/app-assets/${activity.application_id}/${img}.png`;
}

function renderPresence(data) {
  const user = data.discord_user;
  const status = data.discord_status || "offline";

  $("display-name").textContent = user.global_name || user.display_name || user.username;
  $("username").textContent = "@" + user.username;

  const avatar = $("avatar");
  if (user.avatar) {
    avatar.src = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
    avatar.hidden = false;
  }

  const dot = $("status-dot");
  dot.className = "status-dot " + status;
  dot.title = STATUS_LABEL[status] || status;

  const custom = (data.activities || []).find((a) => a.type === 4);
  $("status-text").textContent =
    (custom && custom.state) ? `${STATUS_LABEL[status]} · ${custom.state}` : STATUS_LABEL[status];

  const box = $("activity");
  const imgEl = $("activity-img");
  activityStart = null;
  spotifyRange = null;
  $("progress").hidden = true;

  if (data.listening_to_spotify && data.spotify) {
    const sp = data.spotify;
    $("activity-name").textContent = "Listening to Spotify";
    $("activity-details").textContent = sp.song;
    $("activity-state").textContent = "by " + sp.artist;
    $("activity-time").textContent = "";
    imgEl.src = sp.album_art_url;
    imgEl.hidden = false;
    if (sp.timestamps && sp.timestamps.start && sp.timestamps.end) {
      spotifyRange = { start: sp.timestamps.start, end: sp.timestamps.end };
      $("progress").hidden = false;
    }
    box.hidden = false;
    updateElapsed();
    return;
  }

  const act = (data.activities || []).find((a) => a.type !== 4);
  if (!act) {
    box.hidden = true;
    return;
  }

  $("activity-name").textContent = act.name;
  $("activity-details").textContent = act.details || "";
  $("activity-state").textContent = act.state || "";

  const url = activityImageUrl(act);
  imgEl.hidden = !url;
  if (url) imgEl.src = url;

  activityStart = act.timestamps && act.timestamps.start ? act.timestamps.start : null;
  box.hidden = false;
  updateElapsed();
}

function updateElapsed() {
  const label = $("activity-time");

  if (spotifyRange) {
    const total = spotifyRange.end - spotifyRange.start;
    const played = Math.min(Math.max(Date.now() - spotifyRange.start, 0), total);
    const pct = total > 0 ? (played / total) * 100 : 0;
    label.textContent = `${formatElapsed(played)} / ${formatElapsed(total)}`;
    $("progress-bar").style.width = pct + "%";
    $("progress").setAttribute("aria-valuenow", String(Math.round(pct)));
    return;
  }

  label.textContent = activityStart
    ? formatElapsed(Date.now() - activityStart) + " elapsed"
    : "";
}
setInterval(updateElapsed, 1000);

async function loadPresenceOnce() {
  try {
    const res = await fetch(`https://api.lanyard.rest/v1/users/${DISCORD_ID}`);
    const json = await res.json();
    if (json.success) renderPresence(json.data);
  } catch {
    $("status-text").textContent = "Couldn't reach Discord status right now.";
  }
}

function connectPresenceSocket() {
  let heartbeat;
  const ws = new WebSocket("wss://api.lanyard.rest/socket");

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.op === 1) {
      // Hello: subscribe and start heartbeating
      ws.send(JSON.stringify({ op: 2, d: { subscribe_to_id: DISCORD_ID } }));
      heartbeat = setInterval(() => ws.send(JSON.stringify({ op: 3 })), msg.d.heartbeat_interval);
    } else if (msg.op === 0 && (msg.t === "INIT_STATE" || msg.t === "PRESENCE_UPDATE")) {
      renderPresence(msg.d);
    }
  });

  ws.addEventListener("close", () => {
    clearInterval(heartbeat);
    setTimeout(connectPresenceSocket, 5000); // simple reconnect
  });
}

// SNAKE? SNAKE? SNAKE! (a small game for fun)
const canvas = $("snake");
const ctx = canvas.getContext("2d");
const GRID = 20;
const CELL = canvas.width / GRID;

const scoreEl = $("score");
const bestEl = $("best");
const startBtn = $("start-btn");

let snake, dir, nextDir, food, score, best, state, loopId;
// state: "idle" | "running" | "paused" | "over"

best = Number(storeGet("snakeBest")) || 0;
bestEl.textContent = best;

function css(name) {
  return getComputedStyle(root).getPropertyValue(name).trim();
}

function resetGame() {
  snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  dir = { x: 1, y: 0 };
  nextDir = dir;
  score = 0;
  scoreEl.textContent = score;
  placeFood();
}

function placeFood() {
  const free = [];
  for (let x = 0; x < GRID; x++) {
    for (let y = 0; y < GRID; y++) {
      if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
    }
  }
  food = free[Math.floor(Math.random() * free.length)];
}

function startGame() {
  clearTimeout(loopId);
  resetGame();
  state = "running";
  startBtn.textContent = "Restart";
  canvas.focus();
  tick();
}

function togglePause() {
  if (state === "running") {
    state = "paused";
    clearTimeout(loopId);
    draw();
  } else if (state === "paused") {
    state = "running";
    tick();
  }
}

function tick() {
  if (state !== "running") return;
  step();
  draw();
  if (state === "running") {
    const delay = Math.max(60, 140 - score * 3); // speeds up as you eat. Yum.
    loopId = setTimeout(tick, delay);
  }
}

function step() {
  dir = nextDir;
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  const hitWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
  // The tail will move away this tick, so ignore it in the collision check
  const hitSelf = snake.slice(0, -1).some((s) => s.x === head.x && s.y === head.y);
  if (hitWall || hitSelf) {
    state = "over";
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      storeSet("snakeBest", String(best));
    }
    return;
  }

  snake.unshift(head);
  if (head.x === food.x && head.y === food.y) {
    score++;
    scoreEl.textContent = score;
    placeFood();
  } else {
    snake.pop();
  }
}

function turn(x, y) {
  // Block reversing straight into yourself
  if (x === -dir.x && y === -dir.y) return;
  nextDir = { x, y };
}

function drawCenteredText(lines) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.fillText(lines[0], canvas.width / 2, canvas.height / 2 - 6);
  if (lines[1]) {
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText(lines[1], canvas.width / 2, canvas.height / 2 + 24);
  }
}

function draw() {
  // Colors come from CSS variables, so the game follows the theme
  ctx.fillStyle = css("--surface-2");
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (snake) {
    ctx.fillStyle = css("--accent");
    ctx.beginPath();
    ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 3, 0, Math.PI * 2);
    ctx.fill();

    snake.forEach((seg, i) => {
      ctx.globalAlpha = i === 0 ? 1 : 0.8;
      ctx.fillStyle = css("--text");
      ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
    });
    ctx.globalAlpha = 1;
  }

  if (state === "idle") drawCenteredText(["Snake", "Press Start or Space"]);
  if (state === "paused") drawCenteredText(["Paused", "Press Space to resume"]);
  if (state === "over") drawCenteredText(["Game over", `Score ${score} · Space to retry`]);
}

/* Keyboard */
const KEYS = {
  ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
  ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
  ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
  ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
};

window.addEventListener("keydown", (e) => {
  const focused = document.activeElement === canvas;

  if (e.code === "Space" && (focused || state === "running" || state === "paused")) {
    e.preventDefault();
    if (state === "idle" || state === "over") startGame();
    else togglePause();
    return;
  }

  if (state === "running" && KEYS[e.key]) {
    e.preventDefault(); // stop the page from scrolling while playing
    turn(...KEYS[e.key]);
  }
});

/* Touch swipes */
let touchStart = null;
canvas.addEventListener("touchstart", (e) => {
  const t = e.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });

canvas.addEventListener("touchend", (e) => {
  if (!touchStart || state !== "running") return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return; // ignore taps
  if (Math.abs(dx) > Math.abs(dy)) turn(Math.sign(dx), 0);
  else turn(0, Math.sign(dy));
  touchStart = null;
});

startBtn.addEventListener("click", startGame);

// Redraw on theme change so the canvas colors update immediately
new MutationObserver(draw).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
systemDark.addEventListener("change", draw);

// Okay we are done now.
$("year").textContent = new Date().getFullYear();
loadProjects();
state = "idle";
resetGame();
draw();
loadPresenceOnce();
connectPresenceSocket();
