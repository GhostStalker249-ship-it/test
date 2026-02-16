#!/usr/bin/env bash
set -euo pipefail

# Управление приложением мониторинга на сервере.
# Примеры:
#   ./scripts/server-control.sh start
#   ./scripts/server-control.sh status
#   ./scripts/server-control.sh logs
#   ./scripts/server-control.sh stop

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${ROOT_DIR}/.backup-monitor.pid"
LOG_FILE="${ROOT_DIR}/.backup-monitor.log"
PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"

is_running() {
  if [[ -f "${PID_FILE}" ]]; then
    local pid
    pid="$(cat "${PID_FILE}")"
    if kill -0 "${pid}" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

start_server() {
  if is_running; then
    echo "Сервер уже запущен (PID $(cat "${PID_FILE}"))."
    return 0
  fi

  echo "Запуск сервера на ${HOST}:${PORT}..."
  (
    cd "${ROOT_DIR}"
    nohup env HOST="${HOST}" PORT="${PORT}" node server.js >>"${LOG_FILE}" 2>&1 &
    echo $! >"${PID_FILE}"
  )

  sleep 1
  if is_running; then
    echo "Сервер запущен. PID: $(cat "${PID_FILE}")"
    echo "Лог: ${LOG_FILE}"
  else
    echo "Ошибка запуска. Проверьте лог: ${LOG_FILE}" >&2
    exit 1
  fi
}

stop_server() {
  if ! is_running; then
    echo "Сервер не запущен."
    rm -f "${PID_FILE}"
    return 0
  fi

  local pid
  pid="$(cat "${PID_FILE}")"
  echo "Остановка сервера (PID ${pid})..."
  kill "${pid}" 2>/dev/null || true

  for _ in {1..10}; do
    if kill -0 "${pid}" 2>/dev/null; then
      sleep 0.5
    else
      break
    fi
  done

  if kill -0 "${pid}" 2>/dev/null; then
    echo "Принудительная остановка..."
    kill -9 "${pid}" 2>/dev/null || true
  fi

  rm -f "${PID_FILE}"
  echo "Сервер остановлен."
}

status_server() {
  if is_running; then
    local pid
    pid="$(cat "${PID_FILE}")"
    echo "Сервер запущен. PID: ${pid}, HOST=${HOST}, PORT=${PORT}"
    return 0
  fi
  echo "Сервер не запущен."
  return 1
}

logs_server() {
  touch "${LOG_FILE}"
  echo "Показываю лог: ${LOG_FILE}"
  tail -n 100 -f "${LOG_FILE}"
}

healthcheck() {
  local code
  code="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/providers" || true)"
  if [[ "${code}" == "200" ]]; then
    echo "Healthcheck OK: /api/providers -> 200"
    return 0
  fi
  echo "Healthcheck FAILED: /api/providers -> ${code}" >&2
  return 1
}

case "${1:-}" in
  start)
    start_server
    ;;
  stop)
    stop_server
    ;;
  restart)
    stop_server
    start_server
    ;;
  status)
    status_server
    ;;
  logs)
    logs_server
    ;;
  healthcheck)
    healthcheck
    ;;
  *)
    cat <<USAGE
Использование: $0 {start|stop|restart|status|logs|healthcheck}

Переменные окружения:
  PORT   (по умолчанию: 3000)
  HOST   (по умолчанию: 0.0.0.0)
USAGE
    exit 1
    ;;
esac
