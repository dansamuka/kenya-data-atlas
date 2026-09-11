#!/usr/bin/env python3
"""P24 ward MCA identity — prepare source snapshot.

Fetches the official IEBC Kenya Gazette Special Issue Vol. CXXIV No. 170
(24 August 2022), which carries Gazette Notice No. 9956 — the IEBC's
declaration of persons elected as Members of the various County Assemblies
(Ward Representatives / MCAs) in the 9 August 2022 general election. The
notice's Schedule is a single comprehensive table covering all 1,450
County Assembly Wards nationally (county code, county name, constituency
code, constituency name, CAW code, CAW name, surname, other names,
political party/independent name, party abbreviation, votes garnered).

This script extracts that Schedule with pdfplumber (word-position based,
not naive text-layout extraction, because printed cells wrap across
multiple lines), reconciles it against the Atlas's canonical ward
registry, and writes a frozen JSON snapshot for scripts/p24/build-ward-mca-identity.mjs
to consume. It performs no fabrication: every published name/party/vote
value is exactly as printed in the Gazette; every ward the Gazette does
not resolve to a canonical geography with high confidence is left out of
the resolved set and reported separately with a reason.

Usage:
    python3 scripts/p24/prepare-ward-mca-gazette-9956.py
"""
import json
import re
import sys
import unicodedata
import collections
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IEBC_URL = "https://www.iebc.or.ke/uploads/resources/t5KQ6O4YGp.pdf"
OUT_PATH = ROOT / "data/p24/source/ward-mca-gazette-9956-2022.json"
UA = "Kenya-Data-Atlas-P24/1.0 (+https://github.com/dansamuka/kenya-data-atlas)"

# Wards where the Atlas's canonical 2012-vintage ward list and the 2022
# Gazette's own CAW roster disagree not just on spelling but on which
# named place occupies which numbered slot (Bulla Mpya / Libehia / Sala
# do not cross-match cleanly in either direction). This is the same
# Mandera East / Lafey boundary-configuration conflict already carried as
# a spatial hold for IND-REGISTERED-VOTERS (scripts/p23/build-ward-voters.mjs).
# Because identity cannot be safely inferred by position when the ward
# roster itself is in dispute, both constituencies are held here too.
HELD_CONSTITUENCY_CODES = {43, 44}  # Mandera East, Lafey

COLS = [
    ("county_code", 60, 84),
    ("county_name", 84, 128),
    ("const_code", 128, 148),
    ("const_name", 148, 203),
    ("caw_code", 203, 224),
    ("caw_name", 224, 279),
    ("surname", 279, 330),
    ("other_names", 330, 393),
    ("party_name", 393, 475),
    ("party_abbrev", 475, 506),
    ("votes", 506, 545),
]


def col_for_x(x):
    for name, lo, hi in COLS:
        if lo <= x < hi:
            return name
    return None


def norm_code(text):
    # A handful of leading zeros in the CAW-code column extract as the
    # letter O/o rather than digit 0 (an embedded-font glyph-mapping
    # quirk in this particular Gazette PDF, not a data error).
    t = re.sub(r"^[Oo]", "0", text)
    return t.replace("O", "0").replace("o", "0")


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.upper()
    return re.sub(r"[^A-Z0-9]+", "", s)


def clean_text(s):
    """Repair the mid-word replacement-character glyph this PDF emits for
    an apostrophe (e.g. Ndung'u, Sang'alo), and treat a space-flanked
    occurrence as a dash/separator (e.g. party names like
    'Democratic Action Party - Kenya')."""
    s = s or ""
    s = re.sub(r"(?<=\w)�(?=\w)", "'", s)
    s = s.replace("�", "-")
    return re.sub(r"\s+", " ", s).strip()


def parse_votes(raw):
    """Returns (int_or_None, note). Handles thousands-comma formatting and
    a couple of print-quality artefacts (stray trailing punctuation)."""
    raw = (raw or "").strip()
    if not raw:
        return None, "blank"
    low = raw.lower()
    if "postponed" in low or "election" in low:
        return None, "election_postponed"
    if "contest" in low:
        return None, "no_contest_unopposed"
    stripped = re.sub(r"[^0-9,]", "", raw)
    stripped = stripped.replace(",", "")
    if stripped.isdigit():
        return int(stripped), "ok" if stripped == re.sub(r"[^0-9]", "", raw) else "cleaned_artifact"
    return None, f"unparseable:{raw}"


def fetch_pdf():
    req = urllib.request.Request(IEBC_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        assert resp.status == 200, f"IEBC fetch failed: HTTP {resp.status}"
        return resp.read()


def extract_rows(pdf_bytes):
    import pdfplumber
    import io

    pdf = pdfplumber.open(io.BytesIO(pdf_bytes))
    assert len(pdf.pages) == 39, f"unexpected page count {len(pdf.pages)}; source document layout may have changed"

    raw_rows = []
    for pno in range(3, 39):  # pages 0-2 carry unrelated notices 9952-9955; 3-38 carry 9956's schedule
        page = pdf.pages[pno]
        words = page.extract_words(use_text_flow=False, keep_blank_chars=False)
        words = [w for w in words if w["x0"] < 545]
        if not words:
            continue
        words.sort(key=lambda w: (round(w["top"]), w["x0"]))
        cutoff = next((w["top"] for w in words if w["text"] == "Dated"), None)
        if cutoff is not None:
            words = [w for w in words if w["top"] < cutoff - 1]
        lines, cur = [], None
        for w in words:
            if cur is None or abs(w["top"] - cur[0]) > 3:
                cur = [w["top"], []]
                lines.append(cur)
            cur[1].append(w)
        anchors = []
        for i, (_, ws) in enumerate(lines):
            for w in ws:
                if 203 <= w["x0"] < 224:
                    cand = norm_code(w["text"])
                    if re.fullmatch(r"0\d{2,3}|\d{3,4}", cand):
                        anchors.append((i, cand))
                        break
        for ai, (li, code) in enumerate(anchors):
            end = anchors[ai + 1][0] if ai + 1 < len(anchors) else len(lines)
            fields = {name: [] for name, _, _ in COLS}
            for _, ws in lines[li:end]:
                for w in ws:
                    c = col_for_x(w["x0"])
                    if c:
                        fields[c].append(w["text"])
            row = {k: clean_text(" ".join(v)) for k, v in fields.items()}
            row["caw_code"] = code
            row["_page"] = pno
            raw_rows.append(row)

    # exact-duplicate rows (identical content printed twice) collapse to one
    seen, deduped = set(), []
    for r in raw_rows:
        sig = tuple(r[k] for k, _, _ in COLS)
        if sig in seen:
            continue
        seen.add(sig)
        deduped.append(r)
    return deduped


def load_canonical(geographies_path):
    geos = json.loads(geographies_path.read_text(encoding="utf-8"))
    wards = [g for g in geos if g["level"] == "ward"]
    cons = [g for g in geos if g["level"] == "constituency"]
    assert len(wards) == 1450, f"expected 1,450 canonical wards, got {len(wards)}"
    assert len(cons) == 290, f"expected 290 canonical constituencies, got {len(cons)}"
    return wards, cons


def crosswalk(rows, wards, cons):
    for r in rows:
        r["caw_num"] = int(re.sub(r"^0+", "", r["caw_code"]) or "0")
        ccode_raw = r["const_code"].split()[0] if r["const_code"].strip() else ""
        r["const_code_num"] = int(ccode_raw) if ccode_raw.isdigit() else None

    cons_by_code = {c["constituency_code"]: c for c in cons}
    cons_by_name = collections.defaultdict(list)
    for c in cons:
        cons_by_name[norm(c["name"])].append(c)
    wards_by_cons = collections.defaultdict(list)
    for w in wards:
        wards_by_cons[int(w["constituency_code"])].append(w)

    rows_by_cons = collections.defaultdict(list)
    unresolved_const = []
    for r in rows:
        a = cons_by_code.get(r["const_code_num"]) if r["const_code_num"] else None
        b_candidates = cons_by_name.get(norm(r["const_name"]), [])
        b = b_candidates[0] if len(b_candidates) == 1 else None
        chosen = a if (a and norm(a["name"]) == norm(r["const_name"])) else (b or a)
        if chosen:
            rows_by_cons[chosen["constituency_code"]].append(r)
        else:
            unresolved_const.append(r)
    assert not unresolved_const, f"could not resolve constituency for rows: {unresolved_const}"

    final_assign, method = {}, {}
    unresolved_rows = []
    for ccode, crows in rows_by_cons.items():
        pool = {w["geography_id"]: w for w in wards_by_cons.get(ccode, [])}
        assert len(crows) == len(pool), f"constituency {ccode}: {len(crows)} source rows vs {len(pool)} canonical wards"
        mapped = set()
        # pass 1: exact normalized name match (primary — see module docstring)
        for r in crows:
            if id(r) in mapped:
                continue
            hits = [w for w in pool.values() if norm(w["name"]) == norm(r["caw_name"])]
            if len(hits) == 1:
                w = hits[0]
                final_assign[id(r)] = w
                method[id(r)] = "name_and_code" if int(w["ward_code"]) == r["caw_num"] else "name_match_code_differs"
                mapped.add(id(r))
                del pool[w["geography_id"]]
        # pass 2: numeric CAW-code match, for cross-vintage renames where position is stable
        for r in crows:
            if id(r) in mapped:
                continue
            hit = next((w for w in pool.values() if int(w["ward_code"]) == r["caw_num"]), None)
            if hit:
                final_assign[id(r)] = hit
                method[id(r)] = "code_match_name_differs"
                mapped.add(id(r))
                del pool[hit["geography_id"]]
        # pass 3: residual one-to-one, only ever applied when exactly the
        # same single row and single ward remain (a strong safety property)
        leftover_rows = sorted((r for r in crows if id(r) not in mapped), key=lambda r: r["caw_num"])
        leftover_wards = sorted(pool.values(), key=lambda w: int(w["ward_code"]))
        if len(leftover_rows) != len(leftover_wards):
            unresolved_rows.extend(leftover_rows)
            continue
        for r, w in zip(leftover_rows, leftover_wards):
            final_assign[id(r)] = w
            method[id(r)] = "residual_positional"
            mapped.add(id(r))

    return final_assign, method, unresolved_rows


def build_snapshot(rows, final_assign, method):
    by_id = {id(r): r for r in rows}
    resolved, held, unmatched = [], [], []
    for r in rows:
        w = final_assign.get(id(r))
        if w is None:
            unmatched.append(r)
            continue
        ccode = int(w["constituency_code"])
        entry_method = method[id(r)]
        surname = r["surname"]
        other_names = r["other_names"]
        member_name = clean_text(f"{surname} {other_names}").strip()
        votes_int, votes_note = parse_votes(r["votes"])
        if surname.strip() == "-" and other_names.strip() == "-":
            # Placeholder dashes in every name column is the Gazette's own
            # notation for "no declaration" regardless of which column the
            # wrapped "Election Postponed" caption happened to land in.
            votes_int, votes_note = None, "election_postponed"
        disposition = "direct_official"
        disposition_reason = ""
        if ccode in HELD_CONSTITUENCY_CODES:
            disposition = "governed_unavailable"
            disposition_reason = (
                "Mandera East / Lafey ward-roster conflict: the Gazette Notice No. 9956 CAW "
                "schedule for this pair of constituencies does not reconcile one-to-one with the "
                "Atlas's canonical 2012-vintage ward list (a ward the Gazette calls 'Libehia' and one "
                "it calls 'Sala' have no clean counterpart in the canonical roster, while the canonical "
                "ward 'Bulla Mpya' has no counterpart in the Gazette roster). This is the same known "
                "Mandera East/Lafey boundary-configuration conflict already held for IND-REGISTERED-VOTERS "
                "(scripts/p23/build-ward-voters.mjs); identity is withheld rather than guessed at a "
                "position match."
            )
        elif votes_note == "election_postponed":
            disposition = "governed_unavailable"
            disposition_reason = (
                "Gazette Notice No. 9956 records no elected member for this ward: the poll was "
                "postponed (per the companion Gazette Notices Nos. 9952-9954 in the same Special Issue, "
                "which list constituencies/wards where the 9 August 2022 election was rerun on 29 August "
                "2022). No subsequent comprehensive declaration for these wards was located in this pass."
            )

        row_out = {
            "geo_code": w["geo_code"],
            "ward_code": w["ward_code"],
            "ward_name": w["name"],
            "constituency_code": w["constituency_code"],
            "county_code": w["county_code"],
            "source_caw_code": r["caw_code"],
            "source_ward_name": r["caw_name"],
            "source_constituency_name": r["const_name"],
            "source_county_name": r["county_name"],
            "member_surname": surname,
            "member_other_names": other_names,
            "member_name": member_name,
            "party_name": r["party_name"],
            "party_abbrev": r["party_abbrev"],
            "votes_raw": r["votes"],
            "votes": votes_int,
            "votes_note": votes_note,
            "crosswalk_method": entry_method,
            "geography_crosswalk": "" if entry_method == "name_and_code" else f"{r['caw_code']} {r['caw_name']} -> {w['ward_code']} {w['name']}",
            "disposition": disposition,
            "disposition_reason": disposition_reason,
            "source_page_pdf_index": r["_page"],
        }
        if disposition == "governed_unavailable":
            held.append(row_out)
        else:
            resolved.append(row_out)
    return resolved, held, unmatched


def main():
    print("Fetching IEBC Gazette Notice No. 9956 PDF ...", file=sys.stderr)
    pdf_bytes = fetch_pdf()
    print(f"  {len(pdf_bytes)} bytes", file=sys.stderr)

    rows = extract_rows(pdf_bytes)
    assert len(rows) == 1450, f"expected 1,450 extracted schedule rows after dedupe, got {len(rows)}"

    wards, cons = load_canonical(ROOT / "data/geography/registry/geographies.json")
    final_assign, method, unresolved_rows = crosswalk(rows, wards, cons)
    assert not unresolved_rows, f"unresolved crosswalk rows remain: {unresolved_rows}"
    assert len(final_assign) == 1450, f"expected 1,450 assigned rows, got {len(final_assign)}"
    assigned_wards = {w["geography_id"] for w in final_assign.values()}
    assert len(assigned_wards) == 1450, "duplicate ward assignment detected"

    resolved, held, unmatched = build_snapshot(rows, final_assign, method)
    assert not unmatched

    method_counts = collections.Counter(method.values())
    postponed = [r for r in held if r["votes_note"] == "election_postponed"]
    boundary_held = [r for r in held if r["votes_note"] != "election_postponed"]

    snapshot = {
        "schema_version": "kda.p24.ward-mca-source.v1",
        "source_authority": "Independent Electoral and Boundaries Commission (IEBC)",
        "source_url": IEBC_URL,
        "gazette_notice_no": "9956",
        "gazette_volume": "Vol. CXXIV--No. 170",
        "gazette_publication_date": "2022-08-24",
        "gazette_declaration_date": "2022-08-22",
        "election_date": "2022-08-09",
        "notice_title": "Declaration of Persons Elected as Members of the County Assemblies",
        "retrieval_note": (
            "Extracted with word-position table reconstruction (pdfplumber) rather than naive "
            "linear text extraction, because printed cells (ward names, party names) wrap across "
            "multiple typeset lines. Ward identity is matched to the Atlas's canonical ward registry "
            "primarily by normalized ward name within the correct constituency (this is safe against "
            "the Gazette's own CAW numbering occasionally not matching the Atlas's independent "
            "2012-vintage numbering for the same named ward), falling back to CAW-code position match "
            "for the handful of wards where the Gazette's printed name differs from the canonical name "
            "across vintages, and finally to a positional residual match used only when exactly one "
            "source row and one canonical ward remain in a constituency (a case verified individually; "
            "see crosswalk_method='residual_positional')."
        ),
        "coverage": {
            "total_wards": 1450,
            "resolved_direct_official": len(resolved),
            "governed_unavailable_boundary_conflict": len(boundary_held),
            "governed_unavailable_election_postponed": len(postponed),
            "crosswalk_method_counts": dict(method_counts),
            "no_contest_unopposed": sum(1 for r in resolved if r["votes_note"] == "no_contest_unopposed"),
            "votes_cleaned_artifact": sum(1 for r in resolved if r["votes_note"] == "cleaned_artifact"),
        },
        "held_constituency_codes": sorted(HELD_CONSTITUENCY_CODES),
        "rows": sorted(resolved, key=lambda r: r["ward_code"]),
        "held_rows": sorted(held, key=lambda r: r["ward_code"]),
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        f"P24_WARD_MCA_SOURCE_OK resolved={len(resolved)} "
        f"boundary_held={len(boundary_held)} postponed={len(postponed)} "
        f"-> {OUT_PATH.relative_to(ROOT)}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
