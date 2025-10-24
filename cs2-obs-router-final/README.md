# 🎥 CS2 → OBS Router (Final)
- Group-fix (включение родительских групп)
- WebSocket push для игроков (реальное время)
- React build отдаётся Node-сервером
- OBS_PASS по умолчанию: 123456789a

## Установка
cd server && npm install
cd ../client && npm install && npm run build

## Запуск
cd ../server
node server_obs.mjs
# или
OBS_URL=ws://127.0.0.1:4455 OBS_PASS=123456789a node server_obs.mjs

Открой http://localhost:3000
