import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, '.lighthouserc.json'), 'utf8'));
const collect = config?.ci?.collect || {};
const assertions = config?.ci?.assert?.assertions || {};
const outputDir = path.join(root, config?.ci?.upload?.outputDir || 'artifacts/lighthouse');
const lighthouseBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'lighthouse.cmd' : 'lighthouse');

const urls = Array.isArray(collect.url) ? collect.url : [];
if (!urls.length) throw new Error('P16 Lighthouse audit: no URLs configured');
if (!fs.existsSync(lighthouseBin)) throw new Error(`P16 Lighthouse audit: Lighthouse binary not found at ${lighthouseBin}`);
fs.mkdirSync(outputDir, { recursive: true });

function waitForServer(child, readyPattern, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`P16 Lighthouse audit: static server did not become ready within ${timeoutMs}ms`));
      }
    }, timeoutMs);

    const onData = chunk => {
      const text = String(chunk);
      process.stdout.write(text);
      if (!settled && text.includes(readyPattern)) {
        settled = true;
        clearTimeout(timer);
        resolve();
      }
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', chunk => process.stderr.write(String(chunk)));
    child.once('exit', code => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`P16 Lighthouse audit: static server exited before ready (code ${code})`));
      }
    });
  });
}

function runCommand(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`P16 Lighthouse audit: command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      const text = String(chunk);
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', chunk => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
    });
    child.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`P16 Lighthouse audit: Lighthouse exited with code ${code}\n${stderr.slice(-3000)}`));
    });
  });
}

function slugFor(url, index) {
  const parsed = new URL(url);
  const hash = parsed.hash.replace(/^#\/?/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return hash || (index === 0 ? 'home' : `route-${index + 1}`);
}

function evaluate(lhr, url) {
  const failures = [];
  const measured = {};

  for (const [id, definition] of Object.entries(assertions)) {
    const [, rule = {}] = Array.isArray(definition) ? definition : [];
    let value;
    if (id.startsWith('categories:')) {
      const category = id.slice('categories:'.length);
      value = lhr.categories?.[category]?.score;
    } else {
      value = lhr.audits?.[id]?.numericValue;
    }
    measured[id] = value;

    if (typeof rule.minScore === 'number' && !(typeof value === 'number' && value >= rule.minScore)) {
      failures.push(`${id}=${value ?? 'missing'} < ${rule.minScore}`);
    }
    if (typeof rule.maxNumericValue === 'number' && !(typeof value === 'number' && value <= rule.maxNumericValue)) {
      failures.push(`${id}=${value ?? 'missing'} > ${rule.maxNumericValue}`);
    }
  }

  if (lhr.runtimeError) failures.push(`runtimeError=${lhr.runtimeError.code || 'unknown'} ${lhr.runtimeError.message || ''}`.trim());
  return { url, measured, failures };
}

const serverCommand = collect.startServerCommand || 'node scripts/p16/serve-static.mjs';
const [serverExecutable, ...serverArgs] = serverCommand.split(/\s+/).filter(Boolean);
const server = spawn(serverExecutable, serverArgs, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });

let exitCode = 0;
try {
  await waitForServer(server, collect.startServerReadyPattern || 'P16_STATIC_SERVER_READY');
  const summary = [];

  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i];
    const slug = slugFor(url, i);
    const reportPath = path.join(outputDir, `${slug}.report.json`);
    const chromeFlags = collect.settings?.chromeFlags || '--headless=new --no-sandbox';
    const preset = collect.settings?.preset || 'desktop';

    console.log(`P16_LIGHTHOUSE_START ${slug} ${url}`);
    await runCommand(lighthouseBin, [
      url,
      '--quiet',
      `--preset=${preset}`,
      '--output=json',
      `--output-path=${reportPath}`,
      `--chrome-flags=${chromeFlags}`
    ]);

    const lhr = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const result = evaluate(lhr, url);
    summary.push({ slug, ...result });
    const compact = Object.entries(result.measured)
      .map(([key, value]) => `${key}=${typeof value === 'number' ? Number(value.toFixed(3)) : 'missing'}`)
      .join(' ');
    console.log(`P16_LIGHTHOUSE_RESULT ${slug} ${compact}`);
    if (result.failures.length) {
      exitCode = 1;
      for (const failure of result.failures) console.error(`P16_LIGHTHOUSE_BUDGET_FAIL ${slug} ${failure}`);
    } else {
      console.log(`P16_LIGHTHOUSE_BUDGET_OK ${slug}`);
    }
  }

  fs.writeFileSync(path.join(outputDir, 'summary.json'), `${JSON.stringify({ generated_at: new Date().toISOString(), lighthouse_version: '13.4.1', results: summary }, null, 2)}\n`);
  if (exitCode === 0) console.log('P16_LIGHTHOUSE_ALL_BUDGETS_OK');
} finally {
  server.kill('SIGTERM');
}

process.exit(exitCode);
