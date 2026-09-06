#!/usr/bin/env node
import fs from 'node:fs';

const [aggregatePath, queuePath] = process.argv.slice(2);
if (!aggregatePath || !queuePath) throw new Error('Usage: validate-form34b-candidate-audit.mjs <aggregate.json> <queue.json>');
const aggregate = JSON.parse(fs.readFileSync(aggregatePath, 'utf8'));
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const fail = (message) => { throw new Error(`P23 Form 34B candidate audit validation: ${message}`); };
const fields = ['registered_voters', 'total_valid_votes', 'rejected_ballots'];
const allowed = new Set(['strong_machine_candidate', 'machine_candidate_needs_review', 'unresolved']);

const committedVerified = new Map();
for (const name of fs.readdirSync('data/p23').filter(name => /^form34b-.+-source-verification\.json$/.test(name)).sort()) {
  const evidence = JSON.parse(fs.readFileSync(`data/p23/${name}`, 'utf8'));
  if (evidence.verification_state !== 'verified' || evidence.promotion_eligible !== true) continue;
  if (evidence.schema_version !== 'kda.p23.form34b-source-verification.v1') fail(`${name}: unexpected committed verification schema`);
  const code = evidence.sample?.constituency_code;
  if (!Number.isInteger(code) || code < 1 || code > 290) fail(`${name}: invalid committed constituency code`);
  if (committedVerified.has(code)) fail(`duplicate committed source verification for constituency ${code}`);
  if (typeof evidence.sample?.source_url !== 'string' || !evidence.sample.source_url.startsWith('https://forms.iebc.or.ke/')) fail(`${name}: source URL`);
  if (typeof evidence.sample?.source_pdf_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(evidence.sample.source_pdf_sha256)) fail(`${name}: source digest`);
  for (const field of fields) {
    const item = evidence.field_evidence?.[field];
    if (!item || item.verification_state !== 'source_verified' || !Number.isInteger(item.verified_value)) fail(`${name}: ${field} not source_verified`);
  }
  committedVerified.set(code, evidence);
}

if (aggregate.schema_version !== 'kda.p23.form34b.candidate-audit.v1') fail('unexpected aggregate schema');
if (aggregate.expected_rows !== 290 || aggregate.rows_processed !== 290) fail('aggregate must cover exactly 290 rows');
if (aggregate.source_verified_values !== 0 || aggregate.promotion_authorized !== false) fail('aggregate promotion boundary changed');
if (!Array.isArray(aggregate.rows) || aggregate.rows.length !== 290) fail('aggregate rows length');

let strong = 0;
let review = 0;
let unresolved = 0;
const strongCodes = [];
const alreadyVerifiedStrongCodes = [];
for (let i = 0; i < aggregate.rows.length; i += 1) {
  const row = aggregate.rows[i];
  const expectedCode = i + 1;
  if (row.constituency_code !== expectedCode) fail(`deterministic constituency ordering failed at ${expectedCode}`);
  if (!allowed.has(row.verification_state)) fail(`invalid state for ${expectedCode}`);
  if (row.source_verified_values !== 0 || row.promotion_authorized !== false) fail(`row ${expectedCode} promotion boundary changed`);
  if (typeof row.source_url !== 'string' || !row.source_url.startsWith('https://forms.iebc.or.ke/')) fail(`row ${expectedCode} source URL`);
  if (typeof row.source_pdf_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(row.source_pdf_sha256)) fail(`row ${expectedCode} source digest`);
  if (Object.prototype.hasOwnProperty.call(row, 'turnout_pct')) fail(`row ${expectedCode} leaked turnout_pct`);

  if (row.verification_state === 'strong_machine_candidate') {
    strong += 1;
    strongCodes.push(expectedCode);
    if (row.final_rows_found !== 1 || row.denominator_match !== true || row.arithmetic_ok !== true || row.turnout_range_ok !== true) fail(`row ${expectedCode} strong-candidate reconciliation`);
    for (const field of fields) {
      const evidence = row.field_evidence?.[field];
      if (!evidence || evidence.verification_state !== 'machine_candidate') fail(`row ${expectedCode} ${field} evidence state`);
      if (!Number.isInteger(evidence.machine_transcription)) fail(`row ${expectedCode} ${field} machine transcription`);
      if (evidence.verified_value !== null || evidence.verification_method !== null) fail(`row ${expectedCode} ${field} source verification leaked`);
    }

    const committed = committedVerified.get(expectedCode);
    if (committed) {
      if (row.source_url !== committed.sample.source_url || row.source_pdf_sha256 !== committed.sample.source_pdf_sha256) fail(`row ${expectedCode} source disagrees with committed verification`);
      for (const field of fields) {
        if (row.field_evidence[field].machine_transcription !== committed.field_evidence[field].verified_value) fail(`row ${expectedCode} ${field} disagrees with committed verified value`);
      }
      alreadyVerifiedStrongCodes.push(expectedCode);
    }
  } else if (row.verification_state === 'machine_candidate_needs_review') {
    review += 1;
  } else {
    unresolved += 1;
  }
}

const committedCodes = [...committedVerified.keys()].sort((a, b) => a - b);
const pendingStrongCodes = strongCodes.filter(code => !committedVerified.has(code));
if (aggregate.summary?.strong_machine_candidates !== strong) fail('strong summary mismatch');
if (aggregate.summary?.strong_already_source_verified !== alreadyVerifiedStrongCodes.length) fail('already-verified strong summary mismatch');
if (aggregate.summary?.strong_pending_source_verification !== pendingStrongCodes.length) fail('pending strong summary mismatch');
if (aggregate.summary?.machine_candidates_needing_review !== review) fail('review summary mismatch');
if (aggregate.summary?.unresolved_rows !== unresolved) fail('unresolved summary mismatch');
if (aggregate.summary?.committed_source_verified_rows !== committedCodes.length) fail('committed verified summary mismatch');
if (strong + review + unresolved !== 290) fail('aggregate summary total mismatch');
if (JSON.stringify(aggregate.committed_source_verified_codes) !== JSON.stringify(committedCodes)) fail('committed verified code list mismatch');
if (JSON.stringify(aggregate.strong_already_source_verified_codes) !== JSON.stringify(alreadyVerifiedStrongCodes)) fail('already-verified strong code list mismatch');

if (queue.schema_version !== 'kda.p23.form34b.source-verification-queue.v1') fail('unexpected queue schema');
if (queue.source_audit_schema !== aggregate.schema_version) fail('queue audit linkage');
if (queue.source_verified_values !== 0 || queue.promotion_authorized !== false) fail('queue promotion boundary changed');
if (!Array.isArray(queue.rows) || queue.queue_rows !== queue.rows.length) fail('queue rows mismatch');
if (queue.queue_rows !== pendingStrongCodes.length) fail('queue must contain exactly strong candidates not already source-verified');
if (JSON.stringify(queue.excluded_already_source_verified_codes) !== JSON.stringify(alreadyVerifiedStrongCodes)) fail('queue exclusion list mismatch');
const queueCodes = queue.rows.map(row => row.constituency_code);
if (JSON.stringify(queueCodes) !== JSON.stringify(pendingStrongCodes)) fail('queue codes do not exactly match pending strong candidates');
for (const row of queue.rows) {
  if (committedVerified.has(row.constituency_code)) fail(`queue row ${row.constituency_code} is already source-verified`);
  if (row.verification_state !== 'pending_source_verification') fail(`queue row ${row.constituency_code} state`);
  if (row.source_verified_values !== 0 || row.promotion_authorized !== false) fail(`queue row ${row.constituency_code} promotion boundary changed`);
  if (typeof row.source_url !== 'string' || !row.source_url.startsWith('https://forms.iebc.or.ke/')) fail(`queue row ${row.constituency_code} source URL`);
  if (typeof row.source_pdf_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(row.source_pdf_sha256)) fail(`queue row ${row.constituency_code} source digest`);
  if (row.machine_reconciliation?.denominator_match !== true || row.machine_reconciliation?.arithmetic_ok !== true || row.machine_reconciliation?.turnout_range_ok !== true) fail(`queue row ${row.constituency_code} reconciliation`);
  for (const field of fields) {
    const evidence = row.candidate_evidence?.[field];
    if (!evidence || evidence.verification_state !== 'machine_candidate') fail(`queue row ${row.constituency_code} ${field} evidence state`);
    if (!Number.isInteger(evidence.machine_transcription)) fail(`queue row ${row.constituency_code} ${field} transcription`);
    if (evidence.verified_value !== null || evidence.verification_method !== null) fail(`queue row ${row.constituency_code} ${field} verification leaked`);
  }
}

console.log(`P23_FORM34B_CANDIDATE_AUDIT_VALID rows=290 strong=${strong} strong_verified=${alreadyVerifiedStrongCodes.length} strong_pending=${pendingStrongCodes.length} review=${review} unresolved=${unresolved} queue=${queue.queue_rows} source_verified_values=0 promotion_authorized=false`);
