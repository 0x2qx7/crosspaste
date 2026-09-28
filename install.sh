#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

if ! command -v docker >/dev/null || ! $SUDO docker compose version >/dev/null 2>&1; then
  echo "Ошибка: требуется установленный Docker и Docker Compose." >&2
  exit 1
fi

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
  else
    echo "HOST_PORT=8089" > .env
  fi

  if command -v openssl >/dev/null 2>&1; then
    TOKEN=$(openssl rand -hex 24)
  else
    TOKEN=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  fi
  sed -i "s|^OPTIONAL_ACCESS_TOKEN=.*|OPTIONAL_ACCESS_TOKEN=$TOKEN|" .env 2>/dev/null || true
  chmod 600 .env
  echo "Создан файл .env с сгенерированным ключом доступа."
fi

mkdir -p data/uploads data/thumbnails data/files data/incoming
$SUDO chown -R 1000:1000 data 2>/dev/null || true

$SUDO docker compose up -d --build

echo "Ожидание запуска..."
for i in {1..30}; do
  if [ "$($SUDO docker inspect -f '{{.State.Health.Status}}' crosspaste 2>/dev/null || true)" = "healthy" ]; then
    break
  fi
  sleep 2
done

PORT=$(grep -E '^HOST_PORT=' .env | cut -d= -f2 || echo "8089")
TOKEN=$(grep -E '^OPTIONAL_ACCESS_TOKEN=' .env | cut -d= -f2 || echo "")

echo ""
echo "CrossPaste успешно запущен на порту: ${PORT:-8089}"
if [ -n "$TOKEN" ]; then
  echo "Ключ доступа: $TOKEN"
fi
