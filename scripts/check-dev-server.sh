#!/usr/bin/env bash
set -euo pipefail

# check-dev-server.sh
#
# Ensures a project's dev server is healthy and stable.
# Output contract (single line):
#   running
#   startup failed: <reason>
#   timed out

PROJECT_PATH=""
START_CMD=""
TIMEOUT_SECONDS=30
STABILITY_SECONDS=2
START_PID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-path)
      PROJECT_PATH="$2"
      shift 2
      ;;
    --start-cmd)
      START_CMD="$2"
      shift 2
      ;;
    --timeout-seconds)
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --stability-seconds)
      STABILITY_SECONDS="$2"
      shift 2
      ;;
    *)
      echo "startup failed: unknown argument '$1'"
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_PATH" ]]; then
  echo "startup failed: missing --project-path"
  exit 1
fi

if [[ ! -d "$PROJECT_PATH" ]]; then
  echo "startup failed: project path not found"
  exit 1
fi

PROJECT_PATH="$(cd "$PROJECT_PATH" && pwd)"

PROJECTS_JSON="$HOME/.config/opencode/projects.json"
if [[ ! -f "$PROJECTS_JSON" ]]; then
  echo "startup failed: missing projects registry"
  exit 1
fi

DEV_PORT="$(jq -r --arg p "$PROJECT_PATH" '.projects[] | select(.path == $p) | .devPort' "$PROJECTS_JSON" | head -n 1)"
if [[ -z "$DEV_PORT" || "$DEV_PORT" == "null" ]]; then
  echo "startup failed: no devPort mapping for project path"
  exit 1
fi

if [[ -z "$START_CMD" ]]; then
  PROJECT_JSON="$PROJECT_PATH/docs/project.json"
  if [[ -f "$PROJECT_JSON" ]]; then
    START_CMD="$(jq -r '.commands.dev // empty' "$PROJECT_JSON")"
  fi
fi

if [[ -z "$START_CMD" ]]; then
  START_CMD="npm run dev"
fi

http_code() {
  curl -sS --max-time 2 "http://localhost:${DEV_PORT}" -o /dev/null -w "%{http_code}" || true
}

listener_pids() {
  lsof -n -iTCP:"${DEV_PORT}" -sTCP:LISTEN -t 2>/dev/null || true
}

pid_parent() {
  local pid="$1"
  ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' '
}

is_descendant_of() {
  local child="$1"
  local ancestor="$2"
  local current="$child"

  while [[ -n "$current" && "$current" != "1" ]]; do
    if [[ "$current" == "$ancestor" ]]; then
      return 0
    fi
    current="$(pid_parent "$current")"
  done

  return 1
}

listener_matches_start_tree() {
  local pid
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    if is_descendant_of "$pid" "$START_PID"; then
      return 0
    fi
  done < <(listener_pids)

  return 1
}

listener_matches_project_path() {
  local pid cwd
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ {print substr($0, 2); exit}')"
    if [[ -n "$cwd" && "$cwd" == "$PROJECT_PATH"* ]]; then
      return 0
    fi
  done < <(listener_pids)

  return 1
}

listener_correlation_ok() {
  if [[ -n "$START_PID" ]]; then
    listener_matches_start_tree
    return $?
  fi

  listener_matches_project_path
}

healthy_once() {
  local code
  code="$(http_code)"
  [[ "$code" =~ ^[23][0-9][0-9]$ ]] && listener_correlation_ok
}

healthy_stable() {
  healthy_once || return 1
  sleep "$STABILITY_SECONDS"
  healthy_once
}

if healthy_stable; then
  echo "running"
  exit 0
fi

mkdir -p "$PROJECT_PATH/.tmp"
LOG_FILE="$PROJECT_PATH/.tmp/opencode-dev-server.log"

START_PID="$((
  cd "$PROJECT_PATH"
  nohup bash -lc "exec $START_CMD" >"$LOG_FILE" 2>&1 &
  echo $!
))"

for ((i=1; i<=TIMEOUT_SECONDS; i++)); do
  if healthy_stable; then
    echo "running"
    exit 0
  fi

  if ! ps -p "$START_PID" >/dev/null 2>&1; then
    reason="$(tail -n 1 "$LOG_FILE" 2>/dev/null | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if [[ -z "$reason" ]]; then
      reason="dev process exited before healthy"
    fi
    echo "startup failed: ${reason:0:180}"
    exit 1
  fi

  sleep 1
done

if healthy_stable; then
  echo "running"
  exit 0
fi

if ps -p "$START_PID" >/dev/null 2>&1; then
  echo "timed out"
else
  reason="$(tail -n 1 "$LOG_FILE" 2>/dev/null | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if [[ -z "$reason" ]]; then
    reason="dev process exited before healthy"
  fi
  echo "startup failed: ${reason:0:180}"
  exit 1
fi
