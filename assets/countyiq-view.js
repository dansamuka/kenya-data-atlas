/* Kenya Data Atlas — integrated CountyIQ route.
 *
 * P04: production CountyIQ is backed by one generated canonical analytical
 * mart. The mart itself is derived from Atlas registries; this browser module
 * does not join Sprint CSVs or maintain a parallel production data store.
 * A small source-backed fallback remains available only for static resilience.
 */
(function(){
  'use strict';
  const KDA=window.KDAData;
  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const MART='data/countyiq/county-summary.json';
  const CODES={gcp:'IND-GCP-CURRENT',budget:'IND-COUNTY-BUDGET-TOTAL',expenditure:'IND-COUNTY-EXPENDITURE-TOTAL',absorption:'IND-COUNTY-BUDGET-ABSORPTION',development:'IND-COUNTY-DEVELOPMENT-ABSORPTION',voters:'IND-REGISTERED-VOTERS',poverty:'IND-POVERTY-RATE',stunting:'IND-STUNTING-RATE',immunisation:'IND-IMMUNIZATION-RATE',maternal:'IND-MATERNAL-HEALTH',facilities:'IND-HEALTH-FACILITY-COUNT'};
  const FALLBACK=[
    {geo_code:'KEN-C001',name:'Mombasa',gcp:[469299,528840,605258,670023,711088],budget:17360,expenditure:13316.23,devAbsorption:62,absorption:77,voters:641913},
    {geo_code:'KEN-C004',name:'Tana River',gcp:[29469,35516,37693,43484,51145],budget:9177.72,expenditure:6705.90,devAbsorption:56,absorption:73,voters:141096},
    {geo_code:'KEN-C022',name:'Kiambu',gcp:[555593,618360,695551,760998,819834],budget:23480.38,expenditure:16495.58,devAbsorption:37,absorption:70,voters:1275008},
    {geo_code:'KEN-C023',name:'Turkana',gcp:[107455,111946,133309,155744,178441],budget:17213.59,expenditure:13548.66,devAbsorption:65,absorption:79,voters:238528},
    {geo_code:'KEN-C032',name:'Nakuru',gcp:[479851,565879,633411,755946,771775],budget:23980.40,expenditure:15965.37,devAbsorption:42,absorption:67,voters:1054856},
    {geo_code:'KEN-C047',name:'Nairobi City',gcp:[2685707,3001449,3453792,3834171,4105576],budget:43564.27,expenditure:33523.47,devAbsorption:29,absorption:77,voters:2415310}
  ];
  let bootPromise=null,rows=[],mode='loading',currentCode='KEN-C032',martMeta=null;

  const n=value=>{const x=Number(value);return Number.isFinite(x)?x:null;};
  const formatInt=value=>Number.isFinite(Number(value))?Number(value).toLocaleString('en-KE',{maximumFractionDigits:0}):'—';
  const formatPct=value=>Number.isFinite(Number(value))?`${Number(value).toLocaleString('en-KE',{maximumFractionDigits:1})}%`:'—';
  const formatKesMn=value=>{const x=Number(value);if(!Number.isFinite(x))return'—';return x>=1000?`KES ${(x/1000).toLocaleString('en-KE',{maximumFractionDigits:1})}bn`:`KES ${x.toLocaleString('en-KE',{maximumFractionDigits:1})}mn`;};
  const median=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
  function rankOf(value,values){if(!Number.isFinite(value))return null;return values.filter(Number.isFinite).sort((a,b)=>b-a).findIndex(x=>x===value)+1;}
  function pctOf(value,values){const a=values.filter(Number.isFinite);if(!Number.isFinite(value)||!a.length)return 0;const min=Math.min(...a),max=Math.max(...a);return max===min?50:Math.max(5,Math.min(100,((value-min)/(max-min))*100));}
  function metric(county,code){return county?.metrics?.[code]||null;}
  function latestValue(county,code){return n(metric(county,code)?.latest?.value);}
  function sourceText(m){const o=m?.latest,p=o?.provenance||{};return [o?.period_label,p.agency_name,p.badge?`${p.badge} provenance`:null].filter(Boolean).join(' · ')||'Canonical Atlas observation';}
  function badgeOf(m,fallback='A'){return m?.latest?.provenance?.badge||fallback;}
  function rankingAllowed(m){return m?.eligibility?.ranking_allowed!==false;}

  function martRows(mart){
    if(mart?.meta?.county_count!==47||!Array.isArray(mart.counties)||mart.counties.length!==47)throw new Error('Canonical CountyIQ mart does not contain exactly 47 counties.');
    martMeta=mart.meta;
    return mart.counties.map(c=>{
      const gcp=metric(c,CODES.gcp),history=(gcp?.history||[]).filter(o=>Number.isFinite(Number(o.value))).sort((a,b)=>String(a.period_start||a.period_label).localeCompare(String(b.period_start||b.period_label)));
      return {county:c,fiscal:c.fiscal,geo_code:c.geography?.geo_code,name:c.geography?.name,
        gcpHistory:history.map(o=>({year:String(o.period_label||o.period_start).match(/\d{4}/)?.[0]||String(o.period_label||''),value:n(o.value),observation:o})),
        budget:latestValue(c,CODES.budget),expenditure:latestValue(c,CODES.expenditure),devAbsorption:latestValue(c,CODES.development),absorption:latestValue(c,CODES.absorption),voters:latestValue(c,CODES.voters)};
    }).filter(r=>r.geo_code&&r.name).sort((a,b)=>a.name.localeCompare(b.name));
  }
  function fallbackRows(){return FALLBACK.map(r=>({...r,gcpHistory:r.gcp.map((value,i)=>({year:String(2020+i),value,observation:null}))}));}
  function latestGcp(row){return row?.gcpHistory?.at(-1)?.value??null;}
  function metricCard(label,value,context,m,badgeFallback='A'){
    const badge=badgeOf(m,badgeFallback);
    return`<article class="ciq-metric"><span class="badge ${esc(badge.toLowerCase())}">${esc(badge)}</span><span class="label">${esc(label)}</span><strong>${esc(value)}</strong><span class="context">${esc(context)}</span><small>${esc(sourceText(m))}</small></article>`;
  }
  function fallbackMetricCard(label,value,context,source,badge='A'){
    return`<article class="ciq-metric"><span class="badge ${badge.toLowerCase()}">${badge}</span><span class="label">${esc(label)}</span><strong>${esc(value)}</strong><span class="context">${esc(context)}</span><small>${esc(source)}</small></article>`;
  }
  function trendSvg(row){
    const points=(row.gcpHistory||[]).filter(p=>Number.isFinite(p.value));if(points.length<2)return'<div class="source-note">Trend unavailable.</div>';
    const vals=points.map(p=>p.value),min=Math.min(...vals),max=Math.max(...vals),span=Math.max(1,max-min),w=760,h=280,left=38,right=28,top=24,bottom=32;
    const pts=points.map((p,i)=>({x:left+(i/(points.length-1))*(w-left-right),y:top+((max-p.value)/span)*(h-top-bottom),...p}));
    const line=pts.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const area=`M${pts[0].x} ${h-bottom} ${pts.map(p=>`L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')} L${pts.at(-1).x} ${h-bottom} Z`;
    return`<div class="ciq-trend"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(row.name)} Gross County Product history"><path class="ciq-gridline" d="M${left} ${top}H${w-right}M${left} ${(top+h-bottom)/2}H${w-right}M${left} ${h-bottom}H${w-right}"/><path class="ciq-area" d="${area}"/><path class="ciq-line" d="${line}"/>${pts.map(p=>`<circle class="ciq-dot" cx="${p.x}" cy="${p.y}" r="5"><title>${esc(p.year)}: KES ${formatInt(p.value)} million</title></circle>`).join('')}</svg><div class="ciq-years">${pts.map(p=>`<span>${esc(p.year)}</span>`).join('')}</div></div>`;
  }
  function benchmark(label,value,values,formatter,allowed=true){
    const med=median(values),width=pctOf(value,values),rank=allowed?rankOf(value,values):null;
    return`<div class="ciq-benchmark"><div class="ciq-benchmark-top"><span>${esc(label)}</span><strong>${esc(formatter(value))}</strong></div><div class="ciq-track" aria-hidden="true"><i style="width:${width.toFixed(1)}%"></i></div><small>${rank?`#${rank} of ${values.filter(Number.isFinite).length} · `:''}county median ${esc(formatter(med))}${allowed?'':' · ranking withheld'}</small></div>`;
  }

  function signed(value,suffix){const x=Number(value);if(!Number.isFinite(x))return '—';return `${x>0?'+':''}${x.toLocaleString('en-KE',{maximumFractionDigits:1})}${suffix}`;}
  function fiscalTrendSvg(f){const h=f?.history||[];if(h.length<2)return'<div class="source-note">Fiscal trend unavailable.</div>';const w=760,ht=210,left=34,right=18,top=18,bottom=34;const point=(r,i,key)=>({x:left+(i/(h.length-1))*(w-left-right),y:top+((100-Number(r[key]?.value))/100)*(ht-top-bottom),v:Number(r[key]?.value),fy:r.fiscal_year});const overall=h.map((r,i)=>point(r,i,'overall_absorption')),dev=h.map((r,i)=>point(r,i,'development_absorption'));const path=a=>a.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');return `<div class="ciq-fiscal-chart"><div class="ciq-fiscal-legend"><span><i class="overall"></i>Overall absorption</span><span><i class="development"></i>Development absorption</span></div><svg viewBox="0 0 ${w} ${ht}" role="img" aria-label="Twelve-year budget absorption trend"><path class="ciq-gridline" d="M${left} ${top}H${w-right}M${left} ${(top+ht-bottom)/2}H${w-right}M${left} ${ht-bottom}H${w-right}"/><path class="ciq-fiscal-overall" d="${path(overall)}"/><path class="ciq-fiscal-dev" d="${path(dev)}"/>${overall.map(p=>`<circle class="ciq-fiscal-dot overall" cx="${p.x}" cy="${p.y}" r="3"><title>${esc(p.fy)} overall: ${formatPct(p.v)}</title></circle>`).join('')}${dev.map(p=>`<circle class="ciq-fiscal-dot development" cx="${p.x}" cy="${p.y}" r="3"><title>${esc(p.fy)} development: ${formatPct(p.v)}</title></circle>`).join('')}</svg><div class="ciq-fiscal-years"><span>${esc(h[0].fiscal_year)}</span><span>${esc(h[Math.floor(h.length/2)].fiscal_year)}</span><span>${esc(h.at(-1).fiscal_year)}</span></div></div>`;}
  function renderFiscalHistory(row){const f=row.fiscal;if(!f?.history?.length)return'<div class="source-note">Twelve-year history unavailable.</div>';const rowsHtml=f.history.slice().reverse().map(r=>{const source=r.budget?.provenance?.source_url||'';const ranks=`#${r.rankings?.overall_absorption?.rank||'—'} overall · #${r.rankings?.development_absorption?.rank||'—'} dev`;return `<tr><td data-label="Fiscal year"><strong>${esc(r.fiscal_year)}</strong></td><td data-label="Budget">${esc(formatKesMn(r.budget?.value))}</td><td data-label="Expenditure">${esc(formatKesMn(r.expenditure?.value))}</td><td data-label="Overall absorption">${esc(formatPct(r.overall_absorption?.value))}</td><td data-label="Development absorption">${esc(formatPct(r.development_absorption?.value))}</td><td data-label="Same-year ranks">${esc(ranks)}</td><td data-label="Source">${source?`<a href="${esc(source)}" target="_blank" rel="noopener">CoB ↗</a>`:'—'}</td></tr>`;}).join('');return fiscalTrendSvg(f)+`<div class="ciq-fiscal-table-wrap"><table class="ciq-fiscal-table"><thead><tr><th>FY</th><th>Budget</th><th>Expenditure</th><th>Overall</th><th>Development</th><th>Same-year ranks</th><th>Source</th></tr></thead><tbody>${rowsHtml}</tbody></table></div><p class="ciq-trend-note">Budget and expenditure ranks describe fiscal scale only. Absorption ranks compare execution rates within the same fiscal year; they are not a county performance score.</p>`;}
  function insight(label,item,unit){return `<div><small>${esc(label)}</small><strong>${esc(item?signed(item.value,unit):'—')}</strong><span>${item?`${esc(item.from_period)} → ${esc(item.to_period)}`:'Not comparable'}</span></div>`;}
  function renderFiscalInsights(f){const e=f?.changes?.expenditure||{},a=f?.changes?.overall_absorption||{},v=f?.volatility||{};return [insight('Expenditure · 1Y',e.one_year,'%'),insight('Expenditure · 3Y',e.three_year,'%'),insight('Expenditure · 5Y',e.five_year,'%'),insight('Absorption · 1Y',a.one_year,' pp'),insight('Absorption · 3Y',a.three_year,' pp'),insight('Absorption · 5Y',a.five_year,' pp'),`<div><small>Overall absorption volatility</small><strong>${esc(Number.isFinite(v.overall_absorption_sd_pp)?v.overall_absorption_sd_pp.toFixed(1)+' pp':'—')}</strong><span>12-year standard deviation</span></div>`,`<div><small>Development absorption volatility</small><strong>${esc(Number.isFinite(v.development_absorption_sd_pp)?v.development_absorption_sd_pp.toFixed(1)+' pp':'—')}</strong><span>12-year standard deviation</span></div>`].join('');}
  function renderDenominator(f){const d=f?.denominators?.population,pc=f?.denominators?.per_capita;if(!d)return'';const periods=(d.available_periods||[]).join(', ')||'none aligned to the fiscal panel';return `<strong>Per-capita measures withheld.</strong><p>${esc(pc?.reason||d.reason||'No compatible denominator is active.')}</p><small>Population denominator policy: exact or explicitly compatible period only · interpolation: prohibited · Kenya-level inheritance: prohibited · currently available county population periods: ${esc(periods)}.</small>`;}
  function precisionText(m){const u=m?.latest?.uncertainty||{};if(Number.isFinite(Number(u.standard_error)))return 'Source SE '+Number(u.standard_error).toLocaleString('en-KE',{maximumFractionDigits:2})+' pp';if(Number.isFinite(Number(u.sample_size)))return 'Reported table denominator n='+formatInt(u.sample_size);return 'Census inventory snapshot';}\n  function socialMetric(label,m,formatter){const o=m?.latest;if(!o)return '<article class="ciq-social-metric missing"><small>'+esc(label)+'</small><strong>—</strong><span>Not published for this county</span></article>';const url=o.provenance?.source_url||'';return '<article class="ciq-social-metric"><small>'+esc(label)+'</small><strong>'+esc(formatter(o.value))+'</strong><span>'+esc(o.period_label)+' · '+esc(precisionText(m))+'</span><em>'+(m?.ranking?.eligible?'Comparable rank available':'Ranking withheld')+'</em>'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener">Source ↗</a>':'')+'</article>';}\n  function renderSocial(row){const c=row.county;return [socialMetric('Overall poverty',metric(c,CODES.poverty),formatPct),socialMetric('Children under 5 stunted',metric(c,CODES.stunting),formatPct),socialMetric('Basic immunisation',metric(c,CODES.immunisation),formatPct),socialMetric('Skilled birth attendance',metric(c,CODES.maternal),formatPct),socialMetric('Facilities assessed',metric(c,CODES.facilities),formatInt)].join('');}\n\n  function render(code=currentCode){
    if(!rows.length)return;let row=rows.find(r=>r.geo_code===code)||rows.find(r=>r.name==='Nakuru')||rows[0];currentCode=row.geo_code;
    const picker=$('#ciq-county-select');if(picker&&picker.value!==row.geo_code)picker.value=row.geo_code;
    const title=$('#ciq-county-title');if(title)title.textContent=row.name;
    const state=$('#ciq-mode');if(state){state.className=`ciq-mode ${mode==='sample'?'sample':''}`;state.innerHTML=`<i></i><span>${mode==='production'?`Canonical CountyIQ mart · ${rows.length}-county coverage`:'Bundled source-backed fallback · reduced coverage'}</span>`;}

    const allGcp=rows.map(latestGcp),allExp=rows.map(r=>r.expenditure),allAbs=rows.map(r=>r.absorption),allDev=rows.map(r=>r.devAbsorption),allVoters=rows.map(r=>r.voters);
    const g=latestGcp(row);
    const metrics=$('#ciq-metrics');
    if(metrics){
      if(mode==='production'){
        const c=row.county,gcp=metric(c,CODES.gcp),exp=metric(c,CODES.expenditure),abs=metric(c,CODES.absorption),voters=metric(c,CODES.voters);
        metrics.innerHTML=[
          metricCard('Gross County Product',formatKesMn(g),gcp?.latest?.period_label||'Latest published period',gcp),
          metricCard('County expenditure',formatKesMn(row.expenditure),exp?.latest?.period_label||'Latest published period',exp),
          metricCard('Budget absorption',formatPct(row.absorption),abs?.latest?.period_label||'Latest published period',abs),
          metricCard('Registered voters',formatInt(row.voters),voters?.latest?.period_label||'Latest published period',voters)
        ].join('');
      }else metrics.innerHTML=[
        fallbackMetricCard('Gross County Product',formatKesMn(g),'2024 current prices','2024 preliminary · KNBS','A'),
        fallbackMetricCard('County expenditure',formatKesMn(row.expenditure),'FY2024/25','FY2024/25 · Controller of Budget','A'),
        fallbackMetricCard('Budget absorption',formatPct(row.absorption),'FY2024/25','FY2024/25 · Controller of Budget','A'),
        fallbackMetricCard('Registered voters',formatInt(row.voters),'2022 register','2022 county schedule · IEBC','A')
      ].join('');
    }

    const chart=$('#ciq-trend');if(chart)chart.innerHTML=trendSvg(row)+`<p class="ciq-trend-note">Current-price GCP history from the canonical Atlas series. Economic size is context, not a performance score.</p>`;
    const c=row.county||null;
    const bench=$('#ciq-benchmarks');if(bench)bench.innerHTML=[
      benchmark('Economic size',g,allGcp,formatKesMn,mode!=='production'||rankingAllowed(metric(c,CODES.gcp))),
      benchmark('County expenditure',row.expenditure,allExp,formatKesMn,mode!=='production'||rankingAllowed(metric(c,CODES.expenditure))),
      benchmark('Overall absorption',row.absorption,allAbs,formatPct,mode!=='production'||rankingAllowed(metric(c,CODES.absorption))),
      benchmark('Development absorption',row.devAbsorption,allDev,formatPct,mode!=='production'||rankingAllowed(metric(c,CODES.development))),
      benchmark('Registered voters',row.voters,allVoters,formatInt,mode!=='production'||rankingAllowed(metric(c,CODES.voters)))
    ].join('');
    const fiscal=$('#ciq-fiscal'),fiscalInsights=$('#ciq-fiscal-insights'),fiscalHistory=$('#ciq-fiscal-history'),denominator=$('#ciq-denominator');if(mode==='production'&&row.fiscal){const latest=row.fiscal.history?.at(-1);if(fiscal)fiscal.innerHTML=`<div><small>${esc(latest?.fiscal_year||'Latest')} budget</small><strong>${esc(formatKesMn(latest?.budget?.value))}</strong></div><div><small>${esc(latest?.fiscal_year||'Latest')} expenditure</small><strong>${esc(formatKesMn(latest?.expenditure?.value))}</strong></div><div><small>Overall absorption</small><strong>${esc(formatPct(latest?.overall_absorption?.value))}</strong></div><div><small>Development absorption</small><strong>${esc(formatPct(latest?.development_absorption?.value))}</strong></div>`;if(fiscalInsights)fiscalInsights.innerHTML=renderFiscalInsights(row.fiscal);if(fiscalHistory)fiscalHistory.innerHTML=renderFiscalHistory(row);if(denominator)denominator.innerHTML=renderDenominator(row.fiscal);}else{if(fiscal)fiscal.innerHTML=`<div><small>FY2024/25 budget</small><strong>${esc(formatKesMn(row.budget))}</strong></div><div><small>FY2024/25 expenditure</small><strong>${esc(formatKesMn(row.expenditure))}</strong></div><div><small>Overall absorption</small><strong>${esc(formatPct(row.absorption))}</strong></div><div><small>Development absorption</small><strong>${esc(formatPct(row.devAbsorption))}</strong></div>`;if(fiscalInsights)fiscalInsights.innerHTML='';if(fiscalHistory)fiscalHistory.innerHTML='<div class="source-note">Twelve-year fiscal history requires the canonical CountyIQ mart.</div>';if(denominator)denominator.innerHTML='<strong>Per-capita measures unavailable in fallback mode.</strong>'; }
    const socialRoot=$('#ciq-social');if(socialRoot) socialRoot.innerHTML=mode==='production'?renderSocial(row):'<div class="source-note">Health and living-standards outcomes require the canonical CountyIQ mart.</div>';
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
        const mart=await KDA.fetchJson(MART,{required:true});
        rows=martRows(mart);
        if(rows.length!==47)throw new Error(`Expected 47 county rows; received ${rows.length}.`);
        mode='production';
      }catch(error){
        console.warn('CountyIQ integrated view:',error?.message||error);
        rows=fallbackRows();mode='sample';martMeta=null;
      }
      if(!rows.length){renderFailure('No county rows are available.');return null;}
      wirePicker();render(currentCode);const root=$('#countyiq-view');if(root)root.dataset.countyiqState=mode;
      return window.KDACountyIQ;
    })().catch(error=>{renderFailure(error?.message||String(error));return null;});
    return bootPromise;
  }

  window.KDACountyIQ={boot,render,state:()=>({mode,count:rows.length,currentCode,martMeta})};
})();
