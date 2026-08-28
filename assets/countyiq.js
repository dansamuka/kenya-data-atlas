(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const fmtInt=new Intl.NumberFormat('en-KE',{maximumFractionDigits:0});
  const fmt1=new Intl.NumberFormat('en-KE',{minimumFractionDigits:1,maximumFractionDigits:1});
  const state={rows:[],selected:'KEN-C032',metric:'gcp2024'};

  function parseCsv(text){
    const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
    const head=lines.shift().split(',');
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
  const growth=(a,b)=>a&&b?((a/b)-1)*100:null;
  const median=arr=>{const a=arr.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
  function rank(rows,key,desc=true){return [...rows].filter(r=>Number.isFinite(r[key])).sort((a,b)=>desc?b[key]-a[key]:a[key]-b[key]);}
  function rankOf(row,key,desc=true){return rank(state.rows,key,desc).findIndex(r=>r.geo_code===row.geo_code)+1;}
  function pct(v){return Number.isFinite(v)?`${fmt1.format(v)}%`:'—';}
  function kshBn(vMn){return Number.isFinite(vMn)?`KES ${fmt1.format(vMn/1000)}bn`:'—';}

  async function load(){
    try{
      const [gcpRaw,budgetRaw,votersRaw]=await Promise.all([
        text('data/sprint1/gcp-2020-2024.csv'),
        text('data/sprint1/county-budget-fy2024-25.csv'),
        text('data/sprint1/voters-2022.csv')
      ]);
      const gcp=parseCsv(gcpRaw),budget=parseCsv(budgetRaw),voters=parseCsv(votersRaw);
      const b=new Map(budget.map(r=>[r.geo_code,r]));
      const v=new Map(voters.map(r=>[r.geo_code,r]));
      state.rows=gcp.map(r=>{
        const br=b.get(r.geo_code)||{}, vr=v.get(r.geo_code)||{};
        const out={geo_code:r.geo_code,name:r.name,gcp2020:num(r['2020']),gcp2021:num(r['2021']),gcp2022:num(r['2022']),gcp2023:num(r['2023']),gcp2024:num(r['2024']),budget:num(br.budget_total_ksh_mn),expenditure:num(br.expenditure_total_ksh_mn),devAbsorption:num(br.development_absorption_pct),absorption:num(br.overall_absorption_pct),voters:num(vr.value)};
        out.gcpGrowth=growth(out.gcp2024,out.gcp2023);
        out.gcpGrowth4y=growth(out.gcp2024,out.gcp2020);
        return out;
      });
      setupCountyPicker();setupTabs();setupRankingControl();render();
    }catch(err){
      console.error(err);const root=$('#iq-root');if(root)root.innerHTML=`<div class="iq-error"><strong>CountyIQ data could not load.</strong><br>${String(err.message||err)}</div>`;
    }
  }

  function setupCountyPicker(){
    const sel=$('#county-select');
    sel.innerHTML=state.rows.map(r=>`<option value="${r.geo_code}" ${r.geo_code===state.selected?'selected':''}>${r.name}</option>`).join('');
    sel.addEventListener('change',()=>{state.selected=sel.value;render();});
  }
  function setupTabs(){
    $$('.countyiq-tabs button').forEach(btn=>btn.addEventListener('click',()=>{
      $$('.countyiq-tabs button').forEach(b=>b.classList.toggle('active',b===btn));
      $$('.iq-panel').forEach(p=>p.classList.toggle('active',p.id===btn.dataset.panel));
    }));
  }
  function setupRankingControl(){
    const sel=$('#rank-metric'); if(!sel)return;
    sel.addEventListener('change',()=>{state.metric=sel.value;renderRanking();});
  }
  function current(){return state.rows.find(r=>r.geo_code===state.selected)||state.rows[0];}

  function render(){
    const r=current(); if(!r)return;
    $('#county-title').textContent=r.name;
    $('#county-code').textContent=r.geo_code;
    renderMetrics(r);renderTrend(r);renderBenchmarks(r);renderFiscal(r);renderRanking();renderNarrative(r);
  }
  function renderMetrics(r){
    const medGrowth=median(state.rows.map(x=>x.gcpGrowth));
    const medAbs=median(state.rows.map(x=>x.absorption));
    const cards=[
      ['Gross County Product',kshBn(r.gcp2024),`#${rankOf(r,'gcp2024')} of 47 by 2024 GCP`,'2024 · KNBS GCP · preliminary','A'],
      ['GCP growth',pct(r.gcpGrowth),`${r.gcpGrowth>=medGrowth?'Above':'Below'} county median (${pct(medGrowth)})`,'2023→2024 · derived from published GCP','B'],
      ['Budget absorption',pct(r.absorption),`#${rankOf(r,'absorption')} of 47 · median ${pct(medAbs)}`,'FY2024/25 · Controller of Budget','A'],
      ['Registered voters',fmtInt.format(r.voters),`#${rankOf(r,'voters')} of 47 by 2022 register`,'Certified register · June 2022 · IEBC','A']
    ];
    $('#iq-metrics').innerHTML=cards.map(c=>`<article class="iq-metric"><span class="badge ${c[4].toLowerCase()}">${c[4]}</span><div class="label">${c[0]}</div><strong>${c[1]}</strong><div class="context">${c[2]}</div><small>${c[3]}</small></article>`).join('');
  }
  function renderTrend(r){
    const vals=[r.gcp2020,r.gcp2021,r.gcp2022,r.gcp2023,r.gcp2024];
    const years=['2020','2021','2022','2023','2024'];
    const min=Math.min(...vals),max=Math.max(...vals),span=max-min||1;
    const pts=vals.map((v,i)=>({x:35+i*145,y:190-((v-min)/span)*145,v,year:years[i]}));
    const line=pts.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');
    const area=`M${pts[0].x},195 ${pts.map(p=>`L${p.x},${p.y}`).join(' ')} L${pts[pts.length-1].x},195 Z`;
    $('#gcp-trend').innerHTML=`<svg viewBox="0 0 650 220" role="img" aria-label="Gross County Product trend from 2020 to 2024"><path class="iq-gridline" d="M35 45H615M35 95H615M35 145H615M35 195H615"/><path class="iq-area" d="${area}"/><path class="iq-line" d="${line}"/>${pts.map(p=>`<circle class="iq-dot" cx="${p.x}" cy="${p.y}" r="5"><title>${p.year}: KES ${fmtInt.format(p.v)} million</title></circle>`).join('')}</svg><div class="trend-labels">${years.map(y=>`<span>${y}</span>`).join('')}</div>`;
    $('#trend-note').textContent=`2024 GCP is ${pct(r.gcpGrowth4y)} higher than 2020 in nominal current-price terms.`;
  }
  function renderBenchmarks(r){
    const items=[
      {label:'GCP growth 2023→2024',key:'gcpGrowth',value:r.gcpGrowth,max:Math.max(...state.rows.map(x=>x.gcpGrowth)),unit:'%'},
      {label:'Overall budget absorption',key:'absorption',value:r.absorption,max:100,unit:'%'},
      {label:'Development absorption',key:'devAbsorption',value:r.devAbsorption,max:100,unit:'%'}
    ];
    $('#benchmark-list').innerHTML=items.map(x=>`<div class="benchmark-item"><div class="benchmark-item-top"><span>${x.label}</span><strong>${pct(x.value)}</strong></div><div class="benchmark-track"><div class="benchmark-fill" style="width:${Math.max(0,Math.min(100,(x.value/x.max)*100))}%"></div></div><small>County rank: #${rankOf(r,x.key)} of 47</small></div>`).join('');
  }
  function renderFiscal(r){
    $('#fiscal-summary').innerHTML=`<div class="benchmark-list"><div class="benchmark-item"><div class="benchmark-item-top"><span>Approved county budget</span><strong>${kshBn(r.budget)}</strong></div><small>FY2024/25</small></div><div class="benchmark-item"><div class="benchmark-item-top"><span>Total expenditure</span><strong>${kshBn(r.expenditure)}</strong></div><small>FY2024/25</small></div><div class="benchmark-item"><div class="benchmark-item-top"><span>Overall absorption</span><strong>${pct(r.absorption)}</strong></div><div class="benchmark-track"><div class="benchmark-fill" style="width:${r.absorption}%"></div></div></div><div class="benchmark-item"><div class="benchmark-item-top"><span>Development absorption</span><strong>${pct(r.devAbsorption)}</strong></div><div class="benchmark-track"><div class="benchmark-fill" style="width:${r.devAbsorption}%"></div></div></div></div>`;
  }
  function metricDef(){
    return {
      gcp2024:{label:'Gross County Product (2024)',format:v=>kshBn(v),desc:true,period:'2024'},
      gcpGrowth:{label:'GCP growth (2023→2024)',format:v=>pct(v),desc:true,period:'2023→2024'},
      absorption:{label:'Overall budget absorption',format:v=>pct(v),desc:true,period:'FY2024/25'},
      devAbsorption:{label:'Development budget absorption',format:v=>pct(v),desc:true,period:'FY2024/25'},
      voters:{label:'Registered voters',format:v=>fmtInt.format(v),desc:true,period:'June 2022'}
    }[state.metric];
  }
  function renderRanking(){
    const def=metricDef(),rows=rank(state.rows,state.metric,def.desc);const selected=state.selected;
    $('#rank-label').textContent=`47 counties · ${def.period} · source-backed Atlas data`;
    $('#ranking-body').innerHTML=rows.map((r,i)=>`<tr ${r.geo_code===selected?'data-selected="true"':''}><td><span class="rank-pill">${i+1}</span></td><td><button class="rank-county" data-code="${r.geo_code}">${r.name}</button></td><td>${def.format(r[state.metric])}</td><td>${r.geo_code}</td><td><span class="badge a">A</span></td></tr>`).join('');
    $$('.rank-county').forEach(btn=>btn.addEventListener('click',()=>{state.selected=btn.dataset.code;$('#county-select').value=state.selected;render();window.scrollTo({top:0,behavior:'smooth'});}));
  }
  function renderNarrative(r){
    const medGrowth=median(state.rows.map(x=>x.gcpGrowth)),medAbs=median(state.rows.map(x=>x.absorption));
    const bits=[];
    bits.push(`${r.name} ranks #${rankOf(r,'gcp2024')} of 47 by 2024 Gross County Product.`);
    bits.push(`Nominal GCP growth from 2023 to 2024 was ${pct(r.gcpGrowth)}, ${r.gcpGrowth>=medGrowth?'above':'below'} the county median of ${pct(medGrowth)}.`);
    bits.push(`FY2024/25 overall budget absorption was ${pct(r.absorption)}, ${r.absorption>=medAbs?'above':'below'} the county median of ${pct(medAbs)}.`);
    $('#county-narrative').textContent=bits.join(' ');
  }

  document.addEventListener('DOMContentLoaded',load);
})();