# CS2 OBS POV Router

**RU:** Локальное приложение для автоматического переключения источников OBS по активному игроку CS2. CS2 отправляет SteamID через Game State Integration, сервер сверяет его с mapping и показывает нужный источник в OBS через `SetSceneItemEnabled`.

**EN:** Local app for automatic OBS source switching based on the active CS2 player. CS2 sends SteamID through Game State Integration, the server resolves it through mapping and shows the correct OBS source using `SetSceneItemEnabled`.

## Что Важно / Key Points

- Работает через OBS WebSocket `ws://127.0.0.1:4455`.
- Источники в OBS могут называться как угодно.
- Привязка хранится по scene item key, например `POV_ROUTER:1`, а не по имени источника.
- Known player -> show mapped source.
- Unknown player -> hide all POV sources.
- Freecam/no player -> hide all POV sources.
- Переключение источников выполняется только через `SetSceneItemEnabled`.
- No opacity/filter/transform tricks.
- Player database supports manual editing plus JSON/CSV/XLSX import/export.

## Быстрый Запуск / Quick Start

1. В OBS включи WebSocket:
   - Server: enabled
   - Port: `4455`
   - Password: your password
2. Запусти:

```bat
run_server.bat
```

3. Введи OBS WebSocket password в консоль.
4. Открой:

```txt
http://localhost:3000
```

If the OBS password is wrong, the server asks for it again without restarting the `.bat` file.

## Установка GSI / GSI Setup

Запусти:

```bat
install_gsi_config.bat
```

The installer searches CS2 automatically through common Steam paths and `libraryfolders.vdf`. If CS2 is not found, it asks for the full path to:

```txt
...\Counter-Strike Global Offensive\game\csgo\cfg
```

After installing or changing the GSI config, fully restart CS2.

Recommended GSI config:

```ini
"OBS Router"
{
  "uri" "http://127.0.0.1:3000/gsi"
  "timeout" "0.1"
  "buffer" "0.0"
  "throttle" "0.0"
  "heartbeat" "0.1"

  "data"
  {
    "provider" "1"
    "map" "1"
    "round" "1"
    "player_id" "1"
    "player_state" "1"
    "player_position" "1"
    "player_weapons" "1"
    "player_match_stats" "1"
    "allplayers_id" "1"
    "allplayers_state" "1"
    "allplayers_position" "1"
    "allplayers_weapons" "1"
    "allplayers_match_stats" "1"
    "phase_countdowns" "1"
    "bomb" "1"
  }
}
```

## OBS Scene

Default scene:

```txt
POV_ROUTER
```

Add your webcam/browser/media/NDI sources to this scene. The app reads scene items from OBS and shows them in the UI. You do not need fixed source names.

## Player Database Import

Supported formats:

- `.json`
- `.csv`
- `.xlsx`

Recommended XLSX format:

| Nickname | SteamID64 |
| --- | --- |
| player1 | 76561197960287930 |
| player2 | 76561198000000000 |

Column order is flexible. Import looks for a 17-digit SteamID64 in each row and uses the nearby text cell as nickname.

CSV examples:

```csv
player1,76561197960287930
player2,76561198000000000
```

or:

```csv
76561197960287930,player1
76561198000000000,player2
```

## Project Structure

```txt
cs2-obs-pov-router/
  run_server.bat
  install_gsi_config.bat
  server/
    server_obs.mjs
    mapping_obs.json
    players_db.json
  client/
    src/
    dist/
```

## Development

Install dependencies:

```bat
cd server
npm install
cd ..\client
npm install
```

Build UI:

```bat
npm.cmd --prefix client run build
```

Run server:

```bat
npm.cmd --prefix server start
```

## Release Notes

See `RELEASE_NOTES_v0.8.md`.
