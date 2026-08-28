/* Kenya Data Atlas — dedicated Compare workspace (P01).
 *
 * Compare is deliberately data-heavy, so it does not request the master
 * series/observation registries during first paint. It boots only when the
 * comparison workspace approaches the viewport or is explicitly used, and all
 * data comes through the shared KDAData promise cache.
 */
(function(){
  'use strict';
  const root=document.querySelector('#compare');
  if(!root||!root.classList.contains('compare-hub'))return;
  const KDA=window.KDAData;
  const $=(s,r=root)=>r.querySelector(s);
  const $$=(s,r=root)=>[...r.querySelectorAll(s)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const csvCell=value=>`"${String(value??'').replaceAll('"','""')}"`;
  const TOPIC_ORDER={people:1,economy:2,health:3,finance:4,representation:5,infrastructure:6,resilience:7};
  const TOPIC_LABELS={people:'People',economy:'Economy',health:'Health',finance:'Public finance',representation:'Representation',infrastructure:'Infrastructure',resilience:'Resilience'};
  const LIFE_ORDER=['costs','housing','health','education','work','community','local-services'];
  const LIFE_LABELS={costs:'Household costs',housing:'Home & housing',health:'Health nearby',education:'Education',work:'Work & opportunity',community:'Community & place','local-services':'Local services'};
  let bootPromise=null,booted=false,pendingMode='direct';

  if(!document.querySelector('link[data-life-language-style]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='assets/compare-life-natural.css';link.dataset.lifeLanguageStyle='true';document.head.appendChild(link);
  }

  function showLoadState(){
    const table=$('#compare-direct-table'),cards=$('#life-cards');
    if(table)table.innerHTML='<div class="compare-empty">Loading published county indicators on demand…</div>';
    if(cards&&!cards.children.length)cards.innerHTML='<div class="life-empty">Comparison data loads when this workspace is opened.</div>';
  }
  function showFailure(message){
    const text=esc(message||'The published comparison registries could not be loaded.');
    const table=$('#compare-direct-table'),cards=$('#life-cards'),hero=$('#life-hero');
    if(table)table.innerHTML=`<div class="compare-empty">${text}</div>`;
    if(cards)cards.innerHTML=`<div class="life-empty">${text}</div>`;
    if(hero)hero.innerHTML='<div><h3>Comparison is temporarily unavailable.</h3><p>The rest of Kenya Data Atlas remains usable.</p></div>';
    root.dataset.compareState='error';
  }

  function badgeHtml(letter){return letter?`<span class="badge ${esc(String(letter).toLowerCase())}">${esc(letter)}</span>`:'<span class="badge missing">N/A</span>';}
  function normTopic(indicator){return String(indicator.tab||indicator.topic||'other').toLowerCase();}

  async function boot(){
    if(bootPromise)return bootPromise;
    showLoadState();root.dataset.compareState='loading';
    bootPromise=(async()=>{
      if(!KDA)throw new Error('Shared Atlas data loader is unavailable.');
      const [geographies,indicators,series,observations,units,agencies]=await KDA.registries(['geographies','indicators','series','observations','units','agencies'],{required:true});
      if(![geographies,indicators,series,observations,units].every(Array.isArray))throw new Error('Published comparison registries are incomplete.');

      const countyGeos=geographies.filter(g=>g.level==='county').sort((a,b)=>a.name.localeCompare(b.name));
      const geoById=new Map(geographies.map(g=>[g.geography_id,g]));
      const unitById=new Map(units.map(u=>[u.unit_id,u]));
      const agencyById=new Map((agencies||[]).map(a=>[a.agency_id,a]));
      const obsBySeries=new Map();
      for(const o of observations){if(!obsBySeries.has(o.series_id))obsBySeries.set(o.series_id,[]);obsBySeries.get(o.series_id).push(o);}
      for(const rows of obsBySeries.values())rows.sort((a,b)=>String(a.period_start).localeCompare(String(b.period_start))||String(a.period_end).localeCompare(String(b.period_end)));
      const countySeries=series.filter(s=>geoById.get(s.geography_id)?.level==='county'&&(obsBySeries.get(s.series_id)?.length||0));
      const seriesByIndicator=new Map();
      for(const s of countySeries){if(!seriesByIndicator.has(s.indicator_id))seriesByIndicator.set(s.indicator_id,[]);seriesByIndicator.get(s.indicator_id).push(s);}

      const preferred=pattern=>countyGeos.find(g=>pattern.test(g.name))?.name;
      const defaults=[preferred(/^Nakuru$/i),preferred(/^Nairobi/i),preferred(/^Kiambu$/i)].filter(Boolean);
      while(defaults.length<Math.min(3,countyGeos.length)){const next=countyGeos.find(g=>!defaults.includes(g.name));if(!next)break;defaults.push(next.name);}
      const state={direct:defaults.slice(0,Math.max(2,Math.min(3,defaults.length))),home:defaults[0]||countyGeos[0]?.name||'',away:defaults[1]||countyGeos[1]?.name||countyGeos[0]?.name||'',topic:'all',query:''};
      const countyByName=name=>countyGeos.find(g=>g.name===name);
      const countyOptions=selected=>countyGeos.map(g=>`<option value="${esc(g.name)}"${g.name===selected?' selected':''}>${esc(g.name)}</option>`).join('');
      const seriesGroupKey=s=>[s.comparability_group||'',s.unit_id||'',s.frequency||'',s.period_type||'',s.transformation||'',s.price_basis||'',s.seasonal_adjustment||''].join('|');
      const periodKey=o=>`${o.period_start}|${o.period_end}`;
      const latestObservation=s=>(obsBySeries.get(s?.series_id)||[]).at(-1)||null;

      function formatValue(value,unit){
        if(value===null||value===undefined||Number.isNaN(Number(value)))return '—';
        const n=Number(value),dp=unit?.decimal_places??1;
        if(unit?.code==='persons'||unit?.code==='count')return new Intl.NumberFormat('en-KE',{notation:Math.abs(n)>=100000?'compact':'standard',maximumFractionDigits:Math.abs(n)>=100000?2:0}).format(n);
        if(unit?.code==='kes_million')return `KSh ${new Intl.NumberFormat('en-KE',{maximumFractionDigits:1}).format(n)} mn`;
        if(unit?.code==='kes_per_litre')return `KSh ${n.toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}/L`;
        if(unit?.code==='percent')return `${n.toLocaleString('en-KE',{minimumFractionDigits:dp,maximumFractionDigits:dp})}%`;
        if(unit?.code==='km2')return `${n.toLocaleString('en-KE',{maximumFractionDigits:1})} km²`;
        if(unit?.code==='usd')return `US$${new Intl.NumberFormat('en-KE',{notation:Math.abs(n)>=1000000?'compact':'standard',maximumFractionDigits:2}).format(n)}`;
        if(unit?.code==='usd_per_person')return `US$${n.toLocaleString('en-KE',{maximumFractionDigits:2})}/person`;
        const numeric=n.toLocaleString('en-KE',{minimumFractionDigits:dp,maximumFractionDigits:dp});
        return unit?.symbol?`${numeric} ${unit.symbol}`:numeric;
      }

      function bestGroupForIndicator(indicatorId,geoIds){
        const groups=new Map();
        for(const s of seriesByIndicator.get(indicatorId)||[]){
          if(!geoIds.includes(s.geography_id))continue;
          const key=seriesGroupKey(s);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);
        }
        return [...groups.entries()].map(([key,rows])=>({key,rows,coverage:new Set(rows.map(s=>s.geography_id)).size,recency:rows.map(latestObservation).filter(Boolean).map(o=>o.period_end).sort().at(-1)||''})).sort((a,b)=>b.coverage-a.coverage||b.recency.localeCompare(a.recency))[0]||null;
      }

      function comparableMetric(indicator,selectedNames){
        const selectedGeos=selectedNames.map(countyByName).filter(Boolean),geoIds=selectedGeos.map(g=>g.geography_id),group=bestGroupForIndicator(indicator.indicator_id,geoIds);
        if(!group)return null;
        const seriesForGeo=new Map();
        for(const s of group.rows){const current=seriesForGeo.get(s.geography_id);if(!current||(latestObservation(s)?.period_end||'')>(latestObservation(current)?.period_end||''))seriesForGeo.set(s.geography_id,s);}
        let common=null;
        if(selectedGeos.length&&selectedGeos.every(g=>seriesForGeo.has(g.geography_id))){
          const maps=selectedGeos.map(g=>new Map((obsBySeries.get(seriesForGeo.get(g.geography_id).series_id)||[]).map(o=>[periodKey(o),o])));
          const shared=[...maps[0].keys()].filter(key=>maps.every(m=>m.has(key))).sort();const key=shared.at(-1);
          if(key)common=new Map(selectedGeos.map((g,i)=>[g.geography_id,maps[i].get(key)]));
        }
        const cells=selectedGeos.map(g=>{const s=seriesForGeo.get(g.geography_id),obs=common?.get(g.geography_id)||latestObservation(s);return{geo:g,series:s||null,obs:obs||null};});
        const available=cells.filter(c=>c.obs).length;if(!available)return null;
        return{indicator,topic:normTopic(indicator),unit:unitById.get(group.rows[0]?.unit_id||indicator.unit_id),cells,matched:Boolean(common&&available===selectedGeos.length),available,total:selectedGeos.length,commonPeriod:common?[...common.values()][0]?.period_label||'':''};
      }
      function allMetrics(selectedNames){return indicators.filter(i=>i.lifecycle_status==='active'&&seriesByIndicator.has(i.indicator_id)).map(i=>comparableMetric(i,selectedNames)).filter(Boolean).sort((a,b)=>(TOPIC_ORDER[a.topic]||50)-(TOPIC_ORDER[b.topic]||50)||a.indicator.name.localeCompare(b.indicator.name));}

      function renderPlaceStrip(){
        const strip=$('#compare-place-strip');if(!strip)return;
        strip.innerHTML=state.direct.map((name,index)=>`<div class="compare-place-card" data-place-index="${index}"><label>Place ${index+1}<select aria-label="Comparison place ${index+1}">${countyOptions(name)}</select></label>${state.direct.length>2?'<button class="remove-place" type="button" aria-label="Remove place">×</button>':''}</div>`).join('');
        $$('.compare-place-card',strip).forEach(card=>{
          const index=Number(card.dataset.placeIndex),select=$('select',card);
          select.addEventListener('change',()=>{if(state.direct.some((n,i)=>i!==index&&n===select.value)){select.value=state.direct[index];return;}state.direct[index]=select.value;renderDirect();});
          $('.remove-place',card)?.addEventListener('click',()=>{state.direct.splice(index,1);renderDirect();});
        });
      }

      function renderDirect(){
        renderPlaceStrip();
        const metrics=allMetrics(state.direct),matchedCount=metrics.filter(m=>m.matched).length,partialCount=metrics.length-matchedCount,topics=[...new Set(metrics.map(m=>m.topic))];
        const filtered=metrics.filter(m=>(state.topic==='all'||m.topic===state.topic)&&(!state.query||`${m.indicator.name} ${m.indicator.subtopic||''} ${m.indicator.topic||''}`.toLowerCase().includes(state.query.toLowerCase())));
        const summary=$('#compare-direct-summary');
        if(summary)summary.innerHTML=`<div class="compare-coverage-note"><span><strong>${metrics.length}</strong> published county metrics available. <strong>${matchedCount}</strong> have a common reference period${partialCount?`; ${partialCount} stay visible with explicit warnings`:''}.</span><span class="status-chip${partialCount?' partial':''}">${partialCount?'Matched + transparent gaps':'Fully matched'}</span></div><div class="compare-tools"><div class="compare-topic-filters"><button type="button" data-topic="all" class="${state.topic==='all'?'active':''}">All metrics <span>${metrics.length}</span></button>${topics.map(t=>`<button type="button" data-topic="${esc(t)}" class="${state.topic===t?'active':''}">${esc(TOPIC_LABELS[t]||t)} <span>${metrics.filter(m=>m.topic===t).length}</span></button>`).join('')}</div><label class="compare-search"><span>Find a metric</span><input type="search" value="${esc(state.query)}" placeholder="Population, budget, petrol…"></label></div>`;
        $$('[data-topic]',summary).forEach(btn=>btn.addEventListener('click',()=>{state.topic=btn.dataset.topic;renderDirect();}));
        $('.compare-search input',summary)?.addEventListener('input',e=>{state.query=e.target.value;renderDirect();});
        const grouped=new Map();for(const metric of filtered){if(!grouped.has(metric.topic))grouped.set(metric.topic,[]);grouped.get(metric.topic).push(metric);}
        const table=$('#compare-direct-table');if(!table)return;
        if(!filtered.length){table.innerHTML='<div class="compare-empty">No published county metrics match this filter.</div>';return;}
        table.innerHTML=[...grouped.entries()].map(([topic,rows])=>`<section class="compare-topic"><div class="compare-topic-title">${esc(TOPIC_LABELS[topic]||topic)}</div><table class="compare-matrix"><thead><tr><th>Metric</th>${state.direct.map(n=>`<th>${esc(n)}</th>`).join('')}</tr></thead><tbody>${rows.map(metric=>`<tr><td><span class="compare-metric-name">${esc(metric.indicator.name)}</span><span class="compare-metric-meta"><span>${esc(metric.indicator.subtopic||metric.indicator.topic||'')}</span><span class="compare-status ${metric.matched?'matched':'partial'}">${metric.matched?'Matched period':'Period/gap warning'}</span></span></td>${metric.cells.map(cell=>cell.obs?`<td><span class="compare-cell-value">${esc(formatValue(cell.obs.value,metric.unit))}</span><span class="compare-cell-meta"><span>${esc(cell.obs.period_label)}</span>${badgeHtml(cell.obs.badge)}<span>${esc(agencyById.get(cell.series?.agency_id)?.abbreviation||agencyById.get(cell.series?.agency_id)?.name||'')}</span></span></td>`:'<td><span class="compare-cell-missing">—</span><span class="compare-cell-meta">No published value at this geography</span></td>').join('')}</tr>`).join('')}</tbody></table></section>`).join('');
      }

      function lifeNarrative(metric){
        const [home,away]=metric.cells;if(!home?.obs||!away?.obs)return null;
        const a=Number(home.obs.value),b=Number(away.obs.value);if(!Number.isFinite(a)||!Number.isFinite(b))return null;
        const delta=b-a,pp=Math.abs(delta).toFixed(1),pct=a===0?null:((b-a)/Math.abs(a))*100,code=metric.indicator.indicator_code||'',name=String(metric.indicator.name||'').toLowerCase();
        let category='community',label=metric.indicator.short_name||metric.indicator.name,headline='',explanation='',polarity='neutral';
        if(code==='IND-RENT-BURDEN'){category='costs';label='Rent and household spending';headline=delta===0?'feel about the same squeeze from rent':delta>0?`see rent take ${pp} percentage points more of household spending`:`see rent take ${pp} percentage points less of household spending`;polarity=delta<0?'positive':delta>0?'negative':'neutral';}
        else if(code==='IND-HOUSING-OWNER-OCCUPIED'){category='housing';label='Owning your home';headline=delta===0?'see about the same owner-occupation rate':`see owner-occupied homes ${pp} percentage points ${delta>0?'more':'less'} common`;polarity=delta>0?'positive':delta<0?'negative':'neutral';}
        else if(code==='IND-HEALTH-FACILITY-STOCK'){category='health';label='Health facilities around the county';headline=delta===0?'have about the same number of listed health facilities':`have ${Math.abs(delta).toLocaleString('en-KE',{maximumFractionDigits:0})} ${delta>0?'more':'fewer'} listed health facilities`;}
        else if(code==='IND-SCHOOL-ATTENDANCE-RATE'){category='education';label='Being in school or learning';headline=delta===0?'see about the same attendance rate':`see the attendance measure ${pp} percentage points ${delta>0?'higher':'lower'}`;}
        else if(code==='IND-LABOUR-FORCE-PARTICIPATION'){category='work';label='Labour-force participation';headline=delta===0?'see about the same labour-force participation':`see labour-force participation ${pp} percentage points ${delta>0?'higher':'lower'}`;}
        else if(code==='IND-FUEL-PETROL'||name.includes('petrol')){category='costs';label='Filling up the car';headline=delta===0?'pay about the same for Super Petrol':`pay KSh ${Math.abs(delta).toFixed(2)} ${delta>0?'more':'less'} per litre`;polarity=delta<0?'positive':delta>0?'negative':'neutral';}
        else if(code==='IND-POPULATION'||name==='population'){category='community';label='How many people share the county';headline=delta===0?'live in a county with about the same population':`live in a county with ${Math.abs(pct||0).toFixed(0)}% ${delta>0?'more':'fewer'} residents`;}
        else if(code==='IND-LAND-AREA'||name.includes('land area')){category='community';label='How much ground the county covers';headline=delta===0?'live in a county of about the same physical size':`live in a county ${delta>0?'larger':'smaller'} by land area`;}
        else if(name.includes('budget')&&!name.includes('absorption')){category='local-services';label='County government budget';headline=delta===0?'see a county budget about the same size':`see a county budget ${Math.abs(pct||0).toFixed(0)}% ${delta>0?'larger':'smaller'}`;}
        else if(name.includes('absorption')){category='local-services';label='How much of the budget gets used';headline=delta===0?'see about the same budget absorption':`see absorption ${pp} percentage points ${delta>0?'higher':'lower'}`;}
        else if(name.includes('registered voter')){category='community';label='Size of the electorate';headline=delta===0?'join an electorate about the same size':`join an electorate with ${Math.abs(pct||0).toFixed(0)}% ${delta>0?'more':'fewer'} registered voters`;}
        else return null;
        explanation=`${state.home}: ${formatValue(a,metric.unit)} · ${state.away}: ${formatValue(b,metric.unit)} · ${away.obs.period_label}.`;
        return{metric,category,label,headline,explanation,polarity,magnitude:Math.abs(pct??delta),sourceName:agencyById.get(away.series?.agency_id)?.abbreviation||agencyById.get(away.series?.agency_id)?.name||''};
      }

      function renderLifeControls(){const home=$('#life-home'),away=$('#life-away');if(home){home.innerHTML=countyOptions(state.home);home.value=state.home;}if(away){away.innerHTML=countyOptions(state.away);away.value=state.away;}}
      function renderLife(){
        renderLifeControls();const hero=$('#life-hero'),cards=$('#life-cards');if(!hero||!cards)return;
        if(state.home===state.away){hero.innerHTML='<div><h3>Choose two different counties.</h3><p>Pick another county to compare the measurable conditions around you.</p></div>';cards.innerHTML='';return;}
        const narratives=allMetrics([state.home,state.away]).filter(m=>m.matched&&m.available===2).map(lifeNarrative).filter(Boolean).sort((a,b)=>LIFE_ORDER.indexOf(a.category)-LIFE_ORDER.indexOf(b.category)||b.magnitude-a.magnitude);
        const grouped=new Map();for(const item of narratives){if(!grouped.has(item.category))grouped.set(item.category,[]);grouped.get(item.category).push(item);}
        const highlights=narratives.filter(d=>['costs','housing','health','education','work'].includes(d.category)).slice(0,5);
        hero.innerHTML=`<div><p class="eyebrow">${esc(state.home)} → ${esc(state.away)}</p><h3>If <em>${esc(state.away)}</em> were home instead of ${esc(state.home)}…</h3><p>${highlights.length?'The clearest matched-period differences are summarised below.':'The Atlas has only a small number of everyday-life measures that can be compared responsibly for this pair.'} These are county statistics, not a prediction of personal circumstances.</p>${highlights.length?`<div class="life-summary-grid">${highlights.map(d=>`<div class="life-summary-item"><small>${esc(LIFE_LABELS[d.category])}</small><strong>${esc(d.headline)}</strong></div>`).join('')}</div>`:''}</div><div class="life-match-count"><strong>${narratives.length}</strong><span>everyday-life comparisons with matched periods</span><small>${grouped.size} resident-facing categories</small></div>`;
        cards.innerHTML=narratives.length?`<div class="life-breakdown-intro"><p class="eyebrow">${esc(state.away)} vs. ${esc(state.home)}</p><h3>Measured differences</h3></div>${LIFE_ORDER.filter(c=>grouped.has(c)).map(category=>`<section class="life-topic"><div class="life-topic-head"><span>${esc(LIFE_LABELS[category])}</span><small>${grouped.get(category).length} comparison${grouped.get(category).length===1?'':'s'}</small></div><div class="life-topic-list">${grouped.get(category).map(d=>`<article class="life-card ${d.polarity}"><div class="life-card-top"><div><small>${esc(d.label)}</small><strong>${esc(d.headline)}</strong></div>${badgeHtml(d.metric.cells[1].obs.badge)}</div><p class="life-explanation">${esc(d.explanation)}</p><div class="life-values"><span><b>${esc(state.home)}</b>${esc(formatValue(d.metric.cells[0].obs.value,d.metric.unit))}</span><span class="life-arrow">→</span><span><b>${esc(state.away)}</b>${esc(formatValue(d.metric.cells[1].obs.value,d.metric.unit))}</span></div><p class="life-source-line">${esc(d.metric.cells[1].obs.period_label)}${d.sourceName?` · ${esc(d.sourceName)}`:''} · ${esc(d.metric.indicator.name)}</p></article>`).join('')}</div></section>`).join('')}`:'<div class="life-empty">There are not yet enough matched county observations for a resident-facing comparison. Try Direct Compare for the full statistical view.</div>';
      }

      function downloadDirectCsv(){
        const metrics=allMetrics(state.direct),header=['metric','topic','unit',...state.direct.flatMap(n=>[`${n} value`,`${n} period`,`${n} badge`])],rows=[header.map(csvCell).join(',')];
        for(const m of metrics){const base=[m.indicator.name,TOPIC_LABELS[m.topic]||m.topic,m.unit?.name||''],cells=m.cells.flatMap(c=>c.obs?[c.obs.value,c.obs.period_label,c.obs.badge]:['','','']);rows.push([...base,...cells].map(csvCell).join(','));}
        const blob=new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`kenya-data-atlas-compare-${state.direct.map(n=>n.toLowerCase().replace(/\s+/g,'-')).join('-vs-')}.csv`;a.click();URL.revokeObjectURL(a.href);
      }

      function activateMode(mode){
        pendingMode=mode||'direct';
        $$('[data-compare-mode]').forEach(button=>{const active=button.dataset.compareMode===pendingMode;button.classList.toggle('active',active);button.setAttribute('aria-selected',active?'true':'false');});
        $$('[data-compare-panel]').forEach(panel=>{panel.hidden=panel.dataset.comparePanel!==pendingMode;});
        if(pendingMode==='life')renderLife();
      }
      $$('[data-compare-mode]').forEach(button=>button.addEventListener('click',()=>activateMode(button.dataset.compareMode)));
      $('#compare-add-place')?.addEventListener('click',()=>{if(state.direct.length>=4)return;const next=countyGeos.find(g=>!state.direct.includes(g.name));if(!next)return;state.direct.push(next.name);renderDirect();});
      $('#compare-download')?.addEventListener('click',downloadDirectCsv);
      $('#life-home')?.addEventListener('change',e=>{state.home=e.target.value;renderLife();});
      $('#life-away')?.addEventListener('change',e=>{state.away=e.target.value;renderLife();});
      $('#life-swap')?.addEventListener('click',()=>{[state.home,state.away]=[state.away,state.home];renderLife();});

      renderDirect();renderLife();activateMode(pendingMode);
      booted=true;root.dataset.compareState='ready';
      window.KDACompare={ready:true,renderDirect,renderLife};
    })().catch(error=>{console.error('Atlas Compare:',error);showFailure(error?.message||error);throw error;});
    return bootPromise;
  }

  root.addEventListener('click',event=>{
    const mode=event.target.closest('[data-compare-mode]');
    if(mode&&!booted){pendingMode=mode.dataset.compareMode;boot().then(()=>{}).catch(()=>{});}
  },{capture:true});
  root.addEventListener('pointerdown',()=>boot().catch(()=>{}),{once:true});
  root.addEventListener('focusin',()=>boot().catch(()=>{}),{once:true});
  if(KDA)KDA.whenVisible(root,()=>boot(),{rootMargin:'650px 0px'});
  if(location.hash==='#compare')boot().catch(()=>{});
  window.addEventListener('hashchange',()=>{if(location.hash==='#compare')boot().catch(()=>{});});
  window.KDACompare={ready:false,boot};
})();
