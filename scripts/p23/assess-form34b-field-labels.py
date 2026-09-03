#!/usr/bin/env python3
import argparse,csv,re
from difflib import SequenceMatcher

TARGETS={
  'registered_voters':['REGISTERED VOTERS','NUMBER OF REGISTERED VOTERS','TOTAL REGISTERED VOTERS'],
  'total_valid_votes':['TOTAL VALID VOTES','TOTAL NUMBER OF VALID VOTES','TOTAL VALID VOTES CAST'],
  'rejected_ballots':['REJECTED BALLOTS','REJECTED BALLOT PAPERS','NUMBER OF REJECTED BALLOTS'],
}

def clean(value):
  return re.sub(r'\s+',' ',re.sub(r'[^A-Z ]+',' ',value.upper())).strip()

def main():
  ap=argparse.ArgumentParser(); ap.add_argument('tsv'); args=ap.parse_args()
  tokens=[]
  with open(args.tsv,encoding='utf-8',errors='replace') as f:
    for row in csv.DictReader(f,delimiter='\t'):
      text=clean((row.get('text') or '').strip())
      if not text: continue
      try: conf=float(row.get('conf','-1'))
      except ValueError: conf=-1
      # Retain alphabetic label tokens only. Numeric OCR content is deliberately
      # excluded from this diagnostic and never emitted.
      for word in text.split():
        if word.isalpha(): tokens.append((word,conf))

  findings={}
  for field,variants in TARGETS.items():
    best=(0.0,-1.0,'')
    for size in range(1,7):
      for i in range(0,max(0,len(tokens)-size+1)):
        words=tokens[i:i+size]
        phrase=' '.join(w for w,_ in words)
        confs=[c for _,c in words if c>=0]
        mean_conf=sum(confs)/len(confs) if confs else -1
        for target in variants:
          score=SequenceMatcher(None,phrase,target).ratio()
          if score>best[0] or (score==best[0] and mean_conf>best[1]): best=(score,mean_conf,target)
    findings[field]={'similarity':best[0],'mean_conf':best[1],'target_variant':best[2]}

  # This is a locator diagnostic, not a value gate. Similarity is intentionally
  # moderate because scans may split/garble labels; later numeric promotion still
  # requires source-image verification under the extraction contract.
  located={k:(v['similarity']>=0.62 and v['mean_conf']>=30) for k,v in findings.items()}
  count=sum(located.values())
  feasible=count==3
  print('P23_FORM34B_FIELD_LABEL_ASSESSMENT '+ ' '.join(
    f"{k}=located:{str(located[k]).lower()},similarity:{findings[k]['similarity']:.3f},mean_conf:{findings[k]['mean_conf']:.2f}"
    for k in TARGETS
  ))
  print(f'P23_FORM34B_FIELD_LOCATOR_FEASIBLE located={count}/3 feasible={str(feasible).lower()} values_emitted=0')

if __name__=='__main__': main()
