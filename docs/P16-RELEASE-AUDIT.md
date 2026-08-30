# P16 — Real-browser accessibility, SEO and performance release audit

Status: implemented for v1.0 release gating.

## Purpose

P16 closes the gap between the Atlas' deterministic DOM/data validators and the behavior of the deployed public product in real browser engines. It does not change the canonical data model or reopen P00–P15 analytical work.

## Release gates

### 1. Cross-browser smoke matrix

`npm run p16:browser`

Playwright exercises the critical hash-routed journeys in:

- Chromium
- Firefox
- WebKit

Routes covered:

- Home
- National Pulse
- Explore
- Compare
- Series
- Data
- Rankings
- CountyIQ

Every route must render the intended `data-view` and complete without an uncaught `pageerror`.

### 2. WCAG / axe automation

The browser suite runs axe against Home, Compare and CountyIQ using WCAG 2.0 A/AA, WCAG 2.1 A/AA and WCAG 2.2 AA rule tags. Critical-impact automated violations fail the release audit.

Automated axe testing is not a substitute for a full manual WCAG 2.2 conformance assessment. P16 therefore also contains explicit keyboard/focus checks and records the remaining manual-review boundary below.

### 3. Mobile keyboard, focus and overflow

At a 390 × 844 viewport the suite verifies:

- the skip link is first in the keyboard sequence;
- the mobile menu can receive focus;
- opening it updates `aria-expanded` and exposes the controlled navigation;
- Escape closes the menu and returns focus;
- the document does not introduce horizontal overflow;
- the global search keyboard shortcut remains usable from routed views.

The existing mobile CSS contract continues to enforce 44px touch targets, 16px form controls and bounded mobile scrolling.

### 4. Performance budgets

Two layers are enforced.

**Deterministic shell budget (`npm run p16:static`)**

| Asset class | Budget |
| --- | ---: |
| `index.html` | 128 KiB |
| initially linked local CSS | 640 KiB |
| initially linked local JS | 896 KiB |
| total initial local shell | 1.5 MiB |

This budget intentionally excludes lazy datasets and third-party font transfer so repository growth is caught deterministically.

**Lighthouse (`npm run p16:lighthouse`)**

Cold-load checks run on Home, Compare and CountyIQ with these minimum/maximum gates:

| Measure | Gate |
| --- | ---: |
| Performance score | ≥ 0.75 |
| Accessibility score | ≥ 0.90 |
| Best Practices score | ≥ 0.85 |
| SEO score | ≥ 0.90 |
| First Contentful Paint | ≤ 2.5 s |
| Largest Contentful Paint | ≤ 4.0 s |
| Cumulative Layout Shift | ≤ 0.15 |
| Total Blocking Time | ≤ 350 ms |

Lighthouse reports are retained as GitHub Actions artifacts.

### 5. Link integrity

`npm run p16:links`

The deterministic gate deduplicates public URLs and fails on broken local file references.

For a live external-source check:

```bash
npm run p16:links -- --check-external --report=artifacts/p16-link-audit.json
```

The external audit performs bounded concurrent HEAD/GET probes. HTTP 401, 403, 405 and 429 responses are classified as reachable-but-automation-blocked rather than broken. External checks are advisory in CI because Kenyan government and source sites can intermittently block automated requests; the JSON artifact preserves the exact result for review. Add `--strict` when a release operator wants any unreachable external URL to fail the command.

### 6. Metadata and crawlability

P16 enforces:

- document language;
- viewport metadata;
- title and description metadata;
- theme metadata;
- HTTPS-only resources in the public HTML;
- a permissive `robots.txt`;
- a published `sitemap.xml` for the Atlas root and standalone County Dashboard;
- unique DOM IDs;
- existence of all locally linked assets.

The Atlas is a hash-routed GitHub Pages application. Hash routes are client-side states and are not separately indexable URLs, so the sitemap intentionally lists crawlable documents rather than every `#/...` view.

## CI implementation

`.github/workflows/release-audit.yml` installs pinned audit tooling without modifying the production dependency lockfile, installs Chromium/Firefox/WebKit, then runs:

1. deterministic P16 static/link gates;
2. cross-browser Playwright + axe;
3. Lighthouse budgets;
4. advisory external-link probing;
5. audit-artifact upload.

The ordinary `.github/workflows/validate.yml` remains the fast canonical data/build gate; `npm test` now also includes the deterministic P16 static audit.

## Known limitations / manual review boundary

The following are documented rather than silently treated as automated proof of conformance:

- axe cannot prove complete WCAG 2.2 AA conformance; screen-reader semantics, reading order and cognitive usability still need periodic human review;
- Safari is represented by Playwright WebKit, not a physical macOS/iOS Safari device lab;
- Edge is Chromium-based and is covered at engine level by Chromium; branded Edge-specific enterprise policies are outside the public-site scope;
- public source URLs can be temporarily unavailable or reject automation even when usable in a normal browser;
- hash-routed views share one crawlable HTML document, so per-view search snippets/social cards are not independently indexable without a future path-routing/pre-rendering architecture;
- Lighthouse numbers in shared CI are guardrails, not laboratory-grade field performance measurements.

None of these limitations changes published values, provenance, CountyIQ methodology or the canonical registries.

## P16 completion definition

P16 can be marked complete when:

- `npm test` passes;
- the P16 release-audit workflow passes its blocking browser, accessibility and Lighthouse gates;
- external-link results have been reviewed and any genuine broken public links are either fixed or recorded with an evidence-state reason;
- GitHub Pages deploys the audited commit successfully.

P17 remains responsible for the final clean rebuild, release ledger, exact deployed-commit smoke check and v1.0 release publication.
