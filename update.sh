#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

if ! command -v docker >/dev/null || ! $SUDO docker compose version >/dev/null 2>&1; then
  echo "Ошибка: требуется Docker и Docker Compose." >&2
  exit 1
fi

echo "=== Обновление CrossPaste ==="

# 1. Загрузка обновлений
if [ -d .git ] && command -v git >/dev/null 2>&1; then
  echo "Загрузка кода из git..."
  git fetch origin || true
  BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")"
  git pull origin "$BRANCH" || true
fi

# 2. Резервная копия базы данных и данных
if [ -d data ]; then
  mkdir -p backups
  BACKUP="backups/backup-$(date +%Y%m%d-%H%M%S).tar.gz"
  tar -czf "$BACKUP" data .env 2>/dev/null || true
  echo "Резервная копия сохранена в $BACKUP"
fi

# 3. Пересборка и перезапуск
$SUDO docker compose up -d --build --remove-orphans

echo "Проверка запуска..."
for i in {1..30}; do
  if [ "$($SUDO docker inspect -f '{{.State.Health.Status}}' crosspaste 2>/dev/null || true)" = "healthy" ]; then
    break
  fi
  sleep 2
done

echo "Обновление завершено! CrossPaste работает."
