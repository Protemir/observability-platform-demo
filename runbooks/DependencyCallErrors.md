# DependencyCallErrors

**Важность:** critical  
**Сценарии, которые его вызывают:** paymentUnreachable, paymentFailure, cartFailure

## Что значит

Сервис вызывает зависимость (`span_name` — какую именно), и больше 20 % вызовов падает. Источник — вызываемый сервис или сеть до него.

## Где смотреть

1. Обзор → карта сервисов: красное ребро между сервисами.
2. Есть ли у вызываемого сервиса свои спаны? Если нет совсем — он недоступен (ServiceDown, DNS, порт, сетевая политика).
3. Трасса с ошибкой: у клиентского спана текст ошибки (connection refused, unavailable, deadline exceeded).

## Первые шаги

- `connection refused / unavailable` — проверить поды и Service зависимости, `kubectl get endpoints`.
- `deadline exceeded` — зависимость медленная: смотреть её задержку.
- Если зависимость отвечает ошибками — работать по её ServiceHighErrorRate.

Правило: [alerts/](../alerts/). Панели: Grafana → папка «Observability platform».
