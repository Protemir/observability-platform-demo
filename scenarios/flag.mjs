#!/usr/bin/env node
// Switch an OpenTelemetry Demo failure flag (flagd) on or off.
//   node scenarios/flag.mjs                      list flags and their current state
//   node scenarios/flag.mjs paymentFailure on    turn on ("on" = the flag's strongest failure variant)
//   node scenarios/flag.mjs paymentFailure 50%   pick a named variant
//   node scenarios/flag.mjs all off              everything back to normal
// Local stand: edits <demo>/src/flagd/demo.flagd.json, flagd reloads it by itself.
// Kubernetes:  K8S=1 [NS=otel-demo] — rewrites the live flag file through the flagd-ui
//              sidecar (it shares the file with flagd); flagd reloads it by itself.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = process.env.FLAGD_FILE || join(ROOT, '.demo/opentelemetry-demo/src/flagd/demo.flagd.json');
const K8S = process.env.K8S === '1';
const NS = process.env.NS || 'otel-demo';
const K8S_FILE = '/app/data/demo.flagd.json';
const kexec = (args, input) => execFileSync('kubectl', ['-n', NS, 'exec', ...(input ? ['-i'] : []), 'deploy/flagd', '-c', 'flagd-ui', '--', ...args], { encoding: 'utf8', input });

// The 12 scenarios of the acceptance test (ТЗ 3.2).
const SCENARIOS = ['adFailure', 'adHighCpu', 'cartFailure', 'emailMemoryLeak', 'imageSlowLoad', 'intlShippingSlowdown',
  'kafkaConsumerDead', 'kafkaQueueProblems', 'paymentFailure', 'paymentUnreachable', 'productCatalogFailure', 'recommendationCacheFailure'];

const load = () => JSON.parse(K8S ? kexec(['cat', K8S_FILE]) : readFileSync(FILE, 'utf8'));

const save = (cfg) => {
  const text = JSON.stringify(cfg, null, 2) + '\n';
  if (!K8S) return writeFileSync(FILE, text);
  kexec(['sh', '-c', `cat > ${K8S_FILE}`], text);
};

// "on" = the variant that is not "off" and fails the most (largest number / true / "on").
function onVariant(variants) {
  const names = Object.keys(variants).filter((n) => n !== 'off');
  if (names.includes('on')) return 'on';
  const numeric = names.filter((n) => typeof variants[n] === 'number').sort((a, b) => variants[b] - variants[a]);
  return numeric[0] || names[0];
}

const [flag, value] = process.argv.slice(2);
const cfg = load();

if (!flag) {
  for (const [name, f] of Object.entries(cfg.flags)) {
    const mark = SCENARIOS.includes(name) ? '*' : ' ';
    console.log(`${mark} ${name.padEnd(30)} ${String(f.defaultVariant).padEnd(8)} ${Object.keys(f.variants).join(' | ')}`);
  }
  console.log('\n* = one of the 12 acceptance scenarios');
  process.exit(0);
}

// kafkaConsumerDead is listed in the ТЗ but is not a flag in demo 3.1.0. Same symptom
// (a consumer stops reading orders, lag grows) without changing the demo: stop the
// accounting consumer. Proposed as the replacement to agree on at stage 1.
function consumerDead(on) {
  const cmd = K8S
    ? ['kubectl', ['-n', NS, 'scale', 'deploy/accounting', `--replicas=${on ? 0 : 1}`]]
    : ['docker', [on ? 'stop' : 'start', 'accounting']];
  execFileSync(cmd[0], cmd[1], { stdio: 'inherit' });
  console.log(`${new Date().toISOString()} kafkaConsumerDead (accounting ${on ? 'stopped' : 'started'})`);
}
if (flag === 'kafkaConsumerDead') { consumerDead(value !== 'off'); process.exit(0); }

const targets = flag === 'all' ? SCENARIOS.filter((n) => cfg.flags[n]) : [flag];
for (const name of targets) {
  const f = cfg.flags[name];
  if (!f) { console.error(`unknown flag: ${name}`); process.exit(1); }
  const variant = value === 'off' ? 'off' : value === 'on' || value === undefined ? onVariant(f.variants) : value;
  if (!(variant in f.variants)) { console.error(`${name}: no variant "${variant}" (${Object.keys(f.variants).join(', ')})`); process.exit(1); }
  f.defaultVariant = variant;
  // productCatalogFailure fails one product through a targeting rule: switch the rule's branch.
  if (f.targeting?.if?.length === 3) f.targeting.if[1] = variant;
  console.log(`${new Date().toISOString()} ${name} -> ${variant}`);
}
save(cfg);
