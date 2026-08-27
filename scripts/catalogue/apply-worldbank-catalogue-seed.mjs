import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const write = async (p, value) => writeFile(path.join(root, p), JSON.stringify(value, null, 2) + '\n');

const agencyPath = 'data/catalogue/seed/agencies.json';
const sourcePath = 'data/catalogue/seed/sources.json';
const datasetPath = 'data/catalogue/seed/datasets.json';
const [agencies, sources, datasets] = await Promise.all([read(agencyPath), read(sourcePath), read(datasetPath)]);

function upsert(rows, key, row) {
  const i = rows.findIndex(x => x[key] === row[key]);
  if (i >= 0) rows[i] = { ...rows[i], ...row };
  else rows.push(row);
}

upsert(agencies, 'code', {
  code: 'WB',
  name: 'World Bank Group',
  abbreviation: 'World Bank',
  agency_type: 'international_organization',
  official_url: 'https://www.worldbank.org/',
  jurisdiction: 'International',
  description: 'International development institution and publisher of World Development Indicators. In the Atlas, WDI is treated as a secondary harmonising compiler, never as a Kenyan primary statistical agency.'
});

upsert(sources, 'code', {
  code: 'WB-WDI',
  agency_code: 'WB',
  name: 'World Development Indicators',
  source_type: 'public_api',
  landing_page_url: 'https://data.worldbank.org/country/kenya',
  expected_cadence: 'indicator_specific_irregular',
  source_priority: 'medium',
  access_method: 'public_api',
  reuse_status: 'approved_cc_by_4_0',
  licence_name: 'CC BY 4.0',
  licence_url: 'https://datacatalog.worldbank.org/public-licenses',
  attribution_text: 'Source: World Bank, World Development Indicators',
  assessment_status: 'approved',
  assessment_note: 'National-only WDI integration. World Bank is a secondary harmonising compiler; Atlas badge A is prohibited for this source family.'
});

const common = {
  source_code: 'WB-WDI',
  geographic_coverage: ['country'],
  frequency: 'annual_or_irregular',
  publication_status: 'published'
};
const wbDatasets = [
  {
    code: 'DS-WB-SOCIAL-INDICATORS',
    ...common,
    title: 'World Development Indicators — Kenya social indicators',
    description: 'National social indicators for Kenya retrieved from the World Bank WDI API.',
    topic: 'Social',
    known_limitations: 'National only. Includes harmonised, projected and modelled series. Values must not be relabelled as county, constituency or ward statistics. Population projection is distinct from KNBS census enumeration.'
  },
  {
    code: 'DS-WB-ECONOMIC-INDICATORS',
    ...common,
    title: 'World Development Indicators — Kenya economic indicators',
    description: 'National economic indicators for Kenya retrieved from the World Bank WDI API.',
    topic: 'Economy',
    known_limitations: 'National only. WDI harmonisation can differ from KNBS/CBK definitions and vintages. WB annual inflation is background context and must not displace the monthly KNBS headline. Remittances are held from activation pending primary-source CBK treatment.'
  },
  {
    code: 'DS-WB-ENVIRONMENT-INDICATORS',
    ...common,
    title: 'World Development Indicators — Kenya environment and infrastructure indicators',
    description: 'National environment, infrastructure and service-access indicators for Kenya retrieved from the World Bank WDI API.',
    topic: 'Environment',
    known_limitations: 'National only. Access-to-electricity can be linked to a Kenyan series only when the Kenyan alternate is active and genuinely comparable.'
  },
  {
    code: 'DS-WB-INSTITUTIONS-INDICATORS',
    ...common,
    title: 'World Development Indicators — Kenya institutions indicators',
    description: 'National institutional, digital, public-safety, representation and investment indicators for Kenya retrieved from the World Bank WDI API.',
    topic: 'Institutions',
    known_limitations: 'National only. Composite/index indicators require explicit methodology disclosure. Internet-use alternates must not be linked to Communications Authority data until a CA series is actually ingested.'
  }
];
for (const row of wbDatasets) upsert(datasets, 'code', row);

await Promise.all([write(agencyPath, agencies), write(sourcePath, sources), write(datasetPath, datasets)]);
console.log(`World Bank catalogue seed applied: agency=WB, source=WB-WDI, datasets=${wbDatasets.length}`);
