# P16 — Real-browser accessibility, SEO and performance release audit

**Status: complete.**

P16 converts launch quality from DOM-only assertions into reproducible browser release gates. The release surface is tested locally from the same static files GitHub Pages serves, with permanent CI rerunning the gates on `main` and pull requests.

## Browser matrix

Playwright runs the public routes through:

- Chromium desktop;
- Firefox desktop;
- WebKit desktop (Safari engine coverage);
- Chromium mobile using a Pixel-class viewport.

The matrix exercises Home, Pulse, Explore, Compare, Series, Data, Rankings and CountyIQ. Each route must render its routed view, avoid uncaught page/console errors and avoid horizontal viewport overflow.

## Accessibility

Automated axe checks run against all eight routed surfaces in Chromium using WCAG 2.0/2.1 A+AA plus WCAG 2.2 AA tags. Critical and serious automated violations are release-blocking.

Additional interaction checks cover:

- skip-link focus and transfer to the main landmark;
- keyboard activation of navigation;
- mobile menu expansion and focusability;
- visible `:focus-visible` treatment;
- reduced-motion behavior;
- a contrast hardening layer for small supporting text.

Automated tools do not prove full WCAG conformance. P16 therefore describes the gate as an automated WCAG 2.2 AA audit plus keyboard/focus regression coverage, not a certification.

## Performance

Lighthouse audits four representative cold-load states: Home, Compare, Data and CountyIQ. Release budgets are:

| Metric | Gate |
| --- | ---: |
| Performance score | >= 0.75 |
| Accessibility score | >= 0.95 |
| Best Practices score | >= 0.90 |
| SEO score | >= 0.95 |
| Largest Contentful Paint | <= 3.5 s |
| Total Blocking Time | <= 350 ms |
| Cumulative Layout Shift | <= 0.10 |

These budgets complement the existing P01 direct-JS and initial-data asset budget rather than replacing it.

## Link integrity

`scripts/release/audit-links.mjs` deduplicates external URLs exposed through the main page, repository documentation and county evidence registry. HTTP 404 and 410 are release-blocking. Authentication/rate-limit responses (401/403/405/429), server failures and network timeouts are reported separately because an official source can be reachable but hostile to automated probes.

Audit JSON is uploaded as a CI artifact rather than committed, so volatile external HTTP state does not create false deterministic-data drift.

## SEO and crawlability

The static root now publishes:

- canonical URL;
- robots metadata and `robots.txt`;
- root `sitemap.xml`;
- Open Graph metadata;
- Twitter card metadata;
- JSON-LD `WebSite` + `Dataset` description.

### Known SEO limitation

Kenya Data Atlas uses a client-side hash router. Hash states are shareable and usable, but standard crawlers do not treat `#/compare`, `#/countyiq`, etc. as separate indexable documents. P16 therefore canonicalizes the root and lists only the root in the sitemap. Route-specific server-rendered/HTML snapshots are a future architectural option, not a v1.0 release blocker.

## Permanent CI

`.github/workflows/release-hardening.yml` installs Chromium, Firefox and WebKit and runs:

```bash
npm run p16:browser
npm run p16:lighthouse
npm run p16:links
```

The normal `npm test` suite also includes P16 static/SEO contract validation. Browser reports, Lighthouse JSON and the external-link report are retained as workflow artifacts.

## Handoff

P16 is complete when the release candidate passes the browser matrix, axe gate, Lighthouse budgets, link audit, full Atlas tests and independent geometry audit. P17 is then the sole next v1.0 phase.
