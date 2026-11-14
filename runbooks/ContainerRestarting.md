# ContainerRestarting

**Важность:** warning  
**Сценарии, которые его вызывают:** emailMemoryLeak (OOM), сбой пода

## Что значит

Контейнер перезапустился за последние 10 минут.

## Где смотреть

1. `kubectl describe pod` — причина: OOMKilled, Error, проба живости.
2. `kubectl logs --previous` — последние строки перед падением.

## Первые шаги

- OOMKilled — работать по MemoryLeak/MemoryNearLimit.
- Проба живости — проверить зависимости, от которых зависит проба.

Правило: [alerts/](../alerts/). Панели: Grafana → папка «Observability platform».
