// server_obs.mjs
// CS2 GSI → OBS Router (Fast + Stable version)

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OBSWebSocket from "obs-websocket-js";
import http from "http";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ==== CONFIG ====
const PORT = 3000;
const OBS_URL = "ws://127.0.0.1:4455";
const OBS_PASS = "123456789a"; // default
const ROUTER_SCENE = "POV_ROUTER";
const MAPPING_FILE = path.join(__dirname, "mapping_obs.json");

// ==== STATE ====
let mapping = {};
let players = {};
let lastSteamId = null;
let sceneItemsCache = null;
let lastSwitchTs = 0;

// ==== LOAD MAPPING ====
function loadMapping() {
  try {
    mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, "utf8"));
  } catch {
    mapping = {};
  }
}
function saveMapping() {
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2));
}
loadMapping();

// ==== OBS CONNECTION ====
const obs = new OBSWebSocket();

async function connectOBS() {
  try {
    await obs.connect(OBS_URL, OBS_PASS);
    log("[OBS] connected:", OBS_URL);
  } catch (e) {
    log("[OBS] connection failed:", e?.message || e);
    setTimeout(connectOBS, 2000);
  }
}
connectOBS();

obs.on("ConnectionClosed", () => {
  log("[OBS] disconnected, reconnecting...");
  setTimeout(connectOBS, 1000);
});

async function listSceneItemsRecursive(sceneName) {
  try {
    const { sceneItems } = await obs.call("GetSceneItemList", { sceneName });
    const out = [];
    for (const it of sceneItems) {
      out.push({
        sceneName,
        id: it.sceneItemId,
        sourceName: it.sourceName,
        isGroup: !!it.isGroup,
      });
      if (it.isGroup) {
        const nested = await obs.call("GetGroupSceneItemList", {
          sceneName: it.sourceName,
        });
        for (const n of nested.sceneItems) {
          out.push({
            sceneName: it.sourceName,
            id: n.sceneItemId,
            sourceName: n.sourceName,
            isGroup: !!n.isGroup,
          });
        }
      }
    }
    return out;
  } catch (e) {
    log("[OBS] list error:", e?.message || e);
    return [];
  }
}

async function getSceneItems() {
  try {
    sceneItemsCache = await listSceneItemsRecursive(ROUTER_SCENE);
    return sceneItemsCache;
  } catch (e) {
    log("[OBS] getSceneItems error:", e.message);
    return [];
  }
}

async function enableParents(target) {
  const items = await getSceneItems();
  for (const it of items) {
    if (!it.isGroup) continue;
    try {
      const nested = await obs.call("GetGroupSceneItemList", {
        sceneName: it.sourceName,
      });
      const found = nested.sceneItems.find((n) => n.sourceName === target);
      if (found) {
        await obs.call("SetSceneItemEnabled", {
          sceneName: ROUTER_SCENE,
          sceneItemId: it.id,
          sceneItemEnabled: true,
        });
        await enableParents(it.sourceName);
      }
    } catch {}
  }
}

async function hideAllPOVs() {
  const items = await getSceneItems();
  for (const it of items) {
    if (!it.isGroup && /^pov_/i.test(it.sourceName)) {
      await obs.call("SetSceneItemEnabled", {
        sceneName: it.sceneName,
        sceneItemId: it.id,
        sceneItemEnabled: false,
      });
    }
  }
}

async function setActiveSourceByName(sourceName) {
  const items = await getSceneItems();
  const target = items.find((i) => i.sourceName === sourceName);
  if (!target) return false;
  await enableParents(sourceName);
  for (const it of items) {
    if (it.isGroup) continue;
    const enabled = it.sourceName === sourceName;
    await obs.call("SetSceneItemEnabled", {
      sceneName: it.sceneName,
      sceneItemId: it.id,
      sceneItemEnabled: enabled,
    });
  }
  log("[OBS] active →", sourceName);
  return true;
}

// ==== HTTP + WebSocket ====

const app = express();
app.use(express.json({ limit: "1mb" }));

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Simple broadcast
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const c of wss.clients) {
    if (c.readyState === 1) c.send(msg);
  }
}

// Handle WebSocket upgrade
httpServer.on("upgrade", (req, socket, head) => {
  if (req.url === "/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else socket.destroy();
});

// Send initial state on WS connect
wss.on("connection", (ws) => {
  ws.send(
    JSON.stringify({
      type: "mapping",
      mapping,
    })
  );
  ws.send(
    JSON.stringify({
      type: "players",
      players: Object.values(players),
    })
  );
  ws.send(
    JSON.stringify({
      type: "state",
      lastSteamId,
    })
  );
});

// Heartbeat (UI alive indicator)
setInterval(() => {
  broadcast({ type: "ping", time: Date.now() });
}, 2000);

// ==== GSI ROUTE ====
app.post("/gsi", async (req, res) => {
  try {
    const steamid =
      req.body?.player?.steamid ||
      req.body?.provider?.steamid ||
      req.body?.allplayers?.steamid;
    if (!steamid) return res.sendStatus(204);

    const name = req.body?.player?.name || "unknown";
    players[steamid] = { steamid, name, lastSeen: Date.now() };
    broadcast({
      type: "players",
      players: Object.values(players).sort((a, b) => b.lastSeen - a.lastSeen),
    });

    // Switch logic
    if (!mapping[steamid]) {
      await hideAllPOVs();
      log("[OBS] unmapped → all POVs hidden");
      return res.sendStatus(200);
    }

    if (steamid !== lastSteamId) {
      lastSteamId = steamid;
      await setActiveSourceByName(mapping[steamid]);
      broadcast({ type: "state", lastSteamId });
    }

    res.sendStatus(200);
  } catch (e) {
    log("[GSI]", e?.message || e);
    res.sendStatus(500);
  }
});

// ==== API ====
app.get("/api/mapping", (_, res) => res.json(mapping));
app.post("/api/mapping", (req, res) => {
  const { steamid, source } = req.body;
  if (!steamid || !source) return res.status(400).json({ error: "invalid" });
  mapping[steamid] = source;
  saveMapping();
  broadcast({ type: "mapping", mapping });
  res.json({ ok: true });
});

app.delete("/api/mapping/:steamid", (req, res) => {
  const sid = req.params.steamid;
  delete mapping[sid];
  saveMapping();
  broadcast({ type: "mapping", mapping });
  res.json({ ok: true });
});

app.get("/api/players", (_, res) =>
  res.json(Object.values(players).sort((a, b) => b.lastSeen - a.lastSeen))
);

app.post("/api/force", async (req, res) => {
  const { source } = req.body;
  if (!source) return res.status(400).json({ error: "no source" });
  await setActiveSourceByName(source);
  res.json({ ok: true });
});

// ==== Static UI ====
const distDir = path.join(rootDir, "client", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (req, res) => res.sendFile(path.join(distDir, "index.html")));
} else {
  app.get("/", (_, res) =>
    res.send("⚙️ Build client first: cd client && npm install && npm run build")
  );
}

// ==== START ====
httpServer.listen(PORT, () => {
  log(`[HTTP] Listening on http://localhost:${PORT}`);
});
