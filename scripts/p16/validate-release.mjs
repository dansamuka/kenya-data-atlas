import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));
const bytes = p => fs.statSync(path.join(root, p)).size;
const fail = message => { throw new Error(`P16 release validation: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

const html = read('index.html');
const robots = read('robots.txt');
const sitemap = read('sitemap.xml');

const requiredHead = [
  '<html lang="en">',
  'name="viewport"',
  'name="description"',
  'name="theme-color"',
  '<title>Kenya Data Atlas',
  'class="skip-link"',
  'aria-label="Main navigation"',
  'aria-controls="main-nav"',
  'aria-label="Open search"'
];
for (const token of requiredHead) assert(html.includes(token), `missing metadata/accessibility contract: ${token}`);

assert(robots.includes('User-agent: *'), 'robots.txt must define a default crawler policy');
assert(robots.includes('Sitemap: https://dansamuka.github.io/kenya-data-atlas/sitemap.xml'), 'robots.txt must advertise the canonical sitemap');
assert(sitemap.includes('<loc>https://dansamuka.github.io/kenya-data-atlas/</loc>'), 'sitemap must include the public Atlas root');
assert(!html.includes('http://'), 'public HTML must not contain insecure http:// resources');
console.log('P16_METADATA_CRAWLABILITY_OK');

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
assert(duplicateIds.length === 0, `duplicate DOM ids: ${duplicateIds.join(', ')}`);
console.log(`P16_DOM_ID_UNIQUENESS_OK ids=${ids.length}`);

const localRefs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
  .map(match => match[1])
  .filter(ref => !ref.startsWith('#') && !/^https?:\/\//i.test(ref) && !ref.startsWith('mailto:') && !ref.startsWith('tel:') && !ref.startsWith('data:'))
  .map(ref => ref.split(/[?#]/)[0])
  .filter(Boolean);
const missing = [...new Set(localRefs.filter(ref => !exists(ref)))];
assert(missing.length === 0, `missing local document assets: ${missing.join(', ')}`);
console.log(`P16_LOCAL_LINKS_OK refs=${new Set(localRefs).size}`);

const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
  .map(match => match[1])
  .filter(ref => !/^https?:\/\//i.test(ref));
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
  .map(match => match[1])
  .filter(ref => !/^https?:\/\//i.test(ref));
const styleBytes = styles.reduce((sum, ref) => sum + bytes(ref.split(/[?#]/)[0]), 0);
const scriptBytes = scripts.reduce((sum, ref) => sum + bytes(ref.split(/[?#]/)[0]), 0);
const htmlBytes = bytes('index.html');
const initialBytes = htmlBytes + styleBytes + scriptBytes;

const budgets = {
  html: 128 * 1024,
  css: 640 * 1024,
  js: 896 * 1024,
  initialLocal: 1536 * 1024
};
assert(htmlBytes <= budgets.html, `index.html ${htmlBytes}B exceeds ${budgets.html}B budget`);
assert(styleBytes <= budgets.css, `initial CSS ${styleBytes}B exceeds ${budgets.css}B budget`);
assert(scriptBytes <= budgets.js, `initial JS ${scriptBytes}B exceeds ${budgets.js}B budget`);
assert(initialBytes <= budgets.initialLocal, `initial local shell ${initialBytes}B exceeds ${budgets.initialLocal}B budget`);
console.log(`P16_STATIC_BUDGET_OK html=${htmlBytes} css=${styleBytes} js=${scriptBytes} total=${initialBytes}`);

const requiredRoutes = ['#/', '#/pulse', '#/explore', '#/compare', '#/series/KDA-CPI-YOY-KEN', '#/data', '#/rankings', '#/countyiq'];
for (const route of requiredRoutes) {
  const needle = route === '#/' ? 'href="#/"' : route.includes('/series/') ? `href="${route}"` : `href="${route}"`;
  assert(html.includes(needle) || route === '#/', `critical route is not linked from the shell: ${route}`);
}
console.log('P16_CRITICAL_ROUTE_CONTRACT_OK');

console.log('P16_STATIC_RELEASE_AUDIT_ALL_OK');
