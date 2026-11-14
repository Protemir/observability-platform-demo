// Generates the Grafana dashboards in ../*.json. Run: node dashboards/src/build.mjs
// Dashboards are code: edit this file, regenerate, commit both.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROM = { type: 'prometheus', uid: 'prometheus' };
const TEMPO = { type: 'tempo', uid: 'tempo' };
const LOKI = { type: 'loki', uid: 'loki' };

const SERVER = 'span_kind=~"SPAN_KIND_SERVER|SPAN_KIND_CONSUMER", span_name!~".*EventStream|GET /metrics|GET /health.*"';
const ERR = 'status_code="STATUS_CODE_ERROR"';
const CALLS = 'traces_span_metrics_calls_total';
const DUR = 'traces_span_metrics_duration_milliseconds_bucket';

const refs = (targets) => targets.map((t, i) => ({ ...t, refId: String.fromCharCode(65 + i) }));

// Link from any metrics panel to traces of the same service and time range (ТЗ 4.3).
const exploreTraces = (traceql, title = 'Трассы за этот период') => {
  const panes = { a: { datasource: 'tempo', queries: [{ refId: 'A', datasource: TEMPO, queryType: 'traceql', limit: 50, tableType: 'traces', query: traceql }], range: { from: '__FROM__', to: '__TO__' } } };
  const enc = encodeURIComponent(JSON.stringify(panes))
    .replace('__FROM__', '${__from}').replace('__TO__', '${__to}')
    .replace(/%24service/g, '${service}');
  return { title, url: `/explore?schemaVersion=1&panes=${enc}`, targetBlank: false };
};
const exploreLogs = (logql, title = 'Журналы за этот период') => {
  const panes = { a: { datasource: 'loki', queries: [{ refId: 'A', datasource: LOKI, expr: logql }], range: { from: '__FROM__', to: '__TO__' } } };
  const enc = encodeURIComponent(JSON.stringify(panes))
    .replace('__FROM__', '${__from}').replace('__TO__', '${__to}')
    .replace(/%24service/g, '${service}');
  return { title, url: `/explore?schemaVersion=1&panes=${enc}`, targetBlank: false };
};

const thresholds = (steps) => ({ mode: 'absolute', steps: steps.map(([value, color]) => ({ value, color })) });

function ts(title, targets, { x = 0, y = 0, w = 12, h = 8, unit = 'short', stack = false, links = [], desc = '', min, max, th, ds = PROM } = {}) {
  return {
    type: 'timeseries', title, description: desc, datasource: ds, gridPos: { x, y, w, h },
    targets: refs(targets),
    links,
    fieldConfig: {
      defaults: {
        unit, min, max,
        custom: { drawStyle: 'line', lineWidth: 1, fillOpacity: stack ? 30 : 8, showPoints: 'never', spanNulls: true, stacking: { mode: stack ? 'normal' : 'none' }, ...(th ? { thresholdsStyle: { mode: 'dashed' } } : {}) },
        ...(th ? { thresholds: thresholds(th) } : {}),
      },
      overrides: [],
    },
    options: { legend: { displayMode: 'table', placement: 'right', calcs: ['lastNotNull', 'max'], showLegend: true }, tooltip: { mode: 'multi', sort: 'desc' } },
  };
}

function stat(title, expr, { x = 0, y = 0, w = 4, h = 4, unit = 'short', th = [[null, 'green']], decimals, links = [], desc = '' } = {}) {
  return {
    type: 'stat', title, description: desc, datasource: PROM, gridPos: { x, y, w, h }, links,
    targets: refs([{ expr, instant: false, range: true }]),
    fieldConfig: { defaults: { unit, decimals, thresholds: thresholds(th), color: { mode: 'thresholds' } }, overrides: [] },
    options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'background', graphMode: 'area', textMode: 'value', justifyMode: 'center' },
  };
}

function row(title, y, collapsed = false) {
  return { type: 'row', title, collapsed, gridPos: { x: 0, y, w: 24, h: 1 }, panels: [] };
}

function dashboard({ uid, title, description, tags, panels, templating = [], refresh = '30s', from = 'now-1h', links = [] }) {
  let id = 1;
  return {
    uid, title, description, tags: ['platform', ...tags], timezone: 'browser', editable: false,
    schemaVersion: 39, version: 1, refresh, graphTooltip: 1,
    time: { from, to: 'now' },
    templating: { list: templating },
    annotations: { list: [{ builtIn: 1, datasource: { type: 'grafana', uid: '-- Grafana --' }, enable: true, hide: true, iconColor: 'rgba(0, 211, 255, 1)', name: 'Annotations & Alerts', type: 'dashboard' }] },
    links: [
      { title: 'Обзор', type: 'link', url: '/d/platform-overview/overview', icon: 'apps' },
      { title: 'Сервис', type: 'link', url: '/d/platform-service/service', icon: 'dashboard', keepTime: true },
      { title: 'Очереди', type: 'link', url: '/d/platform-queues/queues', icon: 'dashboard', keepTime: true },
      { title: 'Инфраструктура', type: 'link', url: '/d/platform-infra/infrastructure', icon: 'dashboard', keepTime: true },
      { title: 'SLO checkout', type: 'link', url: '/d/platform-slo/slo-checkout', icon: 'dashboard', keepTime: true },
      ...links,
    ],
    panels: panels.map((p) => ({ id: id++, ...p })),
  };
}

const serviceVar = {
  name: 'service', label: 'Сервис', type: 'query', datasource: PROM,
  query: { query: `label_values(${CALLS}, service_name)`, refId: 'svc' },
  definition: `label_values(${CALLS}, service_name)`,
  refresh: 2, sort: 1, current: { text: 'checkout', value: 'checkout' }, includeAll: false, multi: false,
};

// ---------------------------------------------------------------- Overview
const svcLink = [{ title: 'Открыть сервис ${__data.fields.service_name}', url: '/d/platform-service/service?var-service=${__data.fields.service_name}&${__url_time_range}' }];
const overview = dashboard({
  uid: 'platform-overview', title: 'Обзор системы', tags: ['overview'],
  description: 'Карта сервисов, общее состояние и активные оповещения. Отсюда начинается поиск причины.',
  panels: [
    stat('Сервисов шлют трассы', `count(service:requests:rate2m)`, { x: 0, y: 0 }),
    stat('Запросов в секунду', `sum(service:requests:rate2m)`, { x: 4, y: 0, unit: 'reqps', decimals: 1 }),
    stat('Ошибок, всего', `sum(service:errors:rate2m) / sum(service:requests:rate2m)`, { x: 8, y: 0, unit: 'percentunit', decimals: 2, th: [[null, 'green'], [0.01, 'orange'], [0.05, 'red']] }),
    stat('Заказы: доступность, 1 ч', `1 - slo:checkout_errors:ratio_rate1h`, { x: 12, y: 0, unit: 'percentunit', decimals: 2, th: [[null, 'red'], [0.99, 'green']], links: [{ title: 'SLO checkout', url: '/d/platform-slo/slo-checkout?${__url_time_range}' }] }),
    stat('Активных оповещений', `count(ALERTS{alertstate="firing", alertname!="Watchdog"}) or vector(0)`, { x: 16, y: 0, th: [[null, 'green'], [1, 'red']] }),
    stat('Бюджет ошибок, 7 дней', `clamp_min(slo:checkout_error_budget:remaining_7d, 0)`, { x: 20, y: 0, unit: 'percentunit', decimals: 1, th: [[null, 'red'], [0.25, 'orange'], [0.5, 'green']] }),
    {
      type: 'nodeGraph', title: 'Карта сервисов (по трассам)', datasource: TEMPO, gridPos: { x: 0, y: 4, w: 14, h: 16 },
      description: 'Узлы — сервисы, рёбра — вызовы. Красная доля круга — ошибки. Клик по узлу: трассы, метрики.',
      targets: [{ refId: 'A', datasource: TEMPO, queryType: 'serviceMap', serviceMapIncludeNamespace: false }],
      options: { nodes: {}, edges: {} },
    },
    {
      type: 'table', title: 'Активные оповещения', datasource: PROM, gridPos: { x: 14, y: 4, w: 10, h: 7 },
      targets: refs([{ expr: 'ALERTS{alertstate="firing", alertname!="Watchdog"}', instant: true, format: 'table' }]),
      transformations: [
        { id: 'filterFieldsByName', options: { include: { names: ['severity', 'alertname', 'service', 'span_name'] } } },
        { id: 'organize', options: { indexByName: { severity: 0, alertname: 1, service: 2, span_name: 3 }, renameByName: { severity: 'Важность', alertname: 'Оповещение', service: 'Сервис', span_name: 'Операция' } } },
      ],
      fieldConfig: { defaults: { custom: { cellOptions: { type: 'auto' } } }, overrides: [{ matcher: { id: 'byName', options: 'Важность' }, properties: [{ id: 'custom.cellOptions', value: { type: 'color-background' } }, { id: 'mappings', value: [{ type: 'value', options: { critical: { color: 'red', index: 0 }, warning: { color: 'orange', index: 1 } } }] }] }] },
      options: { showHeader: true, cellHeight: 'sm' },
    },
    {
      type: 'table', title: 'Сервисы: запросы, ошибки, p95', datasource: PROM, gridPos: { x: 14, y: 11, w: 10, h: 9 },
      description: 'Сортировка по доле ошибок. Клик по сервису открывает его панель.',
      targets: refs([
        { expr: 'service:requests:rate2m', instant: true, format: 'table' },
        { expr: 'service:error_ratio:rate2m', instant: true, format: 'table' },
        { expr: 'service:latency_ms:p95_2m', instant: true, format: 'table' },
      ]),
      transformations: [
        { id: 'joinByField', options: { byField: 'service_name', mode: 'outer' } },
        { id: 'organize', options: { excludeByName: { Time: true, 'Time 1': true, 'Time 2': true, 'Time 3': true, __name__: true, '__name__ 1': true, '__name__ 2': true, '__name__ 3': true }, renameByName: { service_name: 'service_name', 'Value #A': 'RPS', 'Value #B': 'Ошибки', 'Value #C': 'p95, мс' } } },
        { id: 'sortBy', options: { sort: [{ field: 'Ошибки', desc: true }] } },
      ],
      fieldConfig: {
        defaults: { links: svcLink },
        overrides: [
          { matcher: { id: 'byName', options: 'RPS' }, properties: [{ id: 'unit', value: 'reqps' }, { id: 'decimals', value: 2 }] },
          { matcher: { id: 'byName', options: 'Ошибки' }, properties: [{ id: 'unit', value: 'percentunit' }, { id: 'decimals', value: 1 }, { id: 'custom.cellOptions', value: { type: 'color-background', mode: 'basic' } }, { id: 'thresholds', value: thresholds([[null, 'green'], [0.01, 'orange'], [0.05, 'red']]) }] },
          { matcher: { id: 'byName', options: 'p95, мс' }, properties: [{ id: 'decimals', value: 0 }, { id: 'custom.cellOptions', value: { type: 'color-text' } }, { id: 'thresholds', value: thresholds([[null, 'green'], [500, 'orange'], [2000, 'red']]) }] },
        ],
      },
      options: { showHeader: true, cellHeight: 'sm' },
    },
    ts('Доля ошибок по сервисам', [{ expr: 'service:error_ratio:rate2m > 0', legendFormat: '{{service_name}}' }], { x: 0, y: 20, unit: 'percentunit', th: [[null, 'green'], [0.05, 'red']], links: [exploreTraces('{ status = error }', 'Трассы с ошибками за этот период')] }),
    ts('p95 задержки по сервисам', [{ expr: 'service:latency_ms:p95_2m', legendFormat: '{{service_name}}' }], { x: 12, y: 20, unit: 'ms', links: [exploreTraces('{ duration > 1s }', 'Медленные трассы за этот период')] }),
  ],
});

// ---------------------------------------------------------------- Service
const S = 'service_name="$service"';
const service = dashboard({
  uid: 'platform-service', title: 'Сервис', tags: ['service'], templating: [serviceVar],
  description: 'RED-метрики, вызовы зависимостей, ресурсы, трассы и журналы одного сервиса. Точки-экземпляры на графике задержки открывают трассу.',
  panels: [
    stat('Запросов в секунду', `service:requests:rate2m{${S}}`, { x: 0, y: 0, unit: 'reqps', decimals: 2 }),
    stat('Ошибки', `service:error_ratio:rate2m{${S}}`, { x: 4, y: 0, unit: 'percentunit', decimals: 2, th: [[null, 'green'], [0.01, 'orange'], [0.05, 'red']] }),
    stat('p50', `histogram_quantile(0.5, sum by (le) (rate(${DUR}{${S}, ${SERVER}}[2m])))`, { x: 8, y: 0, unit: 'ms', decimals: 0 }),
    stat('p95', `histogram_quantile(0.95, sum by (le) (rate(${DUR}{${S}, ${SERVER}}[2m])))`, { x: 12, y: 0, unit: 'ms', decimals: 0, th: [[null, 'green'], [500, 'orange'], [2000, 'red']] }),
    stat('p99', `histogram_quantile(0.99, sum by (le) (rate(${DUR}{${S}, ${SERVER}}[2m])))`, { x: 16, y: 0, unit: 'ms', decimals: 0, th: [[null, 'green'], [1000, 'orange'], [5000, 'red']] }),
    stat('Память / лимит', `service:container_memory_bytes{service="$service"} / service:container_memory_limit_bytes{service="$service"}`, { x: 20, y: 0, unit: 'percentunit', decimals: 0, th: [[null, 'green'], [0.7, 'orange'], [0.9, 'red']] }),
    ts('Запросы по операциям', [{ expr: `sum by (span_name) (rate(${CALLS}{${S}, ${SERVER}}[1m]))`, legendFormat: '{{span_name}}' }], { x: 0, y: 4, unit: 'reqps', links: [exploreTraces('{ resource.service.name = "$service" }')] }),
    ts('Ошибки по операциям', [{ expr: `sum by (span_name) (rate(${CALLS}{${S}, ${SERVER}, ${ERR}}[1m]))`, legendFormat: '{{span_name}}' }], { x: 12, y: 4, unit: 'reqps', links: [exploreTraces('{ resource.service.name = "$service" && status = error }', 'Трассы с ошибками за этот период'), exploreLogs('{service_name="$service"} | severity_text=~"(?i)error|fatal"', 'Журналы ошибок за этот период')] }),
    ts('Задержка p50 / p95 / p99 (точки — трассы)', [
      { expr: `histogram_quantile(0.5, sum by (le) (rate(${DUR}{${S}, ${SERVER}}[1m])))`, legendFormat: 'p50', exemplar: true },
      { expr: `histogram_quantile(0.95, sum by (le) (rate(${DUR}{${S}, ${SERVER}}[1m])))`, legendFormat: 'p95', exemplar: true },
      { expr: `histogram_quantile(0.99, sum by (le) (rate(${DUR}{${S}, ${SERVER}}[1m])))`, legendFormat: 'p99', exemplar: true },
    ], { x: 0, y: 12, w: 24, h: 9, unit: 'ms', desc: 'Каждая точка — пример реального запроса (exemplar). Клик по ней открывает трассу в Tempo, оттуда — журналы этого запроса.', links: [exploreTraces('{ resource.service.name = "$service" && duration > 500ms }', 'Медленные трассы за этот период')] }),
    ts('Исходящие вызовы: доля ошибок', [{ expr: `dependency:error_ratio:rate2m{${S}}`, legendFormat: '{{span_name}}' }], { x: 0, y: 21, unit: 'percentunit', th: [[null, 'green'], [0.2, 'red']], desc: 'Если падает зависимость, это видно здесь, даже когда она сама ничего не шлёт.' }),
    ts('Исходящие вызовы: p95', [{ expr: `histogram_quantile(0.95, sum by (span_name, le) (rate(${DUR}{${S}, span_kind="SPAN_KIND_CLIENT"}[2m])))`, legendFormat: '{{span_name}}' }], { x: 12, y: 21, unit: 'ms' }),
    ts('Память контейнера', [
      { expr: `service:container_memory_bytes{service="$service"}`, legendFormat: 'используется' },
      { expr: `service:container_memory_limit_bytes{service="$service"}`, legendFormat: 'лимит' },
    ], { x: 0, y: 29, unit: 'bytes' }),
    ts('CPU контейнера, ядер', [{ expr: `service:container_cpu_cores:rate2m{service="$service"}`, legendFormat: 'cpu' }], { x: 12, y: 29, unit: 'short' }),
    {
      type: 'table', title: 'Последние трассы с ошибкой', datasource: TEMPO, gridPos: { x: 0, y: 37, w: 12, h: 10 },
      description: 'Клик по Trace ID открывает трассу; в трассе у каждого спана есть кнопка «Logs for this span».',
      targets: [{ refId: 'A', datasource: TEMPO, queryType: 'traceql', tableType: 'traces', limit: 20, query: '{ resource.service.name = "$service" && status = error }' }],
      options: { showHeader: true, cellHeight: 'sm' },
    },
    {
      type: 'logs', title: 'Журналы сервиса (trace_id — ссылка на трассу)', datasource: LOKI, gridPos: { x: 12, y: 37, w: 12, h: 10 },
      targets: [{ refId: 'A', datasource: LOKI, expr: '{service_name="$service"}', queryType: 'range' }],
      options: { showTime: true, wrapLogMessage: true, sortOrder: 'Descending', enableLogDetails: true, dedupStrategy: 'none', prettifyLogMessage: false },
    },
  ],
});

// ---------------------------------------------------------------- Queues
const queues = dashboard({
  uid: 'platform-queues', title: 'Очереди', tags: ['kafka'],
  description: 'Kafka: запись, чтение, отставание потребителей. Метрики — receiver kafkametrics коллектора и спаны потребителей.',
  panels: [
    stat('Макс. отставание, сообщений', 'max(kafka_consumer_group_lag_sum) or vector(0)', { x: 0, y: 0, w: 6, th: [[null, 'green'], [100, 'orange'], [500, 'red']] }),
    stat('Запись, сообщ./с', 'sum(rate(kafka_partition_current_offset[2m])) or vector(0)', { x: 6, y: 0, w: 6, decimals: 1 }),
    stat('Чтение, сообщ./с', 'sum(rate(kafka_consumer_group_offset_sum[2m])) or vector(0)', { x: 12, y: 0, w: 6, decimals: 1 }),
    stat('Потребители: ошибки', `sum(rate(${CALLS}{span_kind="SPAN_KIND_CONSUMER", ${ERR}}[2m])) / sum(rate(${CALLS}{span_kind="SPAN_KIND_CONSUMER"}[2m]))`, { x: 18, y: 0, w: 6, unit: 'percentunit', th: [[null, 'green'], [0.05, 'red']] }),
    ts('Отставание потребителей', [{ expr: 'sum by (group, topic) (kafka_consumer_group_lag_sum)', legendFormat: '{{group}} / {{topic}}' }], { x: 0, y: 4, w: 24, h: 9, th: [[null, 'green'], [500, 'red']] }),
    ts('Запись в топики, сообщ./с', [{ expr: 'sum by (topic) (rate(kafka_partition_current_offset[2m]))', legendFormat: '{{topic}}' }], { x: 0, y: 13 }),
    ts('Чтение группами, сообщ./с', [{ expr: 'sum by (group, topic) (rate(kafka_consumer_group_offset_sum[2m]))', legendFormat: '{{group}} / {{topic}}' }], { x: 12, y: 13 }),
    ts('Обработка сообщений (спаны потребителей)', [{ expr: `sum by (service_name) (rate(${CALLS}{span_kind="SPAN_KIND_CONSUMER"}[1m]))`, legendFormat: '{{service_name}}' }], { x: 0, y: 21, unit: 'ops', links: [exploreTraces('{ kind = consumer }', 'Трассы потребителей')] }),
    ts('Время обработки сообщения, p95', [{ expr: `histogram_quantile(0.95, sum by (service_name, le) (rate(${DUR}{span_kind="SPAN_KIND_CONSUMER"}[2m])))`, legendFormat: '{{service_name}}' }], { x: 12, y: 21, unit: 'ms' }),
  ],
});

// ---------------------------------------------------------------- Infrastructure
const infra = dashboard({
  uid: 'platform-infra', title: 'Инфраструктура', tags: ['infra'],
  description: 'Узлы, поды и контейнеры, базы и кэши стенда. Ряды series k8s пусты на локальном Docker-стенде.',
  panels: [
    stat('Контейнеров', 'count(service:container_memory_bytes)', { x: 0, y: 0 }),
    stat('Перезапусков за 10 мин', 'sum(service:container_restarts:increase10m) or vector(0)', { x: 4, y: 0, th: [[null, 'green'], [1, 'red']] }),
    stat('Подов не Running', 'sum(kube_pod_status_phase{namespace="otel-demo", phase!~"Running|Succeeded"}) or vector(0)', { x: 8, y: 0, th: [[null, 'green'], [1, 'red']] }),
    stat('CPU узлов', 'avg(1 - rate(node_cpu_seconds_total{mode="idle"}[2m])) or (1 - avg(system_cpu_utilization_ratio{state="idle"}))', { x: 12, y: 0, unit: 'percentunit', th: [[null, 'green'], [0.7, 'orange'], [0.9, 'red']] }),
    stat('Память узлов', '(1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)) or sum(system_memory_utilization_ratio{state="used"})', { x: 16, y: 0, unit: 'percentunit', th: [[null, 'green'], [0.8, 'orange'], [0.9, 'red']] }),
    stat('Valkey (кэш корзины): память', 'max(redis_memory_used_bytes)', { x: 20, y: 0, unit: 'bytes' }),
    {
      type: 'bargauge', title: 'Память контейнеров от лимита', datasource: PROM, gridPos: { x: 0, y: 4, w: 12, h: 10 },
      targets: refs([{ expr: 'sort_desc(service:container_memory_bytes / service:container_memory_limit_bytes)', legendFormat: '{{service}}', instant: true }]),
      fieldConfig: { defaults: { unit: 'percentunit', min: 0, max: 1, thresholds: thresholds([[null, 'green'], [0.7, 'orange'], [0.9, 'red']]), color: { mode: 'thresholds' } }, overrides: [] },
      options: { orientation: 'horizontal', displayMode: 'gradient', showUnfilled: true, valueMode: 'color', namePlacement: 'left', sizing: 'manual', minVizHeight: 12, maxVizHeight: 16 },
    },
    {
      type: 'bargauge', title: 'CPU контейнеров, ядер', datasource: PROM, gridPos: { x: 12, y: 4, w: 12, h: 10 },
      targets: refs([{ expr: 'sort_desc(service:container_cpu_cores:rate2m)', legendFormat: '{{service}}', instant: true }]),
      fieldConfig: { defaults: { unit: 'short', min: 0, decimals: 2, thresholds: thresholds([[null, 'green'], [0.5, 'orange'], [1, 'red']]), color: { mode: 'thresholds' } }, overrides: [] },
      options: { orientation: 'horizontal', displayMode: 'gradient', showUnfilled: true, valueMode: 'color', namePlacement: 'left', sizing: 'manual', minVizHeight: 12, maxVizHeight: 16 },
    },
    ts('Память контейнеров', [{ expr: 'service:container_memory_bytes', legendFormat: '{{service}}' }], { x: 0, y: 14, unit: 'bytes' }),
    ts('CPU контейнеров', [{ expr: 'service:container_cpu_cores:rate2m', legendFormat: '{{service}}' }], { x: 12, y: 14 }),
    ts('Перезапуски', [{ expr: 'service:container_restarts:increase10m > 0', legendFormat: '{{service}}' }], { x: 0, y: 22 }),
    ts('Поды по фазам (k8s)', [{ expr: 'sum by (phase) (kube_pod_status_phase{namespace="otel-demo"})', legendFormat: '{{phase}}' }], { x: 12, y: 22, stack: true }),
    ts('Valkey: команд/с и клиенты', [
      { expr: 'sum(rate(redis_commands_processed_total[2m]))', legendFormat: 'команд/с' },
      { expr: 'sum(redis_clients_connected)', legendFormat: 'клиентов' },
    ], { x: 0, y: 30 }),
    ts('PostgreSQL: соединения и транзакции', [
      { expr: 'sum(postgresql_backends)', legendFormat: 'соединения' },
      { expr: 'sum(rate(postgresql_commits_total[2m]))', legendFormat: 'commit/с' },
      { expr: 'sum(rate(postgresql_rollbacks_total[2m]))', legendFormat: 'rollback/с' },
    ], { x: 12, y: 30 }),
  ],
});

// ---------------------------------------------------------------- SLO checkout
const slo = dashboard({
  uid: 'platform-slo', title: 'SLO: оформление заказа', tags: ['slo'], from: 'now-6h',
  description: 'SLI — спаны PlaceOrder сервиса checkout. Доступность 99 %, задержка: 95 % заказов быстрее 2 с. Оповещения — по скорости расхода бюджета (multi-window, multi-burn-rate).',
  panels: [
    stat('Доступность, 1 ч', '1 - slo:checkout_errors:ratio_rate1h', { x: 0, y: 0, unit: 'percentunit', decimals: 2, th: [[null, 'red'], [0.99, 'green']] }),
    stat('Доступность, 7 дней', '1 - (1 - slo:checkout_error_budget:remaining_7d) * 0.01', { x: 4, y: 0, unit: 'percentunit', decimals: 3, th: [[null, 'red'], [0.99, 'green']] }),
    stat('Бюджет ошибок остался, 7 дней', 'clamp_min(slo:checkout_error_budget:remaining_7d, 0)', { x: 8, y: 0, unit: 'percentunit', decimals: 1, th: [[null, 'red'], [0.25, 'orange'], [0.5, 'green']] }),
    stat('Скорость расхода, 1 ч', 'slo:checkout_errors:ratio_rate1h / 0.01', { x: 12, y: 0, unit: 'x', decimals: 1, th: [[null, 'green'], [1, 'orange'], [6, 'red']], desc: '1x — бюджет уйдёт ровно за период SLO; 14.4x — за 2 дня.' }),
    stat('Заказов быстрее 2 с, 1 ч', '1 - slo:checkout_slow:ratio_rate1h', { x: 16, y: 0, unit: 'percentunit', decimals: 1, th: [[null, 'red'], [0.95, 'green']] }),
    stat('Заказов в минуту', `sum(rate(${CALLS}{service_name="checkout", span_name=~".*PlaceOrder", span_kind="SPAN_KIND_SERVER"}[5m])) * 60`, { x: 20, y: 0, decimals: 1 }),
    ts('Скорость расхода бюджета', [
      { expr: 'slo:checkout_errors:ratio_rate5m / 0.01', legendFormat: '5 мин' },
      { expr: 'slo:checkout_errors:ratio_rate1h / 0.01', legendFormat: '1 ч' },
      { expr: 'slo:checkout_errors:ratio_rate6h / 0.01', legendFormat: '6 ч' },
    ], { x: 0, y: 4, w: 24, h: 9, unit: 'x', th: [[null, 'green'], [6, 'orange'], [14.4, 'red']], desc: 'Пунктир: 6x — медленное сгорание (warning), 14.4x — быстрое (critical).', links: [exploreTraces('{ resource.service.name = "checkout" && name =~ ".*PlaceOrder" && status = error }', 'Неудачные заказы за этот период')] }),
    ts('Доля неудачных заказов', [{ expr: 'slo:checkout_errors:ratio_rate5m', legendFormat: 'ошибки, 5 мин' }], { x: 0, y: 13, unit: 'percentunit', th: [[null, 'green'], [0.01, 'red']] }),
    ts('Доля заказов дольше 2 с', [{ expr: 'slo:checkout_slow:ratio_rate5m', legendFormat: 'медленные, 5 мин' }], { x: 12, y: 13, unit: 'percentunit', th: [[null, 'green'], [0.05, 'red']] }),
    ts('Остаток бюджета ошибок (7 дней)', [{ expr: 'clamp_min(slo:checkout_error_budget:remaining_7d, 0)', legendFormat: 'остаток' }], { x: 0, y: 21, w: 24, unit: 'percentunit', min: 0, max: 1 }),
  ],
});

for (const [file, d] of [['overview.json', overview], ['service.json', service], ['queues.json', queues], ['infrastructure.json', infra], ['slo-checkout.json', slo]]) {
  writeFileSync(join(OUT, file), JSON.stringify(d, null, 2) + '\n');
  console.log(`${file}: ${d.panels.length} panels`);
}
