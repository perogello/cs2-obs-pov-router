import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { WebSocketServer } from "ws";
import readline from "readline/promises";
import OBSWebSocket from "obs-websocket-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");

const PORT = Number(process.env.PORT || 3000);
const OBS_URL = process.env.OBS_URL || "ws://127.0.0.1:4455";
const ROUTER_SCENE = process.env.ROUTER_SCENE || "POV_ROUTER";
const MAPPING_FILE = path.join(__dirname, "mapping_obs.json");
const ROSTER_FILE = path.join(__dirname, "players_db.json");
const REAPPLY_MS = Number(process.env.REAPPLY_MS || 100);
const DEBUG_TIMING = process.env.DEBUG_TIMING === "1";

const STEAM_ID_RE = /^\d{17}$/;
const SOURCE_KEY_RE = /^.+:\d+$/;

const log = (...args) => console.log(new Date().toISOString(), ...args);
let promptRl = null;

function getPromptRl() {
  if (!promptRl) {
    promptRl = readline.createInterface({ input: process.stdin, output: process.stdout });
    promptRl.on("close", () => {
      promptRl = null;
    });
  }
  return promptRl;
}

async function promptObsPassword(question = "OBS WebSocket password: ") {
  try {
    return (await getPromptRl().question(question)).trim();
  } catch (e) {
    if (e?.code === "ERR_USE_AFTER_CLOSE") {
      promptRl = null;
      return (await getPromptRl().question(question)).trim();
    }
    throw e;
  }
}

let obsPass = process.env.OBS_PASS || (await promptObsPassword());

let mapping = loadJson(MAPPING_FILE, {});
let roster = loadJson(ROSTER_FILE, {});
let livePlayers = {};

let obsConnected = false;
let connectingObs = false;
let reconnectTimer = null;
let sceneItemsCache = null;

let pendingBindSource = null;
let lastSteamId = null;
let currentVisibleKey = null;
let knownVisibleKeys = new Set();

let desiredRoute = { type: "hide", reason: "startup", seq: 0 };
let routeSeq = 0;
let appliedSeq = 0;
let applyingRoute = false;
let lastAppliedSignature = "";
let lastAppliedAt = 0;
let switchVersion = 0;
let lastRouteKey = "";

function debug(...args) {
  if (DEBUG_TIMING) log("[DEBUG]", ...args);
}

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function saveMapping() {
  saveJson(MAPPING_FILE, mapping);
}

function saveRoster() {
  saveJson(ROSTER_FILE, roster);
}

function sortedRoster() {
  return Object.entries(roster)
    .map(([steamid, name]) => ({ steamid, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeRosterPlayers(value) {
  const rows = Array.isArray(value)
    ? value
    : Object.entries(value || {}).map(([steamid, name]) => ({ steamid, name }));

  const normalized = {};
  for (const row of rows) {
    const steamid = String(row?.steamid || row?.steamId || row?.steam_id || "").trim();
    const name = String(row?.name || row?.nickname || row?.nick || "").trim();
    if (isSteamId(steamid) && name) normalized[steamid] = name;
  }
  return normalized;
}

function sortedLivePlayers() {
  return Object.values(livePlayers).sort((a, b) => b.lastSeen - a.lastSeen);
}

function isSteamId(value) {
  return STEAM_ID_RE.test(String(value || "").trim());
}

function itemKey(item) {
  return `${item.sceneName}:${item.id}`;
}

function routeSignature(route) {
  return `${route.type}:${route.steamid || ""}:${route.source || ""}:${route.reason || ""}`;
}

function queueRoute(route, force = false) {
  const signature = routeSignature(route);
  const now = Date.now();

  if (!force && signature === lastAppliedSignature && now - lastAppliedAt < REAPPLY_MS) {
    return;
  }

  desiredRoute = { ...route, seq: ++routeSeq };
  lastRouteKey = signature;
  drainRoutes();
}

async function drainRoutes() {
  if (applyingRoute) return;
  applyingRoute = true;

  try {
    while (appliedSeq < desiredRoute.seq) {
      const route = desiredRoute;
      await applyRoute(route);
      appliedSeq = route.seq;
      lastAppliedSignature = routeSignature(route);
      lastAppliedAt = Date.now();
    }
  } catch (e) {
    log("[ROUTER] apply failed:", e?.message || e);
  } finally {
    applyingRoute = false;
    if (appliedSeq < desiredRoute.seq) drainRoutes();
  }
}

const obs = new OBSWebSocket();

function isAuthError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("auth");
}

function scheduleObsReconnect(delay = 1000) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectOBS();
  }, delay);
}

async function connectOBS() {
  if (connectingObs || obsConnected) return;
  connectingObs = true;
  let retryDelay = null;

  try {
    await obs.connect(OBS_URL, obsPass);
    obsConnected = true;
    sceneItemsCache = null;
    log("[OBS] connected:", OBS_URL);
    broadcastState();
  } catch (e) {
    obsConnected = false;
    log("[OBS] connection failed:", e?.message || e);

    if (isAuthError(e)) {
      obsPass = await promptObsPassword("OBS WebSocket password is wrong. Enter password again: ");
      retryDelay = 0;
    } else {
      retryDelay = 2000;
    }
  } finally {
    connectingObs = false;
    if (!obsConnected && retryDelay !== null) scheduleObsReconnect(retryDelay);
  }
}

connectOBS();

obs.on("ConnectionClosed", () => {
  obsConnected = false;
  sceneItemsCache = null;
  log("[OBS] disconnected");
  broadcastState();
  scheduleObsReconnect(1000);
});

async function listSceneItemsRecursive(sceneName, isGroupScene = false) {
  const { sceneItems } = await obs.call(
    isGroupScene ? "GetGroupSceneItemList" : "GetSceneItemList",
    { sceneName }
  );

  const out = [];
  for (const item of sceneItems) {
    const normalized = {
      sceneName,
      id: item.sceneItemId,
      key: `${sceneName}:${item.sceneItemId}`,
      sourceName: item.sourceName,
      isGroup: !!item.isGroup,
    };
    out.push(normalized);

    if (item.isGroup) {
      out.push(...(await listSceneItemsRecursive(item.sourceName, true)));
    }
  }

  return out;
}

async function getSceneItems(forceRefresh = false) {
  if (!obsConnected) return [];
  if (!forceRefresh && sceneItemsCache) return sceneItemsCache;

  try {
    sceneItemsCache = await listSceneItemsRecursive(ROUTER_SCENE);
    return sceneItemsCache;
  } catch (e) {
    log("[OBS] scene item list failed:", e?.message || e);
    sceneItemsCache = [];
    return [];
  }
}

function resolveFromItems(items, ref, allowLegacyName = false) {
  const sourceRef = String(ref || "").trim();
  let target = items.find((item) => itemKey(item) === sourceRef);
  if (!target && allowLegacyName) target = items.find((item) => item.sourceName === sourceRef);
  return target || null;
}

async function resolveSceneItem(ref, forceRefresh = false) {
  const sourceRef = String(ref || "").trim();
  if (!sourceRef) return null;

  const allowLegacyName = !SOURCE_KEY_RE.test(sourceRef);
  let target = resolveFromItems(await getSceneItems(forceRefresh), sourceRef, allowLegacyName);
  if (!target && !forceRefresh) {
    target = resolveFromItems(await getSceneItems(true), sourceRef, allowLegacyName);
  }
  return target;
}

async function normalizeSourceRef(ref, allowLegacyName = true, forceRefresh = false) {
  const target = await resolveSceneItem(ref, forceRefresh);
  if (!target && allowLegacyName) return null;
  return target ? itemKey(target) : null;
}

async function normalizeMappedSource(steamid) {
  const sourceRef = mapping[steamid];
  if (!sourceRef) return null;

  const normalized = await normalizeSourceRef(sourceRef, !SOURCE_KEY_RE.test(sourceRef));
  if (!normalized) {
    log("[MAPPING] stale source:", steamid, sourceRef);
    return null;
  }

  if (normalized !== sourceRef) {
    mapping[steamid] = normalized;
    saveMapping();
    broadcast({ type: "mapping", mapping });
    log("[MAPPING] migrated:", steamid, sourceRef, "->", normalized);
  }

  return normalized;
}

async function setItemEnabled(item, enabled) {
  await obs.call("SetSceneItemEnabled", {
    sceneName: item.sceneName,
    sceneItemId: item.id,
    sceneItemEnabled: enabled,
  });
}

async function enableParentGroups(target) {
  const items = await getSceneItems();
  let current = target;

  while (current && current.sceneName !== ROUTER_SCENE) {
    const parent = items.find((item) => item.isGroup && item.sourceName === current.sceneName);
    if (!parent) break;

    await setItemEnabled(parent, true);
    current = parent;
  }
}

async function hideItems(items) {
  for (const item of items) {
    if (!item.isGroup) await setItemEnabled(item, false);
  }
}

async function hideAllItems() {
  await hideItems(await getSceneItems());
  knownVisibleKeys.clear();
  currentVisibleKey = null;
}

async function hideKnownVisibleItems() {
  const items = await getSceneItems();
  const visibleItems = [...knownVisibleKeys]
    .map((key) => items.find((item) => itemKey(item) === key))
    .filter(Boolean);

  if (visibleItems.length) {
    await hideItems(visibleItems);
  } else {
    await hideAllItems();
  }

  knownVisibleKeys.clear();
  currentVisibleKey = null;
}

async function hideAllExcept(targetKey) {
  const items = await getSceneItems();
  const others = items.filter((item) => !item.isGroup && itemKey(item) !== targetKey);
  await hideItems(others);
}

async function applyShowRoute(route) {
  const target = await resolveSceneItem(route.source);
  if (!target) {
    log("[ROUTER] source not found, hide:", route.steamid, route.source);
    await hideKnownVisibleItems();
    return;
  }

  const targetKey = itemKey(target);
  await enableParentGroups(target);

  // Critical path: make the target visible first. Do not wait for hiding other sources.
  await setItemEnabled(target, true);
  currentVisibleKey = targetKey;
  knownVisibleKeys.add(targetKey);
  switchVersion += 1;
  log("[OBS] show:", route.steamid, target.sourceName, targetKey);

  // Cleanup after target is already visible. This is serialized by the route worker.
  await hideAllExcept(targetKey);
  knownVisibleKeys = new Set([targetKey]);
}

async function applyHideRoute(route) {
  await hideKnownVisibleItems();
  switchVersion += 1;
  log("[OBS] hide:", route.reason || "no player");
}

async function applyRoute(route) {
  if (!obsConnected) {
    log("[ROUTER] OBS offline, skip:", routeSignature(route));
    return;
  }

  debug("apply", routeSignature(route), "seq", route.seq);
  if (route.type === "show") await applyShowRoute(route);
  else await applyHideRoute(route);
}

function rememberPlayer(steamid, name, providerSteamId) {
  const sid = String(steamid || "").trim();
  if (!isSteamId(sid) || sid === providerSteamId) return false;

  livePlayers[sid] = {
    steamid: sid,
    name: name || livePlayers[sid]?.name || "unknown",
    lastSeen: Date.now(),
  };
  return true;
}

function rememberPlayersFromGSI(gsi) {
  const providerSteamId = String(gsi?.provider?.steamid || "").trim();
  let changed = false;

  if (gsi?.allplayers && typeof gsi.allplayers === "object") {
    for (const [key, player] of Object.entries(gsi.allplayers)) {
      if (rememberPlayer(player?.steamid || key, player?.name, providerSteamId)) changed = true;
    }
  }

  if (rememberPlayer(gsi?.player?.steamid, gsi?.player?.name, providerSteamId)) changed = true;
  if (changed) broadcast({ type: "players", players: sortedLivePlayers() });
}

function activeSteamIdFromGSI(gsi) {
  const candidates = [
    gsi?.player?.steamid,
    gsi?.player?.steam_id,
    gsi?.player?.steamId,
  ];

  for (const candidate of candidates) {
    const sid = String(candidate || "").trim();
    if (isSteamId(sid)) return sid;
  }

  return "";
}

const app = express();
app.use(express.json({ limit: "1mb" }));

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

function statePayload() {
  return {
    scene: ROUTER_SCENE,
    lastSteamId,
    lastRouteKey,
    switchVersion,
    obsConnected,
    pendingBindSource,
  };
}

function broadcastState() {
  broadcast({ type: "state", ...statePayload() });
}

httpServer.on("upgrade", (req, socket, head) => {
  if (req.url !== "/ws") {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "mapping", mapping }));
  ws.send(JSON.stringify({ type: "roster", roster: sortedRoster() }));
  ws.send(JSON.stringify({ type: "players", players: sortedLivePlayers() }));
  ws.send(JSON.stringify({ type: "state", ...statePayload() }));
});

setInterval(() => broadcast({ type: "ping", time: Date.now() }), 2000);

app.post("/gsi", async (req, res) => {
  try {
    const gsi = req.body || {};
    setImmediate(() => {
      try {
        rememberPlayersFromGSI(gsi);
      } catch (e) {
        log("[GSI] player parse failed:", e?.message || e);
      }
    });

    const steamid = activeSteamIdFromGSI(gsi);
    const providerSteamId = String(gsi?.provider?.steamid || "").trim();

    if (!steamid) {
      lastSteamId = null;
      queueRoute({ type: "hide", reason: "freecam" }, true);
      broadcastState();
      return res.sendStatus(204);
    }

    if (pendingBindSource) {
      mapping[steamid] = pendingBindSource;
      pendingBindSource = null;

      if (!roster[steamid] && gsi?.player?.name) {
        roster[steamid] = gsi.player.name;
        saveRoster();
        broadcast({ type: "roster", roster: sortedRoster() });
      }

      saveMapping();
      broadcast({ type: "mapping", mapping });
      log("[BIND] captured:", steamid, mapping[steamid]);
    }

    const source = await normalizeMappedSource(steamid);
    lastSteamId = steamid;

    if (!source) {
      queueRoute({ type: "hide", steamid, reason: "unknown-player" }, true);
      broadcastState();
      return res.sendStatus(200);
    }

    queueRoute({ type: "show", steamid, source, providerSteamId }, true);
    broadcastState();
    return res.sendStatus(200);
  } catch (e) {
    log("[GSI] failed:", e?.message || e);
    return res.sendStatus(500);
  }
});

app.get("/api/sources", async (_, res) => {
  sceneItemsCache = null;
  res.json((await getSceneItems(true)).filter((item) => !item.isGroup));
});

app.get("/api/state", (_, res) => res.json(statePayload()));

app.get("/api/mapping", (_, res) => res.json(mapping));

app.post("/api/mapping", async (req, res) => {
  const steamid = String(req.body?.steamid || "").trim();
  const source = req.body?.source;

  if (!isSteamId(steamid) || !source) return res.status(400).json({ error: "invalid" });

  const normalized = await normalizeSourceRef(source, true, true);
  if (!normalized) return res.status(400).json({ error: "invalid source" });

  mapping[steamid] = normalized;
  saveMapping();
  broadcast({ type: "mapping", mapping });
  res.json({ ok: true });
});

app.put("/api/mapping/:steamid", async (req, res) => {
  const oldSid = String(req.params.steamid || "").trim();
  const newSid = String(req.body?.steamid || "").trim();
  const source = req.body?.source;

  if (!isSteamId(oldSid) || !isSteamId(newSid) || !source) {
    return res.status(400).json({ error: "invalid" });
  }

  const normalized = await normalizeSourceRef(source, true, true);
  if (!normalized) return res.status(400).json({ error: "invalid source" });

  if (oldSid !== newSid) delete mapping[oldSid];
  mapping[newSid] = normalized;
  saveMapping();
  broadcast({ type: "mapping", mapping });
  res.json({ ok: true });
});

app.delete("/api/mapping/:steamid", (req, res) => {
  delete mapping[String(req.params.steamid || "").trim()];
  saveMapping();
  broadcast({ type: "mapping", mapping });
  res.json({ ok: true });
});

app.get("/api/roster", (_, res) => res.json(sortedRoster()));

app.get("/api/roster/export", (_, res) => {
  res.setHeader("Content-Disposition", "attachment; filename=players_db.json");
  res.json(sortedRoster());
});

app.post("/api/roster/import", (req, res) => {
  const mode = req.body?.mode === "replace" ? "replace" : "merge";
  const imported = normalizeRosterPlayers(req.body?.players ?? req.body?.roster ?? req.body);
  const count = Object.keys(imported).length;

  if (!count) return res.status(400).json({ error: "no valid players" });

  roster = mode === "replace" ? imported : { ...roster, ...imported };
  saveRoster();
  broadcast({ type: "roster", roster: sortedRoster() });
  res.json({ ok: true, imported: count, mode });
});

app.post("/api/roster", (req, res) => {
  const steamid = String(req.body?.steamid || "").trim();
  const name = String(req.body?.name || "").trim();

  if (!isSteamId(steamid) || !name) return res.status(400).json({ error: "invalid" });

  roster[steamid] = name;
  saveRoster();
  broadcast({ type: "roster", roster: sortedRoster() });
  res.json({ ok: true });
});

app.put("/api/roster/:steamid", (req, res) => {
  const oldSid = String(req.params.steamid || "").trim();
  const newSid = String(req.body?.steamid || "").trim();
  const name = String(req.body?.name || "").trim();

  if (!isSteamId(oldSid) || !isSteamId(newSid) || !name) {
    return res.status(400).json({ error: "invalid" });
  }

  if (oldSid !== newSid) {
    delete roster[oldSid];
    if (mapping[oldSid] && !mapping[newSid]) {
      mapping[newSid] = mapping[oldSid];
      delete mapping[oldSid];
      saveMapping();
      broadcast({ type: "mapping", mapping });
    }
  }

  roster[newSid] = name;
  saveRoster();
  broadcast({ type: "roster", roster: sortedRoster() });
  res.json({ ok: true });
});

app.delete("/api/roster/:steamid", (req, res) => {
  delete roster[String(req.params.steamid || "").trim()];
  saveRoster();
  broadcast({ type: "roster", roster: sortedRoster() });
  res.json({ ok: true });
});

app.get("/api/players", (_, res) => res.json(sortedLivePlayers()));

app.post("/api/force", async (req, res) => {
  const normalized = await normalizeSourceRef(req.body?.source, true, true);
  if (!normalized) return res.status(400).json({ error: "invalid source" });

  lastSteamId = null;
  queueRoute({ type: "show", steamid: "manual", source: normalized }, true);
  broadcastState();
  res.json({ ok: true });
});

app.post("/api/bind", async (req, res) => {
  const normalized = await normalizeSourceRef(req.body?.source, true, true);
  if (!normalized) return res.status(400).json({ error: "invalid source" });

  pendingBindSource = normalized;
  broadcastState();
  res.json({ ok: true, pendingBindSource });
});

const distDir = path.join(rootDir, "client", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_, res) => res.sendFile(path.join(distDir, "index.html")));
} else {
  app.get("/", (_, res) => res.send("Build client first: cd client && npm install && npm run build"));
}

httpServer.listen(PORT, () => {
  log("[HTTP] listening:", `http://localhost:${PORT}`);
});
