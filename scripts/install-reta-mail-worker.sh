#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
SERVICE_NAME="io.devlab.reta.mail-worker"
API_URL="${RETA_WORKER_API_URL:-https://zero-server-production.devlab-tahiti.workers.dev}"
APP_URL="${RETA_APP_URL:-https://zero-production.devlab-tahiti.workers.dev}"
INSTALL_DIR="${HOME}/.local/share/reta-mail-worker"
LOG_DIR="${HOME}/Library/Logs/RetaMailWorker"
PLIST_PATH="${HOME}/Library/LaunchAgents/${SERVICE_NAME}.plist"
NODE_PATH="$(command -v node)"
CODEX_PATH="$(command -v codex)"
KEYCHAIN_ACCOUNT="${USER:-default}"
RUNTIME_PATH="${NODE_PATH:h}:${CODEX_PATH:h}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

if [[ "$(uname -s)" != "Darwin" ]]; then
  print -u2 "Ce programme d’installation nécessite macOS."
  exit 1
fi

if ! env PATH="${RUNTIME_PATH}" "${CODEX_PATH}" --version >/dev/null 2>&1; then
  print -u2 "Codex ne démarre pas avec l’environnement launchd. Installation interrompue avant de réserver des brouillons."
  exit 1
fi

REFRESH_ONLY="false"
if [[ "${1:-}" == "--refresh" ]]; then
  REFRESH_ONLY="true"
  shift
fi
if (( $# > 0 )); then
  print -u2 "Usage : ${0:t} [--refresh]"
  exit 1
fi

if [[ "${REFRESH_ONLY}" == "true" ]]; then
  if ! /usr/bin/security find-generic-password -s "${SERVICE_NAME}" -a "${KEYCHAIN_ACCOUNT}" >/dev/null 2>&1; then
    print -u2 "Aucun jeton RETA existant dans le Trousseau. Relancez sans --refresh."
    exit 1
  fi
else
  read "ENROLLMENT_CODE?Code d’enrôlement affiché dans RETA : "
  if [[ -z "${ENROLLMENT_CODE}" ]]; then
    print -u2 "Code d’enrôlement manquant."
    exit 1
  fi

  ENROLLMENT_PAYLOAD="$(node -e 'process.stdout.write(JSON.stringify({code:process.argv[1],name:"Mac de Thomas"}))' "${ENROLLMENT_CODE}")"
  ENROLLMENT_RESPONSE="$(curl --fail-with-body --silent --show-error \
    -X POST "${API_URL}/api/reta-mail-worker/enroll" \
    -H 'Content-Type: application/json' \
    --data-binary "${ENROLLMENT_PAYLOAD}")"
  DEVICE_TOKEN="$(node -e 'const value=JSON.parse(process.argv[1]); if(typeof value.token!=="string") process.exit(1); process.stdout.write(value.token)' "${ENROLLMENT_RESPONSE}")"
fi

mkdir -p "${INSTALL_DIR}" "${LOG_DIR}" "${HOME}/Library/LaunchAgents"
install -m 700 "${SCRIPT_DIR}/reta-mail-worker.mjs" "${INSTALL_DIR}/reta-mail-worker.mjs"
install -m 600 "${SCRIPT_DIR}/reta-mail-worker-output.schema.json" "${INSTALL_DIR}/output.schema.json"
if [[ "${REFRESH_ONLY}" != "true" ]]; then
  /usr/bin/security add-generic-password -U -s "${SERVICE_NAME}" -a "${KEYCHAIN_ACCOUNT}" -w "${DEVICE_TOKEN}" >/dev/null
  unset DEVICE_TOKEN ENROLLMENT_CODE ENROLLMENT_PAYLOAD ENROLLMENT_RESPONSE
fi

cat > "${PLIST_PATH}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${SERVICE_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_PATH}</string>
    <string>${INSTALL_DIR}/reta-mail-worker.mjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>RETA_WORKER_API_URL</key><string>${API_URL}</string>
    <key>RETA_APP_URL</key><string>${APP_URL}</string>
    <key>RETA_CODEX_PATH</key><string>${CODEX_PATH}</string>
    <key>RETA_WORKER_KEYCHAIN_ACCOUNT</key><string>${KEYCHAIN_ACCOUNT}</string>
    <key>RETA_WORKER_OUTPUT_SCHEMA</key><string>${INSTALL_DIR}/output.schema.json</string>
    <key>PATH</key><string>${RUNTIME_PATH}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${LOG_DIR}/worker.log</string>
  <key>StandardErrorPath</key><string>${LOG_DIR}/worker-error.log</string>
</dict>
</plist>
PLIST
chmod 600 "${PLIST_PATH}"

launchctl bootout "gui/$(id -u)" "${PLIST_PATH}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "${PLIST_PATH}"
/usr/bin/open "${APP_URL}/queue"

if [[ "${REFRESH_ONLY}" == "true" ]]; then
  print "Worker RETA mis à jour et relancé avec le jeton existant du Trousseau macOS."
else
  print "Worker RETA installé et lancé. Le jeton est enregistré dans le Trousseau macOS."
fi
