# Watchdog

**Важность:** none  
**Сценарии, которые его вызывают:** —

## Что значит

Всегда активное оповещение — проверка, что цепочка Prometheus → Alertmanager жива. В почту и Telegram не уходит.

## Где смотреть

1. Alertmanager UI: Watchdog должен быть в списке активных.

## Первые шаги

- Если Watchdog пропал — не работает вычисление правил или связь с Alertmanager: проверить оба пода.
- Для внешнего контроля маршрут Watchdog можно направить в heartbeat-сервис.

Правило: [alerts/](../alerts/). Панели: Grafana → папка «Observability platform».
