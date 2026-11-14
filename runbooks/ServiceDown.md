# ServiceDown

**Важность:** critical  
**Сценарии, которые его вызывают:** kafkaConsumerDead (замена: потребитель остановлен), сбой пода

## Что значит

У сервиса был трафик, а последние 2 минуты нет ни одного спана и его контейнер не запущен: сервис лежит или выключен. Сервис, которому просто не пришла работа (email, когда нет заказов), сюда не попадает; зависший, но запущенный сервис виден по DependencyCallErrors у тех, кто его вызывает.

## Где смотреть

1. Инфраструктура: перезапуски, поды не Running.
2. `kubectl -n otel-demo get pods -l app.kubernetes.io/component=<service>`, `kubectl describe pod`.
3. Если под жив и отвечает — проверить экспорт телеметрии (TelemetryPipelineDown, журналы коллектора).

## Первые шаги

- CrashLoopBackOff/OOMKilled — смотреть журналы предыдущего контейнера (`kubectl logs --previous`).
- Под жив, трафика нет — проверить вызывающий сервис и Service/Endpoints.

Правило: [alerts/](../alerts/). Панели: Grafana → папка «Observability platform».
