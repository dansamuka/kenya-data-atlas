#!/usr/bin/env python3
"""Lock FY2018/19 to the verified published CoB Table 2.5 values.

The official FY2018/19 annual report publishes all 47 county rows in Table 2.5
(physical PDF pages 32-33): budget estimates, expenditure and absorption rates.
The PDF text/table geometry is unusually unstable across extraction engines, so
this hardening uses a transparent transcription of that published table while
still fetching and hashing the official report and asserting the table is present.

Each row carries the two published component amounts as well as totals/rates so
we can self-check A+B=C, D+E=F and the reported absorption rates before exposing
only the Atlas fields. No validator is weakened and no value is inferred below
county level.
"""
from pathlib import Path

import harden_acquisition_v10

ROOT = Path(__file__).resolve().parents[2]

# name, recurrent budget, development budget, total budget,
# recurrent spend, development spend, total spend,
# recurrent absorption, development absorption, overall absorption
TABLE_2_5 = [
    ("Baringo",4528.48,3596.55,8125.03,4394.23,1158.45,5552.68,97.0,32.2,68.3),
    ("Bomet",5186.16,2947.82,8133.98,4821.66,2062.22,6883.88,93.0,70.0,84.6),
    ("Bungoma",8571.21,4194.11,12765.31,7226.41,2344.53,9570.95,84.3,55.9,75.0),
    ("Busia",5152.32,3674.16,8826.48,4707.59,1941.07,6648.66,91.4,52.8,75.3),
    ("Elgeyo/Marakwet",3135.27,2465.81,5601.08,3094.30,1333.30,4427.60,98.7,54.1,79.0),
    ("Embu",4660.95,2166.29,6827.24,4552.03,1361.23,5913.26,97.7,62.8,86.6),
    ("Garissa",6528.52,4193.71,10722.24,6615.23,2375.45,8990.68,101.3,56.6,83.9),
    ("Homa Bay",5354.43,3112.91,8467.34,4726.99,1011.12,5738.11,88.3,32.5,67.8),
    ("Isiolo",3624.21,1859.88,5484.10,3281.22,997.92,4279.14,90.5,53.7,78.0),
    ("Kajiado",5835.96,3769.29,9605.25,5335.68,2391.17,7726.84,91.4,63.4,80.4),
    ("Kakamega",7685.24,6804.18,14489.42,7194.63,4983.67,12178.30,93.6,73.2,84.0),
    ("Kericho",4773.71,3644.26,8417.97,4714.78,1417.09,6131.87,98.8,38.9,72.8),
    ("Kiambu",10949.23,5965.12,16914.35,9765.02,4495.23,14260.25,89.2,75.4,84.3),
    ("Kilifi",8711.84,5770.64,14482.48,6074.94,3566.78,9641.72,69.7,61.8,66.6),
    ("Kirinyaga",4093.31,1818.15,5911.46,4025.62,1138.54,5164.16,98.3,62.6,87.4),
    ("Kisii",8013.42,3997.58,12011.00,7276.27,2285.49,9561.76,90.8,57.2,79.6),
    ("Kisumu",7246.43,4629.11,11875.53,5703.04,2675.71,8378.75,78.7,57.8,70.6),
    ("Kitui",7059.91,4628.76,11688.67,6563.10,3304.56,9867.66,93.0,71.4,84.4),
    ("Kwale",5398.24,6119.78,11518.02,5084.61,2609.96,7694.57,94.2,42.6,66.8),
    ("Laikipia",4125.79,2802.17,6927.96,3923.97,1786.32,5710.29,95.1,63.7,82.4),
    ("Lamu",2562.14,2284.60,4846.74,2208.63,693.60,2902.23,86.2,30.4,59.9),
    ("Machakos",9569.68,5395.55,14965.22,8554.73,3097.87,11652.59,89.4,57.4,77.9),
    ("Makueni",6234.36,4417.36,10651.72,5780.73,2655.81,8436.55,92.7,60.1,79.2),
    ("Mandera",6633.04,7076.92,13709.96,6291.37,5750.39,12041.77,94.8,81.3,87.8),
    ("Marsabit",4296.84,4421.96,8718.80,3862.71,3604.99,7467.70,89.9,81.5,85.7),
    ("Meru",7862.71,4693.39,12556.10,7139.04,2641.43,9780.47,90.8,56.3,77.9),
    ("Migori",5141.56,3659.55,8801.12,4552.55,1814.50,6367.05,88.5,49.6,72.3),
    ("Mombasa",10112.51,4343.98,14456.50,9422.62,3106.50,12529.11,93.2,71.5,86.7),
    ("Murang'a",5262.20,3588.58,8850.78,4658.74,2502.68,7161.42,88.5,69.7,80.9),
    ("Nairobi",25662.42,7405.82,33068.25,23497.73,5900.44,29398.17,91.6,79.7,88.9),
    ("Nakuru",10467.35,8011.58,18478.94,8659.22,1477.68,10136.91,82.7,18.4,54.9),
    ("Nandi",5206.59,3220.26,8426.86,4994.32,1732.67,6726.99,95.9,53.8,79.8),
    ("Narok",7041.48,3153.37,10194.86,6952.16,3008.04,9960.21,98.7,95.4,97.7),
    ("Nyamira",4828.60,2130.48,6959.07,4481.79,1120.56,5602.35,92.8,52.6,80.5),
    ("Nyandarua",4502.83,3166.70,7669.54,3893.97,1581.90,5475.87,86.5,50.0,71.4),
    ("Nyeri",5975.85,2860.69,8836.54,5161.05,1884.35,7045.40,86.4,65.9,79.7),
    ("Samburu",3856.21,2004.91,5861.12,3438.00,745.01,4183.01,89.2,37.2,71.4),
    ("Siaya",4712.63,3730.96,8443.59,4526.53,1175.71,5702.24,96.1,31.5,67.5),
    ("Taita Taveta",3955.76,2031.69,5987.45,3764.96,1301.83,5066.79,95.2,64.1,84.6),
    ("Tana River",4637.30,2936.06,7573.36,3203.41,1588.65,4792.06,69.1,54.1,63.3),
    ("Tharaka-Nithi",3542.94,2178.06,5721.00,3206.89,1395.66,4602.55,90.5,64.1,80.5),
    ("Trans Nzoia",4867.14,3175.42,8042.56,3992.57,2395.37,6387.94,82.0,75.4,79.4),
    ("Turkana",9600.34,5751.96,15352.30,8673.75,1675.36,10349.11,90.3,29.1,67.4),
    ("Uasin Gishu",5469.52,4488.54,9958.06,5109.83,1635.43,6745.26,93.4,36.4,67.7),
    ("Vihiga",4517.44,2485.13,7002.57,4129.69,1569.38,5699.07,91.4,63.2,81.4),
    ("Wajir",6417.51,6758.18,13175.69,5861.30,4520.07,10381.37,91.3,66.9,78.8),
    ("West Pokot",4139.23,2230.28,6369.51,3899.50,1619.91,5519.41,94.2,72.6,86.7),
]


def main() -> None:
    harden_acquisition_v10.main()
    p = ROOT / "scripts/sprint3/acquire_cob_history.py"
    s = p.read_text(encoding="utf-8")
    start = s.index("def _parse_2018_consolidated_table(")
    end = s.index("\ndef _validate_year", start)

    parser = r'''def _parse_2018_consolidated_table(content: bytes, county_names: list[str]) -> dict[str, dict]:
    # Verify this is the expected official report/table before using the audited
    # transcription. The source PDF itself is still hashed in the manifest.
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        texts = [p.extract_text(x_tolerance=2, y_tolerance=3) or "" for p in pdf.pages]
    table_pages = [i for i, raw in enumerate(texts) if "Table 2.5" in _norm(raw) and "County Budget Allocation" in _norm(raw)]
    if not table_pages:
        raise RuntimeError("2018/19: expected official Table 2.5 not found in fetched report")

    rows = TABLE_2_5
    if len(rows) != 47:
        raise RuntimeError(f"2018/19 Table 2.5 transcription expected 47 rows, got {len(rows)}")
    names = [r[0] for r in rows]
    if names != COB_2013_ORDER:
        raise RuntimeError("2018/19 Table 2.5 transcription is not in canonical 47-county order")

    found = {}
    for idx, row in enumerate(rows):
        name, rec_b, dev_b, total_b, rec_s, dev_s, total_s, rec_abs, dev_abs, overall_abs = row
        if abs((rec_b + dev_b) - total_b) > 0.02:
            raise RuntimeError(f"2018/19 {name}: published budget components do not reconcile")
        if abs((rec_s + dev_s) - total_s) > 0.02:
            raise RuntimeError(f"2018/19 {name}: published expenditure components do not reconcile")
        for reported, calc, label in (
            (rec_abs, rec_s / rec_b * 100.0, "recurrent"),
            (dev_abs, dev_s / dev_b * 100.0, "development"),
            (overall_abs, total_s / total_b * 100.0, "overall"),
        ):
            if abs(reported - calc) > 0.15:
                raise RuntimeError(f"2018/19 {name}: {label} absorption arithmetic mismatch {reported}/{calc:.2f}")
        found[name] = {
            "budget_total_ksh_mn": total_b,
            "expenditure_total_ksh_mn": total_s,
            "development_absorption_pct": dev_abs,
            "overall_absorption_pct": overall_abs,
            "source_page": 32 if idx <= 36 else 33,
            "rate_method": "published_table_2_5_transcribed",
        }

    # Published table aggregates; county rows are rounded to 2 decimals, so the
    # sum may differ from the printed total by one cent of a million.
    if abs(sum(r[3] for r in rows) - 483473.12) > 0.02:
        raise RuntimeError("2018/19 Table 2.5 budget aggregate mismatch")
    if abs(sum(r[6] for r in rows) - 376434.74) > 0.02:
        raise RuntimeError("2018/19 Table 2.5 expenditure aggregate mismatch")
    if abs(sum(r[5] for r in rows) - 107435.61) > 0.02:
        raise RuntimeError("2018/19 Table 2.5 development-spend aggregate mismatch")

    missing = [c for c in county_names if c not in found]
    if missing or len(found) != 47:
        raise RuntimeError(f"2018/19 Table 2.5 registry mismatch: missing={missing}")
    return found

'''
    s = s[:start] + parser + s[end + 1:]
    # The injected parser references the audited constant from this module.
    # Materialize it into acquire_cob_history.py so acquisition remains standalone.
    table_literal = repr(TABLE_2_5)
    marker = "\ndef _parse_2018_consolidated_table("
    pos = s.index(marker)
    s = s[:pos] + "\nTABLE_2_5 = " + table_literal + "\n" + s[pos:]

    p.write_text(s, encoding="utf-8")
    print("Sprint 3 acquisition hardening v11 applied")


if __name__ == "__main__":
    main()
