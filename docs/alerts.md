# Оповещения: подход и настройка

## Подход

- **Симптомы, а не причины.** Основные правила — по тому, что видит пользователь: ошибки, задержка,
  недоступность (RED по span-метрикам). Ресурсные правила (память, CPU, перезапуски) ловят то, что ещё
  не дошло до пользователя.
- **Сервис в каждой метке.** У каждого оповещения есть `service` — с чего дежурному начинать.
  Ошибки вызовов (`DependencyCallErrors`) называют и вызывающего, и вызываемого.
- **SLO для оформления заказа** — доступность 99 % и 95 % заказов быстрее 2 с, оповещения по скорости
  расхода бюджета ошибок: быстрое (14,4×, окна 1 ч и 5 мин, critical) и медленное (6×, 6 ч и 30 мин, warning)
  — схема Google SRE Workbook.
- **Каждое правило — с runbook и тестом.** `runbooks/<имя>.md`, тесты в `alerts/tests/` (`promtool test rules`).
- **Пороги — стартовые.** Подбираются на пилоте по критерию «не больше 2 ложных за 72 часа»; каждое
  изменение порога — коммит с причиной.

## Доставка

| Важность | Куда | Повтор |
|---|---|---|
| critical | e-mail + Telegram | раз в 4 ч, пока активно |
| warning | e-mail + Telegram | раз в 4 ч |
| info | только e-mail | раз в 4 ч |
| Watchdog | никуда (или во внешний heartbeat) | — |

Группировка `alertname + service`, `group_wait` 30 с, `group_interval` 2 мин.
Подавление: critical скрывает warning того же сервиса; `ServiceDown` скрывает ошибки и задержку того же
сервиса; `DependencyCallErrors` скрывает `ServiceHighErrorRate` вызывающего.

## Настройка e-mail и Telegram

1. Telegram: создать бота у @BotFather (токен), добавить в чат дежурных, узнать `chat_id`.
2. SMTP: адрес сервера с STARTTLS (порт 587), логин, пароль.
3. `deploy/config.env`: `SMTP_HOST`, `SMTP_FROM`, `SMTP_USER`, `ALERT_EMAIL_TO`, `TELEGRAM_CHAT_ID`, `GRAFANA_URL`.
4. Секреты — только через окружение: `export SMTP_PASSWORD=… TELEGRAM_BOT_TOKEN=…`, затем `./deploy/install.sh`.
   Они попадают в Secret `alert-secrets` и читаются Alertmanager из файлов (`*_file`), в Git их нет.
5. Проверка: `amtool alert add Test severity=warning service=test --alertmanager.url=…` — должно прийти
   письмо и сообщение.

Шаблоны сообщений — `alertmanager/templates/platform.tmpl` (HTML для почты и Telegram).
