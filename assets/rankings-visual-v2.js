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
  const reduceMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  const state={data:null,bound:false,sortKey:'diagnostic_rank',sortDir:'asc'};
  let bootPromise=null;

  function route(){return R?.current?.()||R?.parse?.()||{view:'rankings'};}
  function isRankings(){return route().view==='rankings'||/^#\/?rankings(?:\?|$)/.test(location.hash);}
  async function data(){return state.data||(state.data=await KDA.fetchJson('data/results/county-results.json',{required:true}));}
  function ensureStyle(){return KDA.loadStyle?KDA.loadStyle('assets/rankings-visual-v2.css',{id:'kda-rankings-visual-v2-css'}):Promise.resolve();}
  function waitForRankings(){if(window.KDARankings?.boot)return Promise.resolve(window.KDARankings);return new Promise(resolve=>{let tries=0;const timer=setInterval(()=>{tries+=1;if(window.KDARankings?.boot||tries>=50){clearInterval(timer);resolve(window.KDARankings||null);}},80);});}

  function bandClass(row){const band=Number(row.relative_position_band);return finite(band)&&band>=1&&band<=5?`band-${band}`:'band-3';}
  function rankPct(rank){return Math.max(0,Math.min(100,((Number(rank)-1)/46)*100));}
  function spectrum(dataRows){
    const rows=(dataRows||[]).filter(r=>finite(r.diagnostic_rank)).slice().sort((a,b)=>Number(a.diagnostic_rank)-Number(b.diagnostic_rank));
    if(rows.length<5)return'';
    const marks=rows.map((r,index)=>{
      const rank=Number(r.diagnostic_rank),min=finite(r.plausible_min_rank)?Number(r.plausible_min_rank):rank,max=finite(r.plausible_max_rank)?Number(r.plausible_max_rank):rank;
      const lo=Math.min(min,max),hi=Math.max(min,max),left=rankPct(lo),right=rankPct(hi),x=rankPct(rank),lane=index%5;
      return `<span class="ri-spectrum-whisker ${bandClass(r)}" style="--x0:${left.toFixed(3)}%;--x1:${right.toFixed(3)}%;--lane:${lane}" aria-hidden="true"></span><button type="button" class="ri-spectrum-dot ${bandClass(r)}" style="--x:${x.toFixed(3)}%;--lane:${lane}" data-ri-geo="${esc(r.geo_code)}" data-ri-county="${esc(r.county)}" data-ri-score="${esc(r.score)}" data-ri-rank="${esc(rank)}" data-ri-range="#${esc(lo)}–#${esc(hi)}" data-v2-tooltip="${esc(r.county)} · score ${esc(r.score)} / 100 · diagnostic #${esc(rank)} · plausible #${esc(lo)}–#${esc(hi)}" aria-label="${esc(r.county)}, score ${esc(r.score)}, diagnostic position ${esc(rank)}, plausible position ${esc(lo)} to ${esc(hi)}"><span class="sr-only">${esc(r.county)}</span></button>`;
    }).join('');
    return `<div class="ri-development-spectrum" id="v2-dev-beeswarm" data-ri-development-spectrum="true"><div class="ri-spectrum-head"><div><small>Position spectrum</small><strong>How counties cluster — without hiding uncertainty</strong></div><p>Dots use diagnostic position; whiskers show the published plausible rank range. Scores remain visible in the table below.</p></div><div class="ri-spectrum-legend" aria-label="Relative position bands"><span class="band-1"><i></i>Top 20%</span><span class="band-2"><i></i>20–40%</span><span class="band-3"><i></i>40–60%</span><span class="band-4"><i></i>60–80%</span><span class="band-5"><i></i>Bottom 20%</span></div><div class="ri-spectrum-scroll"><div class="ri-spectrum-plot" role="group" aria-label="County diagnostic position spectrum from 1 to 47">${marks}<div class="ri-spectrum-axis" aria-hidden="true"><span>#1</span><span>#12</span><span>#24</span><span>#36</span><span>#47</span></div></div></div><p class="ri-spectrum-note">Exact position is diagnostic. The uncertainty whisker is the published robustness range, not an extra modelled estimate.</p></div>`;
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

  function ensureDevelopmentVisual(d){
    const panel=$('[data-ri-panel="development"]'),wrap=$('.ri-table-wrap',panel);if(!panel||!wrap)return;
    let visual=$('#v2-dev-beeswarm',panel);
    if(!visual||!visual.classList.contains('ri-development-spectrum')){
      const html=spectrum(d.development_snapshot);if(!html)return;
      if(visual)visual.outerHTML=html;else wrap.insertAdjacentHTML('beforebegin',html);
      visual=$('#v2-dev-beeswarm.ri-development-spectrum',panel);
    }
    decorateDevelopmentRows(d);
    ensureSortButtons();
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

  function bind(){
    if(state.bound)return;state.bound=true;
    document.addEventListener('click',event=>{
      const sort=event.target.closest('[data-ri-sort]');if(sort&&isRankings()){sortDevelopment(sort.dataset.riSort);return;}
      const dot=event.target.closest('.ri-spectrum-dot');if(dot&&isRankings()){void window.KDAV2?.pin?.(dot.dataset.riGeo,{announce:false});flashRow(dot.dataset.riGeo);return;}
      const tab=event.target.closest('[data-ri-tab]');if(tab&&isRankings())requestAnimationFrame(()=>animatePanel(tab.dataset.riTab));
    });
  }

  async function enhance(){
    if(!isRankings())return null;await ensureStyle();const d=await data();ensureDevelopmentVisual(d);bind();
    const active=$('[data-ri-tab].active')?.dataset.riTab||'development';animatePanel(active);return d;
  }
  function boot(){if(bootPromise)return bootPromise;bootPromise=waitForRankings().then(rankings=>Promise.resolve(rankings?.boot?.())).then(()=>enhance()).catch(error=>{console.warn('Rankings visual v2:',error?.message||error);return null;});return bootPromise;}
  window.addEventListener('kda:route',event=>{if(event.detail?.view==='rankings'){bootPromise=null;boot();}});
  window.KDARankingsVisualV2={boot,enhance};
  if(isRankings())boot();
})(window);
