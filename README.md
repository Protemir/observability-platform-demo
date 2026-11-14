# Платформа наблюдаемости для микросервисов — demo

> **Демо (proof of concept).** Репозиторий сделан студией [TEMIRLAB](https://temirlab.com) как proof для
> технологической задачи AstanaHub «Платформа наблюдаемости для микросервисов: метрики, логи, трассировки
> и оповещения на открытом стеке». Пороги оповещений — стартовые: их подбирают на 72-часовом пилоте,
> который входит в сам проект.

Метрики, журналы и трассы [OpenTelemetry Demo](https://github.com/open-telemetry/opentelemetry-demo)
(Astronomy Shop 3.1.0) идут через OpenTelemetry Collector в Prometheus, Loki и Tempo, показываются в Grafana,
оповещения уходят через Alertmanager в почту и Telegram. Только открытое ПО.

```
 сервисы демо ──OTLP──▶ OTel Collector ──┬─ трассы ──▶ Tempo ──(граф сервисов)──┐
 (15+ сервисов,          span_metrics ───┤                                       ▼
  сбои через flagd,      + exemplars     ├─ метрики ─▶ Prometheus ◀──────── remote write
  генератор нагрузки)                    └─ журналы ─▶ Loki         │ правила
                                                                    ▼
          Grafana: метрика ─exemplar─▶ трасса ─trace_id─▶ журналы   Alertmanager ─▶ почта (SMTP, TLS)
                                                                                └▶ Telegram Bot API
```

## Что внутри

| Путь | Что |
|---|---|
| `collector/` | слой конфигурации коллектора: экспорт в Tempo/Prometheus/Loki, span-метрики с exemplars |
| `alerts/` | правила записи и оповещений Prometheus + юнит-тесты `promtool` (`alerts/tests/`) |
| `alertmanager/` | маршруты, группировка, подавление, почта и Telegram, шаблоны сообщений |
| `dashboards/` | 5 панелей Grafana (JSON) и их генератор `dashboards/src/build.mjs` |
| `runbooks/` | инструкция дежурному на каждое оповещение |
| `scenarios/` | 12 сценариев сбоев: чем ловятся, где искать; скрипт переключения флагов |
| `deploy/` | Kubernetes: values для kube-prometheus-stack, Loki, Tempo, OTel Demo и `install.sh` |
| `local/` | урезанный стенд на Docker Compose для ноутбука (с заглушками почты и Telegram) |
| `docs/` | архитектура, подключение нового сервиса, оповещения, ресурсы, лицензии |
| `tools/validate.sh` | все проверки без кластера |
| `screenshots/` | снимки с локального стенда |

## Запуск

Kubernetes (kind, k3s или управляемый кластер), одной командой:

```bash
cp deploy/config.example.env deploy/config.env   # SMTP, chat_id, адрес Grafana
export SMTP_PASSWORD=... TELEGRAM_BOT_TOKEN=...  # только в Secret Kubernetes, не в Git
KIND=1 ./deploy/install.sh                       # KIND=1 заодно создаёт локальный кластер kind
```

Ноутбук, только Docker (урезанно: без Kafka, если не `FULL=1`, без браузерной нагрузки):

```bash
./local/up.sh
node scenarios/flag.mjs paymentFailure on      # сломать
node scenarios/flag.mjs all off                # вернуть
```

Проверки без кластера (нужен только Docker):

```bash
./tools/validate.sh   # promtool check + тесты, amtool, otelcol validate, helm template + kubeconform, панели
```

## Состояние

- Локальный стенд на Docker работает, снимки — в `screenshots/`.
- Kubernetes: все четыре чарта рендерятся с нашими values, 202 манифеста проходят kubeconform,
  конфиг коллектора проходит `otelcol validate`. Полный стенд в кластере и 72-часовой пилот — этапы проекта.

Лицензия: Apache-2.0.
