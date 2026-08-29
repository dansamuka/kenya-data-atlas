/* Kenya Data Atlas — routed-view state coordinator.
 * Adds URL-restorable state around existing P01 modules without duplicating
 * their data loaders or business logic.
 */
(function(){
  'use strict';
  const KDA=window.KDAData,R=window.KDARouter;
  if(!R)return;
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let restoringCompare=false,geoRouteKey='',seriesRouteKey='',seriesRange='5Y';
  let geographyPromise=null,seriesDataPromise=null;
  const geographies=()=>geographyPromise||(geographyPromise=KDA?.registry('geographies').then(x=>Array.isArray(x)?x:[])||Promise.resolve([]));
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));

  function route(){return R.current()||R.parse();}
  function mapByCode(rows){return new Map(rows.map(g=>[g.geo_code,g]));}
  function mapByName(rows){return new Map(rows.map(g=>[g.name,g]));}

  // ------------------------------- Home teaser + dedicated Pulse categories
  function pulseCategory(indicator){
    const text=`${indicator?.tab||''} ${indicator?.topic||''} ${indicator?.subtopic||''} ${indicator?.name||''}`.toLowerCase();
    if(/environment|climate|emission|forest|energy|water|resilience/.test(text))return'environment';
    if(/econom|finance|trade|income|gdp|debt|inflation|price|employment|labour/.test(text))return'economy';
    if(/people|health|education|poverty|population|social|life|mortality|birth/.test(text))return'social';
    return'institutions';
  }
  function cloneHomeGlance(){
    const source=$('#pulse-grid'),target=$('#home-glance-grid');if(!source||!target)return;
    const cards=$$('.metric-card',source).slice(0,6);
    if(!cards.length)return;
    target.innerHTML=cards.map(card=>card.outerHTML).join('');
  }
  async function preparePulse(){
    const root=$('#pulse-view');if(!root)return;
    window.KDAOptional?.load?.();
    const indicators=KDA?await KDA.registry('indicators').catch(()=>[]):[];
    const byCode=new Map((Array.isArray(indicators)?indicators:[]).map(i=>[i.indicator_code,i]));
    const apply=()=>{
      $$('#pulse-grid .metric-card').forEach(card=>card.dataset.pulseCategory='core');
      $$('#wb-national-indicators .metric-card').forEach(card=>{card.dataset.pulseCategory=pulseCategory(byCode.get(card.dataset.wbIndicator));});
      const more=$('#wb-national-indicators .wb-more');if(more)more.open=true;
      applyPulseFilter(route().params.get('category')||'all');cloneHomeGlance();
    };
    apply();
    const observer=new MutationObserver(apply);observer.observe(root,{childList:true,subtree:true});
    root.dataset.pulsePrepared='true';
  }
  function applyPulseFilter(category){
    const allowed=new Set(['all','core','economy','social','environment','institutions']);
    const selected=allowed.has(category)?category:'all';
    $$('#pulse-filters [data-pulse-filter]').forEach(btn=>{const active=btn.dataset.pulseFilter===selected;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));});
    const core=$('#pulse-grid'),wb=$('#wb-national-indicators');
    if(core)core.hidden=!['all','core'].includes(selected);
    if(wb)wb.hidden=selected==='core';
    if(wb){$$('.metric-card',wb).forEach(card=>{card.hidden=selected!=='all'&&card.dataset.pulseCategory!==selected;});}
  }
  $('#pulse-filters')?.addEventListener('click',event=>{
    const btn=event.target.closest('[data-pulse-filter]');if(!btn)return;
    const params=new URLSearchParams();if(btn.dataset.pulseFilter!=='all')params.set('category',btn.dataset.pulseFilter);
    R.replace('pulse','',params,{scroll:false});applyPulseFilter(btn.dataset.pulseFilter);
  });

  // ------------------------------------------------------ Generic Series view
  function seriesData(){
    if(seriesDataPromise)return seriesDataPromise;
    seriesDataPromise=KDA.registries(['series','observations','indicators','units','geographies','agencies'],{required:true}).then(([series,observations,indicators,units,geos,agencies])=>({series,observations,indicators,units,geos,agencies}));
    return seriesDataPromise;
  }
  function formatSeriesValue(value,unit){
    const n=Number(value),code=unit?.code||'';if(!Number.isFinite(n))return'—';
    if(code==='percent')return`${n.toLocaleString('en-KE',{maximumFractionDigits:2})}%`;
    if(code==='persons'||code==='count')return n.toLocaleString('en-KE',{maximumFractionDigits:0});
    if(code==='kes_million')return`KES ${n.toLocaleString('en-KE',{maximumFractionDigits:1})} mn`;
    if(code==='usd')return`US$${n.toLocaleString('en-KE',{maximumFractionDigits:1})}`;
    return`${n.toLocaleString('en-KE',{maximumFractionDigits:unit?.decimal_places??2})}${unit?.symbol?` ${unit.symbol}`:''}`;
  }
  function filterRange(rows,range){
    if(range==='MAX'||rows.length<2)return rows;
    const years={ '1Y':1,'5Y':5,'10Y':10 }[range]||5;
    const end=new Date(rows.at(-1).period_end||rows.at(-1).period_start);if(Number.isNaN(end.valueOf()))return rows.slice(-Math.max(2,years*12));
    const cutoff=new Date(end);cutoff.setFullYear(cutoff.getFullYear()-years);
    const filtered=rows.filter(o=>new Date(o.period_end||o.period_start)>=cutoff);return filtered.length>=2?filtered:rows.slice(-2);
  }
  function chartSvg(rows,unit){
    if(!rows.length)return'<div class="series-empty">No published observations.</div>';
    const values=rows.map(o=>Number(o.value)).filter(Number.isFinite);if(!values.length)return'';
    const min=Math.min(...values),max=Math.max(...values),span=Math.max(max-min,1e-9),w=740,h=210;
    const coords=rows.map((o,i)=>({o,x:40+(i/(Math.max(rows.length-1,1)))*(w-80),y:25+((max-Number(o.value))/span)*(h-50)}));
    const points=coords.map(p=>p.x+','+p.y).join(' ');
    const circles=coords.map(p=>'<circle data-chart-point="true" cx="'+p.x+'" cy="'+p.y+'" r="5"><title>'+esc(p.o.period_label)+': '+esc(formatSeriesValue(p.o.value,unit))+'</title></circle>').join('');
    const axisY=esc(unit?.name||unit?.code||'Published value');
    return'<svg viewBox="0 0 '+w+' '+h+'" role="img" data-axis-x="Reference period" data-axis-y="'+axisY+'" aria-label="Published series history"><path class="grid" d="M40 25H700M40 80H700M40 135H700M40 185H700"/><polyline class="series-line" points="'+points+'"/>'+circles+'</svg>';
  }
  async function renderSeriesRoute(r){
    const key=decodeURIComponent(r.rest||'KDA-CPI-YOY-KEN');if(seriesRouteKey===`${key}|${seriesRange}`&&$('#series')?.dataset.seriesReady==='true')return;
    seriesRouteKey=`${key}|${seriesRange}`;
    const root=$('#series');if(!root)return;root.dataset.seriesReady='loading';
    try{
      const data=await seriesData();
      const s=data.series.find(row=>row.series_code===key||row.series_id===key);
      if(!s){root.querySelector('.series-card').innerHTML='<div class="series-empty">This series was not found in the published registry.</div>';root.dataset.seriesReady='error';return;}
      const indicator=data.indicators.find(i=>i.indicator_id===s.indicator_id),unit=data.units.find(u=>u.unit_id===s.unit_id),geo=data.geos.find(g=>g.geography_id===s.geography_id),agency=data.agencies.find(a=>a.agency_id===s.agency_id);
      const all=data.observations.filter(o=>o.series_id===s.series_id).sort((a,b)=>String(a.period_start).localeCompare(String(b.period_start))||String(a.period_end).localeCompare(String(b.period_end)));
      const shown=filterRange(all,seriesRange),latest=all.at(-1),side=$('.series-side',root),main=$('.series-main',root);
      if(side)side.innerHTML=`<span class="badge ${String(latest?.badge||'missing').toLowerCase()}">${esc(latest?.badge||'N/A')} · ${esc({A:'Official direct',B:'Official derived',C:'Spatially derived',D:'Modelled',E:'External'}[latest?.badge]||'Unavailable')}</span><p>${esc(geo?.name||'')}</p><h3>${esc(indicator?.name||s.series_code)}</h3><div class="series-value">${esc(formatSeriesValue(latest?.value,unit))}</div><small>${esc(latest?.period_label||'')} · ${esc(s.frequency||'')}</small><div class="range-buttons">${['1Y','5Y','10Y','MAX'].map(x=>`<button data-series-range="${x}" class="${x===seriesRange?'active':''}">${x}</button>`).join('')}</div>`;
      if(main)main.innerHTML=`<div class="series-toolbar"><div><strong>${esc(s.series_code)}</strong><small>${all.length} published observation${all.length===1?'':'s'}</small></div><div><button type="button" data-series-csv>CSV</button><button type="button" data-series-api>{ } API</button></div></div><div class="large-chart">${chartSvg(shown,unit)}<span class="current-point">${esc(formatSeriesValue(latest?.value,unit))}</span></div><div class="series-meta"><span><small>Series ID</small>${esc(s.series_code)}</span><span><small>Unit</small>${esc(unit?.name||unit?.code||'')}</span><span><small>Source</small>${esc(agency?.abbreviation||agency?.name||'Published source')}</span><span><small>Reference</small>${esc(latest?.period_label||'')}</span></div>${latest?.notes?`<p class="source-note">${esc(latest.notes)}</p>`:''}${latest?.source_url?`<a class="text-link" href="${esc(latest.source_url)}" target="_blank" rel="noopener">Open source ↗</a>`:''}`;
      root.dataset.seriesReady='true';
      if(r.rest!==s.series_code)R.replace('series',s.series_code,r.params,{scroll:false});
      $$('[data-series-range]',root).forEach(btn=>btn.onclick=()=>{seriesRange=btn.dataset.seriesRange;seriesRouteKey='';renderSeriesRoute(route());});
      $('[data-series-csv]',root)?.addEventListener('click',()=>{const csv=['period_start,period_end,period_label,value,badge',...all.map(o=>[o.period_start,o.period_end,o.period_label,o.value,o.badge].map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(','))].join('\n');const blob=new Blob([csv],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${s.series_code}.csv`;a.click();URL.revokeObjectURL(a.href);});
      $('[data-series-api]',root)?.addEventListener('click',()=>window.open('data/indicators/registry/observations.json','_blank'));
    }catch(error){console.error('Series route:',error);root.dataset.seriesReady='error';}
  }

  // --------------------------------------------- Compare state in shareable URL
  async function restoreCompare(r){
    if(restoringCompare)return;restoringCompare=true;
    try{
      await window.KDACompare?.boot?.();
      const rows=await geographies(),byCode=mapByCode(rows),mode=r.params.get('mode')==='life'?'life':'direct';
      const modeBtn=$(`[data-compare-mode="${mode}"]`);if(modeBtn&&!modeBtn.classList.contains('active')){modeBtn.click();await nextFrame();}
      if(mode==='direct'){
        const desired=(r.params.get('places')||'').split(',').filter(Boolean).map(code=>byCode.get(code)?.name).filter(Boolean).slice(0,4);
        if(desired.length>=2){
          while($$('#compare-place-strip select').length<desired.length){$('#compare-add-place')?.click();await nextFrame();}
          while($$('#compare-place-strip select').length>desired.length){$$('#compare-place-strip .remove-place').at(-1)?.click();await nextFrame();}
          for(let i=0;i<desired.length;i+=1){const select=$$('#compare-place-strip select')[i];if(select&&select.value!==desired[i]){select.value=desired[i];select.dispatchEvent(new Event('change',{bubbles:true}));await nextFrame();}}
        }
      }else{
        for(const [param,id] of [['from','#life-home'],['to','#life-away']]){const name=byCode.get(r.params.get(param))?.name,select=$(id);if(name&&select&&select.value!==name){select.value=name;select.dispatchEvent(new Event('change',{bubbles:true}));await nextFrame();}}
      }
    }finally{restoringCompare=false;}
  }
  async function syncCompareUrl(){
    if(restoringCompare||route().view!=='compare')return;
    const rows=await geographies(),byName=mapByName(rows),active=$('[data-compare-mode].active')?.dataset.compareMode||'direct',params=new URLSearchParams();params.set('mode',active);
    if(active==='direct'){
      const codes=$$('#compare-place-strip select').map(s=>byName.get(s.value)?.geo_code).filter(Boolean);if(codes.length)params.set('places',codes.join(','));
    }else{
      const from=byName.get($('#life-home')?.value)?.geo_code,to=byName.get($('#life-away')?.value)?.geo_code;if(from)params.set('from',from);if(to)params.set('to',to);
    }
    R.replace('compare','',params,{scroll:false});
  }
  $('#compare')?.addEventListener('change',()=>setTimeout(syncCompareUrl,0));
  $('#compare')?.addEventListener('click',event=>{if(event.target.closest('[data-compare-mode],#compare-add-place,.remove-place,#life-swap'))setTimeout(syncCompareUrl,40);});

  // ---------------------------------------------- Explore namespaced map state
  async function restoreExplore(r){
    const key=`${r.rest}|${r.params.get('indicator')||''}`;if(!r.rest||key===geoRouteKey)return;geoRouteKey=key;
    try{
      await window.KDAGeo?.boot?.();const rows=await geographies(),geo=rows.find(g=>g.geo_code===decodeURIComponent(r.rest));if(!geo)return;
      await window.KDAGeo?.selectGeography?.(geo.geography_id,{pushHash:false});
      const code=r.params.get('indicator'),select=$('#geo-indicator');if(code&&select&&select.value!==code){select.value=code;select.dispatchEvent(new Event('change',{bubbles:true}));}
    }catch(error){console.warn('Explore route restore:',error);}
  }

  // Capture series links before legacy integrations turn them back into scroll hashes.
  document.addEventListener('click',event=>{
    const open=event.target.closest('[data-open-series]');if(open){event.preventDefault();event.stopImmediatePropagation();R.navigate('series',open.dataset.openSeries);return;}
    const hero=event.target.closest('[data-series]');if(hero){event.preventDefault();R.navigate('series',hero.dataset.series==='inflation'?'KDA-CPI-YOY-KEN':hero.dataset.series);}
  },true);

  // County profile is part of Explore; retain the existing profile renderer and
  // only add route-awareness when it is invoked from another view.
  function wrapCountyProfile(){
    const existing=window.KDASelectCountyProfile;if(!existing||existing.__routed)return false;
    const wrapped=name=>{if(route().view!=='explore')R.navigate('explore','',null,{scroll:false});requestAnimationFrame(()=>existing(name));};wrapped.__routed=true;window.KDASelectCountyProfile=wrapped;return true;
  }
  if(!wrapCountyProfile()){let attempts=0;const timer=setInterval(()=>{if(wrapCountyProfile()||++attempts>40)clearInterval(timer);},100);}

  async function handle(r){
    document.body.classList.toggle('routed-pulse',r.view==='pulse');
    if(r.view==='pulse'){if($('#pulse-view')?.dataset.pulsePrepared!=='true')preparePulse();else applyPulseFilter(r.params.get('category')||'all');}
    if(r.view==='series')renderSeriesRoute(r);
    if(r.view==='compare')restoreCompare(r);
    if(r.view==='explore')restoreExplore(r);
  }
  window.addEventListener('kda:route',event=>handle(event.detail));
  handle(route());

  const pulseGrid=$('#pulse-grid');if(pulseGrid)new MutationObserver(cloneHomeGlance).observe(pulseGrid,{childList:true,subtree:true});
  cloneHomeGlance();
})();
