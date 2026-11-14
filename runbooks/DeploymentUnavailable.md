# DeploymentUnavailable

**Важность:** critical  
**Сценарии, которые его вызывают:** сбой пода, failedReadinessProbe

## Что значит

У Deployment нет ни одной готовой реплики.

## Где смотреть

1. `kubectl -n otel-demo describe deploy <name>` и события пода.

## Первые шаги

- Образ, ресурсы, пробы, конфиг — по событиям пода.

Правило: [alerts/](../alerts/). Панели: Grafana → папка «Observability platform».
