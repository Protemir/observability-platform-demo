# Прогон сценариев на локальном стенде

Время — от включения флага до первого сообщения в Telegram (заглушка tg-mock) о нужном сервисе.

| Сценарий | Время до оповещения | Первое сообщение |
|---|---|---|
| paymentFailure | 3 мин 19 с | 🔴 OperationErrors · payment · warning |
| paymentUnreachable | 3 мин 43 с | 🔴 DependencyCallErrors · checkout · critical |
| adFailure | не пришло за 8 мин | — |
| cartFailure | не пришло за 8 мин | — |
