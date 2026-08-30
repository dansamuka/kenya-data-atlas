import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const checkExternal = args.has('--check-external');
const strict = args.has('--strict');
const reportArg = process.argv.find(arg => arg.startsWith('--report='));
const reportPath = reportArg ? reportArg.slice('--report='.length) : '';

const roots = ['index.html', 'county-dashboard.html', 'README.md', 'docs', 'data/evidence'];
const extensions = new Set(['.html', '.md', '.json', '.js', '.mjs']);
const files = [];

function walk(target) {
  const absolute = path.join(root, target);
  if (!fs.existsSync(absolute)) return;
  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    if (extensions.has(path.extname(target).toLowerCase())) files.push(target);
    return;
  }
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    walk(path.join(target, entry.name));
  }
}
roots.forEach(walk);

const external = new Map();
const localFailures = [];
const localRefs = [];
const urlPattern = /https?:\/\/[^\s<>'"`)\]}]+/g;
const htmlRefPattern = /(?:href|src)=["']([^"']+)["']/g;

for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of text.matchAll(urlPattern)) {
    const url = match[0].replace(/[.,;:!?]+$/, '');
    if (!external.has(url)) external.set(url, new Set());
    external.get(url).add(file);
  }
  if (path.extname(file) === '.html') {
    for (const match of text.matchAll(htmlRefPattern)) {
      const ref = match[1];
      if (/^(?:https?:|mailto:|tel:|data:|javascript:|#)/i.test(ref)) continue;
      const clean = ref.split(/[?#]/)[0];
      if (!clean) continue;
      const resolved = path.resolve(path.dirname(path.join(root, file)), clean);
      localRefs.push({ file, ref: clean });
      if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved)) localFailures.push({ file, ref: clean });
    }
  }
}

const inventory = [...external.entries()]
  .map(([url, refs]) => ({ url, referenced_by: [...refs].sort() }))
  .sort((a, b) => a.url.localeCompare(b.url));

async function probe(item) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const acceptableBlocked = new Set([401, 403, 405, 429]);
  try {
    let response = await fetch(item.url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'KenyaDataAtlas-P16-LinkAudit/1.0' }
    });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(item.url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': 'KenyaDataAtlas-P16-LinkAudit/1.0', range: 'bytes=0-1023' }
      });
    }
    const ok = response.ok || acceptableBlocked.has(response.status);
    return { ...item, ok, status: response.status, final_url: response.url || item.url, classification: response.ok ? 'reachable' : acceptableBlocked.has(response.status) ? 'reachable-but-automated-check-blocked' : 'broken' };
  } catch (error) {
    return { ...item, ok: false, status: null, final_url: item.url, classification: 'unreachable', error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return results;
}

let externalResults = inventory.map(item => ({ ...item, classification: 'inventory-only' }));
if (checkExternal) externalResults = await mapLimit(inventory, 8, probe);

const brokenExternal = externalResults.filter(item => item.classification === 'broken' || item.classification === 'unreachable');
const report = {
  generated_at: new Date().toISOString(),
  scope: roots,
  files_scanned: files.length,
  local_refs_checked: localRefs.length,
  local_failures: localFailures,
  external_unique_urls: inventory.length,
  external_checked: checkExternal,
  external_broken_or_unreachable: brokenExternal,
  external: externalResults
};

if (reportPath) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, JSON.stringify(report, null, 2) + '\n');
}

console.log(`P16_LINK_AUDIT files=${files.length} local_refs=${localRefs.length} external_unique=${inventory.length} external_checked=${checkExternal}`);
if (localFailures.length) console.error(`P16_LOCAL_LINK_FAILURES ${JSON.stringify(localFailures.slice(0, 20))}`);
if (brokenExternal.length) console.warn(`P16_EXTERNAL_LINK_WARNINGS count=${brokenExternal.length}`);

if (localFailures.length || (strict && brokenExternal.length)) process.exit(1);
console.log('P16_LINK_AUDIT_COMPLETE');
