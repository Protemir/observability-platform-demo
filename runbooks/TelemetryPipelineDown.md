# TelemetryPipelineDown

**Важность:** critical  
**Сценарии, которые его вызывают:** сбой самой платформы

## Что значит

В Prometheus 3 минуты не приходят span-метрики. Коллектор не работает или не может отдать данные. Пока это так, остальные оповещения слепы.

## Где смотреть

1. `kubectl -n observability get pods` — коллектор и Prometheus.
2. Журналы коллектора: ошибки экспорта, memory_limiter.

## Первые шаги

- Перезапустить коллектор; если упирается в память — поднять лимит.
- Проверить, что Prometheus принимает OTLP (`--web.enable-otlp-receiver`).

Правило: [alerts/](../alerts/). Панели: Grafana → папка «Observability platform».
