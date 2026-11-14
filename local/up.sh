#!/usr/bin/env bash
# Trimmed local stand: OpenTelemetry Demo (core services) + the observability platform.
#   ./local/up.sh            start   (FULL=1 adds Kafka, accounting, fraud-detection)
#   ./local/up.sh down       stop and remove containers (volumes kept)
# Needs Docker with ~6 GB of free memory (~8 GB with FULL=1).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && (pwd -W 2>/dev/null || pwd))"
DEMO_REF="${DEMO_REF:-3.1.0}"
DEMO_DIR="${DEMO_DIR:-$ROOT/.demo/opentelemetry-demo}"

if [ ! -d "$DEMO_DIR" ]; then
  git clone --quiet --depth 1 --branch "$DEMO_REF" https://github.com/open-telemetry/opentelemetry-demo.git "$DEMO_DIR"
fi

# Local secrets (never committed, see .gitignore)
mkdir -p "$ROOT/local/secrets"
[ -s "$ROOT/local/secrets/grafana-admin" ] || head -c 18 /dev/urandom | base64 | tr -d '/+=' > "$ROOT/local/secrets/grafana-admin"
[ -s "$ROOT/local/secrets/telegram-bot-token" ] || echo "000000:local-mock-token" > "$ROOT/local/secrets/telegram-bot-token"

export PLATFORM_DIR="$ROOT"
# Demo images pinned to the release the compose files come from (its .env says "latest").
export DEMO_VERSION="${DEMO_VERSION:-$DEMO_REF}"
FILES=(-f "$DEMO_DIR/compose.yaml")
[ "${FULL:-0}" = "1" ] && FILES+=(-f "$DEMO_DIR/compose.full.yaml")
FILES+=(-f "$ROOT/local/compose.platform.yaml")

compose() { docker compose --project-name otel-stand --project-directory "$DEMO_DIR" --env-file "$DEMO_DIR/.env" "${FILES[@]}" "$@"; }

if [ "${1:-up}" = "down" ]; then
  compose down
  exit 0
fi

compose up -d --remove-orphans
cat <<EOF

Stand is starting (1-3 minutes until the first traces):
  Shop            http://localhost:8080
  Grafana         http://localhost:3000   admin / $(cat "$ROOT/local/secrets/grafana-admin")
  Prometheus      http://localhost:9090
  Alertmanager    http://localhost:9093
  Mail (SMTP)     http://localhost:8025
  Telegram mock   http://localhost:8088
Failure scenarios: node scenarios/flag.mjs <flag> on|off   (list: node scenarios/flag.mjs)
EOF
