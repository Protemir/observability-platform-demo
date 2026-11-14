#!/usr/bin/env bash
# Offline checks of everything in the repository; needs only Docker.
#   promtool  rules syntax + unit tests (alerts/tests)
#   amtool    Alertmanager configs
#   otelcol   collector layer (local stand) validated by the collector itself
#   helm      all four charts render with our values, the result passes kubeconform
#   node      dashboards regenerate to the committed JSON
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd -W 2>/dev/null || pwd)"
export MSYS_NO_PATHCONV=1
OUT=.validate
rm -rf "$OUT" && mkdir -p "$OUT"
ok() { printf '  \033[32mOK\033[0m  %s\n' "$1"; }

echo "== promtool"
docker run --rm -v "$ROOT/alerts:/r:ro" --entrypoint promtool prom/prometheus:v3.13.5 \
  check rules /r/recording.common.yaml /r/recording.compose.yaml /r/recording.k8s.yaml /r/alerts.yaml >/dev/null
ok "rules: syntax"
docker run --rm -v "$ROOT/alerts:/r:ro" -w /r/tests --entrypoint promtool prom/prometheus:v3.13.5 test rules alerts_test.yaml >/dev/null
ok "rules: unit tests (alerts/tests/alerts_test.yaml)"

echo "== amtool"
docker run --rm -v "$ROOT/alertmanager:/a:ro" -v "$ROOT/local:/l:ro" --entrypoint amtool prom/alertmanager:v0.35.0 \
  check-config /a/alertmanager.yaml /l/alertmanager.local.yml >/dev/null
ok "alertmanager configs (Kubernetes + local)"

echo "== collector"
DEMO_DIR="${DEMO_DIR:-.demo/opentelemetry-demo}"
[ -d "$DEMO_DIR" ] || git clone --quiet --depth 1 --branch 3.1.0 https://github.com/open-telemetry/opentelemetry-demo.git "$DEMO_DIR"
docker run --rm --env-file "$DEMO_DIR/.env" -e POSTGRES_MONITORING_PASSWORD=x \
  -e TEMPO_OTLP_GRPC_ENDPOINT=tempo:4317 -e PROMETHEUS_OTLP_ENDPOINT=http://prometheus:9090/api/v1/otlp -e LOKI_OTLP_ENDPOINT=http://loki:3100/otlp \
  -v "$ROOT/$DEMO_DIR/src/otel-collector:/d:ro" -v "$ROOT/collector:/p:ro" -v "$ROOT/local:/l:ro" \
  ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib:0.159.0 \
  validate --config=/d/otelcol-config.yml --config=/d/otelcol-config-extras.yml --config=/p/otelcol-config-platform.yml \
  --config=/l/otelcol-config-local.yml --feature-gates=service.profilesSupport 2>&1 | grep -v "hostfs" | grep -i error && exit 1 || true
ok "collector platform layer on top of the demo config"

echo "== helm template + kubeconform"
SMTP_HOST=smtp.example.com SMTP_FROM=a@example.com SMTP_USER=a@example.com ALERT_EMAIL_TO=b@example.com GRAFANA_URL=https://grafana.example.com
{
  echo "alertmanager:"; echo "  config:"
  sed -e "s|<smtp-host>|$SMTP_HOST|; s|<alerts@your-domain>|$SMTP_FROM|; s|<smtp-user>|$SMTP_USER|; s|<oncall@your-domain>|$ALERT_EMAIL_TO|g" \
    alertmanager/alertmanager.yaml | sed 's/^/    /'
  echo "  templateFiles:"; echo "    platform.tmpl: |"; sed 's/^/      /' alertmanager/templates/platform.tmpl
} > "$OUT/alertmanager-values.yaml"
render() { # release repo/chart version namespace values...
  local rel=$1 chart=$2 ver=$3 ns=$4; shift 4
  docker run --rm -v "$ROOT:/w:ro" -w /w --entrypoint sh alpine/helm:3.22.1 -c "
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts >/dev/null &&
    helm repo add grafana-community https://grafana-community.github.io/helm-charts >/dev/null &&
    helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts >/dev/null &&
    helm template $rel $chart --version $ver -n $ns $*" > "$OUT/$rel.yaml"
  ok "helm template $chart $ver"
}
render kps prometheus-community/kube-prometheus-stack 93.3.0 observability -f deploy/helm/values/kube-prometheus-stack.yaml -f $OUT/alertmanager-values.yaml
render loki grafana-community/loki 21.2.3 observability -f deploy/helm/values/loki.yaml
render tempo grafana-community/tempo 3.2.1 observability -f deploy/helm/values/tempo.yaml
render otel-demo open-telemetry/opentelemetry-demo 0.42.6 otel-demo -f deploy/helm/values/otel-demo.yaml
for f in recording.common recording.k8s alerts; do
  printf -- '---\napiVersion: monitoring.coreos.com/v1\nkind: PrometheusRule\nmetadata:\n  name: platform-%s\n  namespace: observability\nspec:\n' "${f/./-}"
  sed 's/^/  /' "alerts/$f.yaml"
done > "$OUT/prometheus-rules.yaml"
docker run --rm -v "$ROOT/$OUT:/m:ro" ghcr.io/yannh/kubeconform:v0.7.0 -strict -summary -kubernetes-version 1.33.0 \
  -schema-location default \
  -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' \
  /m/kps.yaml /m/loki.yaml /m/tempo.yaml /m/otel-demo.yaml /m/prometheus-rules.yaml
ok "kubeconform: manifests and PrometheusRules match Kubernetes/CRD schemas"

echo "== dashboards"
cp dashboards/*.json "$OUT/" && node dashboards/src/build.mjs >/dev/null
for d in dashboards/*.json; do cmp -s "$d" "$OUT/$(basename "$d")" || { echo "dashboard $d differs from generator"; exit 1; }; done
ok "dashboards JSON = generator output"
echo "all checks passed"
