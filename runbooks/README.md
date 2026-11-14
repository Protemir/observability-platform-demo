# Runbooks

Короткие инструкции дежурному: что значит оповещение, где смотреть, первые шаги. Ссылка на нужный файл приходит в каждом оповещении.

| Оповещение | Важность | Сценарии из ТЗ |
|---|---|---|
| [ServiceHighErrorRate](ServiceHighErrorRate.md) | critical | adFailure, cartFailure, paymentFailure, productCatalogFailure (если товар частый) |
| [OperationErrors](OperationErrors.md) | warning | productCatalogFailure |
| [DependencyCallErrors](DependencyCallErrors.md) | critical | paymentUnreachable, paymentFailure, cartFailure |
| [ServiceHighLatency](ServiceHighLatency.md) | warning | intlShippingSlowdown, imageSlowLoad, adHighCpu, recommendationCacheFailure |
| [ServiceDown](ServiceDown.md) | critical | kafkaConsumerDead (замена: потребитель остановлен), сбой пода |
| [MemoryLeak](MemoryLeak.md) | warning | emailMemoryLeak, recommendationCacheFailure |
| [MemoryNearLimit](MemoryNearLimit.md) | critical | emailMemoryLeak, recommendationCacheFailure (на поздней стадии) |
| [HighCpu](HighCpu.md) | warning | adHighCpu |
| [ContainerRestarting](ContainerRestarting.md) | warning | emailMemoryLeak (OOM), сбой пода |
| [KafkaConsumerLagHigh](KafkaConsumerLagHigh.md) | warning | kafkaQueueProblems |
| [KafkaConsumerStalled](KafkaConsumerStalled.md) | critical | kafkaConsumerDead (замена: потребитель остановлен), kafkaQueueProblems |
| [CheckoutSloFastBurn](CheckoutSloFastBurn.md) | critical | paymentFailure, paymentUnreachable, cartFailure, productCatalogFailure |
| [CheckoutSloSlowBurn](CheckoutSloSlowBurn.md) | warning | длительные частичные сбои |
| [CheckoutLatencySloBurn](CheckoutLatencySloBurn.md) | warning | intlShippingSlowdown, сильная деградация зависимостей |
| [TelemetryPipelineDown](TelemetryPipelineDown.md) | critical | сбой самой платформы |
| [DeploymentUnavailable](DeploymentUnavailable.md) | critical | сбой пода, failedReadinessProbe |
| [NodeMemoryPressure](NodeMemoryPressure.md) | warning | emailMemoryLeak, recommendationCacheFailure на маленьком кластере |
| [Watchdog](Watchdog.md) | none | — |
