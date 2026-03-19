#!/bin/bash
set -euo pipefail

# Only run in remote (web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "Instalando dependencias de Node.js..."
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$(dirname "$(dirname "$(realpath "$0")")")")}"
npm install

echo "Dependencias instaladas correctamente."
