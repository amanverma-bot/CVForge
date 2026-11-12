#!/usr/bin/env bash
# Start/stop the Ollama daemon used by CVForge's local LLM fallback.
# Termux has no systemd; this uses start-stop-daemon when available and
# falls back to a detached nohup process elsewhere.
set -euo pipefail

ACTION="${1:-start}"
HOST="${OLLAMA_HOST:-127.0.0.1:11434}"
MODEL="${LOCAL_LLM_MODEL:-cvforge-qwen:latest}"
PIDFILE="${HOME}/.cvforge-ollama.pid"
LOG="${HOME}/cvforge-ollama.log"
BASE="http://${HOST}"

is_up() {
  curl -sf --max-time 2 "${BASE}/api/tags" >/dev/null 2>&1
}

status() {
  if is_up; then
    echo "Ollama is responding at ${BASE}"
    if command -v ollama >/dev/null 2>&1; then
      ollama list | awk 'NR==1 || $1 == "'"${MODEL}"'"'
    fi
  else
    echo "Ollama is not responding at ${BASE}"
    return 1
  fi
}

case "${ACTION}" in
  start)
    if is_up; then
      echo "Ollama is already running at ${BASE}"
      status
      exit 0
    fi
    command -v ollama >/dev/null 2>&1 || { echo "ollama is not installed or not on PATH" >&2; exit 1; }
    export OLLAMA_HOST="${HOST}"
    if command -v start-stop-daemon >/dev/null 2>&1; then
      start-stop-daemon --start --background --make-pidfile --pidfile "${PIDFILE}" \
        --startas "$(command -v ollama)" -- serve
    else
      nohup ollama serve >>"${LOG}" 2>&1 &
      echo $! >"${PIDFILE}"
    fi
    for _ in $(seq 1 60); do
      if is_up; then
        echo "Ollama started at ${BASE} (pid $(cat "${PIDFILE}" 2>/dev/null || echo unknown))"
        status || true
        exit 0
      fi
      sleep 1
    done
    echo "Ollama did not become ready within 60 seconds. See ${LOG}" >&2
    exit 1
    ;;
  stop)
    if [ ! -f "${PIDFILE}" ]; then
      echo "No CVForge-managed Ollama pid file at ${PIDFILE}; leaving any external process untouched."
      exit 0
    fi
    start-stop-daemon --stop --pidfile "${PIDFILE}" --retry TERM/10/KILL/5 || true
    rm -f "${PIDFILE}"
    echo "Stopped the CVForge-managed Ollama process."
    ;;
  status)
    status
    ;;
  *)
    echo "Usage: $0 {start|stop|status}" >&2
    exit 2
    ;;
esac
