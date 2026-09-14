#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib

TERMINAL_REVIEW_FIELDS = {
    'registered_voters': None,
    'candidate_vote_totals_in_source_column_order': None,
    'total_valid_votes': None,
    'rejected_ballots': None,
    'verification_state': None,
}


def load(path):
    return json.loads(pathlib.Path(path).read_text(encoding='utf-8'))


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--shard', type=int, required=True)
    ap.add_argument('--shards', type=int, default=30)
    ap.add_argument('--evidence-root', required=True)
    ap.add_argument('--artifact-metadata', required=True)
    ap.add_argument('--run-id', type=int, required=True)
    ap.add_argument('--head-sha', required=True)
    ap.add_argument('--output', required=True)
    args = ap.parse_args()

    if args.shards != 30 or not 0 <= args.shard < 30:
        raise SystemExit('governed review phase requires exactly 30 shards')
    if args.run_id != 34850237885:
        raise SystemExit('review packets must consume pinned evidence run 34850237885')
    if args.head_sha != '2d14b06d8bebfd4d22d275d52303fcfe2f57fd5b':
        raise SystemExit('review packets must consume the pinned evidence head SHA')

    root = pathlib.Path(args.evidence_root)
    summary_paths = list(root.rglob('shard-summary.json'))
    if len(summary_paths) != 1:
        raise SystemExit(f'expected exactly one shard-summary.json; saw {len(summary_paths)}')
    summary = load(summary_paths[0])
    if summary.get('schema_version') != 'kda.p23.final-30way-evidence-cycle.v1':
        raise SystemExit('unexpected evidence schema')
    if summary.get('shard') != args.shard or summary.get('shards') != 30:
        raise SystemExit('shard identity mismatch')

    gov = summary.get('governance', {})
    required = {
        'no_inheritance': True,
        'no_promotion': True,
        'result_values_forbidden': True,
        'required_render_dpi': 250,
        'independent_visual_review_still_required': True,
        'canonical_turnout_values_must_not_be_written': True,
        'terminal_coverage_rules_mirrored': True,
        'live_terminal_remainder': True,
    }
    for k, v in required.items():
        if gov.get(k) != v:
            raise SystemExit(f'governance mismatch: {k}')

    artifact = load(args.artifact_metadata)
    expected_name = f'p23-final-evidence-shard-{args.shard}'
    if artifact.get('name') != expected_name or artifact.get('expired') is not False:
        raise SystemExit('artifact identity/expiry mismatch')
    run = artifact.get('workflow_run', {})
    if run.get('id') != args.run_id or run.get('head_sha') != args.head_sha:
        raise SystemExit('artifact provenance mismatch')

    packets = []
    for row in summary.get('rows', []):
        if row.get('state') != 'fresh_review_context_ready_pending_independent_visual_review':
            raise SystemExit(f"row not review-ready: {row.get('geo_code')}")
        if row.get('required_render_dpi') != 250:
            raise SystemExit('row DPI mismatch')
        if row.get('promotion_authorized') is not False or row.get('canonical_turnout_written') is not False:
            raise SystemExit('promotion/canonical-write invariant failed')

        context_path = pathlib.Path(row['review_context_file'])
        # The stored path is the producer's absolute /tmp path; resolve by geo-code in downloaded artifact.
        matches = list(root.rglob(f"{row['geo_code']}/review-context.json"))
        if len(matches) != 1:
            raise SystemExit(f"missing/ambiguous review context for {row['geo_code']}: {len(matches)}")
        context_path = matches[0]
        context = load(context_path)
        cgov = context.get('governance', {})
        if not (cgov.get('no_inheritance') is True and cgov.get('no_promotion') is True and
                cgov.get('result_values_forbidden') is True and
                cgov.get('canonical_turnout_value_written') is False and
                cgov.get('required_render_dpi') == 250):
            raise SystemExit(f"context governance mismatch for {row['geo_code']}")
        if context.get('source_pdf_sha256') != row.get('source_pdf_sha256'):
            raise SystemExit(f"source PDF hash mismatch for {row['geo_code']}")

        pages = context.get('pages', [])
        if not pages:
            raise SystemExit(f"no rendered pages for {row['geo_code']}")
        page_packets = []
        for p in pages:
            if p.get('render_dpi') != 250:
                raise SystemExit(f"page DPI mismatch for {row['geo_code']}")
            image_name = pathlib.Path(p['image']).name
            image_matches = list(context_path.parent.rglob(image_name))
            if len(image_matches) != 1:
                raise SystemExit(f"missing/ambiguous rendered page {image_name} for {row['geo_code']}")
            image = image_matches[0]
            page_packets.append({
                'page_number': p.get('page_number'),
                'render_dpi': 250,
                'image_file': str(image.relative_to(root)),
                'image_sha256': sha256(image),
            })

        packets.append({
            'geo_code': row['geo_code'],
            'name': row['name'],
            'queue': row['queue'],
            'source_pdf_sha256': row['source_pdf_sha256'],
            'pages': page_packets,
            'review_state': 'ready_for_independent_visual_terminal_classification',
            'review_fields': dict(TERMINAL_REVIEW_FIELDS),
            'review_contract': {
                'human_or_independent_visual_review_required': True,
                'do_not_inherit_result_values': True,
                'candidate_sum_must_reconcile_to_total_valid_votes': True,
                'governed_ward_denominator_must_be_recomputed_independently': True,
                'allowed_terminal_states': [
                    'verified', 'denominator_mismatch', 'arithmetic_mismatch',
                    'source_unreadable', 'partial_unresolved',
                    'official_pdf_missing_results_pages'
                ],
                'promotion_eligible': False,
                'promotion_authorized': False,
                'canonical_turnout_written': False,
            },
        })

    packet = {
        'schema_version': 'kda.p23.30way-independent-review-packet.v1',
        'source_evidence': {
            'workflow_run_id': args.run_id,
            'head_sha': args.head_sha,
            'artifact_id': artifact['id'],
            'artifact_name': artifact['name'],
            'artifact_digest': artifact.get('digest'),
            'artifact_created_at': artifact.get('created_at'),
        },
        'shard': args.shard,
        'shards': 30,
        'governance': {
            'no_inheritance': True,
            'no_promotion': True,
            'required_render_dpi': 250,
            'independent_visual_review_required': True,
            'automatic_result_transcription_forbidden': True,
            'automatic_terminal_classification_forbidden': True,
            'promotion_authorized_by_this_packet': False,
            'canonical_turnout_value_written': False,
        },
        'rows': packets,
    }
    out = pathlib.Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(packet, indent=2) + '\n', encoding='utf-8')
    print(f"P23_REVIEW_PACKET_OK shard={args.shard} rows={len(packets)} artifact={artifact['id']} no_promotion=true")


if __name__ == '__main__':
    main()
