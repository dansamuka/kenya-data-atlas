#!/usr/bin/env python3
"""Apply v27 acquisition hardening and align EPRA native promotion with the canonical Nairobi fuel series.

Sprint 1 already created the Nairobi county-linked Super Petrol series. Sprint 3 must
append its historical Nairobi pricing-town observations to that series rather than
create a second indicator/geography series. The observation-level geographic method
remains `proxy`, and every historical observation retains the explicit pricing-town /
not-county-average caveat.
"""
from pathlib import Path

import harden_acquisition_v27

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    harden_acquisition_v27.main()
    p = ROOT / "scripts/sprint3/build-native.mjs"
    s = p.read_text(encoding="utf-8")

    old = "  const epraSeries=addSeries({code:'KDA-FUEL-PETROL-NAIROBI-TOWN-HISTORY',indicator:fuelInd,geo:nairobi,unitCode:'kes_per_litre',dataset:ds.epra,frequency:'monthly',periodType:'period',group:'EPRA-NAIROBI-PRICING-TOWN',method:'proxy',currency:'KES'});\n"
    new = "  const epraSeries=seriesByCode.get('KDA-FUEL-PETROL-KEN-C047');\n  if (!epraSeries) throw new Error('Sprint 3 canonical Nairobi fuel series missing');\n"

    if old in s:
        s = s.replace(old, new, 1)
    elif new not in s:
        raise RuntimeError("Expected Sprint 3 EPRA series-construction anchor missing")

    p.write_text(s, encoding="utf-8")
    print("Sprint 3 hardening v28 applied; EPRA history reuses canonical Nairobi fuel series")


if __name__ == "__main__":
    main()
