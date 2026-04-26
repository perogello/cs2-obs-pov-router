# v0.8.0 Release Notes

## RU

### Главное

- Полностью переписана серверная логика роутинга CS2 -> OBS.
- Известный игрок показывает привязанный OBS source.
- Неизвестный игрок скрывает все POV sources.
- Freecam/no player скрывает все POV sources.
- Переключение работает через `SetSceneItemEnabled` без opacity/filter/transform.

### OBS

- Источники в OBS больше не завязаны на названия.
- Mapping хранит стабильный scene item key вида `POV_ROUTER:1`.
- Сервер умеет заново спросить OBS WebSocket password при ошибке авторизации без перезапуска `.bat`.
- Добавлена последовательная обработка маршрутов, чтобы старые hide/show команды не ломали новое состояние.

### Игроки И База

- Добавлена база сохранённых игроков.
- Добавлен импорт игроков из `.json`, `.csv`, `.xlsx`.
- Добавлен экспорт базы игроков в JSON.
- В UI сохранённые и live-игроки визуально разделены.
- Добавлено редактирование и удаление игроков из базы.

### GSI

- Добавлен `install_gsi_config.bat`.
- Установщик сам ищет папку CS2 через стандартные пути Steam и `libraryfolders.vdf`.
- Если CS2 не найден, можно вручную указать путь к `game\csgo\cfg`.
- GSI config обновлён под низкую задержку: `heartbeat 0.1`, `buffer 0.0`, `throttle 0.0`.

### UI

- Добавлена ручная привязка SteamID к OBS source.
- Добавлен Edit для текущих привязок.
- Добавлен Force для проверки источника.
- Добавлен Import/Export в Player database.

### Проверки

- `node --check server/server_obs.mjs`
- `npm.cmd --prefix client run build`
- Проверен запуск сервера.
- Проверено подключение к OBS WebSocket.
- Проверено чтение OBS sources.
- Проверены GSI-сценарии mapped player и freecam.

## EN

### Main

- Fully rewrote the CS2 -> OBS server routing logic.
- Known player shows the mapped OBS source.
- Unknown player hides all POV sources.
- Freecam/no player hides all POV sources.
- Switching uses `SetSceneItemEnabled` only, with no opacity/filter/transform behavior.

### OBS

- OBS sources are no longer tied to fixed names.
- Mapping stores stable scene item keys such as `POV_ROUTER:1`.
- The server asks for the OBS WebSocket password again after authentication failure without restarting the `.bat` file.
- Route application is serialized to prevent stale hide/show commands from overriding the latest state.

### Players And Database

- Added saved player database.
- Added player import from `.json`, `.csv`, `.xlsx`.
- Added JSON export for the player database.
- Saved and live players are visually separated in the UI.
- Added editing and deleting players from the database.

### GSI

- Added `install_gsi_config.bat`.
- The installer detects CS2 through common Steam paths and `libraryfolders.vdf`.
- If CS2 is not found, the installer asks for the `game\csgo\cfg` path manually.
- GSI config is tuned for low latency: `heartbeat 0.1`, `buffer 0.0`, `throttle 0.0`.

### UI

- Added manual SteamID to OBS source binding.
- Added Edit for existing mappings.
- Added Force for source testing.
- Added Import/Export in Player database.

### Validation

- `node --check server/server_obs.mjs`
- `npm.cmd --prefix client run build`
- Server startup tested.
- OBS WebSocket connection tested.
- OBS source listing tested.
- GSI mapped player and freecam scenarios tested.
