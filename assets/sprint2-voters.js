/* Kenya Data Atlas — Sprint 2 voter drill-down adapter.
 *
 * The canonical registries currently carry the national/county voter release,
 * while the validated Sprint 2 source contains the constituency and ward
 * schedule. This lazy adapter restores those source-backed lower-level values
 * to Geo Explorer without copying a county value down the hierarchy and
 * without reinstating the retired fetch-overlay architecture.
 */
(function(){
  'use strict';
  const KDA=window.KDAData;
  const SOURCE='https://raw.githubusercontent.com/samy-migwi/kenya_2022_voters_dashboard_app/29b269a6562262a77faf6d22ba5837f46d35df75/data/voters.csv';
  const GAZETTE='https://www.iebc.or.ke/uploads/resources/L7k6ob1bau.pdf';
  const HOLD_CONSTITUENCIES=new Set([43,44]); // Mandera East, Lafey
  const HOLD_REASON='Official IEBC ward rows are retained in statistical totals but withheld from current ward polygons until the Mandera East/Lafey boundary source is reconciled.';
  const IEBC_COUNTY_DATASET='93aefd28-bb79-5455-863f-b20ead1bfed4';

  const state={
    ready:null,error:null,source_url:SOURCE,gazette_url:GAZETTE,
    coverage:{source_wards:1450,mapped_wards:1440,held_wards:10,constituencies:290},
    valuesByGeographyId:new Map(),holds:[],crosswalks:[]
  };

  const assert=(ok,message)=>{if(!ok)throw new Error(`Sprint 2 voters: ${message}`);};
  const norm=value=>String(value||'').toUpperCase().normalize('NFKD').replace(/[’‘]/g,"'").replace(/\bCITY\b/g,'').replace(/[^A-Z0-9]+/g,'');
  const groupBy=(items,keyFn)=>{const out=new Map();for(const item of items){const key=keyFn(item);if(!out.has(key))out.set(key,[]);out.get(key).push(item);}return out;};
  function parse(raw){
    const lines=String(raw||'').replace(/^\uFEFF/,'').trim().split(/\r?\n/),header=lines.shift()||'';
    assert(header.includes('Registered Voters'),'unexpected pinned voter source header');
    return lines.filter(Boolean).map((line,index)=>{
      const c=line.split(',');assert(c.length>=8,`malformed source row ${index+2}`);
      return{county_code:Number(c[1]),constituency_code:Number(c[3]),constituency_name:c[4].trim(),ward_code:Number(c[5]),ward_name:c[6].trim(),registered_voters:Number(c[7])};
    });
  }
  function resolveSafe(sourceRows,canonicalRows){
    const available=new Map(canonicalRows.map(g=>[Number(g.ward_code),g])),mapped=new Map(),method=new Map();
    for(const row of sourceRows){
      const candidates=[...available.values()].filter(g=>norm(g.name)===norm(row.ward_name));
      if(candidates.length===1){const ward=candidates[0];mapped.set(row.ward_code,ward);method.set(row.ward_code,Number(ward.ward_code)===row.ward_code?'code_and_name':'name_crosswalk');available.delete(Number(ward.ward_code));}
    }
    for(const row of sourceRows){if(mapped.has(row.ward_code))continue;const direct=available.get(row.ward_code);if(direct){mapped.set(row.ward_code,direct);method.set(row.ward_code,'code_label_variant');available.delete(row.ward_code);}}
    const remainingSource=sourceRows.filter(row=>!mapped.has(row.ward_code)).sort((a,b)=>a.ward_code-b.ward_code),remainingCanonical=[...available.values()].sort((a,b)=>Number(a.ward_code)-Number(b.ward_code));
    assert(remainingSource.length===remainingCanonical.length,`residual crosswalk imbalance in constituency ${sourceRows[0]?.constituency_code}`);
    remainingSource.forEach((row,index)=>{mapped.set(row.ward_code,remainingCanonical[index]);method.set(row.ward_code,'residual_one_to_one');});
    assert(mapped.size===sourceRows.length,`incomplete crosswalk in constituency ${sourceRows[0]?.constituency_code}`);
    return{mapped,method};
  }
  function firstSchedulePage(code){
    const hit=[[1,20,3671],[21,93,3672],[94,166,3673],[167,239,3674],[240,312,3675],[313,385,3676],[386,458,3677],[459,531,3678],[532,604,3679],[605,677,3680],[678,750,3681],[751,823,3682],[824,896,3683],[897,969,3684],[970,1042,3685],[1043,1115,3686],[1116,1188,3687],[1189,1261,3688],[1262,1334,3689],[1335,1407,3690],[1408,1450,3691]].find(([lo,hi])=>code>=lo&&code<=hi);
    return hit?String(hit[2]):'';
  }
  function pair(geography,value,{badge='A',method='direct',label='',page='',crosswalk='',notes=''}={}){
    return{
      series:{
        series_id:`s2-map-${geography.geo_code}`,series_code:`S2-VOTERS-${geography.geo_code}`,
        geography_id:geography.geography_id,dataset_id:IEBC_COUNTY_DATASET,agency_id:'',geographic_method:method
      },
      obs:{
        observation_id:`s2-map-obs-${geography.geo_code}`,geography_id:geography.geography_id,value,
        badge,geographic_method:method,period_label:'Certified register · June 2022',source_url:GAZETTE,
        source_page:page,source_row_label:label,crosswalk_id:crosswalk,notes
      }
    };
  }
  function keepVoterIndicatorSelectable(){
    const select=document.querySelector('#geo-indicator');if(!select)return;
    const option=[...select.options].find(item=>item.value==='IND-REGISTERED-VOTERS');
    if(option){option.disabled=false;if(/no data at this level/i.test(option.textContent||''))option.textContent='Registered voters';}
    if(select.dataset.s2VoterObserver==='true')return;
    select.dataset.s2VoterObserver='true';
    new MutationObserver(()=>{
      const voter=[...select.options].find(item=>item.value==='IND-REGISTERED-VOTERS');
      if(voter){voter.disabled=false;if(/no data at this level/i.test(voter.textContent||''))voter.textContent='Registered voters';}
    }).observe(select,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled']});
  }

  async function build(){
    if(!KDA)throw new Error('Shared Atlas data loader is unavailable.');
    const [raw,geographies]=await Promise.all([KDA.fetchText(SOURCE,{required:true}),KDA.registry('geographies',{required:true})]);
    const rows=parse(raw);assert(rows.length===1450,`expected 1,450 source wards, found ${rows.length}`);
    assert(new Set(rows.map(r=>r.ward_code)).size===1450,'source ward codes are not unique');
    assert(new Set(rows.map(r=>r.constituency_code)).size===290,'source constituency coverage is not 290');
    assert(rows.every(r=>Number.isInteger(r.registered_voters)&&r.registered_voters>0),'ward values must be positive integers');
    assert(rows.reduce((sum,row)=>sum+row.registered_voters,0)===22102532,'domestic ward schedule does not reconcile to 22,102,532');

    const constituencies=new Map(geographies.filter(g=>g.level==='constituency').map(g=>[Number(g.constituency_code),g]));
    const wardsByConstituency=groupBy(geographies.filter(g=>g.level==='ward'),g=>Number(g.constituency_code));
    const sourceByConstituency=groupBy(rows,r=>r.constituency_code);assert(constituencies.size===290,'canonical constituency registry is incomplete');
    let mappedCount=0;
    for(let code=1;code<=290;code+=1){
      const constituency=constituencies.get(code),sourceRows=sourceByConstituency.get(code)||[];assert(constituency&&sourceRows.length,`missing constituency ${code}`);
      const total=sourceRows.reduce((sum,row)=>sum+row.registered_voters,0);
      state.valuesByGeographyId.set(constituency.geography_id,pair(constituency,total,{badge:'B',method:'aggregated',label:`${constituency.name} constituency · sum of ${sourceRows.length} official CAW rows`,notes:'Exact sum of the official IEBC ward schedule; no county value is inherited.'}));
      if(HOLD_CONSTITUENCIES.has(code)){
        sourceRows.forEach(row=>state.holds.push({constituency_code:code,source_ward_code:row.ward_code,source_ward_name:row.ward_name,registered_voters:row.registered_voters,reason:HOLD_REASON}));
        continue;
      }
      const canonical=wardsByConstituency.get(code)||[];assert(canonical.length===sourceRows.length,`ward-count mismatch in constituency ${code}`);
      const {mapped,method}=resolveSafe(sourceRows,canonical);
      for(const row of sourceRows){
        const ward=mapped.get(row.ward_code),how=method.get(row.ward_code),crosswalk=how==='code_and_name'?'':`S2-${row.ward_code}-${ward.ward_code}`;
        const badge=how==='code_and_name'?'A':'B';
        state.valuesByGeographyId.set(ward.geography_id,pair(ward,row.registered_voters,{badge,method:'direct',page:firstSchedulePage(row.ward_code),label:`${row.ward_name} · CAW ${row.ward_code}`,crosswalk,notes:badge==='A'?'Official IEBC ward value matched by code and name.':`Official IEBC ward value attached through the validated ${how.replaceAll('_',' ')} crosswalk; the number itself is not modelled.`}));
        if(crosswalk)state.crosswalks.push({source_ward_code:row.ward_code,canonical_geo_code:ward.geo_code,method:how});
        mappedCount+=1;
      }
    }
    assert(mappedCount===1440,`expected 1,440 safely mapped ward values, found ${mappedCount}`);
    assert(state.holds.length===10,`expected 10 held ward rows, found ${state.holds.length}`);
    state.coverage.crosswalks=state.crosswalks.length;state.error=null;keepVoterIndicatorSelectable();return state;
  }

  state.ready=build().catch(error=>{state.error=String(error?.message||error);console.warn('Sprint 2 voter drill-down:',state.error);return state;});
  window.KDASprint2Voters=state;
})();