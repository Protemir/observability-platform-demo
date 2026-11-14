# Прогон сценариев на локальном стенде

Время — от включения флага до первого сообщения в Telegram (заглушка tg-mock) о нужном сервисе.

| Сценарий | Время до оповещения | Первое сообщение |
|---|---|---|
| paymentFailure | 3 мин 19 с | 🔴 OperationErrors · payment · warning |
| paymentUnreachable | 3 мин 43 с | 🔴 DependencyCallErrors · checkout · critical |
| adFailure | не пришло за 8 мин | — |
| cartFailure | не пришло за 8 мин | — |
| productCatalogFailure | 2 мин 52 с | 🔴 ServiceHighErrorRate · product-catalog · critical |
| intlShippingSlowdown | 5 мин 41 с | 🔴 ServiceHighLatency · shipping · warning |
| adHighCpu | 3 мин 12 с | 🔴 HighCpu · ad · warning |
| emailMemoryLeak | 2 мин 26 с | 🔴 ContainerRestarting · email · warning |
| recommendationCacheFailure | не пришло за 8 мин | — |
| paymentFailure | 1 мин 54 с | 🔴 ServiceHighErrorRate · payment · critical |
| adFailure | 2 мин 43 с | 🔴 ServiceHighErrorRate · ad · critical |
| cartFailure | 6 мин 57 с | 🔴 OperationErrors · cart · warning |
