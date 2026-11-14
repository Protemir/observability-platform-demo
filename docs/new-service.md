# Подключение нового сервиса к платформе

Платформа не знает про конкретные сервисы: всё, что приходит по OTLP с `service.name`, сразу попадает
на панели, в карту сервисов и под общие правила оповещений. Новому сервису нужно четыре шага.

## 1. Инструментирование

Подключить OpenTelemetry SDK или авто-инструментирование для языка сервиса
(.NET, Java, Go, Python, Node.js, Ruby, PHP, Rust, C++ — все есть в демо как примеры).
Переменные окружения:

```yaml
env:
  - name: OTEL_SERVICE_NAME
    value: billing                       # имя сервиса на панелях и в оповещениях
  - name: OTEL_EXPORTER_OTLP_ENDPOINT
    value: http://otel-collector.otel-demo:4317
  - name: OTEL_RESOURCE_ATTRIBUTES
    value: service.namespace=shop,service.version=1.4.2,deployment.environment.name=prod
```

Журналы — через OTLP-логгер SDK (тогда `trace_id` попадает сам) или в stdout в JSON с полем `trace_id`
(тогда коллектор читает их filelog-ресивером).

## 2. Проверка

- Grafana → «Обзор»: сервис появился в таблице и на карте через 1–2 минуты.
- «Сервис» → выбрать его: запросы, ошибки, задержка, журналы, трассы.
- Открыть трассу → «Logs for this span»: журналы находятся по `trace_id`.

## 3. Оповещения

Общие правила (ошибки, задержка, недоступность, ресурсы, вызовы зависимостей) уже действуют.
Свои правила — в `alerts/` + runbook в `runbooks/` + тест в `alerts/tests/`.
Если у сервиса своё SLO — скопировать группу `slo.checkout.recording` и алерты `CheckoutSlo*`,
поменять фильтр операции и цель.

## 4. Ресурсы контейнера

Указать `resources.limits.memory` (и `cpu` при необходимости): правила MemoryNearLimit, MemoryLeak и
HighCpu считают от лимита. Имя контейнера = имя сервиса, иначе поправить `label_replace` в
`alerts/recording.k8s.yaml`.
