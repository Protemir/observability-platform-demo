# Архитектура

## Поток сигналов

1. Сервисы демо (11+ языков) шлют трассы, метрики и журналы по OTLP в **OpenTelemetry Collector**.
   Код демо не меняется: только адреса экспорта (ТЗ 4.6).
2. Коллектор:
   - убирает чувствительные атрибуты (redaction, как в демо) и шум (health-check);
   - коннектор **span_metrics** строит из трасс RED-метрики (запросы, ошибки, гистограмма задержки)
     по каждому сервису и операции, с **exemplars** — ссылками на конкретную трассу;
   - дополнительно собирает метрики Kafka (kafkametrics), Valkey (redis), PostgreSQL, узлов и подов
     (kubeletstats, k8s_cluster; в Kubernetes ещё node-exporter и kube-state-metrics).
3. Хранилища:
   - **Prometheus** — метрики, принимает OTLP напрямую; хранит exemplars; 7 дней.
   - **Loki** — журналы по OTLP; `trace_id`/`span_id` лежат в structured metadata; 7 дней.
   - **Tempo** — трассы; metrics-generator считает граф вызовов (карта сервисов) и пишет в Prometheus; 7 дней.
4. **Grafana** — панели и переходы между сигналами. **Alertmanager** — доставка оповещений.

## Корреляция сигналов (ТЗ 4.3)

| Откуда | Куда | Как |
|---|---|---|
| график задержки | трасса конкретного запроса | exemplar-точка на графике (span_metrics → Prometheus → Grafana) |
| любая панель метрик | трассы за выбранный период | ссылка панели «Трассы за этот период» (TraceQL с `$service` и `${__from}/${__to}`) |
| трасса / спан | журналы этого запроса | Tempo → Loki `{service_name=…} \| trace_id="…"` (кнопка «Logs for this span») |
| журнал | трасса | поле `trace_id` в журнале — ссылка на Tempo |
| трасса | метрики сервиса | Tempo → Prometheus (tracesToMetrics) |
| оповещение | панель + runbook | ссылки в тексте письма и сообщения Telegram |

## Почему эти компоненты

- **Prometheus**, а не Mimir/VictoriaMetrics: стенд — один кластер, 7 дней; Prometheus проще передать и
  поддерживать, принимает OTLP и хранит exemplars. Mimir имеет смысл при долгом хранении и многих кластерах.
- **Loki**, а не OpenSearch: в 3–5 раз меньше памяти на стенде, индексирует только метки, поиск по
  `trace_id` через structured metadata. OpenSearch оправдан, если нужен полнотекстовый поиск по всему.
- **Tempo**, а не Jaeger: хранит трассы в простом хранилище без Elasticsearch/Cassandra, умеет TraceQL
  и сам считает граф сервисов. Jaeger UI остаётся вариантом, если команда к нему привыкла.
- **Alertmanager**, а не Grafana Alerting: правила живут в Git как Prometheus-правила, их можно
  проверять `promtool test rules` в CI; маршрутизация и подавление — проверенный механизм.
- **Helm + kube-prometheus-stack**: стандарт де-факто, переносится на любой кластер (kind, k3s, managed).

## Хранение и ресурсы

См. [resources.md](resources.md).
