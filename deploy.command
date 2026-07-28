#!/bin/bash
# Деплой сайта для macOS.
# Деплой = отправить изменения в ветку master на GitHub -> GitHub Actions
# автоматически собирает и публикует сайт на https://vetor-studio.ru
# (см. .github/workflows/deploy.yml).

set -u
cd "$(dirname "$0")" || exit 1

echo "==============================================="
echo "  VETOR portfolio — деплой на GitHub Pages"
echo "==============================================="
echo

if ! command -v git >/dev/null 2>&1; then
  echo "git не найден. Установите Xcode Command Line Tools: xcode-select --install"
  read -r -p "Нажмите Enter, чтобы закрыть..."
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
if [ "$BRANCH" != "master" ]; then
  echo "Внимание: текущая ветка — '$BRANCH', а деплоится только 'master'."
  read -r -p "Всё равно продолжить пуш этой ветки? (y/N) " a
  case "$a" in y|Y|yes|Yes) ;; *) echo "Отменено."; read -r -p "Enter для выхода..."; exit 0;; esac
fi

echo "Изменения в проекте:"
git status --short
echo

if [ -n "$(git status --porcelain)" ]; then
  read -r -p "Сообщение коммита (Enter = 'update site'): " MSG
  [ -z "$MSG" ] && MSG="update site"
  git add -A || { echo "git add упал."; read -r -p "Enter..."; exit 1; }
  git commit -m "$MSG" || { echo "Коммит упал."; read -r -p "Enter..."; exit 1; }
  echo
else
  echo "Незакоммиченных изменений нет — запушу уже готовые коммиты."
  echo
fi

echo "Отправляю на GitHub (origin/$BRANCH)..."
if git push origin "$BRANCH"; then
  echo
  echo "Готово! Сборка и публикация идут автоматически (~1-2 минуты)."
  echo "Прогресс: вкладка Actions в репозитории на GitHub."
  echo "Сайт: https://vetor-studio.ru"
else
  echo
  echo "Пуш не удался. Проверьте интернет / доступ к GitHub (токен)."
fi

echo
read -r -p "Нажмите Enter, чтобы закрыть..."
