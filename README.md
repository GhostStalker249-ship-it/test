# Backup Monitoring Center

Веб-приложение для централизованного мониторинга систем резервного копирования:
- Кибер Бекап
- RuBackup
- Veeam

## Возможности

- Сбор данных через API каждой системы резервного копирования.
- Единый API `/api/metrics` с нормализованными метриками.
- Настраиваемый дашборд с виджетами:
  - линейный график,
  - столбчатый график,
  - статистический виджет,
  - специальные виджеты Кибер Бекап и RuBackup для задач и действий,
  - встраивание Grafana панели через iframe.
- Настройки виджетов сохраняются в `localStorage`.
- Fallback режим: если API поставщика недоступен, показываются демонстрационные данные с меткой `source: fallback`.

- Меню «Настройки Кибер Бекап» и «Настройки RuBackup» для фильтрации статусов задач/действий и лимита строк в специальных виджетах.


## Полная инструкция для новичка

Подробная пошаговая инструкция для человека без IT-опыта находится в файле:

- `BEGINNER_SETUP_RU.md`


## Быстрый старт (локально)

```bash
npm start
```

Откройте `http://localhost:3000`.


## Запуск через Docker (самый простой способ)

### Вариант 1: Docker Compose

```bash
docker compose up -d --build
```

Открыть в браузере: `http://<IP_сервера>:3000`

Остановить:

```bash
docker compose down
```

### Вариант 2: Docker напрямую

```bash
# собрать образ
docker build -t backup-monitor:latest .

# запустить контейнер
docker run -d --name backup-monitor -p 3000:3000 \
  -e HOST=0.0.0.0 \
  -e PORT=3000 \
  backup-monitor:latest
```

Проверка health API:

```bash
curl http://127.0.0.1:3000/api/providers
```

Логи:

```bash
docker logs -f backup-monitor
```

Остановка и удаление:

```bash
docker rm -f backup-monitor
```

## Запуск на сервере для тестирования

Добавлен скрипт управления сервером: `scripts/server-control.sh`.

```bash
# запуск в фоне
./scripts/server-control.sh start

# проверить состояние
./scripts/server-control.sh status

# healthcheck API
./scripts/server-control.sh healthcheck

# посмотреть лог
./scripts/server-control.sh logs

# перезапуск / остановка
./scripts/server-control.sh restart
./scripts/server-control.sh stop
```

По умолчанию приложение стартует на `0.0.0.0:3000`.
Можно переопределить через env:

```bash
HOST=0.0.0.0 PORT=3100 ./scripts/server-control.sh start
```

## Переменные окружения

```bash
PORT=3000
HOST=0.0.0.0

CYBER_BACKUP_BASE_URL=http://localhost:9001
CYBER_BACKUP_TOKEN=...
CYBER_BACKUP_JOBS_PATH=/api/jobs
CYBER_BACKUP_TASKS_PATH=/api/tasks
CYBER_BACKUP_ACTIONS_PATH=/api/activities

RU_BACKUP_BASE_URL=http://localhost:9002
RU_BACKUP_TOKEN=...
RU_BACKUP_JOBS_PATH=/api/tasks
RU_BACKUP_TASKS_PATH=/api/plans
RU_BACKUP_ACTIONS_PATH=/api/actions

VEEAM_BASE_URL=http://localhost:9003
VEEAM_TOKEN=...
VEEAM_SESSIONS_PATH=/api/sessions
```

## API

- `GET /api/providers` — список поставщиков.
- `GET /api/config` — текущая конфигурация подключения.
- `GET /api/metrics` — агрегированные данные по всем системам.


## Кибер Бекап: задачи и действия

Для Кибер Бекап backend запрашивает три источника данных (пути настраиваются через env):
- `jobs` — общий таймлайн длительности задач для графиков.
- `tasks` — список задач для виджета «Кибер Бекап: задачи».
- `actions` (`activities`) — список действий/операций для виджета «Кибер Бекап: действия».

Специальные виджеты показывают:
- сводку по статусам,
- последние записи с фильтром по статусам,
- для действий — дополнительную сводку по типам операций.


## RuBackup: задачи и действия

Для RuBackup backend запрашивает три источника данных (пути настраиваются через env):
- `jobs` — временной ряд длительности заданий для графиков.
- `tasks` — список задач/планов для виджета «RuBackup: задачи».
- `actions` — список действий/операций для виджета «RuBackup: действия».

Специальные виджеты RuBackup показывают:
- сводку по статусам,
- последние записи с фильтром по статусам,
- для действий — дополнительную сводку по типам операций.
