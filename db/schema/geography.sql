-- Kenya Data Atlas canonical geography schema (PostgreSQL + PostGIS)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE geography_level AS ENUM ('country', 'county', 'constituency', 'ward');
CREATE TYPE geography_system AS ENUM ('electoral', 'administrative', 'statistical', 'other');

CREATE TABLE geography (
  geography_id uuid PRIMARY KEY,
  geo_code text NOT NULL UNIQUE,
  name text NOT NULL,
  slug text NOT NULL,
  level geography_level NOT NULL,
  geography_system geography_system NOT NULL DEFAULT 'electoral',
  parent_id uuid REFERENCES geography(geography_id),
  county_code smallint,
  constituency_code smallint,
  ward_code integer,
  valid_from date,
  valid_to date,
  source_id text NOT NULL,
  official boolean NOT NULL DEFAULT false,
  registry_status text NOT NULL CHECK (registry_status IN ('verified', 'provisional', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((level = 'country' AND parent_id IS NULL) OR (level <> 'country' AND parent_id IS NOT NULL)),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  UNIQUE (parent_id, slug)
);

CREATE INDEX geography_parent_idx ON geography(parent_id);
CREATE INDEX geography_level_idx ON geography(level);
CREATE INDEX geography_county_idx ON geography(county_code);
CREATE INDEX geography_constituency_idx ON geography(constituency_code);

CREATE TABLE geography_alias (
  alias_id uuid PRIMARY KEY,
  geography_id uuid NOT NULL REFERENCES geography(geography_id),
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  alias_type text NOT NULL CHECK (alias_type IN ('canonical', 'casefolded', 'punctuation', 'historical', 'common', 'source')),
  language text NOT NULL DEFAULT 'en',
  source_id text,
  valid_from date,
  valid_to date,
  UNIQUE (geography_id, normalized_alias)
);

CREATE INDEX geography_alias_lookup_idx ON geography_alias(normalized_alias);

-- boundary_version records the LEGAL DELIMITATION ERA, never the source file.
-- All current geometry describes the 2012 first review ('2012-01'). IEBC confirmed in
-- January 2026 that no constituency or ward boundary changes before the August 2027
-- general election, so '2012-01' is the only era in scope; the next era is created only
-- when delimitation actually occurs.
--
-- Provenance is separate: geometry_source_id says where the coordinates came from and
-- geometry_revision increments when the coordinates improve. Replacing HDX geometry
-- with IEBC-issued geometry for the same boundaries bumps the revision, NOT the era,
-- so observations attached to '2012-01' are never orphaned.
CREATE TABLE geography_geometry (
  geometry_id uuid PRIMARY KEY,
  geography_id uuid NOT NULL REFERENCES geography(geography_id),
  boundary_version text NOT NULL,
  geometry_revision integer NOT NULL DEFAULT 1,
  geometry_source_id text NOT NULL,
  derivation text NOT NULL DEFAULT 'source' CHECK (derivation IN ('source', 'dissolved_from_children')),
  valid_from date,
  valid_to date,
  source_id text NOT NULL,
  source_url text NOT NULL,
  source_crs text NOT NULL,
  geometry geometry(MultiPolygon, 4326),
  simplified_geometry geometry(MultiPolygon, 4326),
  centroid geometry(Point, 4326),
  area_sq_km numeric,
  geometry_hash text,
  -- Derived from match method and measured containment, never assigned flat.
  quality_status text NOT NULL CHECK (quality_status IN (
    'pending', 'validated_external', 'validated_external_with_review',
    'provisional', 'derived_validated', 'derived_provisional', 'rejected', 'superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (geography_id, boundary_version, geometry_revision),
  CONSTRAINT geometry_must_be_valid CHECK (geometry IS NULL OR ST_IsValid(geometry)),
  CONSTRAINT geometry_not_degenerate CHECK (geometry IS NULL OR ST_Area(geometry) > 1e-5)
);

-- Only one revision per era may be current.
CREATE UNIQUE INDEX geography_geometry_current_idx
  ON geography_geometry(geography_id, boundary_version)
  WHERE valid_to IS NULL;

CREATE INDEX geography_geometry_geom_idx ON geography_geometry USING gist(geometry);
CREATE INDEX geography_geometry_simplified_idx ON geography_geometry USING gist(simplified_geometry);

-- Crosswalks are explicit: no administrative area is assumed to equal an electoral area.
--
-- Source and target carry their OWN boundary versions: a crosswalk built between 2012
-- wards and 2019 census sub-locations is invalid once either side changes, and that
-- must be expressible rather than implied.
CREATE TABLE geography_crosswalk (
  crosswalk_id uuid PRIMARY KEY,
  source_geography_id uuid NOT NULL REFERENCES geography(geography_id),
  source_boundary_version text NOT NULL,
  target_geography_id uuid NOT NULL REFERENCES geography(geography_id),
  target_boundary_version text NOT NULL,
  method text NOT NULL CHECK (method IN (
    'exact_nesting', 'population_weighted_areal', 'area_weighted',
    'household_weighted', 'building_weighted', 'manual')),
  weight numeric NOT NULL,
  weight_basis text,
  weight_reference text,
  uncertainty_note text,
  -- Crosswalks are invisible in the UI, look like data, and propagate into every
  -- derived indicator that uses them. They are the highest-risk artefact in the
  -- system and must never be published without a named human reviewer.
  created_by text NOT NULL,
  reviewed_by text,
  reviewed_at timestamptz,
  valid_from date,
  valid_to date,
  CHECK (weight >= 0 AND weight <= 1),
  CHECK (method = 'exact_nesting' OR weight_basis IS NOT NULL),
  UNIQUE (source_geography_id, source_boundary_version, target_geography_id, target_boundary_version)
);

CREATE INDEX geography_crosswalk_source_idx ON geography_crosswalk(source_geography_id);
CREATE INDEX geography_crosswalk_target_idx ON geography_crosswalk(target_geography_id);

-- Weights must partition the source geography exactly. Enforced as a deferred
-- constraint trigger so a crosswalk set can be inserted in one transaction.
CREATE OR REPLACE FUNCTION assert_crosswalk_weights_sum_to_one() RETURNS trigger AS $$
DECLARE total numeric;
BEGIN
  SELECT SUM(weight) INTO total FROM geography_crosswalk
   WHERE source_geography_id = NEW.source_geography_id
     AND source_boundary_version = NEW.source_boundary_version
     AND target_boundary_version = NEW.target_boundary_version;
  IF ABS(total - 1) > 1e-6 THEN
    RAISE EXCEPTION 'Crosswalk weights for source % sum to %, expected 1.0', NEW.source_geography_id, total;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER geography_crosswalk_weights_sum
  AFTER INSERT OR UPDATE ON geography_crosswalk
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_crosswalk_weights_sum_to_one();

-- A recorded, reviewable repair of a defect in a source transcription.
-- Corrections are data, never code: every repair carries evidence and a reviewer.
CREATE TABLE source_correction (
  correction_id text PRIMARY KEY,
  scope text NOT NULL CHECK (scope IN ('county', 'constituency', 'ward')),
  match_county text NOT NULL,
  match_name text NOT NULL,
  field text NOT NULL,
  from_value text NOT NULL,
  to_value text NOT NULL,
  reason text NOT NULL,
  evidence text NOT NULL,
  applied_by text NOT NULL,
  applied_on date NOT NULL
);
