// Controlled ledger proof: proposals typed by this script (no model) go through the village engine's own `act`.
// npm run ledger-proof
// A valid control, an underpriced offer, impossible stats, an early DELIVER, then the clock delivering on time.
// No model, network or key; the same result every run. Writes logs/ledger-proof-<time>.{md,json}; exits 1 if any
// invalid proposal is accepted, any protected gameplay state changes, an expected rejection is missing, or a control fails.
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { REPO_ROOT } from '../server/src/config/env';
import { CONTROLLED, ledgerProof, proofMarkdown } from '../server/src/exploits';

const started = new Date().toISOString().replace(/[:.]/g, '-');
let commit = 'unknown';
try {
  commit = execSync('git describe --always --dirty', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
} catch {
  // not a git checkout
}

const cases = ledgerProof();

for (const [i, c] of cases.entries()) {
  const verdict = c.actor === 'clock' ? (c.verdict.ok ? 'delivered once' : 'NOT delivered') : c.verdict.ok ? 'accepted' : `rejected: ${c.verdict.reason}`;
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${i + 1}. ${c.title} (${c.kind})`);
  console.log(`      ${c.label}`);
  if (c.proposal !== null) console.log(`      ${c.actor} proposed ${JSON.stringify(c.proposal)}`);
  console.log(`      ${verdict}`);
  for (const k of c.checks) if (!k.pass) console.log(`      ✗ ${k.check}: ${k.detail}`);
}

mkdirSync(`${REPO_ROOT}logs`, { recursive: true });
const base = `${REPO_ROOT}logs/ledger-proof-${started}`;
const failed = cases.filter((c) => !c.pass).length;
writeFileSync(`${base}.json`, JSON.stringify({ started, commit, note: CONTROLLED, passed: cases.length - failed, failed, cases }, null, 2));
writeFileSync(`${base}.md`, proofMarkdown(cases, { started, commit }));

console.log(`\n${cases.length - failed} of ${cases.length} cases pass. Report: logs/ledger-proof-${started}.md (and .json)`);
process.exitCode = failed ? 1 : 0;
