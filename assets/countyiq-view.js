/* Kenya Data Atlas — integrated CountyIQ route.
 *
 * This route deliberately has no D3, roadmap JSON, external API or separate
 * application dependency. It reuses the shared Atlas text cache for three
 * already-published Sprint 1 tables and degrades to a small source-backed
 * snapshot rather than taking down the view.
 */
(function(){
  'use strict';
  const KDA=window.KDAData;
  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const FALLBACK=[
    {geo_code:'KEN-C001',name:'Mombasa',gcp:[469299,528840,605258,670023,711088],budget:17360,expenditure:13316.23,devAbsorption:62,absorption:77,voters:641913},
    {geo_code:'KEN-C004',name:'Tana River',gcp:[29469,35516,37693,43484,51145],budget:9177.72,expenditure:6705.90,devAbsorption:56,absorption:73,voters:141096},
    {geo_code:'KEN-C022',name:'Kiambu',gcp:[555593,618360,695551,760998,819834],budget:23480.38,expenditure:16495.58,devAbsorption:37,absorption:70,voters:1275008},
    {geo_code:'KEN-C023',name:'Turkana',gcp:[107455,111946,133309,155744,178441],budget:17213.59,expenditure:13548.66,devAbsorption:65,absorption:79,voters:238528},
    {geo_code:'KEN-C032',name:'Nakuru',gcp:[479851,565879,633411,755946,771775],budget:23980.40,expenditure:15965.37,devAbsorption:42,absorption:67,voters:1054856},
    {geo_code:'KEN-C047',name:'Nairobi City',gcp:[2685707,3001449,3453792,3834171,4105576],budget:43564.27,expenditure:33523.47,devAbsorption:29,absorption:77,voters:2415310}
  ];
  let bootPromise=null,rows=[],mode='loading',currentCode='KEN-C032';

  const n=value=>{const x=Number(value);return Number.isFinite(x)?x:null;};
  const formatInt=value=>Number.isFinite(Number(value))?Number(value).toLocaleString('en-KE',{maximumFractionDigits:0}):'—';
  const formatPct=value=>Number.isFinite(Number(value))?`${Number(value).toLocaleString('en-KE',{maximumFractionDigits:1})}%`:'—';
  const formatKesMn=value=>{const x=Number(value);if(!Number.isFinite(x))return'—';return x>=1000?`KES ${(x/1000).toLocaleString('en-KE',{maximumFractionDigits:1})}bn`:`KES ${x.toLocaleString('en-KE',{maximumFractionDigits:1})}mn`;};
  const median=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
  function rankOf(value,values){if(!Number.isFinite(value))return null;return values.filter(Number.isFinite).sort((a,b)=>b-a).findIndex(x=>x===value)+1;}
  function pctOf(value,values){const a=values.filter(Number.isFinite);if(!Number.isFinite(value)||!a.length)return 0;const min=Math.min(...a),max=Math.max(...a);return max===min?50:Math.max(5,Math.min(100,((value-min)/(max-min))*100));}

  function parseRows(gcp,budget,voters){
    const budgetBy=new Map((budget||[]).map(r=>[r.geo_code,r]));
    const votersBy=new Map((voters||[]).map(r=>[r.geo_code,r]));
    return (gcp||[]).map(r=>{
      const b=budgetBy.get(r.geo_code)||{},v=votersBy.get(r.geo_code)||{};
      return{
        geo_code:r.geo_code,name:r.name||r.county||r.county_name,
        gcp:[2020,2021,2022,2023,2024].map(y=>n(r[String(y)])),
        budget:n(b.budget_total_ksh_mn),expenditure:n(b.expenditure_total_ksh_mn),
        devAbsorption:n(b.development_absorption_pct),absorption:n(b.overall_absorption_pct),
        voters:n(v.value??v.registered_voters)
      };
    }).filter(r=>r.geo_code&&r.name&&r.gcp.some(Number.isFinite)).sort((a,b)=>a.name.localeCompare(b.name));
  }

  function latestGcp(row){return row?.gcp?.[4]??null;}
  function growth(row){const a=row?.gcp?.[3],b=row?.gcp?.[4];return Number.isFinite(a)&&Number.isFinite(b)&&a!==0?((b/a)-1)*100:null;}
  function metricCard(label,value,context,source,badge='A'){
    return`<article class="ciq-metric"><span class="badge ${badge.toLowerCase()}">${badge}</span><span class="label">${esc(label)}</span><strong>${esc(value)}</strong><span class="context">${esc(context)}</span><small>${esc(source)}</small></article>`;
  }
  function trendSvg(row){
    const years=[2020,2021,2022,2023,2024],vals=row.gcp.map(Number),valid=vals.filter(Number.isFinite);if(valid.length<2)return'<div class="source-note">Trend unavailable.</div>';
    const min=Math.min(...valid),max=Math.max(...valid),span=Math.max(1,max-min),w=760,h=280,left=38,right=28,top=24,bottom=32;
    const pts=vals.map((v,i)=>({x:left+(i/(vals.length-1))*(w-left-right),y:top+((max-v)/span)*(h-top-bottom),v,year:years[i]}));
    const line=pts.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const area=`M${pts[0].x} ${h-bottom} ${pts.map(p=>`L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')} L${pts.at(-1).x} ${h-bottom} Z`;
    return`<div class="ciq-trend"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(row.name)} Gross County Product 2020 to 2024"><path class="ciq-gridline" d="M${left} ${top}H${w-right}M${left} ${(top+h-bottom)/2}H${w-right}M${left} ${h-bottom}H${w-right}"/><path class="ciq-area" d="${area}"/><path class="ciq-line" d="${line}"/>${pts.map(p=>`<circle class="ciq-dot" cx="${p.x}" cy="${p.y}" r="5"><title>${p.year}: KES ${formatInt(p.v)} million</title></circle>`).join('')}</svg><div class="ciq-years">${years.map(y=>`<span>${y}</span>`).join('')}</div></div>`;
  }
  function benchmark(label,value,values,formatter){
    const rank=rankOf(value,values),med=median(values),width=pctOf(value,values);
    return`<div class="ciq-benchmark"><div class="ciq-benchmark-top"><span>${esc(label)}</span><strong>${esc(formatter(value))}</strong></div><div class="ciq-track" aria-hidden="true"><i style="width:${width.toFixed(1)}%"></i></div><small>${rank?`#${rank} of ${values.filter(Number.isFinite).length} · `:''}county median ${esc(formatter(med))}</small></div>`;
  }

  function render(code=currentCode){
    if(!rows.length)return;let row=rows.find(r=>r.geo_code===code)||rows.find(r=>r.name==='Nakuru')||rows[0];currentCode=row.geo_code;
    const picker=$('#ciq-county-select');if(picker&&picker.value!==row.geo_code)picker.value=row.geo_code;
    const title=$('#ciq-county-title');if(title)title.textContent=row.name;
    const state=$('#ciq-mode');if(state){state.className=`ciq-mode ${mode==='sample'?'sample':''}`;state.innerHTML=`<i></i><span>${mode==='production'?'Live Atlas tables · 47-county coverage':'Bundled source-backed fallback · reduced coverage'}</span>`;}

    const allGcp=rows.map(latestGcp),allGrowth=rows.map(growth),allAbs=rows.map(r=>r.absorption),allDev=rows.map(r=>r.devAbsorption),allVoters=rows.map(r=>r.voters);
    const g=latestGcp(row),gr=growth(row),gRank=rankOf(g,allGcp),aRank=rankOf(row.absorption,allAbs),vRank=rankOf(row.voters,allVoters);
    const metrics=$('#ciq-metrics');if(metrics)metrics.innerHTML=[
      metricCard('Gross County Product',formatKesMn(g),gRank?`#${gRank} by 2024 economic size`:'2024 current prices','2024 preliminary · KNBS','A'),
      metricCard('GCP change',formatPct(gr),Number.isFinite(gr)?'2023 → 2024':'Insufficient history','Derived from published GCP observations','B'),
      metricCard('Budget absorption',formatPct(row.absorption),aRank?`#${aRank} among loaded counties`:'FY2024/25','FY2024/25 · Controller of Budget','A'),
      metricCard('Registered voters',formatInt(row.voters),vRank?`#${vRank} among loaded counties`:'2022 register','2022 county schedule · IEBC','A')
    ].join('');

    const chart=$('#ciq-trend');if(chart)chart.innerHTML=trendSvg(row)+`<p class="ciq-trend-note">Current-price GCP, 2020–2024. 2024 is preliminary. Economic size is context, not a performance score.</p>`;
    const bench=$('#ciq-benchmarks');if(bench)bench.innerHTML=[
      benchmark('Economic size',g,allGcp,formatKesMn),benchmark('Overall absorption',row.absorption,allAbs,formatPct),benchmark('Development absorption',row.devAbsorption,allDev,formatPct),benchmark('Registered voters',row.voters,allVoters,formatInt)
    ].join('');
    const fiscal=$('#ciq-fiscal');if(fiscal)fiscal.innerHTML=`<div><small>FY2024/25 budget</small><strong>${esc(formatKesMn(row.budget))}</strong></div><div><small>FY2024/25 expenditure</small><strong>${esc(formatKesMn(row.expenditure))}</strong></div><div><small>Overall absorption</small><strong>${esc(formatPct(row.absorption))}</strong></div><div><small>Development absorption</small><strong>${esc(formatPct(row.devAbsorption))}</strong></div>`;
  }

  function wirePicker(){const picker=$('#ciq-county-select');if(!picker)return;picker.innerHTML=rows.map(r=>`<option value="${esc(r.geo_code)}">${esc(r.name)}</option>`).join('');picker.onchange=()=>render(picker.value);}
  function renderFailure(message){
    const state=$('#ciq-mode');if(state){state.className='ciq-mode error';state.innerHTML='<i></i><span>CountyIQ data unavailable</span>';}
    const metrics=$('#ciq-metrics');if(metrics)metrics.innerHTML=`<div class="ciq-error" style="grid-column:1/-1"><strong>CountyIQ could not initialize.</strong><br>${esc(message)} The rest of Kenya Data Atlas remains available.</div>`;
  }

  async function boot(){
    if(bootPromise)return bootPromise;
    bootPromise=(async()=>{
      try{
        if(!KDA)throw new Error('Shared Atlas loader is unavailable.');
        const [gcp,budget,voters]=await Promise.all([
          KDA.csv('data/sprint1/gcp-2020-2024.csv'),
          KDA.csv('data/sprint1/county-budget-fy2024-25.csv'),
          KDA.csv('data/sprint1/voters-2022.csv')
        ]);
        const parsed=parseRows(gcp,budget,voters);
        if(parsed.length!==47)throw new Error(`Expected 47 county rows; received ${parsed.length}.`);
        rows=parsed;mode='production';
      }catch(error){
        console.warn('CountyIQ integrated view:',error?.message||error);
        rows=FALLBACK.map(r=>({...r,gcp:[...r.gcp]}));mode='sample';
      }
      if(!rows.length){renderFailure('No county rows are available.');return null;}
      wirePicker();render(currentCode);const root=$('#countyiq-view');if(root)root.dataset.countyiqState=mode;
      return window.KDACountyIQ;
    })().catch(error=>{renderFailure(error?.message||String(error));return null;});
    return bootPromise;
  }

  window.KDACountyIQ={boot,render,state:()=>({mode,count:rows.length,currentCode})};
})();
