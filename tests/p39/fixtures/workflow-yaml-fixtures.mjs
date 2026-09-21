export const PUSH_PLUS_DISPATCH_YAML = `name: Repository label governance

on:
  push:
    paths:
      - '.github/workflows/labels-governance.yml'
  workflow_dispatch:

permissions:
  contents: read
  issues: write

jobs:
  normalize-labels:
    runs-on: ubuntu-latest
    steps:
      - run: echo noop
`;

export const PULL_REQUEST_ONLY_YAML = `name: P23 cycle 1 30-way shards11-12 new4 terminal classification

on:
  pull_request:
    paths:
      - data/p23/p23-cycle1-terminal-classification-30way-shards11-12-new4.json
      - .github/workflows/p23-cycle1-terminal-classification-30way-shards11-12-new4.yml

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-24.04
    steps:
      - run: echo noop
`;

export const BROADENED_SHARED_GATE_YAML = `name: A workflow that was broadened after the P38 snapshot

on:
  pull_request:
    paths:
      - data/p23/p23-cycle1-terminal-classification-30way-shards11-12-new4.json
      - .github/workflows/p23-cycle1-terminal-classification-30way-shards11-12-new4.yml
      - data/indicators/registry/series.json

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-24.04
    steps:
      - run: echo noop
`;

export const NO_ON_BLOCK_YAML = `name: Malformed workflow with no on: key at all

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-24.04
    steps:
      - run: echo noop
`;
