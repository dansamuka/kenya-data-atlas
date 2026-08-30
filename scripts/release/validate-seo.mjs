import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const robots = fs.readFileSync('robots.txt', 'utf8');
const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
const required = [
  ['lang', /<html[^>]+lang="en"/i],
  ['title', /<title>[^<]{20,}[^<]*<\/title>/i],
  ['description', /<meta\s+name="description"\s+content="[^"]{50,}"/i],
  ['canonical', /<link\s+rel="canonical"\s+href="https:\/\/dansamuka\.github\.io\/kenya-data-atlas\/"/i],
  ['robots-meta', /<meta\s+name="robots"\s+content="index,follow/i],
  ['og-title', /property="og:title"/i],
  ['og-description', /property="og:description"/i],
  ['og-url', /property="og:url"/i],
  ['twitter-card', /name="twitter:card"/i],
  ['json-ld', /application\/ld\+json/i],
  ['main-landmark', /<main\s+id="main"[^>]*tabindex="-1"/i]
];
for (const [name, pattern] of required) {
  if (!pattern.test(html)) throw new Error(`P16 SEO requirement missing: ${name}`);
}
if (!/User-agent:\s*\*/i.test(robots) || !/Allow:\s*\//i.test(robots) || !/Sitemap:\s*https:\/\/dansamuka\.github\.io\/kenya-data-atlas\/sitemap\.xml/i.test(robots)) {
  throw new Error('P16 robots.txt is incomplete');
}
if (!/<loc>https:\/\/dansamuka\.github\.io\/kenya-data-atlas\/<\/loc>/i.test(sitemap)) {
  throw new Error('P16 sitemap root URL missing');
}
console.log('P16_SEO_METADATA_OK canonical=root hash_routes=documented-limitation');
console.log('P16_CRAWLABILITY_OK robots=sitemap');
