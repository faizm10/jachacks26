#!/usr/bin/env bash
# Run FastAPI (backend) and Next.js (frontend) together from repo root.
# Usage: ./dev.sh
# Optional: BACKEND_PORT=8000 FRONTEND_PORT=3000 ./dev.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
}

trap cleanup EXIT INT TERM

echo "[dev] repo root: $ROOT"
echo "[dev] backend http://127.0.0.1:${BACKEND_PORT}  |  frontend http://127.0.0.1:${FRONTEND_PORT}"
echo "[dev] Ctrl+C stops both."
echo ""

# --- Install dependencies (backend venv + frontend node_modules) ---
echo "[dev] installing backend (pip)…"
(
  cd "$ROOT/backend"
  if [[ ! -d .venv ]]; then
    if ! command -v python3 >/dev/null 2>&1; then
      echo "[dev] error: python3 not found; install Python 3 and retry." >&2
      exit 1
    fi
    python3 -m venv .venv
  fi
  # shellcheck source=/dev/null
  source .venv/bin/activate
  python -m pip install -U pip >/dev/null
  python -m pip install -r requirements.txt
)
echo "[dev] installing frontend (npm)…"
(
  cd "$ROOT/frontend"
  npm install
)
echo "[dev] installs done."
echo ""

(
  cd "$ROOT/backend"
  if [[ -f .venv/bin/activate ]]; then
    # shellcheck source=/dev/null
    source .venv/bin/activate
  fi
  exec python -m uvicorn app.main:app --reload --host 127.0.0.1 --port "$BACKEND_PORT"
) &
pids+=("$!")

(
  cd "$ROOT/frontend"
  export PORT="$FRONTEND_PORT"
  exec npm run dev
) &
pids+=("$!")

wait
