#!/usr/bin/env python3
import argparse
import json
import pathlib
import subprocess

P23 = pathlib.Path('data/p23')
TERMINAL = {
    'verified',
    'denominator_mismatch',
    'arithmetic_mismatch',
    'source_unreadable',
    'partial_unresolved',
    'official_pdf_missing_results_pages',
}
FORBIDDEN_RESULT_KEYS = {
    'registered_voters', 'total_valid_votes', 'rejected_ballots', 'turnout_pct',
    'candidate_vote_sum', 'verified_value', 'source_verified', 'promotion_eligible',
    'promotion_state', 'explicit_materialization_authorized'
}


def load_json(path):
    return json.loads(pathlib.Path(path).read_text(encoding='utf-8'))


def scan_forbidden(value, where='root'):
    if isinstance(value, dict):
        bad = set(value) & FORBIDDEN_RESULT_KEYS
        if bad:
            raise SystemExit(f'forbidden result/promotion keys at {where}: {sorted(bad)}')
        for k, v in value.items():
            scan_forbidden(v, f'{where}.{k}')
    elif isinstance(value, list):
        for i, v in enumerate(value):
            scan_forbidden(v, f'{where}[{i}]')


def add_terminal(out, code, state, source):
    if not code or state not in TERMINAL:
        return
    out.setdefault(code, []).append({'state': state, 'source': source})


def terminal_evidence():
    """Mirror audit-turnout-terminal-coverage.py terminal-evidence rules exactly."""
    out = {}
    registry = P23 / 'turnout-salvage-review-outcomes.json'
    if registry.exists():
        doc = load_json(registry)
        for row in doc.get('outcomes', []):
            add_terminal(out, row.get('geo_code'), row.get('reason'), registry.name)

    for path in sorted(P23.glob('form34b-*-fresh-source-review.json')):
        doc = load_json(path)
        add_terminal(out, doc.get('geo_code'), doc.get('verification_state'), path.name)

    for path in sorted(P23.glob('p23-cycle1-terminal-classification-*.json')):
        doc = load_json(path)
        for row in doc.get('rows', []):
            add_terminal(out, row.get('geo_code'), row.get('verification_state'), path.name)
    return out


def canonical_worklist():
    triage = load_json(P23 / 'turnout-followup-triage.json')
    salvage = []
    seen = set()
    for path in sorted(P23.glob('turnout-salvage-tranche-*.json')):
        doc = load_json(path)
        for row in doc.get('tranche', {}).get('rows', []):
            geo = row['geo_code']
            if geo in seen:
                raise SystemExit(f'duplicate salvage geo_code: {geo}')
            seen.add(geo)
            salvage.append({'geo_code': geo, 'name': row['name'], 'queue': 'salvage'})

    if len(salvage) != 85:
        raise SystemExit(f'expected 85 governed salvage rows; saw {len(salvage)}')

    untouched = [
        {'geo_code': r['geo_code'], 'name': r['name'], 'queue': 'untouched'}
        for r in triage.get('genuinely_untouched', {}).get('constituencies', [])
    ]
    if len(untouched) != 24:
        raise SystemExit(f'expected 24 untouched rows; saw {len(untouched)}')

    canonical = salvage + untouched
    geos = [r['geo_code'] for r in canonical]
    if len(canonical) != 109 or len(geos) != len(set(geos)):
        raise SystemExit('canonical 109-row queue invariant failed')

    evidence = terminal_evidence()
    extraneous = sorted(set(evidence) - set(geos))
    if extraneous:
        raise SystemExit(f'terminal evidence outside canonical queue: {extraneous}')
    conflicts = {
        code: records for code, records in evidence.items()
        if len({r['state'] for r in records}) > 1
    }
    if conflicts:
        raise SystemExit(f'conflicting terminal states: {conflicts}')

    terminal_codes = set(evidence)
    rows = [r for r in canonical if r['geo_code'] not in terminal_codes]
    remaining_salvage = sum(1 for r in rows if r['queue'] == 'salvage')
    remaining_untouched = sum(1 for r in rows if r['queue'] == 'untouched')
    return rows, len(terminal_codes), remaining_salvage, remaining_untouched


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--shard', type=int, required=True)
    ap.add_argument('--shards', type=int, default=32)
    ap.add_argument('--output-root', required=True)
    args = ap.parse_args()
    if args.shards != 32 or not 0 <= args.shard < args.shards:
        raise SystemExit('this governed final cycle requires exactly 32 shards')

    rows, terminal_count, remaining_salvage_count, remaining_untouched_count = canonical_worklist()
    # The worklist is deliberately live: it is the exact complement of current
    # governed terminal evidence in the canonical 109-row queue. Do not freeze an
    # historical remainder count here; doing so makes later valid terminal batches
    # break evidence generation or tempt inheritance from excluded evidence classes.
    if terminal_count + len(rows) != 109:
        raise SystemExit(f'canonical coverage invariant failed: terminal={terminal_count} remaining={len(rows)}')
    if not rows:
        raise SystemExit('no governed terminal remainder: evidence cycle has nothing to process')
    assigned = [row for i, row in enumerate(rows) if i % args.shards == args.shard]
    root = pathlib.Path(args.output_root)
    root.mkdir(parents=True, exist_ok=True)

    results = []
    for row in assigned:
        out = root / row['geo_code']
        subprocess.run([
            'python3', 'scripts/p23/fresh-review-context-untouched-row.py',
            '--geo-code', row['geo_code'], '--name', row['name'], '--output-dir', str(out)
        ], check=True)
        manifest = load_json(out / 'review-context.json')
        if manifest['geo_code'] != row['geo_code'] or manifest['name'] != row['name']:
            raise SystemExit(f'identity mismatch for {row["geo_code"]}')
        gov = manifest['governance']
        if not (gov.get('no_inheritance') is True and gov.get('no_promotion') is True and
                gov.get('result_values_forbidden') is True and
                gov.get('canonical_turnout_value_written') is False and
                gov.get('required_render_dpi') == 250):
            raise SystemExit(f'governance mismatch for {row["geo_code"]}')
        pages = manifest.get('pages', [])
        if not pages or any(p.get('render_dpi') != 250 for p in pages):
            raise SystemExit(f'250-DPI page contract failed for {row["geo_code"]}')
        scan_forbidden(manifest, row['geo_code'])
        results.append({
            'geo_code': row['geo_code'],
            'name': row['name'],
            'queue': row['queue'],
            'state': 'fresh_review_context_ready_pending_independent_visual_review',
            'source_pdf_sha256': manifest['source_pdf_sha256'],
            'page_count': len(pages),
            'required_render_dpi': 250,
            'review_context_file': str(out / 'review-context.json'),
            'promotion_authorized': False,
            'canonical_turnout_written': False,
        })

    summary = {
        'schema_version': 'kda.p23.final-32way-evidence-cycle.v3',
        'shard': args.shard,
        'shards': args.shards,
        'governance': {
            'no_inheritance': True,
            'no_promotion': True,
            'result_values_forbidden': True,
            'required_render_dpi': 250,
            'independent_visual_review_still_required': True,
            'canonical_turnout_values_must_not_be_written': True,
            'terminal_coverage_rules_mirrored': True,
        },
        'worklist': {
            'terminal_covered_count': terminal_count,
            'remaining_salvage_count': remaining_salvage_count,
            'remaining_untouched_count': remaining_untouched_count,
            'total_remaining_evidence_rows': len(rows),
        },
        'rows': results,
    }
    scan_forbidden(summary)
    (root / 'shard-summary.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    print(f'P23_FINAL_32WAY shard={args.shard} assigned={len(assigned)} total_remaining={len(rows)} terminal_covered={terminal_count} no_promotion=true')


if __name__ == '__main__':
    main()
