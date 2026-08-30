import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const root = process.cwd();
const reportDir = path.join(root, 'reports', 'p16');
fs.mkdirSync(reportDir, { recursive: true });

const base = process.env.P16_BASE_URL || 'http://127.0.0.1:4173';
const routes = [
  { id: 'home', path: '/#/' },
  { id: 'compare', path: '/#/compare' },
  { id: 'data', path: '/#/data' },
  { id: 'countyiq', path: '/#/countyiq' }
];

const thresholds = {
  performance: 0.75,
  accessibility: 0.95,
  'best-practices': 0.90,
  seo: 0.95,
  lcpMs: 3500,
  tbtMs: 350,
  cls: 0.10
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForServer(url) {
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error(`Static server did not become ready: ${url}`);
}

let server;
if (!process.env.P16_BASE_URL) {
  server = spawn('python3', ['-m', 'http.server', '4173', '--bind', '127.0.0.1'], {
    cwd: root,
    stdio: 'ignore'
  });
  await waitForServer(`${base}/`);
}

const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless', '--no-sandbox', '--disable-dev-shm-usage'] });
const summaries = [];
let failed = false;

try {
  for (const route of routes) {
    const result = await lighthouse(`${base}${route.path}`, {
      port: chrome.port,
      logLevel: 'error',
      output: 'json',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo']
    });
    const lhr = result.lhr;
    const summary = {
      route: route.path,
      finalUrl: lhr.finalUrl,
      scores: Object.fromEntries(Object.entries(lhr.categories).map(([key, value]) => [key, value.score])),
      metrics: {
        lcpMs: lhr.audits['largest-contentful-paint']?.numericValue ?? null,
        tbtMs: lhr.audits['total-blocking-time']?.numericValue ?? null,
        cls: lhr.audits['cumulative-layout-shift']?.numericValue ?? null
      }
    };
    summaries.push(summary);
    fs.writeFileSync(path.join(reportDir, `lighthouse-${route.id}.json`), JSON.stringify(lhr, null, 2));

    for (const key of ['performance', 'accessibility', 'best-practices', 'seo']) {
      if ((summary.scores[key] ?? 0) < thresholds[key]) failed = true;
    }
    if ((summary.metrics.lcpMs ?? Infinity) > thresholds.lcpMs) failed = true;
    if ((summary.metrics.tbtMs ?? Infinity) > thresholds.tbtMs) failed = true;
    if ((summary.metrics.cls ?? Infinity) > thresholds.cls) failed = true;
  }
} finally {
  await chrome.kill();
  if (server) server.kill('SIGTERM');
}

fs.writeFileSync(path.join(reportDir, 'lighthouse-summary.json'), JSON.stringify({ thresholds, routes: summaries }, null, 2));
for (const summary of summaries) {
  console.log(`P16_LIGHTHOUSE ${summary.route} perf=${summary.scores.performance} a11y=${summary.scores.accessibility} bp=${summary.scores['best-practices']} seo=${summary.scores.seo} lcp=${Math.round(summary.metrics.lcpMs)} tbt=${Math.round(summary.metrics.tbtMs)} cls=${summary.metrics.cls}`);
}
if (failed) {
  console.error(`P16_LIGHTHOUSE_BUDGET_FAIL thresholds=${JSON.stringify(thresholds)}`);
  process.exit(1);
}
console.log('P16_LIGHTHOUSE_ALL_OK');
