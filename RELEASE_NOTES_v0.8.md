# v0.8.0 Release Notes

## Русский

### Главное

- Полностью переписана серверная логика маршрутизации CS2 в OBS.
- Известный игрок показывает привязанный OBS-источник.
- Неизвестный игрок скрывает все POV-источники.
- Свободная камера или отсутствие активного игрока скрывает все POV-источники.
- Переключение работает только через `SetSceneItemEnabled`.
- Положение, размер, opacity, фильтры и transform источников не меняются.

### OBS

- Источники OBS больше не завязаны на фиксированные названия.
- Привязка хранит стабильный ключ элемента сцены, например `POV_ROUTER:1`.
- Сервер заново спрашивает пароль OBS WebSocket при ошибке авторизации без перезапуска `.bat`.
- Применение маршрута выполняется последовательно, чтобы старые команды скрытия или показа не перетирали новое состояние.

### Игроки И База

- Добавлена база сохраненных игроков.
- Добавлен импорт игроков из `.json`, `.csv`, `.xlsx`.
- Добавлен экспорт базы игроков в JSON.
- В интерфейсе сохраненные игроки и live-игроки визуально разделены.
- Добавлено редактирование и удаление игроков из базы.

### GSI

- Добавлен `install_gsi_config.bat`.
- Установщик сам ищет CS2 через стандартные пути Steam и `libraryfolders.vdf`.
- Если CS2 не найдена, можно вручную указать путь к `game\csgo\cfg`.
- GSI-конфиг сокращен до минимального набора данных: `provider`, `player_id`, `allplayers_id`.
- GSI-конфиг настроен на низкую задержку: `heartbeat 0.1`, `buffer 0.0`, `throttle 0.0`.

### Интерфейс

- Добавлена ручная привязка SteamID к OBS-источнику.
- Добавлено редактирование текущих привязок.
- Добавлена кнопка принудительного показа источника для проверки.
- Добавлен импорт и экспорт в базе игроков.

### Проверки

- `node --check server/server_obs.mjs`
- `npm.cmd --prefix client run build`
- Проверен запуск сервера.
- Проверено подключение к OBS WebSocket.
- Проверено чтение источников OBS.
- Проверены GSI-сценарии для привязанного игрока и свободной камеры.
- Проверен `npm audit`: уязвимостей не найдено.

## English

### Main

- Fully rewrote the CS2 to OBS server routing logic.
- Known player shows the mapped OBS source.
- Unknown player hides all POV sources.
- Freecam or no active player hides all POV sources.
- Switching uses only `SetSceneItemEnabled`.
- Source position, size, opacity, filters, and transform are not changed.

### OBS

- OBS sources are no longer tied to fixed names.
- Mapping stores a stable scene item key, for example `POV_ROUTER:1`.
- The server asks for the OBS WebSocket password again after authentication failure without restarting the `.bat` file.
- Route application is serialized so stale hide or show commands cannot override the latest state.

### Players And Database

- Added a saved player database.
- Added player import from `.json`, `.csv`, `.xlsx`.
- Added JSON export for the player database.
- Saved and live players are visually separated in the UI.
- Added editing and deleting players from the database.

### GSI

- Added `install_gsi_config.bat`.
- The installer detects CS2 through common Steam paths and `libraryfolders.vdf`.
- If CS2 is not found, the installer asks for the `game\csgo\cfg` path manually.
- GSI config is reduced to the minimal data set: `provider`, `player_id`, `allplayers_id`.
- GSI config is tuned for low latency: `heartbeat 0.1`, `buffer 0.0`, `throttle 0.0`.

### UI

- Added manual SteamID to OBS source binding.
- Added editing for existing mappings.
- Added a force-show button for source testing.
- Added player database import and export.

### Validation

- `node --check server/server_obs.mjs`
- `npm.cmd --prefix client run build`
- Server startup tested.
- OBS WebSocket connection tested.
- OBS source listing tested.
- GSI mapped player and freecam scenarios tested.
- `npm audit` tested: no vulnerabilities found.
