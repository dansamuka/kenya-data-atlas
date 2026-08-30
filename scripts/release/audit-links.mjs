import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportDir = path.join(root, 'reports', 'p16');
fs.mkdirSync(reportDir, { recursive: true });

const sourcePaths = [
  'index.html',
  'README.md',
  'DATA-NOTICE.md',
  'docs/DEVELOPER.md',
  'data/evidence/county-documents.json'
];

const urlPattern = /https?:\/\/[^\s"'<>)}\]]+/g;
const urls = new Set();
for (const relative of sourcePaths) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) continue;
  const text = fs.readFileSync(full, 'utf8');
  for (const match of text.matchAll(urlPattern)) {
    const cleaned = match[0].replace(/[.,;:]+$/, '');
    try {
      const url = new URL(cleaned);
      url.hash = '';
      urls.add(url.toString());
    } catch {}
  }
}

const ordered = [...urls].sort();
const concurrency = 8;
const results = new Array(ordered.length);

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    let response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'Kenya-Data-Atlas-Link-Audit/0.19' } });
    if ([403, 405].includes(response.status)) {
      response = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'Kenya-Data-Atlas-Link-Audit/0.19', range: 'bytes=0-1024' } });
    }
    const status = response.status;
    let classification = 'ok';
    if ([404, 410].includes(status)) classification = 'broken';
    else if ([401, 403, 405, 429].includes(status)) classification = 'restricted';
    else if (status >= 500) classification = 'transient';
    else if (status >= 400) classification = 'warning';
    return { url, status, finalUrl: response.url, classification };
  } catch (error) {
    return { url, status: null, finalUrl: null, classification: 'transient', error: error.name === 'AbortError' ? 'timeout' : String(error.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

let next = 0;
async function worker() {
  while (next < ordered.length) {
    const index = next;
    next += 1;
    results[index] = await probe(ordered[index]);
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, ordered.length) }, () => worker()));

const counts = results.reduce((acc, item) => {
  acc[item.classification] = (acc[item.classification] || 0) + 1;
  return acc;
}, {});
const report = {
  schema_version: 'kda.p16-link-audit.v1',
  audited_sources: sourcePaths,
  deduplicated_urls: ordered.length,
  counts,
  policy: {
    release_blocking: ['404', '410'],
    non_blocking_restricted: ['401', '403', '405', '429'],
    transient_network_failures: 'reported but not release-blocking because official sites may rate-limit or be temporarily unavailable'
  },
  results
};
fs.writeFileSync(path.join(reportDir, 'external-link-audit.json'), JSON.stringify(report, null, 2));
console.log(`P16_LINK_AUDIT urls=${ordered.length} ok=${counts.ok || 0} restricted=${counts.restricted || 0} transient=${counts.transient || 0} warning=${counts.warning || 0} broken=${counts.broken || 0}`);
const broken = results.filter(item => item.classification === 'broken');
if (broken.length) {
  for (const item of broken) console.error(`BROKEN ${item.status} ${item.url}`);
  process.exit(1);
}
console.log('P16_LINK_AUDIT_ALL_OK');
