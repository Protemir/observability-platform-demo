# 12 сценариев сбоев: чем ловятся и где искать причину

Замеры на локальном стенде: [results-local.md](results-local.md) (8 из 9 воспроизводимых сценариев — оповещение до 5 минут).

Флаги — встроенные в OpenTelemetry Demo 3.1.0 (flagd). Переключение: `node scenarios/flag.mjs <флаг> on|off`
(локальный стенд) или `K8S=1 node scenarios/flag.mjs <флаг> on|off` (Kubernetes).

| # | Сценарий (ТЗ 3.2) | Что ломается | Оповещение (первое) | Сервис-источник на панелях |
|---|---|---|---|---|
| 1 | adFailure | ad отвечает ошибкой на часть запросов | ServiceHighErrorRate{service=ad} | Обзор → таблица сервисов, ad красный |
| 2 | adHighCpu | ad грузит процессор | HighCpu{service=ad}, затем ServiceHighLatency | Инфраструктура → CPU контейнеров |
| 3 | cartFailure | EmptyCart уходит в сбойное хранилище (10 с тайм-аут) | ServiceHighLatency{frontend-proxy}, затем OperationErrors{cart, EmptyCart} | Сервис checkout → «Исходящие вызовы» |
| 4 | emailMemoryLeak | память email растёт | MemoryLeak / ContainerRestarting{email} (при 10000× — OOM за минуту) | Сервис email → «Память контейнера» |
| 5 | imageSlowLoad | картинки во фронтенде грузятся 5–10 с | ServiceHighLatency{frontend-proxy, маршрут images} | Сервис frontend-proxy → задержка по операциям |
| 6 | intlShippingSlowdown | расчёт доставки вне США тормозит | ServiceHighLatency{service=shipping}, CheckoutLatencySloBurn | Сервис shipping → p95, медленная трасса |
| 7 | kafkaConsumerDead¹ | потребитель перестаёт читать заказы | KafkaConsumerStalled, ServiceDown{accounting} | Очереди → «Чтение группами» |
| 8 | kafkaQueueProblems | очередь перегружена, потребитель тормозит | KafkaConsumerLagHigh | Очереди → «Отставание потребителей» |
| 9 | paymentFailure | часть платежей падает | ServiceHighErrorRate{service=payment}, CheckoutSloFastBurn | SLO checkout → неудачные заказы → трасса |
| 10 | paymentUnreachable | payment недоступен | DependencyCallErrors{checkout→PaymentService/Charge} | Обзор → карта, красное ребро checkout→payment |
| 11 | productCatalogFailure | ошибка каталога для одного товара | OperationErrors / ServiceHighErrorRate{product-catalog} | Сервис product-catalog → трасса с ошибкой, атрибут product.id |
| 12 | recommendationCacheFailure | кэш рекомендаций растёт без вытеснения | ServiceHighLatency{recommendation}, MemoryLeak | Сервис recommendation → память, задержка |

¹ В демо 3.1.0 флага `kafkaConsumerDead` нет (проверено по `src/flagd/demo.flagd.json` тега 3.1.0).
ТЗ это предусматривает: замену согласуем на этапе 1. Предлагаем воспроизводить тот же симптом без правки
демо — остановкой потребителя `accounting` (`node scenarios/flag.mjs kafkaConsumerDead on` делает
`kubectl scale --replicas=0` или `docker stop`).

## Почему укладываемся в 5 минут

| Звено | Задержка |
|---|---|
| SDK → Collector (batch) | до 5 с |
| span_metrics connector, flush | 15 с (по умолчанию 60 с — уменьшено) |
| окно `rate(...[2m])` набирает сигнал | 30–60 с |
| `for:` правила | 1–2 мин |
| вычисление правил | 15 с |
| Alertmanager `group_wait` | 30 с |
| **итого** | **≈ 2,5–4 мин** |

Для утечек памяти правило ловит сам рост: память поднималась в каждом 2-минутном окне последних
4 минут (прирост > 10 МБ), контейнер работает дольше 10 минут. Падения контейнера ждать не нужно.

## Защита от ложных оповещений (≤ 2 за 72 ч)

- минимальный трафик в каждом правиле на ошибки (не реагируем на 1 ошибку из 3 запросов);
- задержка сравнивается с нормой той же операции за час, а не с одним порогом на всех;
- `for:` 1–2 минуты гасит одиночные всплески;
- подавление (inhibit): критичное скрывает предупреждение того же сервиса; если падает зависимость,
  не шлём отдельно «у вызывающего ошибки»;
- группировка по `alertname + service`: один сбой — одно сообщение, а не по сообщению на под;
- на пилоте 72 часа без сбоев — каждое сработавшее правило разбираем и правим порог, итог в отчёте.
