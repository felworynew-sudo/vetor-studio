#!/bin/bash
# Сборка + локальный предпросмотр готового сайта для macOS (аналог open-portfolio.bat).
# Двойной клик в Finder -> npm run build, затем npm run preview + открытие браузера.

set -u
cd "$(dirname "$0")" || exit 1

echo "==============================================="
echo "  VETOR portfolio — build & preview (macOS)"
echo "==============================================="
echo

if ! command -v node >/dev/null 2>&1; then
  for p in /opt/homebrew/bin /usr/local/bin "$HOME/.nvm/versions/node"/*/bin; do
    if [ -x "$p/node" ]; then PATH="$p:$PATH"; break; fi
  done
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не найден. Установите: brew install node"
  read -r -p "Нажмите Enter, чтобы закрыть..."
  exit 1
fi

NEED_INSTALL=0
[ -d node_modules ] || NEED_INSTALL=1
node -e "require('rollup')" >/dev/null 2>&1 || NEED_INSTALL=1
if [ "$NEED_INSTALL" -eq 1 ]; then
  echo "Устанавливаю зависимости (npm install)..."
  npm install || { echo "Ошибка установки зависимостей."; read -r -p "Enter для выхода..."; exit 1; }
  echo
fi

echo "Собираю сайт (npm run build)..."
npm run build || {
  echo
  echo "Сборка упала. Смотрите ошибки выше."
  read -r -p "Нажмите Enter, чтобы закрыть..."
  exit 1
}

echo
echo "Открываю предпросмотр: http://localhost:4173/"
( sleep 3; open "http://localhost:4173/" >/dev/null 2>&1 ) &
npm run preview -- --host 127.0.0.1 --port 4173

echo
read -r -p "Предпросмотр остановлен. Нажмите Enter, чтобы закрыть..."
