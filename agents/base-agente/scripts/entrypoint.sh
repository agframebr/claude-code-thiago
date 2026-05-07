#!/bin/sh
set -e

# Se a var base64 existir, grava o arquivo antes de iniciar
if [ -n "$GOOGLE_SERVICE_ACCOUNT_JSON_B64" ]; then
  echo "$GOOGLE_SERVICE_ACCOUNT_JSON_B64" | base64 -d > /app/google-service-account.json
  echo "[entrypoint] google-service-account.json escrito OK"
fi

exec bun run src/index.ts
