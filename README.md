# CS2 OBS POV Router

## Русский

### Что это

CS2 OBS POV Router - локальное приложение для автоматического переключения источников OBS по активному игроку в CS2.

CS2 отправляет SteamID активного игрока через Game State Integration. Сервер принимает эти данные, сверяет SteamID с привязками и показывает нужный источник в OBS. Если игрок неизвестен или включена свободная камера, все POV-источники скрываются.

### Главное

- Работает через OBS WebSocket `ws://127.0.0.1:4455`.
- Источники в OBS могут называться как угодно.
- Привязка хранится по стабильному ключу элемента сцены, например `POV_ROUTER:1`.
- Для переключения используется только `SetSceneItemEnabled`.
- Положение, размер, opacity, фильтры и transform источников не меняются.
- Известный игрок показывает привязанный источник.
- Неизвестный игрок скрывает все POV-источники.
- Свободная камера скрывает все POV-источники.
- Есть база игроков с никами и SteamID.
- Поддерживается импорт и экспорт базы игроков.

### Быстрый запуск

1. В OBS включите WebSocket.
2. Проверьте порт: `4455`.
3. Задайте пароль OBS WebSocket.
4. Запустите:

```bat
run_server.bat
```

5. Введите пароль OBS WebSocket в консоли.
6. Откройте:

```txt
http://localhost:3000
```

Если пароль введен неверно, сервер попросит ввести его снова без перезапуска `.bat`.

### Установка GSI

Запустите:

```bat
install_gsi_config.bat
```

Скрипт сам ищет CS2 через стандартные пути Steam и файл `libraryfolders.vdf`. Если CS2 не найдена, скрипт попросит вручную указать путь к папке:

```txt
...\Counter-Strike Global Offensive\game\csgo\cfg
```

После установки или изменения GSI-конфига полностью перезапустите CS2.

Рекомендуемый GSI-конфиг:

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

### Настройка OBS

По умолчанию используется сцена:

```txt
POV_ROUTER
```

Добавьте в эту сцену вебкамеры, браузерные источники, медиа, NDI или любые другие источники. Приложение само читает элементы сцены из OBS и показывает их в интерфейсе.

### Импорт базы игроков

Поддерживаемые форматы:

- `.json`
- `.csv`
- `.xlsx`

Рекомендуемый формат XLSX:

| Ник | SteamID64 |
| --- | --- |
| player1 | 76561197960287930 |
| player2 | 76561198000000000 |

Порядок колонок не критичен. Импорт ищет 17-значный SteamID64 в строке и берет соседнюю текстовую ячейку как ник.

Примеры CSV:

```csv
player1,76561197960287930
player2,76561198000000000
```

или:

```csv
76561197960287930,player1
76561198000000000,player2
```

### Структура проекта

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

### Разработка

Установка зависимостей:

```bat
cd server
npm install
cd ..\client
npm install
```

Сборка интерфейса:

```bat
npm.cmd --prefix client run build
```

Запуск сервера:

```bat
npm.cmd --prefix server start
```

### Изменения

Список изменений находится в `RELEASE_NOTES_v0.8.md`.

## English

### What It Is

CS2 OBS POV Router is a local app for automatic OBS source switching based on the active CS2 player.

CS2 sends the active player's SteamID through Game State Integration. The server receives that data, resolves the SteamID through saved mappings, and shows the correct OBS source. If the player is unknown or freecam is active, all POV sources are hidden.

### Key Points

- Works through OBS WebSocket `ws://127.0.0.1:4455`.
- OBS sources can have any names.
- Mapping is stored by stable scene item key, for example `POV_ROUTER:1`.
- Switching uses only `SetSceneItemEnabled`.
- Source position, size, opacity, filters, and transform are not changed.
- Known player shows the mapped source.
- Unknown player hides all POV sources.
- Freecam hides all POV sources.
- Includes a player database with nicknames and SteamIDs.
- Supports player database import and export.

### Quick Start

1. Enable WebSocket in OBS.
2. Check the port: `4455`.
3. Set your OBS WebSocket password.
4. Run:

```bat
run_server.bat
```

5. Enter the OBS WebSocket password in the console.
6. Open:

```txt
http://localhost:3000
```

If the password is wrong, the server asks for it again without restarting the `.bat` file.

### GSI Setup

Run:

```bat
install_gsi_config.bat
```

The script detects CS2 through common Steam paths and `libraryfolders.vdf`. If CS2 is not found, the script asks for the path to:

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

### OBS Setup

Default scene:

```txt
POV_ROUTER
```

Add webcams, browser sources, media, NDI, or any other sources to this scene. The app reads scene items from OBS and shows them in the UI.

### Player Database Import

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

### Project Structure

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

### Development

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

### Release Notes

See `RELEASE_NOTES_v0.8.md`.
