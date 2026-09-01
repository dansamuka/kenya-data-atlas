/* Kenya Data Atlas — Rankings visual interaction layer v2.
 * Progressive enhancement only: the canonical tables remain the accessible
 * source of truth and every visual is derived from data/results/county-results.json.
 */
(function(){
  'use strict';
  const KDA=window.KDAData,R=window.KDARouter;
  if(!KDA)return;
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const finite=v=>Number.isFinite(Number(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const countyAcronyms=new Map(Object.entries({
    'Baringo':'BAR','Bomet':'BOM','Bungoma':'BNG','Busia':'BUS','Elgeyo/Marakwet':'ELM','Embu':'EMB','Garissa':'GRS','Homa Bay':'HBY','Isiolo':'ISL','Kajiado':'KJD','Kakamega':'KAK','Kericho':'KRC','Kiambu':'KBU','Kilifi':'KLF','Kirinyaga':'KRG','Kisii':'KSI','Kisumu':'KSM','Kitui':'KTU','Kwale':'KWL','Laikipia':'LKP','Lamu':'LAM','Machakos':'MCK','Makueni':'MKN','Mandera':'MDR','Marsabit':'MRS','Meru':'MER','Migori':'MIG','Mombasa':'MSA',"Murang'a":'MUR','Nairobi':'NBO','Nakuru':'NKR','Nandi':'NDI','Narok':'NRK','Nyamira':'NYM','Nyandarua':'NDR','Nyeri':'NYR','Samburu':'SBR','Siaya':'SYA','Taita Taveta':'TTV','Tana River':'TNR','Tharaka-Nithi':'THN','Trans Nzoia':'TNZ','Turkana':'TRK','Uasin Gishu':'UGS','Vihiga':'VHG','Wajir':'WJR','West Pokot':'WPK'
  }));
  const countyAcronym=name=>countyAcronyms.get(String(name||''))||String(name||'').replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase();
  const reduceMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  const state={data:null,bound:false,sortKey:'diagnostic_rank',sortDir:'asc',indicatorCode:null};
  let bootPromise=null;

  function route(){return R?.current?.()||R?.parse?.()||{view:'rankings'};}
  function isRankings(){return route().view==='rankings'||/^#\/?rankings(?:\?|$)/.test(location.hash);}
  async function data(){return state.data||(state.data=await KDA.fetchJson('data/results/county-results.json',{required:true}));}
  function ensureStyle(){return KDA.loadStyle?KDA.loadStyle('assets/rankings-visual-v2.css',{id:'kda-rankings-visual-v2-css'}):Promise.resolve();}
  function waitForRankings(){if(window.KDARankings?.boot)return Promise.resolve(window.KDARankings);return new Promise(resolve=>{let tries=0;const timer=setInterval(()=>{tries+=1;if(window.KDARankings?.boot||tries>=50){clearInterval(timer);resolve(window.KDARankings||null);}},80);});}

  function bandClass(row){const band=Number(row.relative_position_band);return finite(band)&&band>=1&&band<=5?`band-${band}`:'band-3';}
  function rankPct(rank){return Math.max(0,Math.min(100,((Number(rank)-1)/46)*100));}
  function ordinal(value){const n=Math.round(Number(value));if(!Number.isFinite(n))return'—';const mod100=n%100;if(mod100>=11&&mod100<=13)return`${n}th`;return`${n}${n%10===1?'st':n%10===2?'nd':n%10===3?'rd':'th'}`;}
  function fmtValue(value,unit){
    if(!finite(value))return'—';const n=Number(value),code=String(unit||'');
    if(code==='percent'||code.includes('percent'))return`${n.toLocaleString('en-KE',{maximumFractionDigits:1})}%`;
    if(code==='persons'||code==='count')return n.toLocaleString('en-KE',{maximumFractionDigits:0});
    if(code==='kes_million')return`KES ${n.toLocaleString('en-KE',{maximumFractionDigits:1})} mn`;
    if(code==='km2')return`${n.toLocaleString('en-KE',{maximumFractionDigits:1})} km²`;
    if(code==='hectares')return`${n.toLocaleString('en-KE',{maximumFractionDigits:1})} ha`;
    return n.toLocaleString('en-KE',{maximumFractionDigits:2});
  }
  function pinnedGeo(){
    const fromRoute=route().params?.get?.('pinned');if(fromRoute)return fromRoute;
    try{const stored=JSON.parse(sessionStorage.getItem('kda-v2-pinned')||'null');return stored?.geo_code||null;}catch(_){return null;}
  }
  function indicatorGeo(row,geoMap){return row?.geo_code||geoMap?.get?.(row?.county)||'';}
  function packLanes(rows,xFor,laneCount,minGap){
    const last=Array(laneCount).fill(-Infinity),out=new Map();
    for(const row of rows){
      const x=Number(xFor(row));let lane=last.findIndex(v=>x-v>=minGap);
      if(lane<0){let oldest=0;for(let i=1;i<last.length;i+=1)if(last[i]<last[oldest])oldest=i;lane=oldest;}
      last[lane]=x;out.set(row,lane);
    }
    return out;
  }

  function spectrumLabelRow(rank,isPinned){
    if(rank<=5)return rank-1;
    if(rank>=43)return rank-43;
    return isPinned?5:null;
  }

  function spectrum(dataRows){
    const rows=(dataRows||[]).filter(r=>finite(r.diagnostic_rank)).slice().sort((a,b)=>Number(a.diagnostic_rank)-Number(b.diagnostic_rank));
    if(rows.length<5)return'';
    const pinned=pinnedGeo(),lanes=packLanes(rows,r=>rankPct(r.diagnostic_rank),7,8.5);
    const marks=rows.map(r=>{
      const rank=Number(r.diagnostic_rank),min=finite(r.plausible_min_rank)?Number(r.plausible_min_rank):rank,max=finite(r.plausible_max_rank)?Number(r.plausible_max_rank):rank;
      const lo=Math.min(min,max),hi=Math.max(min,max),left=rankPct(lo),right=rankPct(hi),x=rankPct(rank),lane=lanes.get(r)??0,isPinned=Boolean(pinned&&r.geo_code===pinned),showLabel=rank<=5||rank>=43||isPinned,labelBelow=lane<3,labelRow=spectrumLabelRow(rank,isPinned);
      const labelEdge=rank<=5?' label-edge-start':rank>=43?' label-edge-end':'';
      const classes=`ri-spectrum-dot ${bandClass(r)}${isPinned?' is-pinned':''}${showLabel?' show-label':''}${labelBelow?'':' label-below'}${showLabel?labelEdge:''}`;
      const labelStyle=labelRow===null?'':`;--label-y:${8+labelRow*24}px`;
      return `<span class="ri-spectrum-whisker ${bandClass(r)}" style="--x0:${left.toFixed(3)}%;--x1:${right.toFixed(3)}%;--lane:${lane}" data-ri-lane="${lane}" aria-hidden="true"></span><button type="button" class="${classes}" style="--x:${x.toFixed(3)}%;--lane:${lane}${labelStyle}" data-ri-lane="${lane}" data-ri-label-row="${labelRow??''}" data-ri-geo="${esc(r.geo_code)}" data-ri-county="${esc(r.county)}" data-ri-score="${esc(r.score)}" data-ri-rank="${esc(rank)}" data-ri-range="#${esc(lo)}–#${esc(hi)}" data-v2-tooltip="${esc(r.county)} · score ${esc(r.score)} / 100 · diagnostic #${esc(rank)} · plausible #${esc(lo)}–#${esc(hi)}" aria-label="${esc(r.county)}, score ${esc(r.score)}, diagnostic position ${esc(rank)}, plausible position ${esc(lo)} to ${esc(hi)}"><span class="ri-spectrum-label" aria-hidden="true">${esc(countyAcronym(r.county))}</span><span class="sr-only">${esc(r.county)}</span></button>`;
    }).join('');
    return `<div class="ri-development-spectrum" id="v2-dev-beeswarm" data-ri-development-spectrum="true"><div class="ri-spectrum-head"><div><small>Position spectrum</small><strong>How counties cluster — without hiding uncertainty</strong></div><p>Dots use diagnostic position; whiskers show the published plausible rank range. Key counties are labelled; point to or focus any dot to reveal its name.</p></div><div class="ri-spectrum-legend" aria-label="Relative position bands"><span class="band-1"><i></i>Top 20%</span><span class="band-2"><i></i>20–40%</span><span class="band-3"><i></i>40–60%</span><span class="band-4"><i></i>60–80%</span><span class="band-5"><i></i>Bottom 20%</span></div><div class="ri-spectrum-scroll"><div class="ri-spectrum-plot" role="group" aria-label="County diagnostic position spectrum from 1 to 47">${marks}<div class="ri-spectrum-axis" aria-hidden="true"><span>#1</span><span>#12</span><span>#24</span><span>#36</span><span>#47</span></div></div></div><p class="ri-spectrum-note">Exact position is diagnostic. The uncertainty whisker is the published robustness range, not an extra modelled estimate.</p></div>`;
  }

  function indicatorDistribution(group,geoMap){
    if(!group)return'';
    const rows=(group.rows||[]).filter(r=>finite(r.ranking?.rank)&&finite(r.ranking?.percentile)).slice().sort((a,b)=>Number(a.ranking.rank)-Number(b.ranking.rank)||String(a.county).localeCompare(String(b.county)));
    if(rows.length<2)return'';
    const maxRank=Math.max(...rows.map(r=>Number(r.ranking.rank)),rows.length),pinned=pinnedGeo();
    const xFor=r=>Math.max(0,Math.min(100,((Number(r.ranking.rank)-1)/Math.max(1,maxRank-1))*100));
    const lanes=packLanes(rows,xFor,4,6.5),laneY=[78,108,140,170],middle=rows[Math.floor((rows.length-1)/2)];
    const marks=rows.map((r,index)=>{
      const x=xFor(r),geo=indicatorGeo(r,geoMap),isPinned=Boolean(pinned&&geo===pinned),lane=lanes.get(r)??0,y=laneY[lane],showLabel=index<3||index>=rows.length-3||r===middle||isPinned,labelBelow=lane<2;
      const label=`${r.county} · #${r.ranking.rank} of ${rows.length} · ${ordinal(r.ranking.percentile)} percentile · ${fmtValue(r.latest?.value,r.latest?.unit_code)}`;
      const classes=`ri-indicator-dot${isPinned?' is-pinned':''}${showLabel?' show-label':''}${labelBelow?'':' label-below'}`;
      return `<button type="button" class="${classes}" style="--x:${x.toFixed(3)}%;--y:${y}px" data-ri-lane="${lane}" data-ri-indicator-geo="${esc(geo)}" data-v2-tooltip="${esc(label)}" aria-label="${esc(label)}${isPinned?', pinned county':''}"${geo?'':' disabled'}><span class="ri-indicator-label" aria-hidden="true">${esc(countyAcronym(r.county))}</span><span class="sr-only">${esc(r.county)}</span></button>`;
    }).join('');
    const selected=rows.find(r=>indicatorGeo(r,geoMap)===pinned)||null;
    const first=rows[0],last=rows.at(-1);
    const selectedX=selected?xFor(selected):null,edge=selected?(Number(selected.ranking.rank)<=4?' edge-start':Number(selected.ranking.rank)>=maxRank-3?' edge-end':''):'';
    const pin=selected?`<div class="ri-indicator-pin${edge}" style="--x:${selectedX.toFixed(3)}%" aria-hidden="true"><span>You are here</span><strong>${esc(selected.county)}</strong></div>`:'';
    const context=selected?`<div class="ri-indicator-context" aria-live="polite"><span><small>Pinned county</small><strong>${esc(selected.county)}</strong></span><span><small>National rank</small><strong>#${esc(selected.ranking.rank)} of ${rows.length}</strong></span><span><small>National percentile</small><strong>${esc(ordinal(selected.ranking.percentile))}</strong></span><span><small>Latest published value</small><strong>${esc(fmtValue(selected.latest?.value,selected.latest?.unit_code))}</strong><small>${esc(selected.latest?.period_label||'')}</small></span></div>`:`<p class="ri-indicator-hint">Select any county dot to pin it across the Atlas and reveal its exact rank, percentile and latest published value.</p>`;
    return `<div class="ri-indicator-distribution" id="v2-indicator-distribution" data-indicator-code="${esc(group.indicator_code)}"><div class="ri-indicator-dist-head"><div><small>National distribution</small><strong>Where counties sit on this indicator</strong></div><p>Position uses the published national rank. Key counties are labelled; every dot remains keyboard reachable and exposes the same published context.</p></div><div class="ri-indicator-scroll"><div class="ri-indicator-plot" role="group" aria-label="National rank distribution for ${esc(group.name)}">${pin}<div class="ri-indicator-track" aria-hidden="true"></div>${marks}<div class="ri-indicator-axis" aria-hidden="true"><span><strong>#${esc(first.ranking.rank)}</strong>${esc(ordinal(first.ranking.percentile))} percentile</span><span><strong>#${esc(middle.ranking.rank)}</strong>${esc(ordinal(middle.ranking.percentile))} percentile</span><span><strong>#${esc(last.ranking.rank)}</strong>${esc(ordinal(last.ranking.percentile))} percentile</span></div></div></div>${context}<p class="ri-spectrum-note">Ranks follow the published indicator direction shown in the table; the visual does not create a new score or trend.</p></div>`;
  }

  function decorateDevelopmentRows(d){
    const body=$('#ri-development-body');if(!body)return;
    const byName=new Map((d.development_snapshot||[]).map(r=>[r.county,r]));
    $$('tr',body).forEach(row=>{
      const county=$('td:first-child strong',row)?.textContent?.trim(),item=byName.get(county);if(!item)return;
      row.dataset.riGeo=item.geo_code;row.dataset.riScore=String(item.score??'');row.dataset.riRank=String(item.diagnostic_rank??'');
      const scoreCell=$$('td',row)[1];if(scoreCell&&!$('.ri-score-sparkbar',scoreCell)&&finite(item.score)){
        const bar=document.createElement('span');bar.className=`ri-score-sparkbar ${bandClass(item)}`;bar.setAttribute('aria-hidden','true');bar.style.setProperty('--score',`${Math.max(0,Math.min(100,Number(item.score)))}%`);scoreCell.appendChild(bar);
      }
    });
  }

  function decorateIndicatorRows(group,geoMap){
    const body=$('#ri-indicator-body');if(!body||!group)return;
    const byName=new Map((group.rows||[]).map(r=>[r.county,r])),pinned=pinnedGeo();
    $$('tr',body).forEach(row=>{
      const county=$$('td',row)[1]?.querySelector('strong')?.textContent?.trim(),item=byName.get(county);if(!item)return;
      const geo=indicatorGeo(item,geoMap);if(geo)row.dataset.riGeo=geo;else delete row.dataset.riGeo;
      row.classList.toggle('ri-indicator-pinned',Boolean(pinned&&geo===pinned));
    });
  }

  function ensureDevelopmentVisual(d){
    const panel=$('[data-ri-panel="development"]'),wrap=$('.ri-table-wrap',panel);if(!panel||!wrap)return;
    const html=spectrum(d.development_snapshot);if(!html)return;
    let visual=$('#v2-dev-beeswarm',panel);
    if(visual)visual.outerHTML=html;else wrap.insertAdjacentHTML('beforebegin',html);
    decorateDevelopmentRows(d);
    ensureSortButtons();
  }

  function ensureIndicatorVisual(d){
    const panel=$('[data-ri-panel="indicator"]'),meta=$('#ri-indicator-meta',panel),select=$('#ri-indicator-select',panel);if(!panel||!meta||!select)return;
    const group=(d.indicator_rankings||[]).find(g=>g.indicator_code===select.value)||(d.indicator_rankings||[])[0];if(!group)return;
    const geoMap=new Map((d.development_snapshot||[]).filter(r=>r.county&&r.geo_code).map(r=>[r.county,r.geo_code]));
    const html=indicatorDistribution(group,geoMap);if(!html)return;
    let visual=$('#v2-indicator-distribution',panel);
    if(visual)visual.outerHTML=html;else meta.insertAdjacentHTML('afterend',html);
    state.indicatorCode=group.indicator_code;decorateIndicatorRows(group,geoMap);
  }

  function suppressUnsupportedAdministrationSlopes(){
    const body=$('#ri-administration-body');if(!body)return;
    $$('tr',body).forEach(row=>{
      const existing=$('.v2-slope',row);
      if(existing?.matches('svg'))existing.remove();
      if(!$('.v2-slope',row)){
        const marker=document.createElement('span'),host=row.cells?.[2]||row;marker.className='v2-slope';marker.hidden=true;marker.setAttribute('aria-hidden','true');marker.dataset.suppressed='incompatible-units';host.appendChild(marker);
      }
    });
  }

  function ensureSortButtons(){
    const table=$('[data-ri-panel="development"] .ri-table');if(!table||table.dataset.riSortReady==='true')return;
    table.dataset.riSortReady='true';const heads=$$('thead th',table);
    [[1,'score','Score'],[3,'diagnostic_rank','Exact position*']].forEach(([idx,key,label])=>{
      const th=heads[idx];if(!th)return;th.innerHTML=`<button type="button" class="ri-sort-button" data-ri-sort="${key}" aria-label="Sort by ${label}">${label}<span aria-hidden="true">↕</span></button>`;
    });
    updateSortState();
  }
  function updateSortState(){
    $$('[data-ri-sort]').forEach(button=>{
      const active=button.dataset.riSort===state.sortKey,th=button.closest('th');
      button.classList.toggle('active',active);button.querySelector('span').textContent=active?(state.sortDir==='asc'?'↑':'↓'):'↕';
      if(th)th.setAttribute('aria-sort',active?(state.sortDir==='asc'?'ascending':'descending'):'none');
    });
  }
  function sortDevelopment(key){
    const body=$('#ri-development-body');if(!body)return;
    state.sortDir=state.sortKey===key?(state.sortDir==='asc'?'desc':'asc'):(key==='score'?'desc':'asc');state.sortKey=key;
    const rows=$$('tr[data-ri-geo]',body),first=new Map(rows.map(r=>[r,r.getBoundingClientRect().top]));
    rows.sort((a,b)=>{
      const av=Number(key==='score'?a.dataset.riScore:a.dataset.riRank),bv=Number(key==='score'?b.dataset.riScore:b.dataset.riRank),dir=state.sortDir==='asc'?1:-1;
      return (av-bv)*dir||a.textContent.localeCompare(b.textContent);
    }).forEach(r=>body.appendChild(r));
    if(!reduceMotion()){
      rows.forEach(row=>{const delta=first.get(row)-row.getBoundingClientRect().top;if(Math.abs(delta)>1&&row.animate)row.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:480,easing:'cubic-bezier(.22,1,.36,1)'});});
    }
    updateSortState();animateRows(body);
  }

  function animateRows(root){
    if(reduceMotion())return;const rows=$$('tbody tr',root?.closest?.('.ri-panel')||root||document).slice(0,12);
    rows.forEach((row,index)=>row.animate?.([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:330,delay:index*25,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'}));
  }
  function animatePanel(tab){
    const panel=$(`[data-ri-panel="${CSS.escape(tab)}"]`);if(!panel||panel.hidden)return;
    if(!reduceMotion())panel.animate?.([{opacity:.15,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:420,easing:'cubic-bezier(.22,1,.36,1)'});
    animateRows(panel);
  }
  function flashRow(geo){
    const row=$(`#ri-development-body tr[data-ri-geo="${CSS.escape(geo)}"]`);if(!row)return;
    row.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'center'});row.classList.remove('ri-row-flash');void row.offsetWidth;row.classList.add('ri-row-flash');setTimeout(()=>row.classList.remove('ri-row-flash'),900);
  }
  function flashIndicatorRow(geo){
    const row=$(`#ri-indicator-body tr[data-ri-geo="${CSS.escape(geo)}"]`);if(!row)return;
    row.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'center'});row.classList.remove('ri-row-flash');void row.offsetWidth;row.classList.add('ri-row-flash');setTimeout(()=>row.classList.remove('ri-row-flash'),900);
  }

  function bind(){
    if(state.bound)return;state.bound=true;
    document.addEventListener('click',async event=>{
      const sort=event.target.closest('[data-ri-sort]');if(sort&&isRankings()){sortDevelopment(sort.dataset.riSort);return;}
      const indicatorDot=event.target.closest('.ri-indicator-dot');if(indicatorDot&&isRankings()){
        const geo=indicatorDot.dataset.riIndicatorGeo;if(!geo)return;await window.KDAV2?.pin?.(geo,{announce:false});ensureIndicatorVisual(state.data);flashIndicatorRow(geo);return;
      }
      const dot=event.target.closest('.ri-spectrum-dot');if(dot&&isRankings()){await window.KDAV2?.pin?.(dot.dataset.riGeo,{announce:false});ensureDevelopmentVisual(state.data);flashRow(dot.dataset.riGeo);return;}
      const tab=event.target.closest('[data-ri-tab]');if(tab&&isRankings())requestAnimationFrame(()=>{if(tab.dataset.riTab==='indicator')ensureIndicatorVisual(state.data);animatePanel(tab.dataset.riTab);});
    });
    document.addEventListener('change',event=>{if(event.target?.matches?.('#ri-indicator-select')&&isRankings())requestAnimationFrame(()=>ensureIndicatorVisual(state.data));});
  }

  async function enhance(){
    if(!isRankings())return null;await ensureStyle();const d=await data();ensureDevelopmentVisual(d);ensureIndicatorVisual(d);suppressUnsupportedAdministrationSlopes();bind();
    const active=$('[data-ri-tab].active')?.dataset.riTab||'development';animatePanel(active);return d;
  }
  function boot(){if(bootPromise)return bootPromise;bootPromise=waitForRankings().then(rankings=>Promise.resolve(rankings?.boot?.())).then(()=>enhance()).catch(error=>{console.warn('Rankings visual v2:',error?.message||error);return null;});return bootPromise;}
  window.addEventListener('kda:route',event=>{if(event.detail?.view==='rankings'){bootPromise=null;boot();}});
  window.KDARankingsVisualV2={boot,enhance};
  if(isRankings())boot();
})(window);
