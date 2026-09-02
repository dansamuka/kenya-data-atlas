/* Kenya Data Atlas — Compare Across Levels v2.
 * A first-class governed comparison surface for county ↔ constituency ↔ ward.
 * It never inherits parent values and only draws cross-level charts for series
 * that pass the canonical cross-level eligibility registry.
 */
(function(){
  'use strict';
  const KDA=window.KDAData,R=window.KDARouter;if(!KDA)return;
  const root=document.querySelector('#compare');if(!root)return;
  const $=(s,r=root)=>r.querySelector(s),$$=(s,r=root)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  const levels=['county','constituency','ward'];
  const levelNames={county:'County',constituency:'Constituency',ward:'Ward'};
  let bootPromise=null,data=null;
  const state={slots:[],indicator:'',multiples:false,topic:'all',query:''};

  function route(){return R?.current?.()||R?.parse?.()||{view:'compare',params:new URLSearchParams()};}
  function periodKey(o){return `${o.period_start||''}|${o.period_end||''}`;}
  function contractKey(s){return [s.comparability_group||'',s.unit_id||'',s.frequency||'',s.period_type||'',s.transformation||'',s.price_basis||'',s.seasonal_adjustment||''].join('|');}
  function latest(rows){return [...(rows||[])].sort((a,b)=>String(a.period_end||a.period_start||'').localeCompare(String(b.period_end||b.period_start||''))).at(-1)||null;}
  function fmt(value,unit){
    if(value===null||value===undefined||!Number.isFinite(Number(value)))return'—';
    const n=Number(value),dp=unit?.decimal_places??1,code=unit?.code||'';
    if(code==='percent')return`${n.toLocaleString('en-KE',{minimumFractionDigits:dp,maximumFractionDigits:dp})}%`;
    if(code==='persons'||code==='count')return n.toLocaleString('en-KE',{maximumFractionDigits:0});
    if(code==='kes_million')return`KES ${n.toLocaleString('en-KE',{maximumFractionDigits:1})} mn`;
    if(code==='km2')return`${n.toLocaleString('en-KE',{maximumFractionDigits:1})} km²`;
    return`${n.toLocaleString('en-KE',{maximumFractionDigits:dp})}${unit?.symbol?` ${unit.symbol}`:''}`;
  }
  function topicOf(indicator){return String(indicator?.tab||indicator?.topic||indicator?.subtopic||'Other').trim()||'Other';}
  function topicKey(indicator){return topicOf(indicator).toLowerCase().replace(/[^a-z0-9]+/g,'-');}

  function ancestors(g){
    const out=[];let p=g;
    while(p?.parent_id){p=data?.geoById.get(p.parent_id);if(p)out.push(p);else break;}
    return out;
  }
  function parentTrail(g){return ancestors(g).filter(p=>p.level!=='country').reverse().map(p=>p.name).join(' › ');}
  function placeLabel(g){const trail=parentTrail(g);return trail?`${g.name} · ${trail}`:g.name;}
  function relationship(){
    const geos=state.slots.map(s=>data.geoById.get(s.geoId)).filter(Boolean);
    if(geos.length<2)return{kind:'neutral',label:'Choose places',detail:'Select at least two geographies to compare.'};
    const county=geos.find(g=>g.level==='county'),constituency=geos.find(g=>g.level==='constituency'),ward=geos.find(g=>g.level==='ward');
    const nested=county&&constituency&&ward&&constituency.parent_id===county.geography_id&&ward.parent_id===constituency.geography_id;
    if(nested)return{kind:'nested',label:'Nested hierarchy',detail:`${ward.name} sits inside ${constituency.name}, inside ${county.name}.`};
    return{kind:'independent',label:'Independent places',detail:'The places do not need to share a parent; comparability is checked at series level.'};
  }

  async function load(){
    if(data)return data;
    const [[geos,inds,series,obs,units,agencies],elig]=await Promise.all([
      KDA.registries(['geographies','indicators','series','observations','units','agencies'],{required:true}),
      KDA.registry('crossLevelEligibility',{required:true})
    ]);
    const safe=x=>Array.isArray(x)?x:[];
    data={geos:safe(geos),inds:safe(inds),series:safe(series),obs:safe(obs),units:safe(units),agencies:safe(agencies),eligibility:Array.isArray(elig?.series)?elig.series:[]};
    data.geoById=new Map(data.geos.map(x=>[x.geography_id,x]));
    data.indById=new Map(data.inds.map(x=>[x.indicator_id,x]));
    data.unitById=new Map(data.units.map(x=>[x.unit_id,x]));
    data.agencyById=new Map(data.agencies.map(x=>[x.agency_id,x]));
    data.eligBySeries=new Map(data.eligibility.map(x=>[x.series_id,x]));
    data.obsBySeries=new Map();
    for(const o of data.obs){if(!data.obsBySeries.has(o.series_id))data.obsBySeries.set(o.series_id,[]);data.obsBySeries.get(o.series_id).push(o);}
    data.seriesByGeoInd=new Map();
    for(const s of data.series){if(!(data.obsBySeries.get(s.series_id)?.length))continue;const key=`${s.geography_id}|${s.indicator_id}`;if(!data.seriesByGeoInd.has(key))data.seriesByGeoInd.set(key,[]);data.seriesByGeoInd.get(key).push(s);}
    return data;
  }

  function defaults(){
    const preferred=data.geos.find(g=>g.level==='county'&&/^Nakuru$/i.test(g.name))||data.geos.find(g=>g.level==='county'&&data.geos.some(c=>c.parent_id===g.geography_id&&c.level==='constituency'));
    const constituency=data.geos.find(g=>g.level==='constituency'&&g.parent_id===preferred?.geography_id)||data.geos.find(g=>g.level==='constituency');
    const ward=data.geos.find(g=>g.level==='ward'&&g.parent_id===constituency?.geography_id)||data.geos.find(g=>g.level==='ward');
    return[preferred,constituency,ward].filter(Boolean).map(g=>({level:g.level,geoId:g.geography_id}));
  }
  function restoreState(){
    const p=route().params||new URLSearchParams(),d=defaults();
    state.slots=[0,1,2].map(i=>{const code=p.get(`x${i}`),g=code?data.geos.find(x=>x.geo_code===code):null;return g?{level:g.level,geoId:g.geography_id}:d[i]||d[0];});
    state.indicator=p.get('xindicator')||'';
    state.multiples=p.get('xmulti')==='1';
    state.topic=p.get('xtopic')||'all';
  }
  function active(){return $('[data-compare-mode="cross-level"]')?.classList.contains('active')===true;}
  function persist({forceMode=false}={}){
    if(!R?.build)return;
    const r=route(),p=new URLSearchParams(r.params||'');
    if(forceMode||active())p.set('mode','cross-level');
    state.slots.forEach((s,i)=>{const g=data.geoById.get(s.geoId);if(g)p.set(`x${i}`,g.geo_code);});
    if(state.indicator)p.set('xindicator',state.indicator);else p.delete('xindicator');
    if(state.multiples)p.set('xmulti','1');else p.delete('xmulti');
    if(state.topic&&state.topic!=='all')p.set('xtopic',state.topic);else p.delete('xtopic');
    history.replaceState(null,'',R.build('compare','',p));
  }

  function seriesFor(geoId,indicatorId){return data.seriesByGeoInd.get(`${geoId}|${indicatorId}`)||[];}
  function evaluate(indicator){
    const geos=state.slots.map(s=>data.geoById.get(s.geoId)).filter(Boolean);
    if(geos.length<2)return{indicator,eligible:false,reason:'Choose at least two places.'};
    const candidateLists=geos.map(g=>seriesFor(g.geography_id,indicator.indicator_id));
    if(candidateLists.some(x=>!x.length)){
      const missing=geos.filter((g,i)=>!candidateLists[i].length).map(g=>levelNames[g.level]||g.level).join(', ');
      return{indicator,eligible:false,reason:`No published series at ${missing}.`};
    }
    const keys=candidateLists.map(rows=>new Set(rows.map(contractKey))),common=[...keys[0]].filter(k=>keys.every(s=>s.has(k)));
    if(!common.length)return{indicator,eligible:false,reason:'Series use incompatible units, transformations or frequency.'};
    const crossLevel=new Set(geos.map(g=>g.level)).size>1;let best=null,blockedReasons=[];
    for(const key of common){
      const chosen=candidateLists.map(rows=>rows.filter(s=>contractKey(s)===key).sort((a,b)=>String(latest(data.obsBySeries.get(b.series_id))?.period_end||'').localeCompare(String(latest(data.obsBySeries.get(a.series_id))?.period_end||'')))[0]);
      if(crossLevel){
        const blocked=chosen.map(s=>data.eligBySeries.get(s.series_id)).filter(e=>e?.cross_level_eligible!==true);
        if(blocked.length){blockedReasons.push(...blocked.map(e=>e?.rule_basis).filter(Boolean));continue;}
      }
      const maps=chosen.map(s=>new Map((data.obsBySeries.get(s.series_id)||[]).map(o=>[periodKey(o),o])));
      const shared=[...maps[0].keys()].filter(k=>maps.every(m=>m.has(k))).sort(),commonKey=shared.at(-1)||null;
      const cells=chosen.map((s,i)=>({geo:geos[i],series:s,obs:commonKey?maps[i].get(commonKey):latest(data.obsBySeries.get(s.series_id)),elig:data.eligBySeries.get(s.series_id)||null}));
      if(cells.some(c=>!c.obs||!Number.isFinite(Number(c.obs.value))))continue;
      const recency=cells.map(c=>String(c.obs.period_end||c.obs.period_start||'')).sort().at(-1)||'';
      const candidate={indicator,eligible:true,reason:'',cells,matched:Boolean(commonKey),commonPeriod:commonKey?(cells[0].obs.period_label||cells[0].obs.period_end):'',unit:data.unitById.get(chosen[0].unit_id||indicator.unit_id),contract:key,crossLevel,recency};
      if(!best||(candidate.matched&&!best.matched)||candidate.recency>best.recency)best=candidate;
    }
    if(best)return best;
    const reason=[...new Set(blockedReasons)].join('; ')||'Selected series are not eligible for cross-level comparison.';
    return{indicator,eligible:false,reason};
  }
  function evaluations(){
    return data.inds.filter(i=>i.lifecycle_status==='active').map(evaluate)
      .filter(x=>x.eligible||state.slots.some(s=>seriesFor(s.geoId,x.indicator.indicator_id).length))
      .sort((a,b)=>Number(b.eligible)-Number(a.eligible)||topicOf(a.indicator).localeCompare(topicOf(b.indicator))||a.indicator.name.localeCompare(b.indicator.name));
  }

  function panel(){
    let p=$('[data-compare-panel="cross-level"]');if(p)return p;
    const switcher=$('.compare-mode-switch'),button=document.createElement('button');
    button.type='button';button.setAttribute('role','tab');button.setAttribute('aria-selected','false');button.dataset.compareMode='cross-level';button.textContent='Across levels';
    switcher?.appendChild(button);
    p=document.createElement('section');p.className='compare-panel xlevel-panel';p.dataset.comparePanel='cross-level';p.hidden=true;p.setAttribute('aria-label','Compare across county constituency and ward levels');
    p.innerHTML=`
      <div class="xlevel-hero">
        <div class="xlevel-hero-copy">
          <p class="eyebrow">COMPARE THE LADDER</p>
          <h3>One measure. Three levels. No fake equivalence.</h3>
          <p>Put a county, constituency and ward on one governed scale. The Atlas checks the exact published series before a value is allowed onto the chart.</p>
          <div class="xlevel-hero-badges"><span>County</span><i>↔</i><span>Constituency</span><i>↔</i><span>Ward</span></div>
        </div>
        <aside class="xlevel-rule-card"><small>Comparability rule</small><strong>Normalize first; compare second.</strong><p>Rates, shares, indices, per-person measures, density and the documented land-area exception may cross levels. Raw population, voter and currency totals stay same-level only.</p></aside>
      </div>
      <div class="xlevel-chain-toolbar"><div data-xlevel-relationship></div><button type="button" data-xlevel-align>↳ Align to one hierarchy</button></div>
      <div class="xlevel-places" data-xlevel-places></div>
      <section class="xlevel-workbench">
        <div class="xlevel-workbench-head"><div><p class="eyebrow">INDICATOR</p><h4>Choose what to compare</h4></div><label class="xlevel-search"><span>Find</span><input type="search" data-xlevel-search placeholder="Area, density, rate…"></label></div>
        <div class="xlevel-topic-filters" data-xlevel-topics></div>
        <div class="xlevel-indicator-row"><label><span>Comparable indicator</span><select data-xlevel-indicator></select></label><button type="button" data-xlevel-multiples>Small multiples</button><button type="button" data-xlevel-download>↓ CSV</button></div>
      </section>
      <div class="xlevel-summary" data-xlevel-summary></div>
      <div data-xlevel-output></div>`;
    root.querySelector('[data-compare-panel="life"]')?.insertAdjacentElement('afterend',p);

    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();activate({persistMode:true});},{capture:true});
    p.addEventListener('change',event=>event.stopPropagation());
    p.addEventListener('click',event=>event.stopPropagation());
    return p;
  }

  function activate({persistMode=true,focus=false}={}){
    const p=panel();
    $$('[data-compare-mode]').forEach(b=>{const on=b.dataset.compareMode==='cross-level';b.classList.toggle('active',on);b.setAttribute('aria-selected',on?'true':'false');});
    $$('[data-compare-panel]').forEach(x=>x.hidden=x!==p);
    if(persistMode)persist({forceMode:true});
    render();
    if(focus)$('[data-xlevel-indicator]',p)?.focus();
  }

  function geoOptions(level,selected){
    return data.geos.filter(g=>g.level===level).sort((a,b)=>a.name.localeCompare(b.name)||a.geo_code.localeCompare(b.geo_code)).map(g=>`<option value="${esc(g.geography_id)}"${g.geography_id===selected?' selected':''}>${esc(placeLabel(g))}</option>`).join('');
  }
  function renderRelationship(){
    const rel=relationship(),host=$('[data-xlevel-relationship]',panel());
    host.innerHTML=`<span class="xlevel-relation-dot ${esc(rel.kind)}"></span><div><strong>${esc(rel.label)}</strong><small>${esc(rel.detail)}</small></div>`;
  }
  function renderPlaces(){
    const host=$('[data-xlevel-places]',panel());
    host.innerHTML=state.slots.map((s,i)=>{const g=data.geoById.get(s.geoId);return`<article class="xlevel-place" data-slot="${i}"><header><span class="xlevel-step">0${i+1}</span><div><small>${esc(levelNames[s.level]||s.level)}</small><strong>${esc(g?.name||'Choose place')}</strong></div></header><div class="xlevel-place-grid"><label><span>Level</span><select data-slot-level aria-label="Place ${i+1} geography level">${levels.map(l=>`<option value="${l}"${l===s.level?' selected':''}>${levelNames[l]}</option>`).join('')}</select></label><label><span>Place</span><select data-slot-geo aria-label="Place ${i+1}">${geoOptions(s.level,s.geoId)}</select></label></div><footer>${g?esc(parentTrail(g)||'Kenya'):''}</footer></article>`;}).join('');
    $$('.xlevel-place',host).forEach(card=>{
      const i=Number(card.dataset.slot),level=$('[data-slot-level]',card),geo=$('[data-slot-geo]',card);
      level.onchange=()=>{const first=data.geos.find(g=>g.level===level.value);state.slots[i]={level:level.value,geoId:first?.geography_id||''};state.indicator='';persist();render();};
      geo.onchange=()=>{state.slots[i].geoId=geo.value;state.indicator='';persist();render();};
    });
    renderRelationship();
  }
  function alignHierarchy(){
    const selected=state.slots.map(s=>data.geoById.get(s.geoId)).filter(Boolean);
    let county=selected.find(g=>g.level==='county');
    if(!county){const first=selected[0],chain=[first,...ancestors(first)];county=chain.find(g=>g?.level==='county');}
    county=county||data.geos.find(g=>g.level==='county');
    let constituency=selected.find(g=>g.level==='constituency'&&g.parent_id===county?.geography_id)||data.geos.find(g=>g.level==='constituency'&&g.parent_id===county?.geography_id);
    constituency=constituency||data.geos.find(g=>g.level==='constituency');
    let ward=selected.find(g=>g.level==='ward'&&g.parent_id===constituency?.geography_id)||data.geos.find(g=>g.level==='ward'&&g.parent_id===constituency?.geography_id);
    ward=ward||data.geos.find(g=>g.level==='ward');
    state.slots=[county,constituency,ward].filter(Boolean).map(g=>({level:g.level,geoId:g.geography_id}));
    while(state.slots.length<3)state.slots.push(defaults()[state.slots.length]||defaults()[0]);
    state.indicator='';persist();render();
  }

  function filteredEligible(evals){
    const q=state.query.trim().toLowerCase();
    return evals.filter(e=>e.eligible)
      .filter(e=>state.topic==='all'||topicKey(e.indicator)===state.topic)
      .filter(e=>!q||`${e.indicator.name} ${e.indicator.topic||''} ${e.indicator.subtopic||''}`.toLowerCase().includes(q));
  }
  function renderTopics(evals){
    const eligible=evals.filter(e=>e.eligible),counts=new Map();
    for(const e of eligible){const key=topicKey(e.indicator),label=topicOf(e.indicator);if(!counts.has(key))counts.set(key,{label,count:0});counts.get(key).count+=1;}
    const host=$('[data-xlevel-topics]',panel());
    host.innerHTML=`<button type="button" data-topic="all" class="${state.topic==='all'?'active':''}">All <span>${eligible.length}</span></button>${[...counts.entries()].slice(0,8).map(([key,v])=>`<button type="button" data-topic="${esc(key)}" class="${state.topic===key?'active':''}">${esc(v.label)} <span>${v.count}</span></button>`).join('')}`;
    $$('[data-topic]',host).forEach(btn=>btn.onclick=()=>{state.topic=btn.dataset.topic;state.indicator='';persist();render();});
  }
  function renderIndicator(evals){
    const eligible=filteredEligible(evals),allEligible=evals.filter(e=>e.eligible),blocked=evals.filter(e=>!e.eligible),select=$('[data-xlevel-indicator]',panel());
    if(!eligible.some(e=>e.indicator.indicator_id===state.indicator))state.indicator=eligible[0]?.indicator.indicator_id||'';
    select.innerHTML=eligible.length?eligible.map(e=>`<option value="${esc(e.indicator.indicator_id)}"${e.indicator.indicator_id===state.indicator?' selected':''}>${esc(e.indicator.name)}</option>`).join(''):'<option value="">No comparable indicators match this filter</option>';
    select.disabled=!eligible.length;
    select.onchange=()=>{state.indicator=select.value;state.multiples=false;persist();renderOutput(evals);};
    const multi=$('[data-xlevel-multiples]',panel());multi.disabled=allEligible.length<2;multi.classList.toggle('active',state.multiples);multi.textContent=state.multiples?'Single indicator':`Small multiples (${allEligible.length})`;multi.onclick=()=>{state.multiples=!state.multiples;persist();renderOutput(evals);};
    $('[data-xlevel-download]',panel()).onclick=()=>downloadCsv(evals);
    return{eligible:allEligible,blocked};
  }
  function renderWorkbench(evals){
    renderTopics(evals);renderIndicator(evals);
    const search=$('[data-xlevel-search]',panel());search.value=state.query;
    search.oninput=()=>{state.query=search.value;const counts=renderIndicator(evals);renderSummary(counts,filteredEligible(evals).find(e=>e.indicator.indicator_id===state.indicator)||counts.eligible[0]);renderOutput(evals);};
  }

  function animateChecks(metric){
    const host=$('.xlevel-passport',panel());if(!host)return;const checks=$$('.xlevel-passport-item',host),delay=reduced()?0:110;
    checks.forEach((n,i)=>{n.classList.add('pending');setTimeout(()=>n.classList.remove('pending'),delay*i);});
  }
  function passport(metric){
    const seriesEligible=metric?.crossLevel?metric.cells.every(c=>c.elig?.cross_level_eligible===true):true;
    const items=[
      ['Series eligibility',seriesEligible,'Canonical rule passed'],
      ['Units & transform',Boolean(metric?.contract),'Same comparison contract'],
      ['Reference period',Boolean(metric?.matched),metric?.matched?(metric.commonPeriod||'Matched'):'Periods differ'],
      ['No inheritance',true,'Every value is local to its geography']
    ];
    return`<div class="xlevel-passport">${items.map(([name,ok,detail])=>`<div class="xlevel-passport-item ${ok?'pass':'warn'}"><i>${ok?'✓':'!'}</i><span><strong>${esc(name)}</strong><small>${esc(detail)}</small></span></div>`).join('')}</div>`;
  }
  function renderSummary(counts,metric){
    const host=$('[data-xlevel-summary]',panel()),rel=relationship();
    host.innerHTML=`<div class="xlevel-summary-copy"><span class="xlevel-summary-kicker">COMPARABILITY PASSPORT</span><strong>${counts.eligible.length} indicators cleared for these places</strong><small>${counts.blocked.length} are hidden because they are unavailable or would create a false comparison. ${esc(rel.label)}.</small></div>${passport(metric)}`;
    animateChecks(metric);
  }

  function barDomain(cells){const vals=cells.map(c=>Number(c.obs.value)).filter(Number.isFinite),min=Math.min(0,...vals),max=Math.max(0,...vals),span=Math.max(1e-9,max-min),zero=((0-min)/span)*100;return{min,max,span,zero};}
  function deltaLabel(value,base,unit){
    const v=Number(value),b=Number(base);if(!Number.isFinite(v)||!Number.isFinite(b)||v===b)return'Baseline';
    if(unit?.code==='percent')return`${v>b?'+':''}${(v-b).toLocaleString('en-KE',{maximumFractionDigits:1})} pp vs first`;
    if(b===0)return`${v>b?'+':''}${fmt(v-b,unit)} vs first`;
    const pct=((v-b)/Math.abs(b))*100;return`${pct>0?'+':''}${pct.toLocaleString('en-KE',{maximumFractionDigits:1})}% vs first`;
  }
  function sourceLabel(cell){const agency=data.agencyById.get(cell.series.agency_id);return agency?.abbreviation||agency?.name||'Published source';}
  function chart(metric,{compact=false}={}){
    const d=barDomain(metric.cells),title=metric.indicator.name,period=metric.matched?`Matched period · ${metric.commonPeriod}`:'Different published periods · shown explicitly',base=metric.cells[0]?.obs?.value;
    return`<article class="xlevel-chart ${compact?'compact':''}"><div class="xlevel-chart-head"><div><small>${esc(topicOf(metric.indicator))}</small><h4>${esc(title)}</h4><span class="xlevel-axis-note">Linear scale · zero baseline · ${esc(period)}</span></div><div class="xlevel-unit-pill">${esc(metric.unit?.name||metric.unit?.code||'Published unit')}</div></div><div class="xlevel-bars">${metric.cells.map((c,i)=>{const v=Number(c.obs.value),pos=((v-d.min)/d.span)*100,left=Math.min(d.zero,pos),width=Math.abs(pos-d.zero);return`<div class="xlevel-bar-row"><div class="xlevel-place-label"><span>${esc(levelNames[c.geo.level]||c.geo.level)}</span><strong>${esc(c.geo.name)}</strong><small>${esc(c.geo.geo_code)}</small></div><div class="xlevel-track" role="img" aria-label="${esc(c.geo.name)}: ${esc(fmt(v,metric.unit))}; ${esc(c.obs.period_label||c.obs.period_end||'')}"><i class="xlevel-zero" style="left:${d.zero.toFixed(2)}%"></i><i class="xlevel-bar" style="left:${left.toFixed(2)}%;width:${Math.max(width,.35).toFixed(2)}%"></i></div><div class="xlevel-value"><strong>${esc(fmt(v,metric.unit))}</strong><span class="xlevel-delta ${i===0?'base':''}">${esc(deltaLabel(v,base,metric.unit))}</span><small>${esc(c.obs.period_label||c.obs.period_end||'')} · ${esc(sourceLabel(c))}${c.obs.badge?` · ${esc(c.obs.badge)}`:''}</small></div></div>`;}).join('')}</div>${metric.crossLevel?'<p class="xlevel-chart-note">✓ Every concrete series passed the cross-level eligibility gate. No parent value was inherited.</p>':''}</article>`;
  }
  function blockedDetails(evals){
    const blocked=evals.filter(e=>!e.eligible).slice(0,12);if(!blocked.length)return'';
    return`<details class="xlevel-blocked"><summary>Why some indicators are not shown</summary><div>${blocked.map(e=>`<p><strong>${esc(e.indicator.name)}</strong><span>${esc(e.reason)}</span></p>`).join('')}</div></details>`;
  }
  function renderOutput(evals){
    const counts={eligible:evals.filter(e=>e.eligible),blocked:evals.filter(e=>!e.eligible)},filtered=filteredEligible(evals),metric=filtered.find(e=>e.indicator.indicator_id===state.indicator)||filtered[0]||counts.eligible.find(e=>e.indicator.indicator_id===state.indicator)||counts.eligible[0]||null;
    renderSummary(counts,metric);
    const out=$('[data-xlevel-output]',panel());
    if(!metric){out.innerHTML='<div class="xlevel-empty"><strong>No honest comparison is available for this selection.</strong><p>Try another geography combination or clear the indicator filter. The Atlas will not substitute a broader-area value.</p></div>'+blockedDetails(evals);return;}
    if(state.multiples){
      const gallery=counts.eligible.slice(0,9);out.innerHTML=`<div class="xlevel-gallery-head"><div><p class="eyebrow">SMALL MULTIPLES</p><h4>${gallery.length} comparable indicators at a glance</h4></div><span>Same eligibility rules · independent scales</span></div><div class="xlevel-multiples">${gallery.map(m=>chart(m,{compact:true})).join('')}</div>${counts.eligible.length>9?`<p class="source-note">Showing 9 of ${counts.eligible.length} comparable indicators. Use the selector for the full set.</p>`:''}${blockedDetails(evals)}`;
    }else{
      const warning=metric.matched?'':`<div class="xlevel-warning"><strong>Reference periods differ.</strong><span>The series are structurally comparable, but each row keeps its own published period. Treat differences cautiously.</span></div>`;
      out.innerHTML=`${warning}${chart(metric)}${blockedDetails(evals)}`;
    }
  }

  function downloadCsv(evals){
    const rows=[['indicator','place','level','geo_code','value','period','badge','series_code','cross_level_eligible','eligibility_basis']];
    const metrics=state.multiples?evals.filter(e=>e.eligible):evals.filter(e=>e.eligible&&e.indicator.indicator_id===state.indicator);
    for(const m of metrics)for(const c of m.cells)rows.push([m.indicator.name,c.geo.name,c.geo.level,c.geo.geo_code,c.obs.value,c.obs.period_label||c.obs.period_end||'',c.obs.badge||'',c.series.series_code,c.elig?.cross_level_eligible??'',c.elig?.rule_basis||'']);
    const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='kenya-data-atlas-compare-across-levels.csv';a.click();URL.revokeObjectURL(a.href);
  }

  function render(){
    if(!data)return;renderPlaces();const evals=evaluations();renderWorkbench(evals);renderOutput(evals);
    $('[data-xlevel-align]',panel()).onclick=alignHierarchy;
    persist();
  }

  async function boot(){
    if(bootPromise)return bootPromise;
    bootPromise=(async()=>{
      await load();restoreState();panel();render();
      if((route().params||new URLSearchParams()).get('mode')==='cross-level')activate({persistMode:false});
      return window.KDACompareCross;
    })().catch(error=>{
      console.error('Compare Across Levels:',error);const p=panel();const out=$('[data-xlevel-output]',p);if(out)out.innerHTML='<div class="xlevel-empty"><strong>Across-level comparison could not load.</strong><p>The standard county comparison remains available.</p></div>';return null;
    });
    return bootPromise;
  }

  window.addEventListener('kda:route',event=>{
    if(event.detail?.view!=='compare')return;
    const mode=event.detail?.params?.get?.('mode');
    if(mode==='cross-level')setTimeout(()=>activate({persistMode:false}),0);
  });
  window.KDACompareCross={boot,activate,state:()=>({...state})};
  boot();
})();
