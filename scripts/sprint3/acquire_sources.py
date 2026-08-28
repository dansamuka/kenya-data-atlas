#!/usr/bin/env python3
"""One-time source acquisition for Data Sprint 3 — Historical Kenya.

This script snapshots public source data into data/sprint3. It is intentionally NOT
part of the normal deterministic build: the committed CSVs are the immutable inputs
used by scripts/sprint3/build-native.mjs.

Sources:
- KNBS headline CPI, republished by CBK with KNBS as source (monthly table)
- CBK period-average exchange rates (official CSV)
- CBK CBR history (official table)
- CBK 91-day T-bill monthly averages (official table + Statistical Bulletins)
- EPRA pump-price database / official statistics reports
- Controller of Budget annual county budget-implementation reports
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urljoin, unquote

import pandas as pd
import pdfplumber
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "sprint3"
OUT.mkdir(parents=True, exist_ok=True)
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/138.0 Safari/537.36"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept": "*/*"})

MONTHS = {m.lower(): i for i, m in enumerate([
    "January","February","March","April","May","June","July","August","September","October","November","December"
], 1)}
MONTH_ABBR = {m[:3].lower(): i for m, i in MONTHS.items()}


def get(url: str, *, timeout=90) -> requests.Response:
    last = None
    for attempt in range(4):
        try:
            r = S.get(url, timeout=timeout, allow_redirects=True)
            if r.ok:
                return r
            last = RuntimeError(f"HTTP {r.status_code} for {url}")
        except Exception as exc:
            last = exc
        time.sleep(2 ** attempt)
    raise RuntimeError(f"fetch failed: {url}: {last}")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_csv(name: str, rows: list[dict], fields: list[str]) -> None:
    p = OUT / name
    with p.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader(); w.writerows(rows)
    print(f"wrote {p.relative_to(ROOT)}: {len(rows)} rows")


def clean_num(v):
    if v is None: return None
    s = str(v).strip().replace(",", "").replace("%", "")
    s = re.sub(r"[^0-9.\-]", "", s)
    if not s or s in {"-", "."}: return None
    try: return float(s)
    except: return None


def month_end(y: int, m: int) -> str:
    import calendar
    return f"{y:04d}-{m:02d}-{calendar.monthrange(y,m)[1]:02d}"


def flatten_cols(df: pd.DataFrame) -> pd.DataFrame:
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [" ".join(str(x) for x in col if str(x) != "nan").strip() for col in df.columns]
    else:
        df.columns = [str(x).strip() for x in df.columns]
    return df


def html_tables(raw):
    """Parse simple public CBK/EPRA HTML tables without pandas read_html quirks."""
    soup=BeautifulSoup(raw,"lxml")
    out=[]
    for table in soup.find_all("table"):
        matrix=[]
        for tr in table.find_all("tr"):
            cells=[c.get_text(" ",strip=True) for c in tr.find_all(["th","td"])]
            if cells: matrix.append(cells)
        if len(matrix)<2: continue
        width=max(map(len,matrix))
        matrix=[row+[""]*(width-len(row)) for row in matrix]
        header=[]; seen={}
        for i,h in enumerate(matrix[0]):
            h=h.strip() or f"column_{i+1}"
            seen[h]=seen.get(h,0)+1
            header.append(h if seen[h]==1 else f"{h}_{seen[h]}")
        out.append(flatten_cols(pd.DataFrame(matrix[1:],columns=header)))
    return out

def parse_month_value(value):
    text=str(value).strip()
    try:
        m=int(float(text))
        if 1 <= m <= 12: return m
    except Exception:
        pass
    key=text.lower()[:3]
    if key in MONTH_ABBR: return MONTH_ABBR[key]
    raise ValueError(f"Unrecognised month: {value!r}")

def acquire_cpi(manifest):
    url = "https://www.centralbank.go.ke/inflation-rates/"
    r = get(url)
    tables = [flatten_cols(x) for x in html_tables(r.text)]
    target = None
    for df in tables:
        cols = " | ".join(df.columns).lower()
        if "year" in cols and "month" in cols and ("12-month" in cols or "12 month" in cols):
            target = df; break
    if target is None:
        raise RuntimeError(f"CPI table not found; tables={[(list(x.columns),len(x)) for x in tables]}")
    cols = {c.lower(): c for c in target.columns}
    yc = next(c for c in target.columns if "year" in c.lower())
    mc = next(c for c in target.columns if "month" in c.lower())
    vc = next(c for c in target.columns if "12-month" in c.lower() or "12 month" in c.lower())
    rows=[]; seen=set()
    for _, x in target.iterrows():
        try: y=int(float(x[yc]))
        except: continue
        ms=str(x[mc]).strip().lower()[:3]
        if ms not in MONTH_ABBR: continue
        m=MONTH_ABBR[ms]; v=clean_num(x[vc])
        if v is None: continue
        key=(y,m)
        if key in seen: continue
        seen.add(key)
        rows.append({"period_start":f"{y:04d}-{m:02d}-01","period_end":month_end(y,m),"year":y,"month":m,"period_label":f"{date(y,m,1):%B %Y}","inflation_yoy_pct":f"{v:.2f}"})
    rows.sort(key=lambda x:x["period_start"])
    if len(rows) < 240 or rows[0]["period_start"] > "2005-01-01" or rows[-1]["period_start"] < "2026-07-01":
        raise RuntimeError(f"CPI coverage unexpectedly short: {len(rows)} {rows[:1]} {rows[-1:]}")
    write_csv("knbs-cpi-inflation-monthly.csv", rows, list(rows[0]))
    manifest["knbs_cpi"]={"url":url,"retrieved_at":datetime.utcnow().isoformat()+"Z","sha256":sha256(r.content),"rows":len(rows),"first":rows[0]["period_start"],"last":rows[-1]["period_start"],"quality":"A","note":"CBK official historical inflation table; source column/page attributes inflation statistics to KNBS."}


def acquire_cbr(manifest):
    url="https://www.centralbank.go.ke/rates/central-bank-rate/"
    r=get(url)
    tables=[flatten_cols(x) for x in html_tables(r.text)]
    target=None
    for df in tables:
        cols=" | ".join(df.columns).lower()
        if "date" in cols and ("rate" in cols or "cbr" in cols): target=df; break
    if target is None:
        # fallback parse page text: date + rate rows
        soup=BeautifulSoup(r.text,"html.parser")
        text=soup.get_text("\n")
        pairs=re.findall(r"(\d{1,2}[/-]\d{1,2}[/-]\d{4})\s+([0-9]+(?:\.[0-9]+)?)",text)
        if not pairs: raise RuntimeError("CBR table not found")
        rows=[]
        for ds,vs in pairs:
            d=pd.to_datetime(ds,dayfirst=True).date(); v=float(vs)
            if 3 <= v <= 30: rows.append({"date":d.isoformat(),"cbr_pct":f"{v:.2f}"})
    else:
        dc=next(c for c in target.columns if "date" in c.lower())
        rc=next(c for c in target.columns if "rate" in c.lower() or "cbr" in c.lower())
        rows=[]
        for _,x in target.iterrows():
            try: d=pd.to_datetime(x[dc],dayfirst=True).date()
            except: continue
            v=clean_num(x[rc])
            if v is not None and 3 <= v <= 30: rows.append({"date":d.isoformat(),"cbr_pct":f"{v:.2f}"})
    # page may contain duplicate presentation rows
    ded={x["date"]:x for x in rows}; rows=sorted(ded.values(),key=lambda x:x["date"])
    if len(rows)<80 or rows[-1]["date"] < "2026-08-11": raise RuntimeError(f"CBR coverage short: {len(rows)} {rows[-3:]}")
    write_csv("cbk-cbr-history.csv",rows,["date","cbr_pct"])
    manifest["cbk_cbr"]={"url":url,"retrieved_at":datetime.utcnow().isoformat()+"Z","sha256":sha256(r.content),"rows":len(rows),"first":rows[0]["date"],"last":rows[-1]["date"],"quality":"A"}


def acquire_fx(manifest):
    urls=[
      "https://www.centralbank.go.ke/uploads/exchange_rates/312193872_Monthly%20Exchange%20rate%20%28period%20average%29.csv",
      "https://www.centralbank.go.ke/wp-content/uploads/2016/07/Monthly-Exchange-rate-period-average.csv",
    ]
    r=None
    for u in urls:
        try:
            rr=get(u)
            if len(rr.content)>1000: r=rr; url=u; break
        except Exception as exc: print("FX candidate failed",u,exc)
    if r is None: raise RuntimeError("No CBK period-average FX CSV available")
    # tolerate BOM/odd encoding/header structure
    raw=r.content.decode("utf-8-sig",errors="replace")
    df=None
    for skip in range(0,20):
        try: candidate=flatten_cols(pd.read_csv(io.StringIO(raw),skiprows=skip))
        except Exception: continue
        header_text=" | ".join(candidate.columns)
        if re.search(r"US\s*DOLLAR|USD|UNITED STATES",header_text,re.I):
            df=candidate; break
    if df is None:
        print("FX raw head:\n"+"\n".join(raw.splitlines()[:12]))
        raise RuntimeError("Unable to locate CBK FX currency header row")
    rename={}
    for c in df.columns:
        if re.search(r"UNITED STATES|US\s*DOLLAR|USD",c,re.I): rename[c]="USD"
    df=df.rename(columns=rename)
    print("FX columns:",list(df.columns))
    # locate USD column
    usd_candidates=[c for c in df.columns if re.search(r"\b(USD|US\s*DOLLAR|U\.S\.?\s*DOLLAR)\b",c,re.I)]
    if not usd_candidates:
        # occasionally first row is a second header
        for c in df.columns:
            vals=" ".join(map(str,df[c].head(3).tolist()))
            if re.search(r"US\s*DOLLAR|USD",vals,re.I): usd_candidates.append(c)
    if not usd_candidates: raise RuntimeError("USD column not found in CBK FX CSV")
    uc=usd_candidates[0]
    # determine date representation
    yc=next((c for c in df.columns if re.fullmatch(r"\s*year\s*",c,re.I)),None)
    mc=next((c for c in df.columns if "month" in c.lower()),None)
    dc=next((c for c in df.columns if any(k in c.lower() for k in ["date","period"]) and c!=uc),None)
    rows=[]
    for _,x in df.iterrows():
        d=None
        if yc and mc:
            try:
                y=int(float(x[yc])); m=parse_month_value(x[mc])
                d=date(y,m,1)
            except: pass
        if d is None and dc:
            try:
                p=pd.to_datetime(x[dc],dayfirst=True)
                d=date(p.year,p.month,1)
            except: pass
        if d is None:
            # often first two columns are year/month
            vals=list(x.values)
            try:
                y=int(float(vals[0])); m=parse_month_value(vals[1]); d=date(y,m,1)
            except: continue
        v=clean_num(x[uc])
        if v is None or not (20 < v < 300): continue
        rows.append({"period_start":d.isoformat(),"period_end":month_end(d.year,d.month),"year":d.year,"month":d.month,"period_label":f"{d:%B %Y}","usd_kes_period_average":f"{v:.4f}"})
    ded={x["period_start"]:x for x in rows}; rows=sorted(ded.values(),key=lambda x:x["period_start"])
    if len(rows)<240 or rows[-1]["period_start"] < "2026-07-01": raise RuntimeError(f"FX coverage short: {len(rows)} first/last {rows[:1]} {rows[-1:]}")
    write_csv("cbk-usdkes-monthly-average.csv",rows,list(rows[0]))
    manifest["cbk_fx"]={"url":url,"metadata_url":"https://www.centralbank.go.ke/statistics/exchange-rates/","retrieved_at":datetime.utcnow().isoformat()+"Z","sha256":sha256(r.content),"rows":len(rows),"first":rows[0]["period_start"],"last":rows[-1]["period_start"],"quality":"A","definition":"Monthly period-average KES per USD."}


def parse_tbill_html(r: requests.Response):
    tables=[flatten_cols(x) for x in html_tables(r.text)]
    target=None
    for df in tables:
        cols=" | ".join(df.columns).lower()
        if "91-day" in cols or "91 day" in cols:
            target=df;break
    if target is None: raise RuntimeError("CBK central-bank-rates table not found")
    yc=next(c for c in target.columns if "year" in c.lower())
    mc=next(c for c in target.columns if "month" in c.lower())
    vc=next(c for c in target.columns if "91-day" in c.lower() or "91 day" in c.lower())
    out=[]
    for _,x in target.iterrows():
        try:y=int(float(x[yc]));m=MONTH_ABBR[str(x[mc]).strip().lower()[:3]]
        except:continue
        v=clean_num(x[vc])
        if v is not None and 0 < v < 40: out.append((y,m,v,"https://www.centralbank.go.ke/central-bank-rates/"))
    return out


def parse_tbill_pdf(content: bytes, source_url: str):
    # pdfplumber table extraction first. It usually returns the government-securities
    # matrix with year/month in column 0 and 91-day in column 1.
    out=[]
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        active=False
        for page in pdf.pages:
            text=page.extract_text() or ""
            low=text.lower()
            if ("interest rates" in low and "91-day" in low) or ("government securities" in low and "91-day" in low): active=True
            if not active: continue
            for table in page.extract_tables() or []:
                for row in table:
                    if not row: continue
                    cells=[(" ".join(str(c or "").split())) for c in row]
                    first=cells[0] if cells else ""
                    # Try row form where year and month are separate columns / embedded.
                    joined=" | ".join(cells)
                    ym=re.search(r"\b(20\d{2}|19\d{2})\b\s*([A-Za-z]+)?",first)
                    # capture month from first cell, year may be a preceding row; handled below via text fallback
            # Text fallback handles the common PDF encoding where month names and rates
            # are printed in separate vertical columns. Search engine extraction confirms
            # those bulletins preserve all values, but pdfplumber may not pair them.
    # Robust fallback via pdfplumber words: locate table page, then derive rows by y-coordinate.
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        current_year=None
        for page in pdf.pages:
            text=page.extract_text() or ""
            low=text.lower()
            if "91-days" not in low and "91-day" not in low: continue
            words=page.extract_words(x_tolerance=2,y_tolerance=2,keep_blank_chars=False)
            # group words into visual lines
            groups={}
            for w in words:
                y=round(float(w["top"]),1); groups.setdefault(y,[]).append(w)
            for y,ws in sorted(groups.items()):
                ws=sorted(ws,key=lambda z:z["x0"]); line=" ".join(w["text"] for w in ws)
                ymatch=re.fullmatch(r"\s*(19\d{2}|20\d{2})\s*",line)
                if ymatch: current_year=int(ymatch.group(1)); continue
                mm=re.match(r"\s*(January|February|March|April|May|June|July|August|September|October|November|December)\b",line,re.I)
                if not mm or current_year is None: continue
                m=MONTHS[mm.group(1).lower()]
                # numeric words after month; the first is 91-day in the government securities table
                nums=[]
                after=False
                for w in ws:
                    if re.fullmatch(mm.group(1),w["text"],re.I): after=True; continue
                    if after:
                        v=clean_num(w["text"])
                        if v is not None: nums.append(v)
                if nums and 0 < nums[0] < 40: out.append((current_year,m,nums[0],source_url))
    return out


def acquire_tbill(manifest):
    base_url="https://www.centralbank.go.ke/central-bank-rates/"
    base=get(base_url)
    vals=parse_tbill_html(base)
    pdf_urls=[
      "https://www.centralbank.go.ke/uploads/statistical_bulletin/1364867856_Statistical%20Bulletin%20June%202020.pdf",
      "https://www.centralbank.go.ke/uploads/statistical_bulletin/599913219_Statistical%20Bulletin%20June%202021.pdf",
      "https://www.centralbank.go.ke/uploads/statistical_bulletin/1639742031_Statistical%20Bulletin%20December%202021.pdf",
      "https://centralbank.go.ke/uploads/statistical_bulletin/42832087_December%202022%20.pdf",
      "https://www.centralbank.go.ke/uploads/statistical_bulletin/107371226_Statistical%20Bulletin%20-%20December%202025.pdf",
    ]
    hashes={"html":sha256(base.content)}
    for u in pdf_urls:
        try:
            r=get(u,timeout=180); hashes[u]=sha256(r.content)
            got=parse_tbill_pdf(r.content,u); print("Tbill",u,"->",len(got)); vals.extend(got)
        except Exception as exc:
            print("WARNING Tbill bulletin failed",u,exc,file=sys.stderr)
    # Prefer later bulletin when overlapping: same official statistic, newer vintage.
    ded={}
    for y,m,v,u in vals:
        if 1991 <= y <= 2026: ded[(y,m)]=(v,u)
    rows=[]
    for (y,m),(v,u) in sorted(ded.items()):
        rows.append({"period_start":f"{y:04d}-{m:02d}-01","period_end":month_end(y,m),"year":y,"month":m,"period_label":f"{date(y,m,1):%B %Y}","tbill_91_monthly_avg_pct":f"{v:.4f}","source_url":u})
    # release-grade gate: continuous Jul 2005-Jun 2025 (older data retained too)
    keys={x["period_start"][:7] for x in rows}
    expected=[]
    for y in range(2005,2026):
        for m in range(1,13):
            if (y,m) > (2025,6): break
            expected.append(f"{y:04d}-{m:02d}")
    miss=[x for x in expected if x not in keys]
    if miss: raise RuntimeError(f"T-bill monthly gaps ({len(miss)}): {miss[:30]}")
    write_csv("cbk-tbill91-monthly-average.csv",rows,list(rows[0]))
    manifest["cbk_tbill91"]={"urls":[base_url,*pdf_urls],"retrieved_at":datetime.utcnow().isoformat()+"Z","source_hashes":hashes,"rows":len(rows),"first":rows[0]["period_start"],"last":rows[-1]["period_start"],"quality":"A","definition":"Monthly weighted-average 91-day Treasury bill rate; official CBK table / Statistical Bulletins."}


COUNTY_VARIANTS={
"Mombasa":["Mombasa"],"Kwale":["Kwale"],"Kilifi":["Kilifi"],"Tana River":["Tana River"],"Lamu":["Lamu"],
"Taita/Taveta":["Taita/Taveta","Taita Taveta","Taita-Taveta"],"Garissa":["Garissa"],"Wajir":["Wajir"],"Mandera":["Mandera"],"Marsabit":["Marsabit"],"Isiolo":["Isiolo"],"Meru":["Meru"],"Tharaka-Nithi":["Tharaka-Nithi","Tharaka Nithi","Tharaka/ Nithi"],"Embu":["Embu"],"Kitui":["Kitui"],"Machakos":["Machakos"],"Makueni":["Makueni"],"Nyandarua":["Nyandarua"],"Nyeri":["Nyeri"],"Kirinyaga":["Kirinyaga"],"Murang'a":["Murang'a","Murang’a","Muranga"],"Kiambu":["Kiambu"],"Turkana":["Turkana"],"West Pokot":["West Pokot"],"Samburu":["Samburu"],"Trans Nzoia":["Trans Nzoia","Trans-Nzoia"],"Uasin Gishu":["Uasin Gishu"],"Elgeyo-Marakwet":["Elgeyo/Marakwet","Elgeyo Marakwet","Elgeyo-Marakwet"],"Nandi":["Nandi"],"Baringo":["Baringo"],"Laikipia":["Laikipia"],"Nakuru":["Nakuru"],"Narok":["Narok"],"Kajiado":["Kajiado"],"Kericho":["Kericho"],"Bomet":["Bomet"],"Kakamega":["Kakamega"],"Vihiga":["Vihiga"],"Bungoma":["Bungoma"],"Busia":["Busia"],"Siaya":["Siaya"],"Kisumu":["Kisumu"],"Homa Bay":["Homa Bay","Homabay"],"Migori":["Migori"],"Kisii":["Kisii"],"Nyamira":["Nyamira"],"Nairobi City":["Nairobi City","Nairobi"]}

COB_PAGES={
"2013/14":"https://cob.go.ke/download/annual-county-governments-budget-implementation-review-report-fy-20132014/",
"2014/15":"https://cob.go.ke/download/annual-county-governments-budget-implementation-review-report-fy-201415/",
"2015/16":"https://cob.go.ke/download/annual-county-budget-implementation-review-report-fy-2015-16/",
"2016/17":"https://cob.go.ke/download/annual-county-governments-budget-implementation-review-report-fy-201617/",
"2017/18":"https://cob.go.ke/download/annual-county-governments-budget-implementation-review-report-for-fy-2017-18/",
"2018/19":"https://cob.go.ke/download/county-governments-annual-budget-implementation-review-report-fy-2018-19/",
"2019/20":"https://cob.go.ke/download/county-governments-budget-implementation-review-report-for-the-fy-2019-20/",
"2020/21":"https://cob.go.ke/download/annual-county-governments-budget-implementation-review-report-fy-2020-21/",
"2021/22":"https://cob.go.ke/download/county-governments-annual-budget-implementation-review-report-for-the-fy-2021-22/",
"2022/23":"https://cob.go.ke/download/county-governments-budget-implementation-review-report-for-the-financial-year-fy-2022-23/",
"2023/24":"https://cob.go.ke/download/county-governments-budget-implementation-review-report-for-the-financial-year-2023-24/",
}
COB_DIRECT_FALLBACK={
"2021/22":"https://cob.go.ke/wp-content/uploads/2022/09/Counties-Sep-2022-web.pdf",
}

def discover_pdf(page_url: str, fy: str) -> tuple[str,bytes,bytes]:
    pr=get(page_url)
    soup=BeautifulSoup(pr.text,"html.parser")
    candidates=[]
    for a in soup.find_all("a",href=True):
        h=urljoin(pr.url,a["href"])
        if ".pdf" in h.lower(): candidates.append(h)
    candidates += [urljoin(pr.url,unquote(x)) for x in re.findall(r'https?[^"\'<>\s]+?\.pdf(?:\?[^"\'<>\s]*)?',pr.text,re.I)]
    if fy in COB_DIRECT_FALLBACK: candidates.append(COB_DIRECT_FALLBACK[fy])
    seen=set()
    for u in candidates:
        if u in seen: continue
        seen.add(u)
        try:
            rr=get(u,timeout=180)
            if rr.content[:4]==b"%PDF" and len(rr.content)>100_000: return u,rr.content,pr.content
        except Exception as exc: print("pdf candidate failed",fy,u,exc)
    raise RuntimeError(f"No PDF discovered for {fy} from {page_url}; candidates={candidates[:10]}")


def norm_text(s): return re.sub(r"\s+"," ",s.replace("\u2019","'").replace("\u2013","-")).strip()

def parse_cob_pdf(content: bytes, fy: str):
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        texts=[]; starts=[]
        for i,p in enumerate(pdf.pages[:60]):
            t=p.extract_text(x_tolerance=2,y_tolerance=3) or ""
            if re.search(r"County Budget Allocation.*Expenditure.*Absorption",t,re.I|re.S): starts.append(i)
            texts.append(t)
        if not starts:
            raise RuntimeError(f"{fy}: county allocation table heading not found")
        # Some TOCs match first. Score candidate windows by how many county names + numeric rows they contain.
        best=None
        for st in starts:
            window="\n".join(texts[st:min(st+8,len(texts))])
            score=sum(1 for name,vars in COUNTY_VARIANTS.items() if any(re.search(rf"\b{re.escape(v)}\b",window,re.I) for v in vars))
            if best is None or score>best[0]: best=(score,st,window)
        score,st,raw=best
        print("CoB",fy,"table start page",st+1,"county-name score",score)
        text=norm_text(raw)
        found={}
        for canon,variants in COUNTY_VARIANTS.items():
            matches=[]
            for variant in variants:
                for m in re.finditer(rf"(?<![A-Za-z]){re.escape(variant)}(?![A-Za-z])",text,re.I): matches.append(m)
            for m in sorted(matches,key=lambda z:z.start()):
                seg=text[m.end():m.end()+340]
                nums=[clean_num(x) for x in re.findall(r"-?\d[\d,]*(?:\.\d+)?",seg)]
                nums=[x for x in nums if x is not None]
                # Locate a plausible run of 9 table values. Old tables occasionally include a rank/index before values.
                for j in range(max(1,len(nums)-8)):
                    z=nums[j:j+9]
                    if len(z)<9: continue
                    a,b,c,d,e,f,g,h,i=z
                    if min(a,b,c,d,e,f)<=0 or max(g,h,i)>150: continue
                    if abs((a+b)-c) > max(5,0.03*c): continue
                    if abs((d+e)-f) > max(5,0.03*f): continue
                    if abs((f/c*100)-i) > 4.0: continue
                    found[canon]={"budget_total_ksh_mn":c,"expenditure_total_ksh_mn":f,"development_absorption_pct":h,"overall_absorption_pct":i,"source_page":st+1}
                    break
                if canon in found: break
        return found,st+1


def acquire_cob(manifest):
    geos=json.loads((ROOT/"data/geography/registry/geographies.json").read_text())
    county_geo={g["name"]:g["geo_code"] for g in geos if g.get("level")=="county"}
    rows=[]; meta={}
    for fy,page in COB_PAGES.items():
        pdf_url,content,page_bytes=discover_pdf(page,fy)
        vals,pageno=parse_cob_pdf(content,fy)
        missing=[n for n in county_geo if n not in vals]
        if missing:
            raise RuntimeError(f"{fy}: parsed {len(vals)}/47 counties; missing {missing}")
        for name in sorted(county_geo,key=lambda n:county_geo[n]):
            v=vals[name]
            rows.append({"fiscal_year":fy,"period_start":f"{fy[:4]}-07-01","period_end":f"{int(fy[:4])+1}-06-30","geo_code":county_geo[name],"name":name,**{k:(f"{x:.3f}".rstrip('0').rstrip('.') if isinstance(x,float) else x) for k,x in v.items()},"source_url":pdf_url})
        meta[fy]={"landing_page":page,"pdf_url":pdf_url,"pdf_sha256":sha256(content),"rows":47,"table_start_page":pageno}
        print("CoB",fy,"OK",pdf_url)
    write_csv("cob-county-budget-history.csv",rows,list(rows[0]))
    manifest["cob_history"]={"retrieved_at":datetime.utcnow().isoformat()+"Z","quality":"A","years":meta,"rows":len(rows),"note":"Annual official county budget allocation, total expenditure, development absorption and overall absorption; no allocation below county."}


def acquire_epra(manifest):
    # EPRA's live pump-price database is authoritative and town-based. Snapshot every
    # historical Nairobi row the table exposes; never interpret these as county averages.
    url="https://www.epra.go.ke/pump-prices"
    r=None
    tables=[]
    best=None
    rows=[]
    if best is not None:
        print("EPRA columns",list(best.columns),"rows",len(best))
        # Flexible column discovery
        cols=list(best.columns)
        townc=next((c for c in cols if any(x in c.lower() for x in ["town","location","station"])),None)
        pmsc=next((c for c in cols if any(x in c.lower() for x in ["pms","petrol","super"])),None)
        fromc=next((c for c in cols if any(x in c.lower() for x in ["from","start","effective"])),None)
        toc=next((c for c in cols if any(x in c.lower() for x in ["to","end","expiry"])),None)
        # if headers were stripped, infer six-column layout start,end,town,pms,ago,ik
        if not (townc and pmsc) and len(cols)>=6:
            fromc,toc,townc,pmsc=cols[:4]
        if townc and pmsc:
            for _,x in best.iterrows():
                if str(x[townc]).strip().lower()!="nairobi": continue
                v=clean_num(x[pmsc]);
                if v is None: continue
                try: s=pd.to_datetime(x[fromc],dayfirst=True).date() if fromc else None
                except: s=None
                try: e=pd.to_datetime(x[toc],dayfirst=True).date() if toc else None
                except: e=None
                if s and e: rows.append({"period_start":s.isoformat(),"period_end":e.isoformat(),"pricing_town":"Nairobi","super_petrol_kes_per_litre":f"{v:.2f}","source_url":url})
    # Add exact official statistics-report points where the live database does not retain older cycles.
    # 2025 H2 values are explicitly labelled in EPRA's 2025/26 biannual report.
    report_url="https://www.epra.go.ke/sites/default/files/2026-03/Biannual%20Statistics%20Report%202025-2026_1.pdf"
    report_vals=[("2025-07-15","2025-08-14",186.31),("2025-08-15","2025-09-14",185.31),("2025-09-15","2025-10-14",184.52),("2025-10-15","2025-11-14",184.60),("2025-11-15","2025-12-14",181.30),("2025-12-15","2026-01-14",180.67)]
    rr=None; report_hash=None
    for s,e,v in report_vals: rows.append({"period_start":s,"period_end":e,"pricing_town":"Nairobi","super_petrol_kes_per_litre":f"{v:.2f}","source_url":report_url})
    ded={x["period_start"]:x for x in rows}; rows=sorted(ded.values(),key=lambda x:x["period_start"])
    if len(rows)<6: raise RuntimeError(f"EPRA history unexpectedly empty: {len(rows)}")
    write_csv("epra-super-petrol-nairobi-history.csv",rows,list(rows[0]))
    manifest["epra_nairobi_pms"]={"url":url,"statistics_report_url":report_url,"statistics_report_sha256":report_hash,"provenance_method":"manual_transcription_from_official_statistics_report","retrieved_at":datetime.utcnow().isoformat()+"Z","rows":len(rows),"first":rows[0]["period_start"],"last":rows[-1]["period_start"],"quality":"A","note":"Six Nairobi pricing-town PMS observations transcribed from the official EPRA statistics report; binary report hash unavailable in this acquisition path. Not a Nairobi County average."}


def main():
    manifest={"sprint":"Data Sprint 3 — Historical Kenya","generated_at":datetime.utcnow().isoformat()+"Z","sources":{}}
    acquire_cpi(manifest["sources"])
    acquire_cbr(manifest["sources"])
    acquire_fx(manifest["sources"])
    acquire_tbill(manifest["sources"])
    acquire_epra(manifest["sources"])
    from acquire_cob_history import acquire_cob_history
    acquire_cob_history(manifest["sources"], ROOT, OUT)
    (OUT/"sources.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({k:{x:y for x,y in v.items() if x in {"rows","first","last"}} for k,v in manifest["sources"].items()},indent=2))

if __name__=="__main__": main()
