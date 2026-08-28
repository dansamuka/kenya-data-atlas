(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const fmtInt=new Intl.NumberFormat('en-KE',{maximumFractionDigits:0});
  const fmt1=new Intl.NumberFormat('en-KE',{minimumFractionDigits:1,maximumFractionDigits:1});
  const state={rows:[],selected:'KEN-C032',metric:'gcp2024',mode:'loading',issue:null,sample:null};

  function parseCsv(text){
    const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
    const head=(lines.shift()||'').split(',');
    return lines.filter(Boolean).map(line=>{
      const cells=[]; let cur=''; let quoted=false;
      for(let i=0;i<line.length;i++){
        const ch=line[i];
        if(ch==='"'){
          if(quoted&&line[i+1]==='"'){cur+='"';i++;}
          else quoted=!quoted;
        }else if(ch===','&&!quoted){cells.push(cur);cur='';}
        else cur+=ch;
      }
      cells.push(cur);
      return Object.fromEntries(head.map((h,i)=>[h,cells[i]??'']));
    });
  }
  async function text(url){const r=await fetch(url);if(!r.ok)throw new Error(`${url} (${r.status})`);return r.text();}
  const num=v=>v===''||v==null?null:Number(v);
  const growth=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b!==0?((a/b)-1)*100:null;
  const median=arr=>{const a=arr.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
  function rank(rows,key,desc=true){return [...rows].filter(r=>Number.isFinite(r[key])).sort((a,b)=>desc?b[key]-a[key]:a[key]-b[key]);}
  function rankOf(row,key,desc=true){const i=rank(state.rows,key,desc).findIndex(r=>r.geo_code===row.geo_code);return i<0?null:i+1;}
  function pct(v){return Number.isFinite(v)?`${fmt1.format(v)}%`:'—';}
  function int(v){return Number.isFinite(v)?fmtInt.format(v):'—';}
  function kshBn(vMn){return Number.isFinite(vMn)?`KES ${fmt1.format(vMn/1000)}bn`:'—';}
  function totalLabel(){return state.mode==='production'?'47 counties':`${state.rows.length} bundled sample counties`;}

  function hydrateRows(rows){
    return rows.map(r=>{
      const out={...r};
      out.gcpGrowth=Number.isFinite(out.gcpGrowth)?out.gcpGrowth:growth(out.gcp2024,out.gcp2023);
      out.gcpGrowth4y=Number.isFinite(out.gcpGrowth4y)?out.gcpGrowth4y:growth(out.gcp2024,out.gcp2020);
      return out;
    });
  }

  async function loadProductionRows(){
    const [gcpRaw,budgetRaw,votersRaw]=await Promise.all([
      text('data/sprint1/gcp-2020-2024.csv'),
      text('data/sprint1/county-budget-fy2024-25.csv'),
      text('data/sprint1/voters-2022.csv')
    ]);
    const gcp=parseCsv(gcpRaw),budget=parseCsv(budgetRaw),voters=parseCsv(votersRaw);
    if(!gcp.length)throw new Error('GCP file returned no county rows');
    const b=new Map(budget.map(r=>[r.geo_code,r]));
    const v=new Map(voters.map(r=>[r.geo_code,r]));
    return hydrateRows(gcp.map(r=>{
      const br=b.get(r.geo_code)||{},vr=v.get(r.geo_code)||{};
      return {geo_code:r.geo_code,name:r.name,gcp2020:num(r['2020']),gcp2021:num(r['2021']),gcp2022:num(r['2022']),gcp2023:num(r['2023']),gcp2024:num(r['2024']),budget:num(br.budget_total_ksh_mn),expenditure:num(br.expenditure_total_ksh_mn),devAbsorption:num(br.development_absorption_pct),absorption:num(br.overall_absorption_pct),voters:num(vr.value)};
    }));
  }

  function loadSampleBundle(){
    if(window.COUNTYIQ_SAMPLE)return Promise.resolve(window.COUNTYIQ_SAMPLE);
    return new Promise(resolve=>{
      const existing=document.querySelector('script[data-countyiq-sample]');
      if(existing){existing.addEventListener('load',()=>resolve(window.COUNTYIQ_SAMPLE||null),{once:true});existing.addEventListener('error',()=>resolve(null),{once:true});return;}
      const script=document.createElement('script');
      script.src='assets/countyiq-sample.js';
      script.dataset.countyiqSample='true';
      script.onload=()=>resolve(window.COUNTYIQ_SAMPLE||null);
      script.onerror=()=>resolve(null);
      document.head.appendChild(script);
    });
  }

  function ensureResilienceUi(){
    const tabs=$('.countyiq-tabs');
    if(tabs&&!$('#demo-preview-tab')){
      const btn=document.createElement('button');
      btn.type='button';btn.id='demo-preview-tab';btn.dataset.panel='demo-preview';btn.textContent='Demo preview';
      const finalBtn=$('button[data-panel="final-shape"]',tabs);
      tabs.insertBefore(btn,finalBtn||null);
    }
    if(!$('#demo-preview')){
      const panel=document.createElement('section');
      panel.className='iq-panel';panel.id='demo-preview';
      panel.innerHTML=`<div class="iq-section-head"><div><p class="eyebrow">Illustrative mature-product preview</p><h2>See the intended CountyIQ experience with sample data.</h2></div><p>Everything in this tab is explicitly <strong>Demo</strong>. It shows final-product structure before the corresponding methodology and production datasets are complete.</p></div><div class="iq-alert"><strong>Demo only:</strong> scores, peer groups, gap values and opportunities below are synthetic interface samples. Do not cite them as county facts.</div><div id="demo-preview-body"><div class="iq-loading">Loading sample preview…</div></div>`;
      const method=$('#methodology');
      method?.parentNode?.insertBefore(panel,method);
    }
    if(!$('#data-mode-note')){
      const note=document.createElement('div');
      note.id='data-mode-note';note.className='data-mode-note';note.setAttribute('role','status');note.setAttribute('aria-live','polite');
      const overview=$('#overview');const alert=$('.iq-alert',overview);
      overview?.insertBefore(note,alert||overview.firstChild);
    }
  }

  function setupTabs(){
    $$('.countyiq-tabs button').forEach(btn=>btn.addEventListener('click',()=>{
      $$('.countyiq-tabs button').forEach(b=>b.classList.toggle('active',b===btn));
      $$('.iq-panel').forEach(p=>p.classList.toggle('active',p.id===btn.dataset.panel));
    }));
  }
  function setupRankingControl(){
    const sel=$('#rank-metric');if(!sel)return;
    sel.addEventListener('change',()=>{state.metric=sel.value;renderRanking();});
  }
  function setupCountyPicker(){
    const sel=$('#county-select');if(!sel)return;
    sel.innerHTML=state.rows.map(r=>`<option value="${r.geo_code}" ${r.geo_code===state.selected?'selected':''}>${r.name}</option>`).join('');
    if(!state.rows.some(r=>r.geo_code===state.selected)&&state.rows.length)state.selected=state.rows[0].geo_code;
    sel.value=state.selected;
    sel.onchange=()=>{state.selected=sel.value;render();};
  }
  function current(){return state.rows.find(r=>r.geo_code===state.selected)||state.rows[0];}

  async function load(){
    ensureResilienceUi();setupTabs();setupRankingControl();
    try{
      state.rows=await loadProductionRows();
      state.mode='production';
    }catch(err){
      console.warn('CountyIQ production data unavailable; attempting bundled sample fallback.',err);
      state.issue=String(err.message||err);
      state.sample=await loadSampleBundle();
      if(state.sample?.rows?.length){state.rows=hydrateRows(state.sample.rows);state.mode='sample';}
      else state.mode='unavailable';
    }
    if(!state.sample)state.sample=await loadSampleBundle();
    setupCountyPicker();renderModeNote();render();renderDemoPreview(current());
  }

  function renderModeNote(){
    const el=$('#data-mode-note');if(!el)return;
    if(state.mode==='production'){
      el.className='data-mode-note production';
      el.innerHTML='<strong>Live Atlas data loaded.</strong> Current CountyIQ metrics are reading the published 47-county source files. A bundled sample remains available only for the Demo preview and as a resilience fallback.';
    }else if(state.mode==='sample'){
      el.className='data-mode-note sample';
      el.innerHTML=`<strong>Sample fallback active.</strong> The production CSV requests were unavailable, so CountyIQ is showing a ${state.rows.length}-county bundled source-backed snapshot. Demo preview scores and opportunities remain synthetic and clearly labelled. <small>${state.issue||''}</small>`;
    }else{
      el.className='data-mode-note error';
      el.innerHTML='<strong>County data is temporarily unavailable.</strong> Navigation, methodology and the project roadmap remain usable. Reload from the published site or serve the repository through a local HTTP server.';
    }
  }

  function render(){
    const r=current();
    if(!r){renderUnavailable();return;}
    $('#county-title').textContent=r.name;
    $('#county-code').textContent=r.geo_code;
    renderMetrics(r);renderTrend(r);renderBenchmarks(r);renderFiscal(r);renderRanking();renderNarrative(r);renderDemoPreview(r);
  }
  function renderUnavailable(){
    const metrics=$('#iq-metrics');if(metrics)metrics.innerHTML='<div class="iq-error"><strong>County metrics unavailable.</strong><br>The rest of CountyIQ remains available; no demo value has been substituted silently.</div>';
    const ranking=$('#ranking-body');if(ranking)ranking.innerHTML='';
    const narrative=$('#county-narrative');if(narrative)narrative.textContent='No county statistics are available in this browser session.';
  }
  function renderMetrics(r){
    const medGrowth=median(state.rows.map(x=>x.gcpGrowth));
    const medAbs=median(state.rows.map(x=>x.absorption));
    const total=state.rows.length;
    const cards=[
      ['Gross County Product',kshBn(r.gcp2024),`#${rankOf(r,'gcp2024')||'—'} of ${total} by 2024 GCP`,'2024 · KNBS GCP · preliminary','A'],
      ['GCP growth',pct(r.gcpGrowth),`${Number.isFinite(medGrowth)&&r.gcpGrowth>=medGrowth?'Above':'Below'} ${state.mode==='production'?'county':'sample'} median (${pct(medGrowth)})`,'2023→2024 · derived from published GCP','B'],
      ['Budget absorption',pct(r.absorption),`#${rankOf(r,'absorption')||'—'} of ${total} · median ${pct(medAbs)}`,'FY2024/25 · Controller of Budget','A'],
      ['Registered voters',int(r.voters),`#${rankOf(r,'voters')||'—'} of ${total} by 2022 register`,'Certified register · June 2022 · IEBC','A']
    ];
    $('#iq-metrics').innerHTML=cards.map(c=>`<article class="iq-metric"><span class="badge ${c[4].toLowerCase()}">${c[4]}</span><div class="label">${c[0]}</div><strong>${c[1]}</strong><div class="context">${c[2]}</div><small>${c[3]}</small></article>`).join('');
  }
  function renderTrend(r){
    const vals=[r.gcp2020,r.gcp2021,r.gcp2022,r.gcp2023,r.gcp2024];
    const years=['2020','2021','2022','2023','2024'];
    const finite=vals.filter(Number.isFinite);
    if(finite.length<2){$('#gcp-trend').innerHTML='<div class="iq-loading">Trend not available.</div>';$('#trend-note').textContent='Not enough comparable observations to calculate a trend.';return;}
    const min=Math.min(...finite),max=Math.max(...finite),span=max-min||1;
    const pts=vals.map((v,i)=>({x:35+i*145,y:Number.isFinite(v)?190-((v-min)/span)*145:190,v,year:years[i]}));
    const line=pts.filter(p=>Number.isFinite(p.v)).map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');
    const valid=pts.filter(p=>Number.isFinite(p.v));
    const area=valid.length?`M${valid[0].x},195 ${valid.map(p=>`L${p.x},${p.y}`).join(' ')} L${valid[valid.length-1].x},195 Z`:'';
    $('#gcp-trend').innerHTML=`<svg viewBox="0 0 650 220" role="img" aria-label="Gross County Product trend from 2020 to 2024"><path class="iq-gridline" d="M35 45H615M35 95H615M35 145H615M35 195H615"/>${area?`<path class="iq-area" d="${area}"/>`:''}<path class="iq-line" d="${line}"/>${valid.map(p=>`<circle class="iq-dot" cx="${p.x}" cy="${p.y}" r="5"><title>${p.year}: KES ${fmtInt.format(p.v)} million</title></circle>`).join('')}</svg><div class="trend-labels">${years.map(y=>`<span>${y}</span>`).join('')}</div>`;
    $('#trend-note').textContent=`2024 GCP is ${pct(r.gcpGrowth4y)} higher than 2020 in nominal current-price terms.`;
  }
  function renderBenchmarks(r){
    const maxGrowth=Math.max(...state.rows.map(x=>x.gcpGrowth).filter(Number.isFinite),1);
    const items=[
      {label:'GCP growth 2023→2024',key:'gcpGrowth',value:r.gcpGrowth,max:maxGrowth},
      {label:'Overall budget absorption',key:'absorption',value:r.absorption,max:100},
      {label:'Development absorption',key:'devAbsorption',value:r.devAbsorption,max:100}
    ];
    $('#benchmark-list').innerHTML=items.map(x=>`<div class="benchmark-item"><div class="benchmark-item-top"><span>${x.label}</span><strong>${pct(x.value)}</strong></div><div class="benchmark-track"><div class="benchmark-fill" style="width:${Number.isFinite(x.value)?Math.max(0,Math.min(100,(x.value/x.max)*100)):0}%"></div></div><small>${state.mode==='production'?'County':'Sample'} rank: #${rankOf(r,x.key)||'—'} of ${state.rows.length}</small></div>`).join('');
  }
  function renderFiscal(r){
    $('#fiscal-summary').innerHTML=`<div class="benchmark-list"><div class="benchmark-item"><div class="benchmark-item-top"><span>Approved county budget</span><strong>${kshBn(r.budget)}</strong></div><small>FY2024/25</small></div><div class="benchmark-item"><div class="benchmark-item-top"><span>Total expenditure</span><strong>${kshBn(r.expenditure)}</strong></div><small>FY2024/25</small></div><div class="benchmark-item"><div class="benchmark-item-top"><span>Overall absorption</span><strong>${pct(r.absorption)}</strong></div><div class="benchmark-track"><div class="benchmark-fill" style="width:${Number.isFinite(r.absorption)?r.absorption:0}%"></div></div></div><div class="benchmark-item"><div class="benchmark-item-top"><span>Development absorption</span><strong>${pct(r.devAbsorption)}</strong></div><div class="benchmark-track"><div class="benchmark-fill" style="width:${Number.isFinite(r.devAbsorption)?r.devAbsorption:0}%"></div></div></div></div>`;
  }
  function metricDef(){
    return {
      gcp2024:{label:'Gross County Product (2024)',format:v=>kshBn(v),desc:true,period:'2024',quality:'A'},
      gcpGrowth:{label:'GCP growth (2023→2024)',format:v=>pct(v),desc:true,period:'2023→2024',quality:'B'},
      absorption:{label:'Overall budget absorption',format:v=>pct(v),desc:true,period:'FY2024/25',quality:'A'},
      devAbsorption:{label:'Development budget absorption',format:v=>pct(v),desc:true,period:'FY2024/25',quality:'A'},
      voters:{label:'Registered voters',format:v=>int(v),desc:true,period:'June 2022',quality:'A'}
    }[state.metric];
  }
  function renderRanking(){
    const body=$('#ranking-body');if(!body||!state.rows.length)return;
    const def=metricDef(),rows=rank(state.rows,state.metric,def.desc),selected=state.selected;
    $('#rank-label').textContent=`${totalLabel()} · ${def.period} · ${state.mode==='production'?'live Atlas source files':'bundled source-backed sample snapshot'}`;
    body.innerHTML=rows.map((r,i)=>`<tr ${r.geo_code===selected?'data-selected="true"':''}><td><span class="rank-pill">${i+1}</span></td><td><button class="rank-county" data-code="${r.geo_code}">${r.name}</button></td><td>${def.format(r[state.metric])}</td><td>${r.geo_code}</td><td><span class="badge ${def.quality.toLowerCase()}">${def.quality}</span></td></tr>`).join('');
    $$('.rank-county').forEach(btn=>btn.addEventListener('click',()=>{state.selected=btn.dataset.code;const sel=$('#county-select');if(sel)sel.value=state.selected;render();window.scrollTo({top:0,behavior:'smooth'});}));
  }
  function renderNarrative(r){
    const medGrowth=median(state.rows.map(x=>x.gcpGrowth)),medAbs=median(state.rows.map(x=>x.absorption));
    const bits=[];
    bits.push(`${r.name} ranks #${rankOf(r,'gcp2024')||'—'} of ${state.rows.length} ${state.mode==='production'?'counties':'sample counties'} by 2024 Gross County Product.`);
    bits.push(`Nominal GCP growth from 2023 to 2024 was ${pct(r.gcpGrowth)}, ${Number.isFinite(medGrowth)&&r.gcpGrowth>=medGrowth?'above':'below'} the comparison median of ${pct(medGrowth)}.`);
    bits.push(`FY2024/25 overall budget absorption was ${pct(r.absorption)}, ${Number.isFinite(medAbs)&&r.absorption>=medAbs?'above':'below'} the comparison median of ${pct(medAbs)}.`);
    $('#county-narrative').textContent=bits.join(' ');
  }

  function renderDemoPreview(r){
    const root=$('#demo-preview-body');if(!root)return;
    const preview=state.sample?.previews?.[r?.geo_code];
    if(!preview){
      root.innerHTML='<div class="iq-card soft"><h3>Preview sample not defined for this county.</h3><p>Select Nakuru, Mombasa, Tana River, Kiambu, Turkana or Nairobi City to see the intentionally synthetic mature-product preview. Production statistics elsewhere on CountyIQ are unaffected.</p></div>';
      return;
    }
    const gap=preview.development_gap;
    const opportunities=preview.opportunities||[];
    root.innerHTML=`<div class="demo-preview-grid">
      <article class="demo-score-card"><span class="badge demo">Demo</span><small>Illustrative County Development & Performance Index</small><strong>${fmt1.format(preview.development_performance_index)}</strong><p>Peer group: ${preview.peer_group}</p><div class="demo-meta"><span>${preview.peer_rank}</span><span>${preview.trend_label}</span></div></article>
      <article class="demo-score-card"><span class="badge demo">Demo</span><small>Illustrative Government Delivery & Accountability</small><strong>${fmt1.format(preview.delivery_accountability_score)}</strong><p>This demonstrates the future separation between broad county outcomes and government-linked delivery.</p></article>
      <article class="demo-score-card"><span class="badge demo">Demo</span><small>Development Gap Calculator</small><strong>${gap?.value||'Sample'}</strong><p>${gap?.label||'Benchmark gap'} · ${gap?.basis||'Illustrative benchmark formula'}</p></article>
    </div>${opportunities.length?`<div class="iq-card soft demo-opportunities"><div class="iq-card-head"><div><small>Opportunity Finder preview</small><h3>Verified-style records, using demo content</h3><p>These are not live programmes. The mature product will require a primary URL, eligibility, deadline and verification date for every record.</p></div><span class="badge demo">Demo</span></div>${opportunities.map(o=>`<div class="source-row"><div><strong>${o.title}</strong><small>${o.fit}</small></div><span class="roadmap-status roadmap-planned">${o.status}</span></div>`).join('')}</div>`:''}`;
  }

  document.addEventListener('DOMContentLoaded',load);
})();