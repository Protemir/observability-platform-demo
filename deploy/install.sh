#!/usr/bin/env bash
# One-command install of the stand + platform on Kubernetes (kind, k3s or managed).
#   cp deploy/config.example.env deploy/config.env   # fill in SMTP / Telegram / URLs
#   export SMTP_PASSWORD=... TELEGRAM_BOT_TOKEN=...   # secrets: environment only
#   ./deploy/install.sh
# Optional: KIND=1 creates a local kind cluster first (deploy/kind.yaml).
# Re-running is safe: every step is "upgrade --install" / "apply".
set -euo pipefail
cd "$(dirname "$0")/.."

for bin in kubectl helm; do command -v "$bin" >/dev/null || { echo "need $bin"; exit 1; }; done
[ -f deploy/config.env ] || { echo "copy deploy/config.example.env to deploy/config.env and fill it in"; exit 1; }
# shellcheck disable=SC1091
source deploy/config.env
: "${SMTP_PASSWORD:?export SMTP_PASSWORD}" "${TELEGRAM_BOT_TOKEN:?export TELEGRAM_BOT_TOKEN}"

OBS=observability
DEMO=otel-demo
GEN=deploy/.generated
mkdir -p "$GEN"

if [ "${KIND:-0}" = "1" ] && ! kind get clusters 2>/dev/null | grep -qx otel-stand; then
  kind create cluster --name otel-stand --config deploy/kind.yaml
fi

echo "== namespaces and secrets"
kubectl create namespace "$OBS" --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace "$DEMO" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "$OBS" create secret generic alert-secrets \
  --from-literal=smtp-password="$SMTP_PASSWORD" \
  --from-literal=telegram-bot-token="$TELEGRAM_BOT_TOKEN" \
  --from-literal=telegram-chat-id="$TELEGRAM_CHAT_ID" \
  --dry-run=client -o yaml | kubectl apply -f -
if ! kubectl -n "$OBS" get secret grafana-admin >/dev/null 2>&1; then
  kubectl -n "$OBS" create secret generic grafana-admin \
    --from-literal=admin-user=admin \
    --from-literal=admin-password="$(head -c 18 /dev/urandom | base64 | tr -d '/+=')"
fi

echo "== alertmanager values from alertmanager/ (placeholders filled from config.env)"
{
  echo "alertmanager:"
  echo "  config:"
  sed -e "s|<smtp-host>|$SMTP_HOST|; s|<alerts@your-domain>|$SMTP_FROM|; s|<smtp-user>|$SMTP_USER|" \
      -e "s|<oncall@your-domain>|$ALERT_EMAIL_TO|g" \
      alertmanager/alertmanager.yaml | sed 's/^/    /'
  echo "  templateFiles:"
  echo "    platform.tmpl: |"
  sed 's/^/      /' alertmanager/templates/platform.tmpl
  echo "    grafana-url.tmpl: |"
  echo "      {{ define \"platform.grafana_url\" }}$GRAFANA_URL{{ end }}"
} > "$GEN/alertmanager-values.yaml"

echo "== helm repositories"
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts >/dev/null
helm repo add grafana-community https://grafana-community.github.io/helm-charts >/dev/null
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts >/dev/null
helm repo update >/dev/null

echo "== platform: Prometheus + Alertmanager + Grafana, Loki, Tempo"
helm upgrade --install kps prometheus-community/kube-prometheus-stack --version 93.3.0 -n "$OBS" \
  -f deploy/helm/values/kube-prometheus-stack.yaml -f "$GEN/alertmanager-values.yaml" --wait --timeout 10m
helm upgrade --install loki grafana-community/loki --version 21.2.3 -n "$OBS" \
  -f deploy/helm/values/loki.yaml --wait --timeout 10m
helm upgrade --install tempo grafana-community/tempo --version 3.2.1 -n "$OBS" \
  -f deploy/helm/values/tempo.yaml --wait --timeout 10m

echo "== rules and dashboards"
{
  for f in recording.common recording.k8s alerts; do
    cat <<EOF
---
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: platform-${f/./-}
  namespace: $OBS
spec:
EOF
    sed 's/^/  /' "alerts/$f.yaml"
  done
} > "$GEN/prometheus-rules.yaml"
kubectl apply -f "$GEN/prometheus-rules.yaml"
for d in dashboards/*.json; do
  name="platform-$(basename "$d" .json)"
  kubectl -n "$OBS" create configmap "$name" --from-file="$d" --dry-run=client -o yaml \
    | kubectl label --local -f - grafana_dashboard=1 -o yaml \
    | kubectl annotate --local -f - grafana_folder="Observability platform" -o yaml \
    | kubectl apply -f -
done

echo "== demo application"
helm upgrade --install otel-demo open-telemetry/opentelemetry-demo --version 0.42.6 -n "$DEMO" \
  -f deploy/helm/values/otel-demo.yaml --wait --timeout 15m

cat <<EOF

Done. Access (or put an Ingress with TLS in front of Grafana):
  kubectl -n $OBS port-forward svc/grafana 3000:80
  kubectl -n $DEMO port-forward svc/frontend-proxy 8080:8080
Grafana admin password:
  kubectl -n $OBS get secret grafana-admin -o jsonpath='{.data.admin-password}' | base64 -d
Failure scenarios: K8S=1 node scenarios/flag.mjs paymentFailure on
EOF
