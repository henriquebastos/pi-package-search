#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PACKAGE_SOURCE="${PI_PACKAGE_SEARCH_SOURCE:-$REPO_DIR}"
TEST_INSTALL_PACKAGE="${PI_E2E_TEST_INSTALL_PACKAGE:-@kaiserlich-dev/pi-session-search}"
SEARCH_QUERY="${PI_E2E_SEARCH_QUERY:-session search}"
SEARCH_PROMPT="${PI_E2E_SEARCH_PROMPT:-/skill:pi-package-search ${SEARCH_QUERY}}"
INSTALL_PROMPT="${PI_E2E_INSTALL_PROMPT:-Install ${TEST_INSTALL_PACKAGE} in this project.}"
WORK_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/pi-package-search-e2e-XXXXXX")"
PROJECT_DIR="${WORK_ROOT}/project"
AGENT_DIR="${WORK_ROOT}/agent"
MODEL_ARGS=()
INSTALL_ENV=(env)
RUN_ENV=(env PI_OFFLINE=1)

if [[ -n "${PI_E2E_MODEL:-}" ]]; then
  MODEL_ARGS+=(--model "${PI_E2E_MODEL}")
fi

if [[ "${PI_E2E_ISOLATE_AGENT_DIR:-0}" == "1" ]]; then
  INSTALL_ENV+=("PI_CODING_AGENT_DIR=${AGENT_DIR}")
  RUN_ENV+=("PI_CODING_AGENT_DIR=${AGENT_DIR}")
  echo "[e2e] using isolated PI_CODING_AGENT_DIR: ${AGENT_DIR}"
else
  echo "[e2e] using current Pi auth/config for model access"
fi

cleanup() {
  if [[ "${PI_E2E_KEEP_TMPDIR:-0}" == "1" ]]; then
    echo "[e2e] keeping temp directory: ${WORK_ROOT}"
    return
  fi

  rm -rf "${WORK_ROOT}"
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[e2e] required command not found: $1" >&2
    exit 1
  fi
}

run_pi_json() {
  local prompt="$1"
  local output_path="$2"
  local stderr_path="$3"
  local cmd=(pi --mode json -p --no-session)

  if [[ ${#MODEL_ARGS[@]} -gt 0 ]]; then
    cmd+=("${MODEL_ARGS[@]}")
  fi

  cmd+=("$prompt")

  (
    cd "${PROJECT_DIR}"
    "${RUN_ENV[@]}" "${cmd[@]}" >"${output_path}" 2>"${stderr_path}"
  )
}

require_command git
require_command pi
require_command python3

echo "[e2e] work root: ${WORK_ROOT}"
echo "[e2e] package source: ${PACKAGE_SOURCE}"
mkdir -p "${PROJECT_DIR}" "${AGENT_DIR}"
git -C "${PROJECT_DIR}" init -q

(
  cd "${PROJECT_DIR}"
  "${INSTALL_ENV[@]}" pi install -l "${PACKAGE_SOURCE}"
)

if ! grep -q "pi-package-search" "${PROJECT_DIR}/.pi/settings.json"; then
  echo "[e2e] expected .pi/settings.json to contain pi-package-search after install" >&2
  cat "${PROJECT_DIR}/.pi/settings.json" >&2
  exit 1
fi

echo "[e2e] running skill-driven search prompt"
run_pi_json \
  "${SEARCH_PROMPT}" \
  "${WORK_ROOT}/search.jsonl" \
  "${WORK_ROOT}/search.stderr"
python3 "${SCRIPT_DIR}/assert-pi-json.py" \
  "${WORK_ROOT}/search.jsonl" \
  search_pi_packages \
  "query=${SEARCH_QUERY}"

echo "[e2e] running install prompt"
run_pi_json \
  "${INSTALL_PROMPT}" \
  "${WORK_ROOT}/install.jsonl" \
  "${WORK_ROOT}/install.stderr"
python3 "${SCRIPT_DIR}/assert-pi-json.py" \
  "${WORK_ROOT}/install.jsonl" \
  install_pi_package \
  "packageName=${TEST_INSTALL_PACKAGE}" \
  "project=true" \
  "details.reloadQueued=true" \
  "queue.followUp=/pi-package-search-reload"

python3 - "${PROJECT_DIR}/.pi/settings.json" "${TEST_INSTALL_PACKAGE}" <<'PY'
import json
import sys
from pathlib import Path

settings_path = Path(sys.argv[1])
package_name = sys.argv[2]
settings = json.loads(settings_path.read_text())
packages = settings.get("packages", [])
expected = f"npm:{package_name}"
if expected not in packages:
    print(f"[e2e] expected {expected} in {settings_path}", file=sys.stderr)
    print(json.dumps(settings, indent=2), file=sys.stderr)
    raise SystemExit(1)
print(json.dumps({"installedPackage": expected, "projectPackages": packages}, indent=2))
PY

echo "[e2e] success"
