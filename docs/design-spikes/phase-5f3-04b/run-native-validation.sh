#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

EVIDENCE_DIR="docs/design-spikes/phase-5f3-04b"
LOG_DIR="${EVIDENCE_DIR}/logs"
mkdir -p "${EVIDENCE_DIR}/screenshots" "${LOG_DIR}"

stage() { printf '\n=== %s ===\n' "$1"; }
run_logged() {
  local log_file="$1"
  shift
  "$@" 2>&1 | tee "${log_file}"
}

SERVER_PID=""
cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

stage 'Stage A — state'
branch="$(git branch --show-current)"
head="$(git rev-parse HEAD)"
git status --short
git diff --check
[[ "${branch}" == 'phase5f3-04b-semantic-foundation' ]] || { echo "Unexpected branch: ${branch}" >&2; exit 1; }
[[ "${head}" == '3887bef30598724bbd6d45f98f866bd01926e198' ]] || { echo "Unexpected committed base: ${head}" >&2; exit 1; }

stage 'Stage B — contrast validator'
run_logged "${LOG_DIR}/contrast.log" node docs/design-spikes/phase-5f3-04a/validate-contrast.mjs

stage 'Stage C — production build'
run_logged "${LOG_DIR}/build.log" npm run build

stage 'Stage D — start Angular server'
port_owner=''
if command -v ss >/dev/null 2>&1; then
  port_owner="$(ss -ltnp '( sport = :4200 )' 2>/dev/null | tail -n +2)"
elif command -v lsof >/dev/null 2>&1; then
  port_owner="$(lsof -nP -iTCP:4200 -sTCP:LISTEN 2>/dev/null || true)"
fi
if [[ -n "${port_owner}" ]] || curl --silent --max-time 1 http://127.0.0.1:4200/ >/dev/null 2>&1; then
  echo 'Port 4200 is already occupied:' >&2
  if [[ -n "${port_owner}" ]]; then
    printf '%s\n' "${port_owner}" >&2
  else
    echo 'An HTTP service answered on 127.0.0.1:4200, but its owning process could not be identified.' >&2
  fi
  exit 1
fi
npm start -- --host 127.0.0.1 --port 4200 >"${LOG_DIR}/server.log" 2>&1 &
SERVER_PID=$!
ready=0
for _ in $(seq 1 120); do
  if curl --fail --silent --show-error --max-time 2 http://127.0.0.1:4200/ >/dev/null; then ready=1; break; fi
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo 'Angular server exited before becoming ready.' >&2
    tail -n 80 "${LOG_DIR}/server.log" >&2 || true
    exit 1
  fi
  sleep 1
done
[[ "${ready}" == 1 ]] || { echo 'Angular server did not become ready within 120 seconds.' >&2; exit 1; }
echo 'Angular server is ready at http://127.0.0.1:4200/'

stage 'Stage E — focused foundation E2E'
run_logged "${LOG_DIR}/design-foundation-e2e.log" npx playwright test e2e/design-foundation.spec.ts --workers=1 --reporter=line

stage 'Stage F — required regressions'
run_logged "${LOG_DIR}/public-accessibility-e2e.log" npx playwright test e2e/public-accessibility.spec.ts --workers=1 --reporter=line
run_logged "${LOG_DIR}/public-site-e2e.log" npx playwright test e2e/public-site.spec.ts --workers=1 --reporter=line
run_logged "${LOG_DIR}/admin-mobile-navigation-e2e.log" npx playwright test e2e/admin-mobile-navigation.spec.ts --workers=1 --reporter=line
run_logged "${LOG_DIR}/shell-navigation-accessibility-e2e.log" npx playwright test e2e/shell-navigation-accessibility.spec.ts --workers=1 --reporter=line

stage 'Stage G — unit tests'
run_logged "${LOG_DIR}/unit.log" npm test -- --no-watch

stage 'Stage H — actual-app screenshots'
run_logged "${LOG_DIR}/screenshots.log" node docs/design-spikes/phase-5f3-04b/capture-app.mjs
for screenshot in \
  public-390.png public-820.png public-1440.png \
  admin-390.png admin-820.png admin-1440.png \
  member-390.png member-820.png member-1440.png \
  public-390-200.png admin-390-200.png member-390-200.png; do
  [[ -s "${EVIDENCE_DIR}/screenshots/${screenshot}" ]] || { echo "Missing screenshot: ${screenshot}" >&2; exit 1; }
done

stage 'Stage I — final diff'
{
  git diff --check
  git status --short
  git diff --stat
} 2>&1 | tee "${LOG_DIR}/final-diff.log"

echo
echo 'Native WSL validation completed successfully.'
