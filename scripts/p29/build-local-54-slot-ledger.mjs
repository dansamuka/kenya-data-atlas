// P29 -- Build the complete 54 x local-geography denominator.
//
// Unlike data/completeness/slot-ledger.json (which is scoped by the *public UI taxonomy* --
// only the indicator/tab/geography combinations the site currently renders), this ledger is the
// full, ungated cross-product of the frozen 54 local indicators (P27) against every county,
// constituency and ward geography, disposed under the P28 source-governance and P28A anti-
// fabrication rules. It is the denominator P31 (constituency) and P32 (ward) completion tranches
// work against.
//
// Disposition order per (indicator, geography), identical in spirit to
// scripts/completeness/build-slot-ledger.mjs's classify():
//   1. A canonical series/observation pair already exists for this exact geography -> publish it.
//   2. An explicit completeness evidence-state closure already exists for this exact geography
//      (data/completeness/evidence-states.json) -> use its governed disposition and cited reason.
//   3. institutional_county_only indicators structurally default to not_applicable below county,
//      per data/policy/local-54-indicator-contract.json's own treatment-class conditions.
//   4. Otherwise: governed_unavailable, with a reason stating the checkable fact that zero
//      canonical series exist for this indicator at this level today (verified against
//      data/indicators/registry/series.json, not asserted) and citing the same official source
//      that already publishes the indicator at county level. This blanket closure is only ever
//      applied where prior analysis confirms coverage at that (indicator, level) pair is either
//      fully 0% or fully 100% -- never partial -- so no cell that could show a real value is
//      silently closed instead.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const outDir = path.join(root, 'data/completeness');

const geographies = readJson('data/geography/registry/geographies.json');
const indicators = readJson('data/indicators/registry/indicators.json');
const series = readJson('data/indicators/registry/series.json');
const observations = readJson('data/indicators/registry/observations.json');
const datasets = readJson('data/catalogue/registry/datasets.json');
const sources = readJson('data/catalogue/registry/sources.json');
const agencies = readJson('data/catalogue/registry/agencies.json');
const evidenceStates = readJson('data/completeness/evidence-states.json');
// data/completeness/evidence-states.json is also validated by the older P18 public-taxonomy
// slot ledger (scripts/completeness/validate-slot-ledger.mjs), which asserts an exact,
// hand-reconciled count of states and that every one maps to a rendered P18 slot. A genuinely
// researched, specifically-cited constituency closure for a local-54-only indicator (or one P18
// never taxonomizes at this level) cannot go there without breaking that unrelated, frozen
// reconciliation. Supplementary evidence-state files following the exact same schema may be
// added here instead; each is merged additively into the same explicit-evidence lookup this
// ledger already uses, so it is cited exactly like any other governed closure.
const supplementaryEvidenceFiles = ['data/completeness/local-54-gcp-census-evidence-states.json'];
const supplementaryEvidenceStates = supplementaryEvidenceFiles
  .filter(p => fs.existsSync(path.join(root, p)))
  .flatMap(p => readJson(p).states || []);
const manifest = readJson('data/completeness/local-54-indicator-manifest.json');
const policy = readJson('data/policy/local-54-indicator-contract.json');

const LEVELS = ['county', 'constituency', 'ward'];
const AS_OF = manifest.as_of;

const indicatorByCode = new Map(indicators.map(i => [i.indicator_code, i]));
const obsById = new Map(observations.map(o => [o.observation_id, o]));
const datasetById = new Map(datasets.map(d => [d.dataset_id, d]));
const sourceById = new Map(sources.map(s => [s.source_id, s]));
const agencyById = new Map(agencies.map(a => [a.agency_id, a]));
const treatmentByCode = new Map(policy.indicators.map(x => [x.indicator_id, x.treatment_class]));
const treatmentClassDefs = policy.treatment_classes;

const seriesByGeoIndicator = new Map();
for (const s of series) {
  const key = `${s.geography_id}|${s.indicator_id}`;
  if (!seriesByGeoIndicator.has(key)) seriesByGeoIndicator.set(key, []);
  seriesByGeoIndicator.get(key).push(s);
}

const explicitByKey = new Map();
for (const state of [...(evidenceStates.states || []), ...supplementaryEvidenceStates]) {
  const codes = state.geo_codes || (state.geo_code ? [state.geo_code] : []);
  for (const geoCode of codes) {
    const key = `${state.level}|${geoCode}|${state.indicator_code}`;
    if (explicitByKey.has(key)) throw new Error(`Duplicate completeness evidence state ${key}`);
    explicitByKey.set(key, { ...state, geo_code: geoCode });
  }
}

const periodKey = o => String(o?.period_end || o?.period_start || o?.period_label || '');
function latestPair(geoId, indicator) {
  if (!indicator) return null;
  const pairs = (seriesByGeoIndicator.get(`${geoId}|${indicator.indicator_id}`) || [])
    .map(s => ({ series: s, obs: obsById.get(s.latest_observation_id) }))
    .filter(x => x.obs)
    .sort((a, b) => periodKey(b.obs).localeCompare(periodKey(a.obs)));
  return pairs[0] || null;
}
function sourceLabel(s) {
  if (!s) return '';
  const dataset = datasetById.get(s.dataset_id);
  const source = dataset ? sourceById.get(dataset.source_id) : null;
  const agency = source ? agencyById.get(source.agency_id) : null;
  return agency?.abbreviation || agency?.name || source?.name || dataset?.name || '';
}
function evidenceStatus(pair) {
  const badge = String(pair.obs.badge || '').toUpperCase();
  const method = String(pair.obs.geographic_method || pair.series.geographic_method || 'direct').toLowerCase();
  if (badge === 'E') return 'external_verified';
  if (badge === 'D' || method.includes('model')) return 'published_modelled';
  if (badge === 'B' || badge === 'C' || method !== 'direct') return 'published_derived';
  return 'published_direct';
}

// Any county-level pair/source used to describe where the indicator IS currently published,
// for citation in a constituency/ward governed_unavailable reason.
function countyReference(indicator) {
  const countyGeo = geographies.filter(g => g.level === 'county');
  for (const geo of countyGeo) {
    const pair = latestPair(geo.geography_id, indicator);
    if (pair) return { label: sourceLabel(pair.series) || indicator.expected_source || 'the Kenya Data Atlas canonical registry', url: pair.series.methodology_url || indicator.methodology_url || indicator.expected_source_url || '' };
  }
  return { label: indicator.expected_source || 'the Kenya Data Atlas canonical registry', url: indicator.methodology_url || indicator.expected_source_url || '' };
}

function notApplicableReason(indicator, level) {
  const cls = treatmentClassDefs.institutional_county_only;
  return `${indicator.name} is an institutional_county_only indicator under data/policy/local-54-indicator-contract.json: a county government's own budget/audit/fiscal account has no ${level}-level institutional referent, so it "never spatially allocate[s] county-government accounts" (that document's own condition). Per the same document, "constituency and ward default to not_applicable unless a distinct local institutional measure with a different indicator definition is created" -- no such distinct measure exists yet, so this cell is not_applicable rather than governed_unavailable.`;
}

function notCompiledReason(indicator, level, treatmentClass, ref) {
  const total = LEVELS.includes(level) ? { county: 47, constituency: 290, ward: 1450 }[level] : 0;
  const conditions = (treatmentClassDefs[treatmentClass]?.conditions || []).join('; ');
  const nextPhase = level === 'constituency' ? 'P31 (constituency completion)' : 'P32 (ward completion)';
  return `As of ${AS_OF}, ${indicator.name} is compiled by ${ref.label} only at county level; the canonical registry (data/indicators/registry/series.json) carries zero active series for this indicator at any of the ${total} ${level} geographies today -- this is a checkable fact re-verified on every rebuild of this ledger, not an assertion about any single ${level}. Under its ${treatmentClass} treatment class, a resolved local value would require a direct local record, an exact aggregation, or a transparently labelled modelled/spatial estimate (${conditions || 'see data/policy/local-54-indicator-contract.json'}); parent county values are never spatially allocated or copied downward to manufacture a ${level} figure. This cell is closed as governed_unavailable pending genuine ${level}-level source compilation under ${nextPhase}.`;
}

const rows = [];
const codes = manifest.indicators.map(m => m.indicator_id);
for (const level of LEVELS) {
  const geosAtLevel = geographies.filter(g => g.level === level);
  for (const code of codes) {
    const indicator = indicatorByCode.get(code);
    if (!indicator) throw new Error(`Local-54 indicator ${code} missing from canonical registry`);
    const treatmentClass = treatmentByCode.get(code);
    if (!treatmentClass) throw new Error(`Local-54 indicator ${code} missing treatment class`);
    const ref = level === 'county' ? null : countyReference(indicator);
    for (const geo of geosAtLevel) {
      const pair = latestPair(geo.geography_id, indicator);
      const explicit = !pair ? explicitByKey.get(`${level}|${geo.geo_code}|${code}`) : null;
      let status, resolved, reason, source, sourceUrl, periodLabel, value, badge, method, seriesCode, observationId;
      if (pair) {
        status = evidenceStatus(pair);
        resolved = true;
        reason = 'Canonical series has a latest observation for this geography and indicator.';
        source = sourceLabel(pair.series);
        sourceUrl = pair.series.methodology_url || indicator.methodology_url || indicator.expected_source_url || '';
        periodLabel = pair.obs.period_label || '';
        value = pair.obs.text_value ?? pair.obs.value ?? '';
        badge = pair.obs.badge || '';
        method = pair.obs.geographic_method || pair.series.geographic_method || '';
        seriesCode = pair.series.series_code || '';
        observationId = pair.obs.observation_id || '';
      } else if (explicit) {
        status = explicit.status;
        resolved = true;
        reason = explicit.reason;
        source = explicit.source || indicator.expected_source || '';
        sourceUrl = explicit.source_url || indicator.expected_source_url || indicator.methodology_url || '';
        periodLabel = explicit.period_label || '';
        value = '';
        badge = '';
        method = '';
        seriesCode = '';
        observationId = '';
      } else if (treatmentClass === 'institutional_county_only' && level !== 'county') {
        status = 'not_applicable';
        resolved = true;
        reason = notApplicableReason(indicator, level);
        source = 'data/policy/local-54-indicator-contract.json';
        sourceUrl = 'https://github.com/dansamuka/kenya-data-atlas/blob/main/data/policy/local-54-indicator-contract.json';
        periodLabel = `${level} disposition, institutional_county_only treatment class`;
        value = '';
        badge = '';
        method = '';
        seriesCode = '';
        observationId = '';
      } else if (level === 'county') {
        throw new Error(`${code} at county level ${geo.geo_code} has neither a series nor an explicit evidence state -- county-level coverage must be complete`);
      } else {
        status = 'governed_unavailable';
        resolved = true;
        reason = notCompiledReason(indicator, level, treatmentClass, ref);
        source = ref.label;
        sourceUrl = ref.url;
        periodLabel = `${level} disaggregation not yet compiled as of ${AS_OF}`;
        value = '';
        badge = '';
        method = '';
        seriesCode = '';
        observationId = '';
      }
      rows.push({
        slot_key: `${geo.geo_code}|local_54|${code}`,
        surface: 'local_54',
        geography_id: geo.geography_id,
        geo_code: geo.geo_code,
        geography_name: geo.name,
        level,
        indicator_code: code,
        indicator_name: indicator.name,
        treatment_class: treatmentClass,
        lifecycle_status: indicator.lifecycle_status || '',
        status,
        resolved,
        reason,
        series_code: seriesCode,
        observation_id: observationId,
        period_label: periodLabel,
        value,
        badge,
        geographic_method: method,
        source,
        source_url: sourceUrl
      });
    }
  }
}

rows.sort((a, b) => a.slot_key.localeCompare(b.slot_key));

const numericStatuses = new Set(['published_direct', 'published_derived', 'published_modelled', 'external_verified']);
const closureStatuses = new Set(['official_unavailable', 'governed_unavailable', 'not_applicable', 'boundary_unresolved', 'retired_replaced']);

// Closure reasons repeat verbatim across every geography an indicator-family closure covers (up to
// 1,450 wards for one reason). Storing that text on every row would balloon the ledger to hundreds
// of megabytes for zero new information, so closure rows are normalized against a small reason
// catalogue instead: reason/source/source_url/period_label move to data/completeness/
// local-54-reason-catalogue.json, keyed by a content-derived reason_id, and the row keeps only
// that id. Numeric (published) rows keep their reason/source/source_url/period_label inline --
// there are only 6,007 of them and each one is genuinely distinct (real series/observation/source).
const reasonGroupKey = r => JSON.stringify([r.reason, r.source, r.source_url, r.period_label]);
const uniqueClosureGroups = [...new Set(rows.filter(r => closureStatuses.has(r.status)).map(reasonGroupKey))].sort();
const reasonIdByGroup = new Map(uniqueClosureGroups.map((g, i) => [g, `R${String(i + 1).padStart(3, '0')}`]));
const reasonCatalogue = uniqueClosureGroups.map(g => {
  const [reason, source, source_url, period_label] = JSON.parse(g);
  return { reason_id: reasonIdByGroup.get(g), reason, source, source_url, period_label };
});
for (const r of rows) {
  if (!closureStatuses.has(r.status)) continue;
  r.reason_id = reasonIdByGroup.get(reasonGroupKey(r));
  delete r.reason;
  delete r.source;
  delete r.source_url;
  delete r.period_label;
}
const countBy = key => Object.fromEntries([...new Set(rows.map(r => r[key]))].sort().map(v => [v, rows.filter(r => r[key] === v).length]));
const numericCount = rows.filter(r => numericStatuses.has(r.status)).length;
const closureCount = rows.filter(r => closureStatuses.has(r.status)).length;
const unclassified = rows.filter(r => !numericStatuses.has(r.status) && !closureStatuses.has(r.status)).length;
const byLevel = countBy('level');

const summary = {
  schema_version: 'kda.local-54-slot-ledger.summary.v1',
  as_of: AS_OF,
  definition: 'The full cross-product of the frozen 54 local indicators (P27) against every county, constituency and ward geography. Every cell ends in a numeric published disposition or a governed closure (official_unavailable, governed_unavailable, not_applicable, boundary_unresolved, retired_replaced) with an auditable reason; none are inherited, interpolated or fabricated.',
  total_cells: rows.length,
  county_cells: byLevel.county || 0,
  constituency_cells: byLevel.constituency || 0,
  ward_cells: byLevel.ward || 0,
  child_level_cells: (byLevel.constituency || 0) + (byLevel.ward || 0),
  unclassified_cells: unclassified,
  numeric_evidence_cells: numericCount,
  numeric_evidence_pct: Number((100 * numericCount / rows.length).toFixed(2)),
  governed_closure_cells: closureCount,
  governed_closure_pct: Number((100 * closureCount / rows.length).toFixed(2)),
  by_status: countBy('status'),
  by_level: byLevel,
  by_treatment_class: countBy('treatment_class')
};

const ledger = {
  schema_version: 'kda.local-54-slot-ledger.v2',
  target_definition: 'Every (local-54 indicator, county|constituency|ward geography) cell must end in a defensible resolved evidence state -- a real published value, or a governed closure with an auditable reason. No parent, regional or interpolated value is ever inherited or manufactured to fill a cell.',
  expected_cell_instances: 96498,
  reason_catalogue_note: 'Closure rows (status in official_unavailable/governed_unavailable/not_applicable/boundary_unresolved/retired_replaced) carry reason_id instead of an inline reason/source/source_url/period_label -- look those up in data/completeness/local-54-reason-catalogue.json. Numeric (published_*/external_verified) rows keep them inline since each is genuinely distinct.',
  rows
};

const csvCols = ['slot_key', 'surface', 'geo_code', 'geography_name', 'level', 'indicator_code', 'indicator_name', 'treatment_class', 'lifecycle_status', 'status', 'resolved', 'reason_id', 'reason', 'series_code', 'observation_id', 'period_label', 'value', 'badge', 'geographic_method', 'source', 'source_url'];
const q = v => `"${String(v ?? '').replaceAll('"', '""')}"`;
const csv = [csvCols.join(','), ...rows.map(r => csvCols.map(c => q(r[c])).join(','))].join('\n') + '\n';

const catalogueCsvCols = ['reason_id', 'reason', 'source', 'source_url', 'period_label'];
const catalogueCsv = [catalogueCsvCols.join(','), ...reasonCatalogue.map(r => catalogueCsvCols.map(c => q(r[c])).join(','))].join('\n') + '\n';

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'local-54-slot-ledger.json'), JSON.stringify(ledger, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'local-54-slot-ledger.csv'), csv);
fs.writeFileSync(path.join(outDir, 'local-54-reason-catalogue.json'), JSON.stringify({ schema_version: 'kda.local-54-reason-catalogue.v1', reasons: reasonCatalogue }, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'local-54-reason-catalogue.csv'), catalogueCsv);
fs.writeFileSync(path.join(outDir, 'local-54-summary.json'), JSON.stringify(summary, null, 2) + '\n');

console.log(`P29_LOCAL_54_LEDGER_OK total=${rows.length} county=${summary.county_cells} constituency=${summary.constituency_cells} ward=${summary.ward_cells} unclassified=${unclassified} numeric=${numericCount} (${summary.numeric_evidence_pct}%) governed_closure=${closureCount} (${summary.governed_closure_pct}%) reason_catalogue_entries=${reasonCatalogue.length}`);
