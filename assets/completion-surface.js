/* Kenya Data Atlas — P18–P22 public-surface reconciliation.
 * Makes the governed completion programme visible without inventing values.
 */
(function(){
  'use strict';
  const KDA=window.KDAData;
  if(!KDA)return;
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const PHASE_CODES={
    P19:new Set(['IND-PUBLIC-PRIMARY-SCHOOLS','IND-PRIMARY-CLASSROOM-TEACHERS','IND-PUBLIC-SECONDARY-SCHOOLS','IND-SECONDARY-TEACHERS','IND-INTERNET-USE','IND-COMPUTER-USE','IND-MAIN-GRID-ELECTRICITY','IND-AGRICULTURE-GVA','IND-AGRICULTURE-GCP-SHARE','IND-MANUFACTURING-GVA','IND-MANUFACTURING-GCP-SHARE','IND-MAIZE-AREA','IND-MAIZE-PRODUCTION','IND-MAIZE-YIELD']),
    P20:new Set(['IND-MAIN-GRID-ELECTRICITY','IND-COUNTY-OSR','IND-COUNTY-AUDIT-OPINION','IND-HOUSEHOLD-SIZE','IND-DISABILITY-PREVALENCE','IND-TEENAGE-PREGNANCY','IND-HOME-BIRTH-RATE','IND-CONTRACEEPTIVE-USE','IND-CONTRACEPTIVE-USE','IND-FGM-CHILD-MARRIAGE','IND-LITERACY-RATE','IND-HOUSING-MATERIAL','IND-HIV-PREVALENCE','IND-HEALTH-FACILITY-DENSITY','IND-COUNTY-PENDING-BILLS','IND-SUBSTANCE-ABUSE-PREVALENCE']),
    P21:new Set(['IND-WATER-ACCESS','IND-INPATIENT-SERVICE-AVAILABILITY','IND-HOUSEHOLDS-CASH-TRANSFER-SOCIAL-ASSISTANCE','IND-HOUSEHOLD-MOTORCYCLE-OWNERSHIP','IND-HOUSEHOLD-CAR-OWNERSHIP','IND-CLASS-C-RURAL-ROAD-LENGTH'])
  };
  const P21_RETIRED=new Set(['IND-AGRI-PRODUCTION','IND-EXAM-PERFORMANCE','IND-BUSINESS-LICENSES','IND-FACILITY-INFRASTRUCTURE','IND-HOSPITAL-BED-UTILIZATION','IND-SOCIAL-PROTECTION-BENEFICIARIES','IND-VEHICLE-REGISTRATIONS','IND-ROAD-NETWORK-LENGTH']);
  const P22_CODES=new Set(['IND-DROUGHT-EARLY-WARNING','IND-FOOD-SECURITY-PHASE','IND-RAINFALL-TEMPERATURE']);
  const GROUP_ORDER=['people','economy','health','finance','infrastructure','resilience'];
  const GROUP_LABEL={people:'People & households',economy:'Economy & livelihoods',health:'Health',finance:'Public finance',infrastructure:'Infrastructure & access',resilience:'Resilience & environment'};
  let bootPromise=null,state=null,renderQueued=false;

  async function getJson(url){
    if(typeof KDA.fetchJson==='function')return KDA.fetchJson(url,{required:false}).catch(()=>null);
    try{const r=await fetch(url);return r.ok?await r.json():null;}catch{return null;}
  }
  function phaseFor(code){
    if(PHASE_CODES.P21.has(code))return'P21';
    if(PHASE_CODES.P20.has(code)&&PHASE_CODES.P19.has(code))return'P19/P20';
    if(PHASE_CODES.P20.has(code))return'P20';
    if(PHASE_CODES.P19.has(code))return'P19';
    if(P22_CODES.has(code))return'P22';
    if(P21_RETIRED.has(code))return'P21';
    return'';
  }
  function groupFor(ind){
    const text=`${ind?.tab||''} ${ind?.topic||''} ${ind?.subtopic||''} ${ind?.name||''}`.toLowerCase();
    if(/resilien|drought|food security|rainfall|temperature|climate/.test(text))return'resilience';
    if(/finance|budget|revenue|audit|fiscal|pending bill/.test(text))return'finance';
    if(/health|birth|pregnan|contracep|hiv|fgm|facility|inpatient|stunt|immun/.test(text))return'health';
    if(/infrastructure|electric|water|road|vehicle|motorcycle|car ownership|internet|computer/.test(text))return'infrastructure';
    if(/econom|agric|manufactur|gcp|maize|business/.test(text))return'economy';
    return'people';
  }
  function unitText(unit){return {persons:'persons',percent:'%',kes_per_usd:'KES/USD',km2:'km²',kes_per_litre:'KES/L',kes_million:'KSh mn',count:'count',persons_per_household:'persons/household',index_score:'score',category:'',km:'km',per_10000_persons:'per 10k'}[unit?.code]||unit?.symbol||unit?.name||'';}
  function formatValue(value,unit){
    if(unit?.code==='category')return String(value??'').trim()||'—';
    const n=Number(value);if(!Number.isFinite(n))return'—';
    if(unit?.code==='persons'||unit?.code==='count')return n.toLocaleString('en-KE',{maximumFractionDigits:0});
    if(unit?.code==='kes_million')return n>=1000?`KSh ${(n/1000).toLocaleString('en-KE',{maximumFractionDigits:1})}bn`:`KSh ${n.toLocaleString('en-KE',{maximumFractionDigits:1})}mn`;
    const dp=unit?.decimal_places??(Math.abs(n-Math.round(n))>.0001?1:0);
    return n.toLocaleString('en-KE',{minimumFractionDigits:dp,maximumFractionDigits:dp});
  }
  function agencyFor(series){
    const dataset=state.datasetById.get(series?.dataset_id),source=dataset?state.sourceById.get(dataset.source_id):null;
    const agency=state.agencyById.get(source?.agency_id||series?.agency_id);return agency?.abbreviation||agency?.name||source?.name||'Official source';
  }
  function latestPair(geoId,indicatorId){
    const rows=state.seriesByGeoIndicator.get(`${geoId}|${indicatorId}`)||[];let best=null;
    for(const s of rows){
      const obs=s.latest_observation_id?state.obsById.get(s.latest_observation_id):(state.obsBySeries.get(s.series_id)||[]).at(-1);
      if(!obs)continue;if(!best||String(obs.period_end||obs.period_start)>String(best.obs.period_end||best.obs.period_start))best={series:s,obs};
    }
    return best;
  }
  function evidenceFor(code,geoCode){return state.evidence.filter(e=>e.indicator_code===code&&(e.geo_codes||[]).includes(geoCode));}
  function phaseIndicatorCodes(){return new Set([...PHASE_CODES.P19,...PHASE_CODES.P20,...PHASE_CODES.P21]);}
  function countyRows(county){
    const wanted=phaseIndicatorCodes(),rows=[];
    for(const code of wanted){
      const ind=state.indicatorByCode.get(code);if(!ind||ind.lifecycle_status!=='active')continue;
      const pair=latestPair(county.geography_id,ind.indicator_id);if(!pair)continue;
      rows.push({code,ind,pair,unit:state.unitById.get(ind.unit_id),phase:phaseFor(code),group:groupFor(ind)});
    }
    return rows.sort((a,b)=>GROUP_ORDER.indexOf(a.group)-GROUP_ORDER.indexOf(b.group)||a.ind.name.localeCompare(b.ind.name));
  }
  function evidenceRows(county){
    return state.evidence.filter(e=>(e.geo_codes||[]).includes(county.geo_code)&&(P22_CODES.has(e.indicator_code)||P21_RETIRED.has(e.indicator_code)||e.indicator_code==='IND-SUBSTANCE-ABUSE-PREVALENCE'||e.indicator_code==='IND-COUNTY-PENDING-BILLS'));
  }
  function metricCard(row){
    const {ind,pair,unit,phase}=row,o=pair.obs,source=agencyFor(pair.series),u=unitText(unit),uncertainty=Number.isFinite(Number(o.sample_size))?` · n=${Number(o.sample_size).toLocaleString('en-KE')}`:'';
    const value=formatValue(o.text_value??o.value,unit),display=u?`${value} ${u}`:value;
    return `<article class="kda-data-card"><div class="top"><span class="label">${esc(ind.name)}</span><span class="phase">${esc(phase)}</span></div><div class="value">${esc(display)}</div><div class="meta"><strong>${esc(o.period_label||'Published period')}</strong>${esc(uncertainty)}<span class="source">${esc(source)} · ${esc(o.badge||'')} provenance</span></div></article>`;
  }
  function evidenceCard(e){
    const ind=state.indicatorByCode.get(e.indicator_code),phase=P22_CODES.has(e.indicator_code)?'P22':P21_RETIRED.has(e.indicator_code)?'P21':'P20';
    const replacement=(e.status==='retired_replaced'||P21_RETIRED.has(e.indicator_code));
    const successors=(e.successor_indicator_codes||[]).map(c=>state.indicatorByCode.get(c)?.name||c).join(', ');
    const status=replacement?'Replaced concept':'Current observation unavailable';
    return `<article class="kda-data-card kda-evidence-card ${replacement?'kda-replacement-card':''}"><div class="top"><span class="label">${esc(ind?.name||e.indicator_code)}</span><span class="phase">${phase}</span></div><div class="value">${esc(status)}</div>${successors?`<div class="reason"><strong>Use instead:</strong> ${esc(successors)}</div>`:''}<div class="reason">${esc(e.period_label||'')} ${esc(e.reason||'')}</div>${e.refresh_trigger?`<div class="refresh"><strong>Refresh trigger:</strong> ${esc(e.refresh_trigger)}</div>`:''}${e.source_url?`<a href="${esc(e.source_url)}" target="_blank" rel="noopener">Open official source ↗</a>`:''}</article>`;
  }
  function phaseStrip(){
    const phases=(state.roadmap?.phases||[]).filter(p=>['P18','P19','P20','P21','P22'].includes(p.id));
    return `<div class="kda-phase-strip">${phases.map(p=>`<div class="kda-phase-chip ${p.status==='complete'?'complete':''}"><strong>${esc(p.id)} · ${esc(p.status==='complete'?'Complete':p.status)}</strong><span>${esc(p.title)}</span></div>`).join('')}</div>`;
  }
  function statsHtml(){
    const s=state.summary||{},remaining=s.by_completion_phase||{};
    return `<div class="kda-completion-summary"><div class="kda-completion-stat"><small>Resolved</small><strong>${Number(s.resolved_slots||0).toLocaleString('en-KE')}</strong><span>${esc(String(s.resolved_pct??0))}% of ${Number(s.total_slots||0).toLocaleString('en-KE')}</span></div><div class="kda-completion-stat"><small>Unknown blanks</small><strong>${Number(s.unknown_missing||0).toLocaleString('en-KE')}</strong><span>Unexplained missing state</span></div><div class="kda-completion-stat"><small>Next · P23</small><strong>${Number(remaining.P23||0).toLocaleString('en-KE')}</strong><span>Constituency slots</span></div><div class="kda-completion-stat"><small>Later</small><strong>${Number((remaining.P24||0)+(remaining.P25||0)).toLocaleString('en-KE')}</strong><span>P24 ward + P25 national slots</span></div></div>`;
  }
  function programmeHeader(context,count){
    return `<div class="kda-completion-head"><div><span class="kda-completion-kicker">Data completion programme · P18–P22</span><h3>${esc(context)}</h3><p>The public surface now follows the governed registry: direct/derived observations stay source-labelled; retired concepts show their replacement decision; unavailable current observations show the evidence constraint instead of a fabricated value.</p></div><div class="kda-completion-score"><strong>${esc(String(state.summary?.resolved_pct??0))}%</strong><span>governed slots resolved${count!=null?` · ${count} phase metrics here`:''}</span></div></div>`;
  }
  function countySurface(county){
    const rows=countyRows(county),ev=evidenceRows(county),groups=new Map();for(const g of GROUP_ORDER)groups.set(g,[]);for(const r of rows)groups.get(r.group)?.push(r);
    const groupHtml=GROUP_ORDER.map((g,i)=>{const items=groups.get(g)||[];if(!items.length)return'';return `<details class="kda-county-group" ${i<2?'open':''}><summary>${esc(GROUP_LABEL[g])}<span>${items.length} published</span></summary><div class="kda-county-grid">${items.map(metricCard).join('')}</div></details>`;}).join('');
    const evidenceHtml=ev.length?`<details class="kda-county-group" open><summary>Governed availability & replacement decisions<span>${ev.length} explicit states</span></summary><div class="kda-county-grid">${ev.map(evidenceCard).join('')}</div></details>`:'';
    const p22Count=ev.filter(e=>P22_CODES.has(e.indicator_code)).length;
    const note=p22Count?`P22 shows ${p22Count} explicit current-unavailable resilience states for this whole-county ASAL geography. Stale NDMA warnings, expired food-security phases and station/map proxies are not promoted as current county values.`:'P22 applies only to the fixed whole-county ASAL set. No resilience value is inherited into a non-eligible or partial-ASAL county.';
    return `${programmeHeader(`${county.name} · completed county data`,rows.length)}${phaseStrip()}<div class="kda-county-groups">${groupHtml}${evidenceHtml}</div><p class="kda-completion-note">${esc(note)} County values are never copied down to constituencies or wards. Non-rankable measures remain visible here and in Direct Compare without being turned into league tables.</p>`;
  }
  function dataSurface(){
    const s=state.summary||{},statuses=s.by_status||{};
    return `${programmeHeader('What is complete, and what remains')} ${phaseStrip()}${statsHtml()}<p class="kda-completion-note"><strong>P18–P22 are complete.</strong> The ledger currently records ${Number(statuses.published_direct||0).toLocaleString('en-KE')} published-direct, ${Number(statuses.published_derived||0).toLocaleString('en-KE')} published-derived, ${Number(statuses.external_verified||0).toLocaleString('en-KE')} externally verified, ${Number(statuses.official_unavailable||0).toLocaleString('en-KE')} officially unavailable and ${Number(statuses.retired_replaced||0).toLocaleString('en-KE')} retired/replaced resolved slots. Remaining work is explicitly assigned to P23–P25; unknown blanks remain ${Number(s.unknown_missing||0).toLocaleString('en-KE')}.</p>`;
  }
  function countyFromGeo(geo){let g=geo;while(g&&g.level!=='county')g=g.parent_id?state.geoById.get(g.parent_id):null;return g?.level==='county'?g:null;}
  function selectedCountyExplore(){
    const current=$('#geo-breadcrumb button[aria-current="location"]');if(current?.dataset.geoId){const c=countyFromGeo(state.geoById.get(current.dataset.geoId));if(c)return c;}
    const picker=$('#county-picker');if(picker?.value){const c=state.countyByName.get(String(picker.value).replace(/^\s*\d{3}\s*[·-]\s*/,''));if(c)return c;}
    return state.counties.find(c=>c.name==='Nakuru')||state.counties[0]||null;
  }
  function selectedCountyIQ(){const code=$('#ciq-county-select')?.value;return state.countyByCode.get(code)||null;}
  function renderExplore(){
    const profile=$('#profile');if(!profile)return;const county=selectedCountyExplore();if(!county)return;
    let host=$('#kda-p18-p22-profile',profile);if(!host){host=document.createElement('section');host.id='kda-p18-p22-profile';host.className='kda-completion-surface';profile.appendChild(host);}
    if(host.dataset.geoCode===county.geo_code)return;host.dataset.geoCode=county.geo_code;host.innerHTML=countySurface(county);
  }
  function renderData(){
    const root=$('#catalogue'),list=$('#dataset-list');if(!root||!list)return;let host=$('#kda-data-programme',root);if(!host){host=document.createElement('section');host.id='kda-data-programme';host.className='kda-completion-surface kda-data-programme';list.insertAdjacentElement('beforebegin',host);}host.innerHTML=dataSurface();
  }
  function renderCountyIQ(){
    const root=$('#countyiq-view'),lower=$('.ciq-lower',root);if(!root||!lower)return;const county=selectedCountyIQ();if(!county)return;let card=$('#kda-p18-p22-ciq',root);if(!card){card=document.createElement('article');card.id='kda-p18-p22-ciq';card.className='ciq-card kda-completion-ciq';lower.appendChild(card);}let host=$('.kda-completion-surface',card);if(!host){host=document.createElement('section');host.className='kda-completion-surface';card.appendChild(host);}if(host.dataset.geoCode===county.geo_code)return;host.dataset.geoCode=county.geo_code;host.innerHTML=countySurface(county);
  }
  function renderCompareNote(){
    const head=$('#compare .compare-panel-head');if(!head||$('#kda-completion-compare-note'))return;const p=document.createElement('p');p.id='kda-completion-compare-note';p.className='kda-route-note';p.innerHTML='<strong>P18–P22 registry reconciliation:</strong> Direct Compare includes every active county series with observations, including non-rankable P20/P21 measures. P22 evidence-only states are not converted into numeric comparisons.';head.insertAdjacentElement('afterend',p);
  }
  function renderRankingNote(){
    const hero=$('#rankings-results .ri-hero');if(!hero||$('#kda-completion-ranking-note'))return;const p=document.createElement('p');p.id='kda-completion-ranking-note';p.className='kda-route-note';p.innerHTML='<strong>Coverage note:</strong> some P20/P21 county measures are intentionally non-rankable or non-directional. They remain visible in Explore, county profiles and Direct Compare, but are not forced into a league table.';hero.insertAdjacentElement('afterend',p);
  }
  function renderAll(){
    if(!state)return;renderExplore();renderData();renderCountyIQ();renderCompareNote();renderRankingNote();
  }
  function scheduleRender(){if(renderQueued)return;renderQueued=true;setTimeout(()=>{renderQueued=false;renderAll();},40);}
  function installObservers(){
    document.addEventListener('change',e=>{if(e.target.matches('#county-picker,#ciq-county-select,#geo-indicator'))scheduleRender();});
    window.addEventListener('hashchange',scheduleRender);window.addEventListener('kda:route',scheduleRender);
    const targets=['#profile','#geo-breadcrumb','#countyiq-view','#catalogue','#compare','#rankings-results'].map(s=>$(s)).filter(Boolean);for(const t of targets)new MutationObserver(scheduleRender).observe(t,{childList:true,subtree:true});
  }
  async function boot(){
    if(bootPromise)return bootPromise;
    bootPromise=(async()=>{
      const [geographies,indicators,series,observations,units,agencies,sources,datasets,summary,roadmap,evidenceDoc]=await Promise.all([
        KDA.registry('geographies'),KDA.registry('indicators'),KDA.registry('series'),KDA.registry('observations'),KDA.registry('units'),KDA.registry('agencies').catch(()=>[]),KDA.registry('sources').catch(()=>[]),KDA.registry('datasets').catch(()=>[]),getJson('data/completeness/summary.json'),getJson('data/data-completion-roadmap.json'),getJson('data/completeness/evidence-states.json')
      ]);
      if(![geographies,indicators,series,observations,units].every(Array.isArray))throw new Error('P18–P22 public surface requires canonical registries.');
      const geoById=new Map(geographies.map(g=>[g.geography_id,g])),indicatorByCode=new Map(indicators.map(i=>[i.indicator_code,i])),obsById=new Map(observations.map(o=>[o.observation_id,o])),obsBySeries=new Map();
      for(const o of observations){if(!obsBySeries.has(o.series_id))obsBySeries.set(o.series_id,[]);obsBySeries.get(o.series_id).push(o);}for(const rows of obsBySeries.values())rows.sort((a,b)=>String(a.period_end||a.period_start).localeCompare(String(b.period_end||b.period_start)));
      const seriesByGeoIndicator=new Map();for(const s of series){const k=`${s.geography_id}|${s.indicator_id}`;if(!seriesByGeoIndicator.has(k))seriesByGeoIndicator.set(k,[]);seriesByGeoIndicator.get(k).push(s);}
      const counties=geographies.filter(g=>g.level==='county');
      state={geographies,indicators,series,observations,units,summary:summary||{},roadmap:roadmap||{},evidence:evidenceDoc?.states||[],geoById,indicatorByCode,unitById:new Map(units.map(u=>[u.unit_id,u])),obsById,obsBySeries,seriesByGeoIndicator,agencyById:new Map((agencies||[]).map(a=>[a.agency_id,a])),sourceById:new Map((sources||[]).map(s=>[s.source_id,s])),datasetById:new Map((datasets||[]).map(d=>[d.dataset_id,d])),counties,countyByCode:new Map(counties.map(c=>[c.geo_code,c])),countyByName:new Map(counties.map(c=>[c.name,c]))};
      installObservers();renderAll();return window.KDACompletionSurface;
    })().catch(error=>{console.warn('P18–P22 public surface:',error?.message||error);return null;});
    return bootPromise;
  }
  window.KDACompletionSurface={boot,render:renderAll,state:()=>state};
})();
