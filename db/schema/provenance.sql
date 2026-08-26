-- Phase 2 source, dataset, release and file provenance schema.
CREATE TYPE assessment_status AS ENUM ('not_assessed', 'in_review', 'approved', 'approved_with_conditions', 'evaluation_only', 'rejected');
CREATE TYPE publication_status AS ENUM ('blocked', 'evaluation', 'approved', 'published', 'withdrawn', 'superseded');

CREATE TABLE agency (
  agency_id uuid PRIMARY KEY,
  agency_code text NOT NULL UNIQUE,
  name text NOT NULL,
  abbreviation text,
  agency_type text NOT NULL,
  official_url text NOT NULL,
  jurisdiction text,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE source (
  source_id uuid PRIMARY KEY,
  source_code text NOT NULL UNIQUE,
  agency_id uuid NOT NULL REFERENCES agency(agency_id),
  name text NOT NULL,
  source_type text NOT NULL,
  landing_page_url text NOT NULL,
  expected_cadence text,
  source_priority text NOT NULL,
  access_method text,
  reuse_status text NOT NULL,
  licence_name text,
  licence_url text,
  attribution_text text,
  assessment_status assessment_status NOT NULL,
  assessment_note text,
  review_due date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dataset (
  dataset_id uuid PRIMARY KEY,
  dataset_code text NOT NULL UNIQUE,
  source_id uuid NOT NULL REFERENCES source(source_id),
  title text NOT NULL,
  description text NOT NULL,
  topic text NOT NULL,
  geographic_coverage text[] NOT NULL,
  temporal_coverage_note text,
  frequency text,
  methodology_url text,
  licence_name text,
  publication_status publication_status NOT NULL,
  known_limitations text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE release (
  release_id uuid PRIMARY KEY,
  release_code text NOT NULL UNIQUE,
  dataset_id uuid NOT NULL REFERENCES dataset(dataset_id),
  title text NOT NULL,
  reference_period_start date,
  reference_period_end date,
  published_at timestamptz,
  discovered_at timestamptz NOT NULL,
  ingested_at timestamptz,
  release_url text NOT NULL,
  release_status publication_status NOT NULL,
  version_label text,
  release_notes text,
  supersedes_release_id uuid REFERENCES release(release_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE source_file (
  source_file_id uuid PRIMARY KEY,
  release_id uuid NOT NULL REFERENCES release(release_id),
  original_url text NOT NULL,
  original_filename text NOT NULL,
  archived_path text,
  retrieved_at timestamptz,
  mime_type text,
  byte_size bigint,
  sha256 text,
  git_blob_sha text,
  licence_name text,
  extraction_status text NOT NULL,
  source_table text,
  source_sheet text,
  source_page text,
  notes text,
  CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE (release_id, original_url, original_filename)
);

CREATE TABLE lineage_edge (
  lineage_edge_id uuid PRIMARY KEY,
  from_entity_type text NOT NULL,
  from_entity_id uuid NOT NULL,
  to_entity_type text NOT NULL,
  to_entity_id uuid NOT NULL,
  relationship text NOT NULL,
  transformation_version text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_entity_type IN ('agency','source','dataset','release','source_file','indicator','series','observation')),
  CHECK (to_entity_type IN ('agency','source','dataset','release','source_file','indicator','series','observation'))
);

CREATE INDEX source_agency_idx ON source(agency_id);
CREATE INDEX dataset_source_idx ON dataset(source_id);
CREATE INDEX release_dataset_idx ON release(dataset_id);
CREATE INDEX source_file_release_idx ON source_file(release_id);
CREATE INDEX lineage_from_idx ON lineage_edge(from_entity_type, from_entity_id);
CREATE INDEX lineage_to_idx ON lineage_edge(to_entity_type, to_entity_id);

