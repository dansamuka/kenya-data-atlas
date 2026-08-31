-- Kenya Data Atlas indicator, series and observation schema (PostgreSQL).
--
-- Implements spec sections 17 (indicator), 18A (series), 18B (unit and period),
-- 18C (series breaks), 20 (observation, two-axis quality model), 21 (vintages),
-- plus Placeholder Category Specification v2 lifecycle/profile taxonomy fields.
--
-- Design notes carried over from the geography schema remediation:
--   - quality is DERIVED from two orthogonal axes (geographic_method,
--     statistical_status), never stored as a third flat label that can drift.
--   - every observation resolves to series -> dataset -> agency (provenance.sql).
--     An observation whose dataset is not 'approved' or 'published' must not
--     be emitted by the build pipeline; this is enforced in code, not only
--     checked afterwards (see scripts/indicators/build-registry.mjs).

CREATE TYPE geographic_method AS ENUM ('direct', 'aggregated', 'interpolated', 'proxy', 'modelled');
CREATE TYPE statistical_status AS ENUM ('final', 'provisional', 'revised', 'projected', 'estimated', 'suppressed');
CREATE TYPE frequency AS ENUM ('daily', 'weekly', 'monthly', 'quarterly', 'annual', 'decennial', 'irregular', 'point_in_time');
CREATE TYPE period_type AS ENUM ('calendar_year', 'fiscal_year', 'quarter', 'fiscal_quarter', 'month', 'week', 'day', 'point_in_time');
CREATE TYPE price_basis AS ENUM ('nominal', 'constant', 'index', 'not_applicable');
CREATE TYPE series_status AS ENUM ('active', 'discontinued', 'superseded', 'draft');

-- ---------------------------------------------------------------- units
CREATE TABLE unit (
  unit_id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,              -- persons, kes, kes_million, percent, per_1000, index, ratio, km2
  name text NOT NULL,
  symbol text,
  dimension text NOT NULL CHECK (dimension IN ('count', 'currency', 'ratio', 'rate', 'index', 'area', 'duration', 'category', 'length', 'climate')),
  scale_factor numeric NOT NULL DEFAULT 1,  -- multiplier to the dimension's base unit
  decimal_places smallint NOT NULL DEFAULT 0,
  currency_code text                       -- ISO 4217, where dimension = currency
);

-- ------------------------------------------------------------ indicator
CREATE TABLE indicator (
  indicator_id uuid PRIMARY KEY,
  indicator_code text NOT NULL UNIQUE,
  name text NOT NULL,
  short_name text,
  description text NOT NULL,
  topic text NOT NULL,
  subtopic text,
  unit_id uuid NOT NULL REFERENCES unit(unit_id),
  -- Nullable by design (spec 17): population has no "better" direction, and
  -- ranking it must not be allowed to imply performance.
  higher_is_better boolean,
  preferred_frequency frequency,
  minimum_geo_level text CHECK (minimum_geo_level IN ('country', 'county', 'constituency', 'ward')),
  -- Below this denominator a rate is shown but excluded from rankings (spec 26.2).
  minimum_denominator numeric,
  methodology_url text,
  comparable boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,

  -- Placeholder Category Specification v2. A profile slot exists independently
  -- of whether a series has been ingested. Lifecycle is self-enforcing in the
  -- registry validator: planned/sourced => zero series; active => >=1 series.
  lifecycle_status text NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('planned', 'sourced', 'active', 'retired')),
  expected_source text,
  expected_source_url text,
  expected_availability_note text,
  tab text NOT NULL DEFAULT 'economy'
    CHECK (tab IN ('people', 'economy', 'health', 'finance', 'representation', 'infrastructure', 'resilience')),
  applies_to_levels text[] NOT NULL DEFAULT '{}'::text[],
  applies_to_geography_subset text,

  -- Implementation metadata for two binding cross-cutting rules in v2:
  -- sample-survey uncertainty must be rendered; sensitive indicators must not
  -- be turned into editorial "worst offender" rankings.
  requires_sampling_uncertainty boolean NOT NULL DEFAULT false,
  ranking_allowed boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (applies_to_levels <@ ARRAY['county','constituency','ward']::text[]),
  CHECK (tab <> 'resilience' OR applies_to_geography_subset IS NOT NULL)
);

-- ----------------------------------------------------------------- series
-- The central table: the unique combination of what is measured, where, how
-- often, in what units, and on what basis. Everything else hangs off this.
CREATE TABLE series (
  series_id uuid PRIMARY KEY,
  series_code text NOT NULL UNIQUE,         -- e.g. KDA-POP-TOTAL-KEN
  indicator_id uuid NOT NULL REFERENCES indicator(indicator_id),
  geography_id uuid NOT NULL,                -- resolves against geography.geography_id (separate schema)
  geography_taxonomy text NOT NULL DEFAULT 'electoral' CHECK (geography_taxonomy IN ('electoral', 'administrative', 'statistical', 'other')),
  boundary_version text,                     -- required when geography carries versioned boundaries

  frequency frequency NOT NULL,
  period_type period_type NOT NULL,
  unit_id uuid NOT NULL REFERENCES unit(unit_id),
  price_basis price_basis NOT NULL DEFAULT 'not_applicable',
  base_period text,                          -- required when price_basis IN ('constant','index')
  currency text,
  seasonal_adjustment text NOT NULL DEFAULT 'none' CHECK (seasonal_adjustment IN ('none', 'sa', 'trend')),
  transformation text NOT NULL DEFAULT 'level' CHECK (transformation IN ('level', 'rate', 'share', 'per_capita', 'growth')),

  -- Two independent axes; the A-E badge is DERIVED from these at render time,
  -- exactly as geography_geometry.quality_status is derived, never stored flat.
  geographic_method geographic_method NOT NULL,
  comparability_group text NOT NULL,          -- series sharing this key are safe to chart together (18C)

  dataset_id uuid NOT NULL,                   -- resolves against catalogue dataset_id
  agency_id uuid NOT NULL,                    -- resolves against catalogue agency_id
  methodology_url text,

  start_period text,
  end_period text,
  latest_observation_id uuid,
  observation_count integer NOT NULL DEFAULT 0,
  last_updated_at timestamptz,
  next_expected_release date,

  status series_status NOT NULL DEFAULT 'active',
  superseded_by_series_id uuid REFERENCES series(series_id),

  -- Comparable concept from an independent source/method. This is display metadata,
  -- never a merge: both series retain their own lifecycle, provenance and observations.
  comparable_alternate_series_id uuid REFERENCES series(series_id),

  CHECK (price_basis NOT IN ('constant', 'index') OR base_period IS NOT NULL),
  UNIQUE (indicator_id, geography_id, boundary_version, frequency, unit_id, price_basis, seasonal_adjustment, transformation)
);

CREATE INDEX series_indicator_idx ON series(indicator_id);
CREATE INDEX series_geography_idx ON series(geography_id);
CREATE INDEX series_comparability_idx ON series(comparability_group);
CREATE INDEX series_alternate_idx ON series(comparable_alternate_series_id);

-- ------------------------------------------------------------ series_break
-- Records a methodology, rebasing, classification or boundary discontinuity.
-- A chart MUST render a visible break here, never an unbroken line through it.
CREATE TABLE series_break (
  break_id uuid PRIMARY KEY,
  series_id uuid NOT NULL REFERENCES series(series_id),
  break_period text NOT NULL,                 -- first period on the new basis
  break_type text NOT NULL CHECK (break_type IN ('rebasing', 'methodology', 'classification', 'boundary', 'source_change', 'definition')),
  description text NOT NULL,
  source_url text,
  comparable_before boolean NOT NULL DEFAULT false,
  splice_factor numeric                        -- only where the producing agency published one
);

-- ---------------------------------------------------------------- observation
CREATE TABLE observation (
  observation_id uuid PRIMARY KEY,
  series_id uuid NOT NULL REFERENCES series(series_id),
  geography_id uuid NOT NULL,                  -- denormalised read optimisation only (20.2);
                                                -- MUST equal series.geography_id, enforced below
  boundary_version text,

  period_start date NOT NULL,
  period_end date NOT NULL,
  period_type period_type NOT NULL,
  period_label text NOT NULL,                  -- canonical human string, generated never typed

  value numeric,
  text_value text,
  CHECK ((value IS NOT NULL AND text_value IS NULL) OR (value IS NULL AND NULLIF(BTRIM(text_value), '') IS NOT NULL)),

  -- Two orthogonal axes. The A-E badge is derived from these plus series.geographic_method.
  geographic_method geographic_method NOT NULL,
  statistical_status statistical_status NOT NULL,

  source_release_id uuid,                      -- resolves against catalogue release_id
  source_dataset_id uuid NOT NULL,             -- resolves against catalogue dataset_id
  source_table text,
  source_sheet text,
  source_page text,
  source_row_label text,
  source_url text NOT NULL,

  published_at date,
  ingested_at timestamptz NOT NULL DEFAULT now(),

  vintage_id uuid,
  supersedes_observation_id uuid REFERENCES observation(observation_id),

  lower_bound numeric,
  upper_bound numeric,
  confidence_level numeric,
  standard_error numeric,
  sample_size integer,

  suppression_reason text,
  crosswalk_id uuid,                           -- required for interpolated geographic transforms

  notes text,
  pipeline_run_id text,

  CHECK (statistical_status <> 'suppressed' OR suppression_reason IS NOT NULL),
  CHECK (geographic_method <> 'interpolated' OR crosswalk_id IS NOT NULL),
  CHECK (geographic_method <> 'proxy' OR notes IS NOT NULL),
  UNIQUE (series_id, period_start, period_end, vintage_id)
);

CREATE INDEX observation_series_idx ON observation(series_id);
CREATE INDEX observation_period_idx ON observation(series_id, period_start);

-- observation.geography_id must always agree with its series (20.2). Enforced as a
-- trigger rather than a cross-table CHECK, which PostgreSQL does not support directly.
CREATE OR REPLACE FUNCTION assert_observation_geography_matches_series() RETURNS trigger AS $$
DECLARE series_geo uuid; series_boundary text;
BEGIN
  SELECT geography_id, boundary_version INTO series_geo, series_boundary FROM series WHERE series_id = NEW.series_id;
  IF series_geo IS DISTINCT FROM NEW.geography_id THEN
    RAISE EXCEPTION 'observation %: geography_id disagrees with series %', NEW.observation_id, NEW.series_id;
  END IF;
  IF series_boundary IS DISTINCT FROM NEW.boundary_version THEN
    RAISE EXCEPTION 'observation %: boundary_version disagrees with series %', NEW.observation_id, NEW.series_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER observation_geography_matches_series
  BEFORE INSERT OR UPDATE ON observation
  FOR EACH ROW EXECUTE FUNCTION assert_observation_geography_matches_series();
