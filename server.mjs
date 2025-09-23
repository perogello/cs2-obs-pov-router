// server.mjs
// GSI → OBS Router: включает нужный источник камеры в сцене OBS по SteamID активного игрока.

import express from "express";
import OBSWebSocket from "obs-websocket-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

process.on("unhandledRejection", (r) => console.error("[unhandledRejection]", r));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const log = (...args) => console.log(new Date().toISOString(), ...args);

// ===== ENV config =====
const OBS_URL = process.env.OBS_URL || "ws://127.0.0.1:4455";
const OBS_PASS = process.env.OBS_PASS || "CHANGE_ME";
const ROUTER_SCENE = process.env.ROUTER_SCENE || "POV_ROUTER";
const MAPPING_FILE = process.env.MAPPING_FILE || path.join(__dirname, "mapping.json");
const PORT = Number(process.env.PORT || 3000);
const GSI_TOKEN = process.env.GSI_TOKEN || "";
const MIN_SWITCH_INTERVAL_MS = Number(process.env.MIN_SWITCH_INTERVAL_MS || 150);
const DEFAULT_SOURCE = process.env.DEFAULT_SOURCE || "";

let mapping = {};
try {
  if (fs.existsSync(MAPPING_FILE)) {
    mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, "utf8"));
    log("[MAPPING] Loaded:", mapping);
  } else {
    log("[MAPPING] File not found, will use auto-names like POV_<steamid>");
  }
} catch (e) {
  log("[MAPPING] Failed to read mapping.json:", e.message);
}

const obs = new OBSWebSocket();
async function connectOBS() {
  try {
    await obs.connect(OBS_URL, OBS_PASS);
    log("[OBS] Connected:", OBS_URL);
  } catch (e) {
    log("[OBS] Connect failed:", e?.message || e);
    setTimeout(connectOBS, 2000);
  }
}
connectOBS();
obs.on("ConnectionClosed", () => {
  log("[OBS] Disconnected, retrying…");
  setTimeout(connectOBS, 1000);
});

let sceneItemsCache = null;
async function listSceneItems(sceneName) {
  const { sceneItems } = await obs.call("GetSceneItemList", { sceneName });
  return sceneItems.map(i => ({ id: i.sceneItemId, sourceName: i.sourceName }));
}
async function ensureSceneCache() {
  sceneItemsCache = await listSceneItems(ROUTER_SCENE);
  return sceneItemsCache;
}
async function getSceneItems() {
  if (!sceneItemsCache) return await ensureSceneCache();
  return sceneItemsCache;
}
async function refreshSceneCacheIfMissing(sourceName) {
  const items = await getSceneItems();
  if (!items.find(i => i.sourceName === sourceName)) {
    await ensureSceneCache();
  }
}

async function setActiveSourceByName(sourceName) {
  await refreshSceneCacheIfMissing(sourceName);
  const items = await getSceneItems();
  let matched = false;
  for (const it of items) {
    const enable = it.sourceName === sourceName;
    if (enable) matched = true;
    await obs.call("SetSceneItemEnabled", {
      sceneName: ROUTER_SCENE,
      sceneItemId: it.id,
      sceneItemEnabled: enable,
    });
  }
  if (!matched) {
    if (DEFAULT_SOURCE) {
      log(`[OBS] Target "${sourceName}" not found. Fallback → "${DEFAULT_SOURCE}"`);
      await setActiveSourceByName(DEFAULT_SOURCE);
    } else {
      log(`[OBS] WARNING: target source "${sourceName}" not found in scene "${ROUTER_SCENE}"`);
    }
  } else {
    log("[OBS] Active source:", sourceName);
  }
}

const app = express();
app.use(express.json({ limit: "512kb" }));

function extractSteamId(gsi) {
  const sid = gsi?.player?.steamid || gsi?.provider?.steamid || "";
  return String(sid).trim();
}
function checkToken(req) {
  if (!GSI_TOKEN) return true;
  const hdr = req.get("x-gsi-token") || req.query.token || "";
  return hdr === GSI_TOKEN;
}

let lastSteamId = null;
let lastSwitchTs = 0;

app.post("/gsi", async (req, res) => {
  try {
    if (!checkToken(req)) return res.status(401).json({ error: "invalid token" });
    const steamid = extractSteamId(req.body);
    if (!/^\d{17}$/.test(steamid)) return res.sendStatus(204);
    const now = Date.now();
    if (steamid === lastSteamId && now - lastSwitchTs < MIN_SWITCH_INTERVAL_MS) return res.sendStatus(200);
    lastSteamId = steamid;
    lastSwitchTs = now;
    const sourceName = mapping[steamid] || `POV_${steamid}`;
    if (!obs || !obs.identified) {
      log("[OBS] Not connected yet; skipping switch");
      return res.sendStatus(202);
    }
    await setActiveSourceByName(sourceName);
    res.sendStatus(200);
  } catch (e) {
    log("[GSI] Error:", e?.message || e);
    res.sendStatus(500);
  }
});

app.post("/force/:source", async (req, res) => {
  try {
    const name = req.params.source;
    if (!name) return res.status(400).json({ error: "no source name" });
    await setActiveSourceByName(name);
    lastSteamId = null;
    res.json({ forced: name });
  } catch (e) {
    log("[FORCE] Error:", e?.message || e);
    res.sendStatus(500);
  }
});

app.post("/reload-mapping", (req, res) => {
  try {
    mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, "utf8"));
    sceneItemsCache = null;
    res.json({ ok: true, mapping });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    obsConnected: !!obs?.identified,
    scene: ROUTER_SCENE,
    lastSteamId,
  });
});

app.listen(PORT, () => log(`[HTTP] Listening on :${PORT}`));
