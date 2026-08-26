#!/usr/bin/env python3
"""
Kenya Data Atlas — geography integrity audit.

Adds the checks the existing validators do not perform:

  1. geo_code well-formedness  (catches KEN-C030-CONNaN)
  2. code-sequence completeness (catches the missing constituency_code 158)
  3. name hygiene               (catches "Baringo  North", "Kitutu   Central")
  4. OGC geometry validity      (catches self-intersecting polygons)
  5. degenerate-polygon detection (catches slivers matched with score 0)
  6. child-in-parent containment (catches wards attached to the wrong constituency)
  7. child-union coverage of parent (catches gaps and spill)

Usage:
    pip install shapely
    python3 audit-geometry.py /path/to/kenya-data-atlas

Exit code 1 if any CRITICAL finding is present.
"""

import json
import re
import sys
import collections
import statistics
from pathlib import Path

try:
    from shapely.geometry import shape
    from shapely.ops import unary_union
    from shapely import make_valid
except ImportError:
    sys.exit("shapely is required:  pip install shapely")

# thresholds
CONTAINMENT_WARN = 0.90      # below this -> review
CONTAINMENT_FAIL = 0.10      # below this -> almost certainly misassigned
DEGENERATE_AREA_DEG2 = 1e-5  # ~ 100 ha near the equator

CRITICAL = []
WARNING = []


def critical(msg):
    CRITICAL.append(msg)
    print(f"  [CRITICAL] {msg}")


def warn(msg):
    WARNING.append(msg)
    print(f"  [warn]     {msg}")


def geom(feature):
    g = shape(feature["geometry"])
    return g if g.is_valid else make_valid(g)


def load_features(path):
    d = json.loads(Path(path).read_text())
    return {f["properties"]["geo_code"]: f for f in d["features"]}, d


# ----------------------------------------------------------------- registry
def audit_registry(root):
    print("\n1. REGISTRY CODE AND NAME HYGIENE")
    recs = json.loads((root / "data/geography/registry/geographies.json").read_text())

    pattern = {
        "country": re.compile(r"^KEN$"),
        "county": re.compile(r"^KEN-C\d{3}$"),
        "constituency": re.compile(r"^KEN-C\d{3}-CON\d{3}$"),
        "ward": re.compile(r"^KEN-C\d{3}-CON\d{3}-W\d{4}$"),
    }

    malformed = [r for r in recs if not pattern[r["level"]].match(r["geo_code"])]
    if malformed:
        critical(
            f"{len(malformed)} malformed geo_code(s): "
            + ", ".join(r["geo_code"] for r in malformed[:8])
        )
    else:
        print("  ok  every geo_code matches its level pattern")

    ws = [r for r in recs if re.search(r"\s{2,}", r["name"]) or r["name"] != r["name"].strip()]
    for r in ws:
        critical(f"name has irregular whitespace: {r['geo_code']} {r['name']!r}")
    if not ws:
        print("  ok  no irregular whitespace in names")

    # code sequences must be complete and unique
    for level, field, expected in (
        ("county", "county_code", 47),
        ("constituency", "constituency_code", 290),
        ("ward", "ward_code", 1450),
    ):
        vals = [r[field] for r in recs if r["level"] == level]
        ints = [v for v in vals if isinstance(v, int)]
        if len(ints) != len(vals):
            critical(f"{level}: {len(vals) - len(ints)} non-integer {field} value(s)")
        missing = sorted(set(range(1, expected + 1)) - set(ints))
        dupes = [v for v, c in collections.Counter(ints).items() if c > 1]
        if missing:
            critical(f"{level}: {field} missing {missing[:10]}")
        if dupes:
            critical(f"{level}: {field} duplicated {dupes[:10]}")
        if not missing and not dupes and len(ints) == len(vals):
            print(f"  ok  {level}: {field} is a complete unique 1..{expected} sequence")

    # every non-country record must resolve to a real parent
    by_id = {r["geography_id"]: r for r in recs}
    orphans = [r for r in recs if r["parent_id"] and r["parent_id"] not in by_id]
    if orphans:
        critical(f"{len(orphans)} record(s) with a dangling parent_id")
    return recs


# ----------------------------------------------------------------- geometry
def audit_geometry(root):
    print("\n2. GEOMETRY VALIDITY AND DEGENERACY")
    layers = {}
    for level, fn in (
        ("county", "counties.geojson"),
        ("constituency", "constituencies.geojson"),
        ("ward", "wards.geojson"),
    ):
        feats, doc = load_features(root / "data/geography/geometry" / fn)
        layers[level] = feats
        crs = (doc.get("crs") or {}).get("properties", {}).get("name", "")
        if "CRS84" not in crs and "4326" not in crs:
            critical(f"{level}: unexpected CRS {crs!r}")

        invalid = [k for k, f in feats.items() if not shape(f["geometry"]).is_valid]
        if invalid:
            warn(
                f"{level}: {len(invalid)} of {len(feats)} polygons fail OGC validity "
                f"(self-intersection / ring order) e.g. {invalid[:4]}"
            )
        else:
            print(f"  ok  {level}: all {len(feats)} polygons are OGC-valid")

        areas = sorted((geom(f).area, k, f["properties"]["name"]) for k, f in feats.items())
        degenerate = [a for a in areas if a[0] < DEGENERATE_AREA_DEG2]
        for a, k, n in degenerate:
            critical(
                f"{level}: {k} ({n!r}) polygon area {a:.3e} deg^2 is degenerate — "
                f"almost certainly matched to a blank or sliver source record"
            )
        if not degenerate:
            print(f"  ok  {level}: no degenerate polygons")
    return layers


# ----------------------------------------------------------------- topology
def audit_containment(layers):
    print("\n3. CHILD-IN-PARENT CONTAINMENT")
    results = {}
    for child, parent in (("ward", "constituency"), ("constituency", "county")):
        pg = {k: geom(f) for k, f in layers[parent].items()}
        buckets = collections.Counter()
        by_method = collections.defaultdict(list)
        misplaced = []

        for k, f in layers[child].items():
            parent_code = k.rsplit("-", 1)[0]
            p = pg.get(parent_code)
            g = geom(f)
            frac = (g.intersection(p).area / g.area) if (p is not None and g.area) else 0.0
            m = f["properties"].get("match_method", "unknown")
            by_method[m].append(frac)

            if frac >= 0.99:
                buckets[">=99%"] += 1
            elif frac >= CONTAINMENT_WARN:
                buckets["90-99%"] += 1
            elif frac >= 0.50:
                buckets["50-90%"] += 1
            elif frac >= CONTAINMENT_FAIL:
                buckets["10-50%"] += 1
            else:
                buckets["<10%"] += 1
                rp = g.representative_point()
                actual = [
                    layers[parent][ck]["properties"]["name"]
                    for ck, cg in pg.items()
                    if cg.contains(rp)
                ]
                misplaced.append(
                    (k, f["properties"]["name"], layers[parent][parent_code]["properties"]["name"]
                     if parent_code in layers[parent] else "?", actual or ["NONE"], m)
                )

        total = len(layers[child])
        print(f"\n  {child} in {parent}  (n={total})")
        for b in [">=99%", "90-99%", "50-90%", "10-50%", "<10%"]:
            print(f"    {b:8s} {buckets[b]:5d}  {buckets[b] / total * 100:5.1f}%")

        if by_method and any(m != "unknown" for m in by_method):
            print(f"\n    by match_method:")
            for m, v in sorted(by_method.items(), key=lambda x: -len(x[1])):
                print(
                    f"      {m:44s} n={len(v):5d} median={statistics.median(v):.3f} "
                    f"misplaced={sum(1 for x in v if x < CONTAINMENT_FAIL)}"
                )

        if misplaced:
            print()
            critical(f"{len(misplaced)} {child} polygon(s) sit outside their assigned {parent}")
            print(f"\n    {'geo_code':26s} {'name':22s} {'assigned':24s} -> actual")
            for k, n, assigned, actual, m in sorted(misplaced):
                print(f"    {k:26s} {n[:21]:22s} {assigned[:23]:24s} -> {', '.join(actual)}")
        results[child] = misplaced
    return results


def audit_coverage(layers, sample_size=None):
    print("\n4. CHILD-UNION COVERAGE OF PARENT")
    pg = {k: geom(f) for k, f in layers["constituency"].items()}
    kids = collections.defaultdict(list)
    for k, f in layers["ward"].items():
        kids[k.rsplit("-", 1)[0]].append(geom(f))

    covs, spills, worst = [], [], []
    keys = sorted(pg)
    if sample_size:
        keys = keys[:: max(1, len(keys) // sample_size)]
    for ck in keys:
        if ck not in kids:
            continue
        u = unary_union(kids[ck])
        c = pg[ck]
        if not c.area:
            continue
        cov = u.intersection(c).area / c.area
        spill = (u.area - u.intersection(c).area) / u.area if u.area else 0
        covs.append(cov)
        spills.append(spill)
        worst.append((cov, spill, ck, layers["constituency"][ck]["properties"]["name"]))

    if covs:
        print(f"  constituencies checked: {len(covs)}")
        print(f"  ward-union coverage : median {statistics.median(covs):.3f}  min {min(covs):.3f}")
        print(f"  ward-union spill    : median {statistics.median(spills):.3f}  max {max(spills):.3f}")
        worst.sort()
        print("\n  10 worst-covered constituencies:")
        for cov, spill, ck, n in worst[:10]:
            print(f"    {ck:22s} {n[:24]:26s} covers={cov:.3f} spill={spill:.3f}")
        if statistics.median(covs) < 0.98:
            warn(
                "ward and constituency layers are not topologically consistent — "
                "consider dissolving parents from the ward layer instead of "
                "carrying three independently sourced layers"
            )


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    print("=" * 78)
    print(f"KENYA DATA ATLAS — GEOGRAPHY INTEGRITY AUDIT")
    print(f"root: {root}")
    print("=" * 78)

    audit_registry(root)
    layers = audit_geometry(root)
    audit_containment(layers)
    audit_coverage(layers)

    print("\n" + "=" * 78)
    print(f"SUMMARY: {len(CRITICAL)} critical, {len(WARNING)} warnings")
    print("=" * 78)
    return 1 if CRITICAL else 0


if __name__ == "__main__":
    sys.exit(main())
