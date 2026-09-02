import { writeFile } from 'node:fs/promises';

const ARC_ITEM = '9c12cc5d3d244a8bad34bce09a28540b';
const ARC_LAYER = 'https://services8.arcgis.com/oTalEaSXAuyNT7xf/arcgis/rest/services/Constituency_Results_gdb/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&resultRecordCount=2000&f=json';
const VOTER_SOURCE = 'https://raw.githubusercontent.com/samy-migwi/kenya_2022_voters_dashboard_app/29b269a6562262a77faf6d22ba5837f46d35df75/data/voters.csv';
const assert = (ok,msg) => { if(!ok) throw new Error(`P23 turnout reconciliation: ${msg}`); };
const get = async url => {
  const r = await fetch(url,{headers:{'User-Agent':'Kenya-Data-Atlas-P23'}});
  assert(r.ok,`fetch failed ${r.status} ${url}`);
  return r;
};
const toInt = (v,label) => {
  const n=Number(v); assert(Number.isInteger(n) && n>=0,`${label} invalid (${v})`); return n;
};

const arc = await (await get(ARC_LAYER)).json();
assert(!arc.error,`ArcGIS error ${JSON.stringify(arc.error)}`);
const features=arc.features||[];
assert(features.length===290,`expected 290 transcription rows, found ${features.length}`);

const voterText=await (await get(VOTER_SOURCE)).text();
const voterLines=voterText.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
const header=voterLines.shift();
assert(header.includes('Registered Voters'),'voter source header changed');
const regByCode=new Map();
for(const [i,line] of voterLines.entries()) {
  const c=line.split(',');
  assert(c.length>=8,`voter row ${i+2} malformed`);
  const code=Number(c[3]), voters=Number(c[7]);
  assert(Number.isInteger(code)&&code>=1&&code<=290,`bad constituency code at voter row ${i+2}`);
  assert(Number.isInteger(voters)&&voters>0,`bad voters at row ${i+2}`);
  regByCode.set(code,(regByCode.get(code)||0)+voters);
}
assert(regByCode.size===290,'official voter aggregate does not cover 290 constituencies');
assert([...regByCode.values()].reduce((a,b)=>a+b,0)===22102532,'official domestic registered-voter total changed');

const rows=[];
for(const f of features) {
  const a=f.attributes||{};
  const pcode=String(a.ADM2_PCODE||'');
  const m=pcode.match(/(\d{3})$/);
  assert(m,`missing constituency code in ${pcode}`);
  const code=Number(m[1]);
  const sourceRegistered=toInt(a.Registered__Voters,`${code} registered`);
  const officialRegistered=regByCode.get(code);
  const raila=toInt(a.Raila,`${code} Raila`);
  const ruto=toInt(a.Ruto,`${code} Ruto`);
  const mwaure=toInt(a.Mwaure,`${code} Mwaure`);
  const wajackoyah=toInt(a.Wajackoyah,`${code} Wajackoyah`);
  const candidateTotal=raila+ruto+mwaure+wajackoyah;
  const citizenTotal=toInt(a.Our_Total__By_adding_up_,`${code} citizen total`);
  const transcribedIebcTotal=toInt(a.IEBC_Total__As_per_Forms_,`${code} IEBC total`);
  const rejected=toInt(a.Rejected_votes,`${code} rejected`);
  assert(candidateTotal===citizenTotal,`${code}: candidate sum ${candidateTotal} != citizen arithmetic ${citizenTotal}`);
  const voterMatch=sourceRegistered===officialRegistered;
  const voteDiscrepancy=transcribedIebcTotal-candidateTotal;
  const votesFitOfficial=candidateTotal+rejected<=officialRegistered;
  const holdReasons=[];
  if(!voterMatch) holdReasons.push('registered_voter_mismatch');
  if(voteDiscrepancy!==0) holdReasons.push('valid_vote_total_mismatch');
  if(!votesFitOfficial) holdReasons.push('votes_cast_exceeds_official_registered_voters');
  rows.push({
    constituency_code:code,
    source_name:String(a.Constituency||'').trim(),
    source_boundary_name:String(a.ADM2_EN||'').trim(),
    source_pcode:pcode,
    county_name:String(a.County_Name||a.County_Nam||a.ADM1_EN||'').trim(),
    source_registered_voters:sourceRegistered,
    official_registered_voters:officialRegistered,
    registered_voter_difference:sourceRegistered-officialRegistered,
    registered_voter_match:voterMatch,
    raila_votes:raila,
    ruto_votes:ruto,
    mwaure_votes:mwaure,
    wajackoyah_votes:wajackoyah,
    candidate_sum_valid_votes:candidateTotal,
    transcribed_iebc_total_valid_votes:transcribedIebcTotal,
    rejected_ballots:rejected,
    valid_vote_discrepancy:voteDiscrepancy,
    source_turnout:a.Turnout==null?null:Number(a.Turnout),
    arithmetic_turnout_pct:voterMatch && voteDiscrepancy===0 && votesFitOfficial
      ? Number((((candidateTotal+rejected)/officialRegistered)*100).toFixed(6))
      : null,
    verification_status:holdReasons.length===0?'arithmetic_reconciled':'requires_direct_form34b',
    hold_reasons:holdReasons,
  });
}
rows.sort((a,b)=>a.constituency_code-b.constituency_code);
assert(new Set(rows.map(r=>r.constituency_code)).size===290,'duplicate constituency code');
assert(rows.every((r,i)=>r.constituency_code===i+1),'constituency code sequence is not 1..290');

const voterMismatches=rows.filter(r=>!r.registered_voter_match);
const validVoteMismatches=rows.filter(r=>r.valid_vote_discrepancy!==0);
const impossibleAgainstOfficial=rows.filter(r=>r.candidate_sum_valid_votes+r.rejected_ballots>r.official_registered_voters);
const holds=rows.filter(r=>r.verification_status==='requires_direct_form34b');
const publishable=rows.filter(r=>r.verification_status==='arithmetic_reconciled');

const totals={
  official_registered_voters:rows.reduce((s,r)=>s+r.official_registered_voters,0),
  source_registered_voters:rows.reduce((s,r)=>s+r.source_registered_voters,0),
  raila_votes:rows.reduce((s,r)=>s+r.raila_votes,0),
  ruto_votes:rows.reduce((s,r)=>s+r.ruto_votes,0),
  mwaure_votes:rows.reduce((s,r)=>s+r.mwaure_votes,0),
  wajackoyah_votes:rows.reduce((s,r)=>s+r.wajackoyah_votes,0),
  candidate_sum_valid_votes:rows.reduce((s,r)=>s+r.candidate_sum_valid_votes,0),
  transcribed_iebc_total_valid_votes:rows.reduce((s,r)=>s+r.transcribed_iebc_total_valid_votes,0),
  rejected_ballots:rows.reduce((s,r)=>s+r.rejected_ballots,0),
};
assert(totals.official_registered_voters===22102532,'official registered-voter national total changed');

const payload={
  schema_version:'1.1.0',
  status:'candidate_extraction_reconciled_not_yet_published',
  arcgis_item_id:ARC_ITEM,
  arcgis_layer_url:ARC_LAYER,
  official_registered_voter_extraction:VOTER_SOURCE,
  official_form_portal:'https://forms.iebc.or.ke/',
  formula:'turnout_pct = 100 * (verified_valid_votes + rejected_ballots) / official_registered_voters',
  policy:{
    publish_arithmetic_reconciled_rows:false,
    reason:'Only rows matching the official registered-voter schedule and internally reconciling valid votes can be promoted; all others require direct Form 34B verification.',
    no_parent_inheritance:true,
    no_fuzzy_geography_matching:true,
    no_substitution_of_source_registered_voters:true,
  },
  counts:{
    source_rows:290,
    registered_voter_matches:290-voterMismatches.length,
    registered_voter_mismatches:voterMismatches.length,
    valid_vote_mismatches:validVoteMismatches.length,
    votes_exceed_official_registered:impossibleAgainstOfficial.length,
    arithmetic_reconciled:publishable.length,
    requires_direct_form34b:holds.length,
  },
  totals,
  direct_form34b_constituency_codes:holds.map(r=>r.constituency_code),
  registered_voter_mismatch_codes:voterMismatches.map(r=>r.constituency_code),
  valid_vote_mismatch_codes:validVoteMismatches.map(r=>r.constituency_code),
  rows,
};
await writeFile('/tmp/p23-turnout-reconciliation.json',JSON.stringify(payload,null,2)+'\n');
console.log(`P23_TURNOUT_RECONCILIATION_OK rows=290 voter_matches=${290-voterMismatches.length} voter_mismatches=${voterMismatches.length} valid_vote_mismatches=${validVoteMismatches.length} publishable=${publishable.length} direct_form34b=${holds.length}`);
console.log(`P23_TURNOUT_VOTER_MISMATCH_CODES ${voterMismatches.map(r=>r.constituency_code).join(',')||'none'}`);
console.log(`P23_TURNOUT_VALID_VOTE_MISMATCH_CODES ${validVoteMismatches.map(r=>r.constituency_code).join(',')||'none'}`);
console.log(`P23_TURNOUT_DIRECT_FORM_CODES ${holds.map(r=>r.constituency_code).join(',')||'none'}`);
console.log(`P23_TURNOUT_TRANSCRIPTION_TOTALS official_registered=${totals.official_registered_voters} source_registered=${totals.source_registered_voters} candidate_valid=${totals.candidate_sum_valid_votes} transcribed_iebc_valid=${totals.transcribed_iebc_total_valid_votes} rejected=${totals.rejected_ballots}`);
