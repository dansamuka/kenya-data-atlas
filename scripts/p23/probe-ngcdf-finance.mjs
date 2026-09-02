import { writeFile, mkdir } from 'node:fs/promises';

const sources = {
  allocations: 'https://ngcdf.go.ke/allocations/',
  disbursements: 'https://ngcdf.go.ke/disbursement/'
};

const headers = {
  'user-agent': 'Kenya-Data-Atlas/1.0 (+https://github.com/dansamuka/kenya-data-atlas)',
  accept: 'text/html,application/xhtml+xml'
};

const absolute = (value, base) => {
  try { return new URL(value.replaceAll('&amp;', '&'), base).href; }
  catch { return null; }
};

const unique = values => [...new Set(values.filter(Boolean))];

async function probe(kind, url) {
  const response = await fetch(url, { headers, redirect: 'follow' });
  if (!response.ok) throw new Error(`${kind}: HTTP ${response.status} ${response.statusText}`);
  const html = await response.text();

  const quoted = [...html.matchAll(/["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)].map(m => absolute(m[1], url));
  const encoded = [...html.matchAll(/https?:\\?\/\\?\/[^"'<>\s]+\.pdf(?:\?[^"'<>\s]*)?/gi)]
    .map(m => absolute(m[0].replaceAll('\\/', '/'), url));
  const pdf_links = unique([...quoted, ...encoded]);

  const onclick = unique([...html.matchAll(/onclick\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]));
  const hrefs = unique([...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m => absolute(m[1], url)));
  const api_refs = unique([...html.matchAll(/["']([^"']*(?:wp-json|admin-ajax\.php)[^"']*)["']/gi)].map(m => absolute(m[1], url)));
  const download_contexts = [...html.matchAll(/.{0,180}(?:Download PDF|Allocations|Disbursements).{0,420}/gis)]
    .slice(0, 12)
    .map(m => m[0].replace(/\s+/g, ' ').trim());

  return {
    kind,
    url,
    fetched_at: new Date().toISOString(),
    http_status: response.status,
    final_url: response.url,
    html_bytes: Buffer.byteLength(html),
    constituency_label_count: (html.match(/Allocations|Disbursements/g) || []).length,
    pdf_link_count: pdf_links.length,
    pdf_links: pdf_links.slice(0, 320),
    onclick_count: onclick.length,
    onclick_samples: onclick.slice(0, 20),
    href_count: hrefs.length,
    api_refs: api_refs.slice(0, 40),
    download_contexts
  };
}

await mkdir('data/p23/source', { recursive: true });
const results = {};
for (const [kind, url] of Object.entries(sources)) {
  results[kind] = await probe(kind, url);
  console.log(`P23_NGCDF_PROBE ${kind} status=${results[kind].http_status} bytes=${results[kind].html_bytes} pdfs=${results[kind].pdf_link_count} onclick=${results[kind].onclick_count} api=${results[kind].api_refs.length}`);
}

const out = {
  schema_version: 'kda.p23.ngcdf-source-probe.v1',
  authority: 'National Government Constituencies Development Fund Board',
  purpose: 'Discover the official machine-retrievable allocation and disbursement payloads before any constituency finance observation is promoted.',
  no_fabrication_rule: 'A finance slot may only be promoted from an official constituency/fiscal-year amount that reconciles to the canonical 290-constituency registry. No county inheritance, missing-value fill, or inferred amount is permitted.',
  results
};
await writeFile('data/p23/source/ngcdf-finance-source-probe.json', JSON.stringify(out, null, 2) + '\n');

if (results.allocations.html_bytes < 10000 || results.disbursements.html_bytes < 10000) {
  throw new Error('NG-CDF source pages returned implausibly small payloads');
}
console.log('P23_NGCDF_SOURCE_PROBE_OK');
