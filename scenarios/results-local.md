# Прогон сценариев на локальном стенде, 14.11.2026

Стенд: ядро OpenTelemetry Demo 3.1.0 на Docker (15 сервисов, без Kafka), генератор нагрузки — 10 HTTP-пользователей,
платформа из этого репозитория. Время — от включения флага (`scenarios/run.mjs`) до первого сообщения в
Telegram (заглушка Bot API) о нужном сервисе. Правила — версия из этого коммита.

| Сценарий | До оповещения | Первое сообщение | Сервис-источник назван |
|---|---|---|---|
| paymentFailure | 1 мин 54 с | ServiceHighErrorRate · payment · critical | сразу |
| paymentUnreachable | 3 мин 43 с | DependencyCallErrors · checkout → PaymentService/Charge | сразу (вызываемый сервис) |
| adFailure | 2 мин 43 с | ServiceHighErrorRate · ad · critical | сразу |
| cartFailure | 2 мин 27 с | ServiceHighLatency · frontend-proxy (POST p95 10 с) | 6 мин 57 с — OperationErrors · cart / EmptyCart |
| productCatalogFailure | 2 мин 52 с | ServiceHighErrorRate · product-catalog · critical | сразу |
| intlShippingSlowdown | 4 мин 55 с | ServiceHighLatency · shipping · warning | сразу |
| adHighCpu | 3 мин 12 с | HighCpu · ad · warning | сразу |
| emailMemoryLeak | 2 мин 26 с | ContainerRestarting · email (OOM при утечке 10000×) | сразу |
| recommendationCacheFailure | 6 мин 14 с | ServiceHighLatency · recommendation · warning | сразу |

Итого: оповещение не позже 5 минут — 8 из 9, сервис-источник в первом сообщении — 7 из 9.

Не воспроизводились локально: `imageSlowLoad` (нужны браузерные пользователи нагрузки), `kafkaQueueProblems`
и `kafkaConsumerDead` (урезанный стенд без Kafka). Это проверяется на полном стенде в Kubernetes.

## Что поправили по ходу прогона

1. Прогрев контейнера после старта выглядел как утечка → MemoryLeak требует непрерывного роста 4 минуты и uptime > 10 минут.
2. Долгие gRPC-стримы flagd (`EventStream`) и опрос `/metrics` попадали в RED → исключены.
3. `ServiceDown` срабатывал на email, когда без оплат нет писем → теперь нужен ещё и остановленный контейнер.
4. Процесс, который просто работает у лимита памяти (flagd-ui), давал MemoryNearLimit → нужен ещё и рост.
5. Редкие операции (EmptyCart ~1,5 вызова в минуту) мигали в 2-минутном окне → добавлено окно 5 минут с минимумом 3 ошибок.
6. Синтетический клиент load-generator давал DependencyCallErrors → исключён.
7. Сами Grafana и Tempo упирались в лимиты памяти → GOMEMLIMIT и лимиты; ресурсные правила смотрят только на сервисы демо.

## Что ещё улучшить на пилоте

- `recommendationCacheFailure`: кэш растёт в 1,25 раза на промах, заметный рост — через 5–6 минут при нашей нагрузке.
  На полной нагрузке быстрее; если нет — правило на атрибут `demo.product.count` в span-метриках.
- `cartFailure`: сбой бьёт только `EmptyCart` с 10-секундным тайм-аутом; первое оповещение — о задержке
  frontend-proxy, источник видно на панели checkout («Исходящие вызовы»). Можно снизить порог OperationErrors до 2 ошибок.
- После `cartFailure` сервис cart продолжал изредка ходить в сбойное хранилище и после выключения флага —
  платформа это показала; на стенде лечится перезапуском cart.
