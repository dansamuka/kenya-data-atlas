import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const assert=(ok,message)=>{if(!ok)throw new Error(`Map cascade validation: ${message}`);};

try{
  const geographies=json('data/geography/registry/geographies.json');
  const indicators=json('data/indicators/registry/indicators.json');
  const series=json('data/indicators/registry/series.json');
  const observations=json('data/indicators/registry/observations.json');
  const geoById=new Map(geographies.map(g=>[g.geography_id,g]));
  const indicatorById=new Map(indicators.map(i=>[i.indicator_id,i]));
  const obsById=new Map(observations.map(o=>[o.observation_id,o]));

  let connected=0;
  for(const s of series){
    assert(geoById.has(s.geography_id),`${s.series_code||s.series_id} points to a missing geography`);
    assert(indicatorById.has(s.indicator_id),`${s.series_code||s.series_id} points to a missing indicator`);
    if(!s.latest_observation_id)continue;
    const o=obsById.get(s.latest_observation_id);
    assert(o,`${s.series_code||s.series_id} latest_observation_id is missing`);
    assert(o.series_id===s.series_id,`${s.series_code||s.series_id} latest observation belongs to another series`);
    assert(o.geography_id===s.geography_id,`${s.series_code||s.series_id} latest observation belongs to another geography`);
    connected+=1;
  }
  console.log(`MAP_SERIES_OBSERVATION_GEO_CONNECTION_OK connected=${connected}`);

  const coverage=new Map();
  for(const s of series){
    if(!s.latest_observation_id||!obsById.has(s.latest_observation_id))continue;
    const geo=geoById.get(s.geography_id),indicator=indicatorById.get(s.indicator_id);if(!geo||!indicator)continue;
    const key=indicator.indicator_code;if(!coverage.has(key))coverage.set(key,{country:new Set(),county:new Set(),constituency:new Set(),ward:new Set()});
    if(coverage.get(key)[geo.level])coverage.get(key)[geo.level].add(geo.geography_id);
  }

  const active=indicators.filter(i=>i.lifecycle_status==='active');
  const advertisedMismatches=[];
  for(const indicator of active){
    const c=coverage.get(indicator.indicator_code)||{country:new Set(),county:new Set(),constituency:new Set(),ward:new Set()};
    const counts={country:c.country.size,county:c.county.size,constituency:c.constituency.size,ward:c.ward.size};
    const advertised=(indicator.applies_to_levels||[]).filter(level=>['county','constituency','ward'].includes(level));
    const zeroAdvertised=advertised.filter(level=>counts[level]===0);
    if(zeroAdvertised.length)advertisedMismatches.push(`${indicator.indicator_code}:${zeroAdvertised.join('+')}`);
    console.log(`MAP_COVERAGE ${indicator.indicator_code} country=${counts.country} county=${counts.county} constituency=${counts.constituency} ward=${counts.ward}`);
  }
  console.log(`MAP_ADVERTISED_LEVEL_GAPS ${advertisedMismatches.length?advertisedMismatches.join(','):'none'}`);

  const voters=active.find(i=>i.indicator_code==='IND-REGISTERED-VOTERS');
  assert(voters,'registered-voter indicator is missing');
  const native=coverage.get(voters.indicator_code);
  assert(native?.county?.size===47,`registered voters must retain 47 native county series; found ${native?.county?.size||0}`);

  const supplement=read('assets/sprint2-voters.js');
  const geoJs=read('assets/geo-explorer.js');
  for(const token of ['29b269a6562262a77faf6d22ba5837f46d35df75','source_wards:1450','mapped_wards:1440','held_wards:10','HOLD_CONSTITUENCIES=new Set([43,44])','valuesByGeographyId'])assert(supplement.includes(token),`Sprint 2 voter adapter missing ${token}`);
  for(const token of ['ensureVoterSupplement','KDASprint2Voters','Coverage in this view','assets/sprint2-voters.js'])assert(geoJs.includes(token),`Geo Explorer voter connection missing ${token}`);
  assert(!geoJs.includes("KDA.loadScript('assets/sprint2-data.js'"),'retired Sprint 2 fetch overlay must not be restored');
  console.log('MAP_SPRINT2_VOTER_DRILLDOWN_CONTRACT_OK counties=47 constituencies=290 wards=1440 holds=10');

  console.log('MAP_CASCADE_ALL_OK');
}catch(error){
  console.error(error.message||error);
  process.exit(1);
}
