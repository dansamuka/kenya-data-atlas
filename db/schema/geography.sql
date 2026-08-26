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

CREATE TABLE geography_geometry (
  geometry_id uuid PRIMARY KEY,
  geography_id uuid NOT NULL REFERENCES geography(geography_id),
  boundary_version text NOT NULL,
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
  quality_status text NOT NULL CHECK (quality_status IN ('pending', 'validated', 'rejected', 'superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (geography_id, boundary_version)
);

CREATE INDEX geography_geometry_geom_idx ON geography_geometry USING gist(geometry);
CREATE INDEX geography_geometry_simplified_idx ON geography_geometry USING gist(simplified_geometry);

-- Crosswalks are explicit: no administrative area is assumed to equal an electoral area.
CREATE TABLE geography_crosswalk (
  crosswalk_id uuid PRIMARY KEY,
  source_geography_id uuid NOT NULL REFERENCES geography(geography_id),
  target_geography_id uuid NOT NULL REFERENCES geography(geography_id),
  method text NOT NULL,
  weight numeric,
  boundary_version text NOT NULL,
  reference_dataset text,
  uncertainty_note text,
  valid_from date,
  valid_to date,
  CHECK (weight IS NULL OR (weight >= 0 AND weight <= 1))
);

