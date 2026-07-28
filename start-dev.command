#!/bin/bash
# Дев-сервер Vetor (macOS). Двойной клик из Finder.
# Рабочая копия на внутреннем диске (быстро). Флешка — только для деплоя.

set -u
cd "$(dirname "$0")" || exit 1

echo "==============================================="
echo "  VETOR — dev server (внутренний диск)"
echo "==============================================="
echo

if ! command -v node >/dev/null 2>&1; then
  for p in /opt/homebrew/bin /usr/local/bin "$HOME/.nvm/versions/node"/*/bin; do
    if [ -x "$p/node" ]; then PATH="$p:$PATH"; break; fi
  done
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не найден. Установите: brew install node"
  read -r -p "Enter для выхода..."; exit 1
fi

echo "Node: $(node -v)   npm: $(npm -v)"
echo

if [ ! -d node_modules ] || ! node -e "require('rollup')" >/dev/null 2>&1; then
  echo "Устанавливаю зависимости (npm install)..."
  npm install || { echo "Ошибка установки."; read -r -p "Enter..."; exit 1; }
  echo
fi

( sleep 4; open "http://localhost:5173/" >/dev/null 2>&1 ) &

echo "Dev-сервер: http://localhost:5173/  (Studio-режим включён)"
echo "Остановить: Ctrl+C."
echo
npm run dev

echo
read -r -p "Остановлено. Enter, чтобы закрыть..."
