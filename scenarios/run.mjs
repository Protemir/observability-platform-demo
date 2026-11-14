#!/usr/bin/env node
// Runs failure scenarios one by one on the local stand and measures the time from
// switching the flag on to the first Telegram message (tg-mock) about the expected service.
//   node scenarios/run.mjs                 all locally reproducible scenarios
//   node scenarios/run.mjs paymentFailure  one scenario
// Writes scenarios/results-local.md. Needs the local stand (./local/up.sh).
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'scenarios/results-local.md');
const TG = process.env.TG_URL || 'http://localhost:8088/api/messages';
const LIMIT_MS = (+process.env.LIMIT_MIN || 8) * 60_000; // stop waiting after 8 minutes by default
const COOLDOWN_MS = 4 * 60_000; // let the stand recover between scenarios

// scenario -> text that must appear in the first firing message (service or dependency)
const SCENARIOS = {
  paymentFailure: /payment|PaymentService/,
  paymentUnreachable: /PaymentService|payment/,
  adFailure: /\bad\b/,
  cartFailure: /cart/,
  productCatalogFailure: /product-catalog/,
  intlShippingSlowdown: /shipping/,
  adHighCpu: /\bad\b/,
  emailMemoryLeak: /email/,
  recommendationCacheFailure: /recommendation/,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flag = (name, v) => execFileSync('node', [join(ROOT, 'scenarios/flag.mjs'), name, v], { stdio: 'ignore' });
const messages = async () => { try { return await (await fetch(TG)).json(); } catch { return []; } };
const parseAt = (s) => Date.parse(s.replace(' UTC', 'Z').replace(' ', 'T'));
const fmt = (ms) => `${Math.floor(ms / 60000)} мин ${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')} с`;

const only = process.argv[2];
const list = only ? [only] : Object.keys(SCENARIOS);
if (!existsSync(OUT) || !only) {
  writeFileSync(OUT, `# Прогон сценариев на локальном стенде\n\nВремя — от включения флага до первого сообщения в Telegram (заглушка tg-mock) о нужном сервисе.\n\n| Сценарий | Время до оповещения | Первое сообщение |\n|---|---|---|\n`);
}
for (const name of list) {
  const re = SCENARIOS[name];
  const t0 = Date.now();
  flag(name, 'on');
  console.log(`${new Date(t0).toISOString()} ${name} on`);
  let hit = null;
  while (!hit && Date.now() - t0 < LIMIT_MS) {
    await sleep(5000);
    hit = (await messages()).reverse().find((m) => parseAt(m.at) >= t0 - 1000 && m.text.startsWith('🔴') && re.test(m.text));
  }
  flag(name, 'off');
  const line = hit
    ? `| ${name} | ${fmt(parseAt(hit.at) - t0)} | ${hit.text.split('\n')[0].replace(/<[^>]+>/g, '').replace(/\|/g, '/')} |`
    : `| ${name} | не пришло за ${LIMIT_MS / 60000} мин | — |`;
  console.log(line);
  appendFileSync(OUT, line + '\n');
  if (list.length > 1) await sleep(COOLDOWN_MS);
}
