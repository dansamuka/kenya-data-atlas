/* Kenya Data Atlas — additive editorial visualisation enhancements.
 *
 * This layer deliberately sits above the canonical data and mature route modules.
 * It never creates replacement observations: charts are derived only from the
 * same published registries/results already used by Series, Compare and Rankings.
 */
(function(){
  'use strict';
  const KDA=window.KDAData,R=window.KDARouter;
  if(!KDA||!R)return;
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const finite=v=>Number.isFinite(Number(v));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const route=()=>R.current?.()||R.parse?.()||{view:'home',rest:'',params:new URLSearchParams()};
  const idle=fn=>(window.requestIdleCallback?requestIdleCallback(fn,{timeout:1200}):setTimeout(fn,60));
  const seriesState=new Map();
  let seriesDataPromise=null,rankingsPromise=null,pulsePromise=null,seriesObserver=null,lifeObserver=null;

  function ensureStyle(){
    if(document.querySelector('link[data-viz-enhancements-style]'))return;
    const link=document.createElement('link');link.rel='stylesheet';link.href='assets/viz-enhancements.css';link.dataset.vizEnhancementsStyle='true';document.head.appendChild(link);
  }

  function formatCompact(v){
    const n=Number(v);if(!Number.isFinite(n))return'—';
    return new Intl.NumberFormat('en-KE',{notation:Math.abs(n)>=100000?'compact':'standard',maximumFractionDigits:2}).format(n);
  }

  function lineSvg(values,label){
    const rows=values.filter(finite).map(Number);if(rows.length<2)return'';
    const min=Math.min(...rows),max=Math.max(...rows),span=Math.max(max-min,1e-9),w=220,h=52,p=4;
    const pts=rows.map((v,i)=>`${p+(i/(rows.length-1))*(w-p*2)},${p+((max-v)/span)*(h-p*2)}`).join(' ');
    return `<svg class="viz-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)} trend across ${rows.length} published observations"><polyline points="${pts}"/></svg>`;
  }

  async function pulseData(){
    if(pulsePromise)return pulsePromise;
    pulsePromise=Promise.all([
      KDA.fetchJson('data/ui/initial-pulse.json',{required:true}),
      KDA.registries(['series','observations'],{required:true})
    ]).then(([display,[series,observations]])=>{
      const byCode=new Map((series||[]).map(s=>[s.series_code,s]));
      const obsBySeries=new Map();
      for(const o of observations||[]){if(!obsBySeries.has(o.series_id))obsBySeries.set(o.series_id,[]);obsBySeries.get(o.series_id).push(o);}
      for(const rows of obsBySeries.values())rows.sort((a,b)=>String(a.period_start).localeCompare(String(b.period_start))||String(a.period_end).localeCompare(String(b.period_end)));
      return{cards:display?.cards||[],byCode,obsBySeries};
    });
    return pulsePromise;
  }

  async function enhancePulse(){
    const root=$('#explore');if(!root||route().view!=='pulse')return;
    const cards=$$('#pulse-grid .metric-card',root);if(!cards.length)return;
    try{
      const data=await pulseData();
      cards.forEach((card,index)=>{
        const descriptor=data.cards[index];if(!descriptor)return;
        card.dataset.seriesCode=descriptor.series_code;
        if(index===0)card.classList.add('viz-feature-card');
        const s=data.byCode.get(descriptor.series_code),rows=s?(data.obsBySeries.get(s.series_id)||[]):descriptor.history||[];
        const recent=rows.slice(-24),svg=lineSvg(recent.map(o=>o.value),descriptor.label);
        card.querySelector('.viz-card-spark')?.remove();
        if(svg){const wrap=document.createElement('div');wrap.className='viz-card-spark';wrap.innerHTML=`${svg}<span>${recent.length} published points</span>`;card.appendChild(wrap);}
      });
    }catch(error){console.warn('Pulse visual enhancements:',error?.message||error);}
  }

  function parseDisplayNumber(text){
    let raw=String(text||'').trim().toLowerCase().replace(/,/g,'');
    let mult=1;
    if(/\bbn\b/.test(raw))mult=1e9;else if(/\bmn\b/.test(raw)||/\d(?:\.\d+)?m\b/.test(raw))mult=1e6;else if(/\d(?:\.\d+)?k\b/.test(raw))mult=1e3;
    const match=raw.match(/-?\d+(?:\.\d+)?/);return match?Number(match[0])*mult:null;
  }

  function enhanceLifeCards(){
    const root=$('#life-cards');if(!root)return;
    $$('.life-card',root).forEach(card=>{
      if(card.querySelector('.viz-life-pair'))return;
      const spans=$$('.life-values > span:not(.life-arrow)',card);if(spans.length!==2)return;
      const values=spans.map(span=>{const b=$('b',span),display=span.textContent.replace(b?.textContent||'','').trim();return{name:b?.textContent||'',display,value:parseDisplayNumber(display)};});
      if(values.some(v=>!finite(v.value)))return;
      const max=Math.max(...values.map(v=>Math.abs(v.value)),1),pair=document.createElement('div');pair.className='viz-life-pair';pair.setAttribute('aria-label',`${values[0].name} ${values[0].display}; ${values[1].name} ${values[1].display}`);
      pair.innerHTML=values.map((v,i)=>`<div class="viz-life-row"><span>${esc(v.name)}</span><i><b class="viz-life-bar-${i}" style="width:${clamp(Math.abs(v.value)/max*100,4,100)}%"></b></i><strong>${esc(v.display)}</strong></div>`).join('');
      $('.life-values',card)?.insertAdjacentElement('afterend',pair);
    });
  }

  function watchLife(){
    const root=$('#life-cards');if(!root||lifeObserver)return;
    lifeObserver=new MutationObserver(()=>enhanceLifeCards());lifeObserver.observe(root,{childList:true,subtree:true});enhanceLifeCards();
  }

  function rankingsData(){return rankingsPromise||(rankingsPromise=KDA.fetchJson('data/results/county-results.json',{required:true}));}
  function rankingGroup(data){const code=$('#ri-indicator-select')?.value;return(data?.indicator_rankings||[]).find(g=>g.indicator_code===code)||(data?.indicator_rankings||[])[0];}

  function beeswarmSvg(group,query){
    const rows=(group?.rows||[]).filter(r=>finite(r.latest?.value));if(rows.length<5)return'';
    const values=rows.map(r=>Number(r.latest.value)),min=Math.min(...values),max=Math.max(...values),span=Math.max(max-min,1e-9),w=900,h=166,left=46,right=854,axisY=137;
    const sorted=rows.map(r=>({...r,_x:left+((Number(r.latest.value)-min)/span)*(right-left)})).sort((a,b)=>a._x-b._x||a.county.localeCompare(b.county));
    const lastX=Array(6).fill(-Infinity);for(const row of sorted){let lane=lastX.findIndex(x=>row._x-x>=17);if(lane<0)lane=lastX.indexOf(Math.min(...lastX));row._lane=lane;lastX[lane]=row._x;}
    const q=String(query||'').trim().toLowerCase();
    const dots=sorted.map(r=>{const focus=q&&r.county.toLowerCase().includes(q),y=34+r._lane*15,rank=r.ranking?.rank;return`<g class="viz-bee${focus?' focus':''}" tabindex="0" role="button" data-viz-county="${esc(r.county)}" aria-label="${esc(r.county)}, ${esc(formatCompact(r.latest.value))}, rank ${esc(rank||'unavailable')}"><circle cx="${r._x.toFixed(1)}" cy="${y}" r="${focus?7:5}"></circle><title>${esc(r.county)} · ${esc(formatCompact(r.latest.value))}${rank?` · #${rank}`:''} · ${esc(r.latest.period_label||'')}</title></g>`;}).join('');
    const mid=(min+max)/2;
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Distribution of ${esc(group.name)} across ${rows.length} counties"><path class="viz-bee-axis" d="M${left} ${axisY}H${right}"/><path class="viz-bee-tick" d="M${left} ${axisY-5}V${axisY+5}M${(left+right)/2} ${axisY-5}V${axisY+5}M${right} ${axisY-5}V${axisY+5}"/>${dots}<text x="${left}" y="158" text-anchor="start">${esc(formatCompact(min))}</text><text x="${(left+right)/2}" y="158" text-anchor="middle">${esc(formatCompact(mid))}</text><text x="${right}" y="158" text-anchor="end">${esc(formatCompact(max))}</text></svg>`;
  }

  async function enhanceRankings(){
    if(route().view!=='rankings')return;
    const panel=$('[data-ri-panel="indicator"]'),meta=$('#ri-indicator-meta');if(!panel||!meta)return;
    try{
      const data=await rankingsData(),group=rankingGroup(data);if(!group)return;
      let box=$('#ri-beeswarm');if(!box){box=document.createElement('div');box.id='ri-beeswarm';box.className='viz-beeswarm';meta.insertAdjacentElement('afterend',box);}
      const query=$('#ri-indicator-search')?.value||'',svg=beeswarmSvg(group,query);
      box.innerHTML=svg?`<div class="viz-beeswarm-head"><div><small>Distribution view</small><strong>Where counties actually sit</strong></div><span>Dot position shows the published value; the table below remains the exact ranking.</span></div>${svg}`:'<p class="source-note">A distribution view is withheld because too few comparable county values are available.</p>';
      $$('[data-viz-county]',box).forEach(node=>{const select=()=>{const input=$('#ri-indicator-search');if(!input)return;input.value=node.dataset.vizCounty;input.dispatchEvent(new Event('input',{bubbles:true}));};node.addEventListener('click',select);node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});});
    }catch(error){console.warn('Rankings distribution:',error?.message||error);}
  }

  function seriesData(){
    if(seriesDataPromise)return seriesDataPromise;
    seriesDataPromise=KDA.registries(['series','observations','indicators','units','geographies'],{required:true}).then(([series,observations,indicators,units,geographies])=>{
      const obsBySeries=new Map();for(const o of observations||[]){if(!obsBySeries.has(o.series_id))obsBySeries.set(o.series_id,[]);obsBySeries.get(o.series_id).push(o);}for(const rows of obsBySeries.values())rows.sort((a,b)=>String(a.period_start).localeCompare(String(b.period_start))||String(a.period_end).localeCompare(String(b.period_end)));
      return{series:series||[],indicators:indicators||[],units:units||[],geographies:geographies||[],obsBySeries,geoById:new Map((geographies||[]).map(g=>[g.geography_id,g]))};
    });return seriesDataPromise;
  }
  function compatibilityKey(s){return[s.indicator_id,s.unit_id,s.frequency,s.period_type,s.transformation,s.price_basis,s.seasonal_adjustment,s.comparability_group].map(v=>v||'').join('|');}
  function rangeRows(rows,range){
    if(range==='MAX'||rows.length<2)return rows;const years={ '1Y':1,'5Y':5,'10Y':10 }[range]||5,end=new Date(rows.at(-1).period_end||rows.at(-1).period_start);if(Number.isNaN(end.valueOf()))return rows;
    const cutoff=new Date(end);cutoff.setFullYear(cutoff.getFullYear()-years);const out=rows.filter(o=>new Date(o.period_end||o.period_start)>=cutoff);return out.length>=2?out:rows.slice(-2);
  }
  function seriesLabel(s,data){const g=data.geoById.get(s.geography_id);return`${g?.level==='country'?'Kenya (national)':g?.name||s.series_code}`;}

  function multiSeriesSvg(primary,overlays,data,range){
    const rows=[primary,...overlays].map(s=>({s,label:seriesLabel(s,data),rows:rangeRows(data.obsBySeries.get(s.series_id)||[],range)})).filter(x=>x.rows.length);
    const all=rows.flatMap(x=>x.rows.map(o=>({v:Number(o.value),d:new Date(o.period_end||o.period_start)}))).filter(x=>Number.isFinite(x.v)&&!Number.isNaN(x.d.valueOf()));if(all.length<2)return'';
    const minV=Math.min(...all.map(x=>x.v)),maxV=Math.max(...all.map(x=>x.v)),spanV=Math.max(maxV-minV,1e-9),minD=Math.min(...all.map(x=>x.d.valueOf())),maxD=Math.max(...all.map(x=>x.d.valueOf())),spanD=Math.max(maxD-minD,86400000),w=800,h=260,L=48,Rr=764,T=22,B=220;
    const x=d=>L+((d.valueOf()-minD)/spanD)*(Rr-L),y=v=>T+((maxV-v)/spanV)*(B-T);
    const lines=rows.map((entry,i)=>{const pts=entry.rows.map(o=>{const d=new Date(o.period_end||o.period_start),v=Number(o.value);return Number.isFinite(v)&&!Number.isNaN(d.valueOf())?`${x(d).toFixed(1)},${y(v).toFixed(1)}`:null;}).filter(Boolean);if(!pts.length)return'';return`<polyline class="viz-series-line viz-series-line-${i}" points="${pts.join(' ')}"/>${entry.rows.map(o=>{const d=new Date(o.period_end||o.period_start),v=Number(o.value);if(!Number.isFinite(v)||Number.isNaN(d.valueOf()))return'';return`<circle class="viz-series-point viz-series-point-${i}" cx="${x(d).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3"><title>${esc(entry.label)} · ${esc(o.period_label)} · ${esc(formatCompact(v))}</title></circle>`;}).join('')}`;}).join('');
    const legend=rows.map((entry,i)=>`<span class="viz-series-key viz-series-key-${i}"><i></i>${esc(entry.label)}</span>`).join('');
    return `<div class="viz-series-legend" aria-label="Series shown">${legend}</div><svg class="viz-overlay-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Like-for-like overlay of ${rows.length} published series"><path class="grid" d="M${L} ${T}H${Rr}M${L} ${T+(B-T)/3}H${Rr}M${L} ${T+2*(B-T)/3}H${Rr}M${L} ${B}H${Rr}"/>${lines}<text x="${L}" y="248" text-anchor="start">${new Date(minD).getFullYear()}</text><text x="${Rr}" y="248" text-anchor="end">${new Date(maxD).getFullYear()}</text></svg>`;
  }

  async function enhanceSeries(){
    const r=route();if(r.view!=='series')return;const root=$('#series');if(!root||root.dataset.seriesReady!=='true')return;
    try{
      const data=await seriesData(),code=decodeURIComponent(r.rest||'KDA-CPI-YOY-KEN'),primary=data.series.find(s=>s.series_code===code||s.series_id===code);if(!primary)return;
      const state=seriesState.get(primary.series_code)||[];seriesState.set(primary.series_code,state);
      const candidates=data.series.filter(s=>s.series_id!==primary.series_id&&(!s.status||s.status==='active')&&compatibilityKey(s)===compatibilityKey(primary)&&(data.obsBySeries.get(s.series_id)?.length||0)).sort((a,b)=>seriesLabel(a,data).localeCompare(seriesLabel(b,data)));
      const toolbar=$('.series-toolbar',root),chart=$('.large-chart',root);if(!toolbar||!chart)return;
      const activeRange=$('.range-buttons .active',root)?.dataset.seriesRange||$('.range-buttons .active',root)?.textContent||'5Y';
      const chartKey=`${primary.series_code}|${activeRange}`;
      if(chart.dataset.vizOverlayKey!==chartKey){chart.dataset.vizBaseHtml=encodeURIComponent(chart.innerHTML);chart.dataset.vizOverlayKey=chartKey;}
      let controls=$('.viz-overlay-controls',toolbar);if(!controls){controls=document.createElement('div');controls.className='viz-overlay-controls';toolbar.insertBefore(controls,toolbar.lastElementChild);}
      const selected=state.map(c=>data.series.find(s=>s.series_code===c)).filter(Boolean);state.splice(0,state.length,...selected.map(s=>s.series_code));
      const available=candidates.filter(c=>!state.includes(c.series_code));
      controls.innerHTML=`<label><span>Overlay place</span><select data-viz-overlay-add ${state.length>=3||!available.length?'disabled':''}><option value="">${state.length>=3?'Maximum 3 overlays':available.length?'Add a like-for-like series…':'No compatible overlay series'}</option>${available.map(s=>`<option value="${esc(s.series_code)}">${esc(seriesLabel(s,data))}</option>`).join('')}</select></label><div class="viz-overlay-chips">${selected.map(s=>`<button type="button" data-viz-overlay-remove="${esc(s.series_code)}" aria-label="Remove ${esc(seriesLabel(s,data))} overlay">${esc(seriesLabel(s,data))} ×</button>`).join('')}</div><small>Only matching indicator, unit, frequency and comparability definitions can be overlaid.</small>`;
      $('[data-viz-overlay-add]',controls)?.addEventListener('change',e=>{if(e.target.value&&state.length<3&&!state.includes(e.target.value)){state.push(e.target.value);enhanceSeries();}});
      $$('[data-viz-overlay-remove]',controls).forEach(btn=>btn.addEventListener('click',()=>{const i=state.indexOf(btn.dataset.vizOverlayRemove);if(i>=0)state.splice(i,1);enhanceSeries();}));
      if(state.length){const overlayRows=state.map(c=>data.series.find(s=>s.series_code===c)).filter(Boolean),svg=multiSeriesSvg(primary,overlayRows,data,activeRange);if(svg){chart.innerHTML=svg;chart.classList.add('viz-overlay-active');}}
      else if(chart.classList.contains('viz-overlay-active')){try{chart.innerHTML=decodeURIComponent(chart.dataset.vizBaseHtml||'');}catch{}chart.classList.remove('viz-overlay-active');}
    }catch(error){console.warn('Series overlays:',error?.message||error);}
  }

  function watchSeries(){
    const root=$('#series');if(!root||seriesObserver)return;
    let queued=false;seriesObserver=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhanceSeries();});});seriesObserver.observe(root,{attributes:true,attributeFilter:['data-series-ready']});
  }

  function enhanceMapAccessibility(){
    const panel=$('#geo-explorer .geo-map-panel'),legend=$('#geo-legend');if(!panel||!legend||panel.querySelector('.viz-map-tools'))return;
    const tools=document.createElement('div');tools.className='viz-map-tools';const stored=localStorage.getItem('kda-map-contrast')==='true';if(stored)panel.classList.add('viz-map-contrast');
    tools.innerHTML=`<button type="button" class="viz-map-contrast-toggle" aria-pressed="${stored?'true':'false'}">High-contrast map</button><span>Ranking and labels remain available so colour is never the only cue.</span>`;legend.insertAdjacentElement('afterend',tools);
    $('.viz-map-contrast-toggle',tools)?.addEventListener('click',e=>{const on=panel.classList.toggle('viz-map-contrast');e.currentTarget.setAttribute('aria-pressed',String(on));localStorage.setItem('kda-map-contrast',String(on));});
    $('#geo-svg')?.setAttribute('aria-describedby','geo-source-note');
  }

  function bindRankingControls(){
    const select=$('#ri-indicator-select'),search=$('#ri-indicator-search');if(select&&!select.dataset.vizBound){select.dataset.vizBound='true';select.addEventListener('change',()=>requestAnimationFrame(enhanceRankings));}if(search&&!search.dataset.vizBound){search.dataset.vizBound='true';search.addEventListener('input',()=>requestAnimationFrame(enhanceRankings));}
  }

  function onRoute(){
    ensureStyle();const r=route();
    if(r.view==='pulse')idle(()=>enhancePulse());
    if(r.view==='compare'){watchLife();requestAnimationFrame(enhanceLifeCards);}
    if(r.view==='rankings'){bindRankingControls();idle(()=>enhanceRankings());}
    if(r.view==='series'){watchSeries();idle(()=>enhanceSeries());}
    if(r.view==='explore')enhanceMapAccessibility();
  }

  document.addEventListener('focusin',e=>{if(e.target.closest('#ri-indicator-select,#ri-indicator-search'))bindRankingControls();});
  window.addEventListener('kda:route',()=>onRoute());
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',onRoute,{once:true});else onRoute();
  window.KDAVizEnhancements={enhancePulse,enhanceRankings,enhanceLifeCards,enhanceSeries,enhanceMapAccessibility};
})();