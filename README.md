# 🎥 CS2 GSI → OBS Router

Программа для автоматического переключения POV-камер в OBS Studio по данным Game State Integration (GSI) из Counter-Strike 2.

## ✨ Возможности
- Определяет активного игрока по `steamid` из GSI и включает только его камеру.
- Работает через OBS WebSocket (OBS 28+).
- Поддержка `mapping.json` или авто-правила `POV_<steamid>`.
- Антидребезг переключений, healthcheck, ручной override.

## ⚙️ Требования
- Node.js 18+
- OBS Studio 28+
- Включённый OBS WebSocket (порт 4455, пароль).

## 🚀 Установка
```bash
git clone <your-repo> cs2-obs-router
cd cs2-obs-router
npm install
```

## 🎛 Настройка OBS
1. В OBS: `Tools → WebSocket Server Settings` → включить сервер, порт 4455, задать пароль.
2. Создать сцену `POV_ROUTER`.
3. Добавить POV-источники:
   - либо назвать их `POV_<steamid64>`,
   - либо создать `mapping.json` с сопоставлениями.

Пример `mapping.json`:
```json
{
  "76561198000000001": "POV_Player1",
  "76561198000000002": "POV_Player2"
}
```

## 🎮 Настройка CS2 (GSI)
Создать файл `.../game/csgo/cfg/gamestate_integration_obsrouter.cfg` со строками:
```ini
"Gamestate Integration OBS Router"
{
  "uri" "http://127.0.0.1:3000/gsi"
  "timeout" "1.0"
  "buffer"  "0.1"
  "throttle" "0.1"
  "heartbeat" "5.0"
  "data"
  {
    "provider" "1"
    "player_id" "1"
    "player_state" "1"
    "player_position" "1"
    "allplayers_id" "1"
    "allplayers_position" "1"
  }
}
```

> Если CS2 и OBS находятся на разных ПК: укажи в `uri` IP стримерского ПК вместо `127.0.0.1`.

## ▶️ Запуск
Через npm-скрипт (Windows/macOS/Linux одинаково, используется `cross-env`):
```bash
npm run start --silent
```
или напрямую:
```bash
OBS_PASS=superpass node server.mjs
```

### Переменные окружения
- `OBS_URL` (по умолчанию `ws://127.0.0.1:4455`)
- `OBS_PASS` — пароль OBS WebSocket
- `ROUTER_SCENE` (по умолчанию `POV_ROUTER`)
- `PORT` (по умолчанию `3000`)
- `DEFAULT_SOURCE` — имя источника по умолчанию (если цель не найдена)
- `MIN_SWITCH_INTERVAL_MS` — минимум между переключениями (мс)
- `GSI_TOKEN` — если нужен простой токен для защиты `/gsi`

## 🌐 HTTP API
- `POST /gsi` — вход GSI (CS2 → сюда)
- `GET /health` — статус JSON
- `POST /force/:source` — ручное переключение
- `POST /reload-mapping` — горячая перезагрузка `mapping.json`

Тест без игры:
```bash
curl -X POST http://127.0.0.1:3000/gsi \
 -H "Content-Type: application/json" \
 -d '{"player":{"steamid":"76561198000000001"}}'
```

## 🛡 Надёжность
Рекомендуется запускать под PM2 или systemd. Следить за `/health`. Для сетевого доступа включите `GSI_TOKEN` и фаервол.

## 📄 Лицензия
MIT
