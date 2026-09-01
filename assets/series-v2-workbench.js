/* Kenya Data Atlas — Series v2 workbench.
 * Uses canonical series/observation registries. Revision history is rendered
 * only where supersedes_observation_id proves an actual prior observation.
 */
(function(){
  'use strict';
  const KDA=window.KDAData,R=window.KDARouter;if(!KDA||!R)return;
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  let dataPromise=null,lastKey='',renderTimer=null;
  const state={range:'5Y',transform:'level',overlay:'',revisions:false,start:0,end:0};

  function route(){return R.current()||R.parse();}
  function seriesKey(){return decodeURIComponent(route().rest||'KDA-CPI-YOY-KEN');}
  function periodKey(o){return `${o.period_start||''}|${o.period_end||''}`;}
  function dateValue(o){const d=new Date(o.period_end||o.period_start||'');return Number.isNaN(d.valueOf())?null:d.valueOf();}
  function fmt(value,unit){
    if(value===null||value===undefined||!Number.isFinite(Number(value)))return'—';const n=Number(value),code=unit?.code||'',dp=unit?.decimal_places??2;
    if(code==='percent')return`${n.toLocaleString('en-KE',{maximumFractionDigits:Math.max(1,dp)})}%`;
    if(code==='persons'||code==='count')return n.toLocaleString('en-KE',{maximumFractionDigits:0});
    if(code==='kes_million')return`KES ${n.toLocaleString('en-KE',{maximumFractionDigits:1})} mn`;
    if(code==='usd')return`US$${n.toLocaleString('en-KE',{maximumFractionDigits:2})}`;
    if(code==='kes_per_usd')return n.toLocaleString('en-KE',{maximumFractionDigits:2});
    return`${n.toLocaleString('en-KE',{maximumFractionDigits:dp})}${unit?.symbol?` ${unit.symbol}`:''}`;
  }
  async function loadData(){
    if(dataPromise)return dataPromise;
    dataPromise=(async()=>{
      const [[series,obs,inds,units,geos,agencies,datasets,releases],sourceFiles,lineage]=await Promise.all([
        KDA.registries(['series','observations','indicators','units','geographies','agencies','datasets','releases'],{required:true}),
        KDA.fetchJson('data/catalogue/registry/source-files.json',{required:false}),
        KDA.fetchJson('data/catalogue/registry/lineage.json',{required:false})
      ]);
      const safe=x=>Array.isArray(x)?x:[];const d={series:safe(series),obs:safe(obs),inds:safe(inds),units:safe(units),geos:safe(geos),agencies:safe(agencies),datasets:safe(datasets),releases:safe(releases),sourceFiles:safe(sourceFiles),lineage:safe(lineage)};
      d.seriesByCode=new Map(d.series.map(x=>[x.series_code,x]));d.seriesById=new Map(d.series.map(x=>[x.series_id,x]));d.indById=new Map(d.inds.map(x=>[x.indicator_id,x]));d.unitById=new Map(d.units.map(x=>[x.unit_id,x]));d.geoById=new Map(d.geos.map(x=>[x.geography_id,x]));d.agencyById=new Map(d.agencies.map(x=>[x.agency_id,x]));d.datasetById=new Map(d.datasets.map(x=>[x.dataset_id,x]));d.releaseById=new Map(d.releases.map(x=>[x.release_id,x]));
      d.filesByRelease=new Map();for(const f of d.sourceFiles){if(!d.filesByRelease.has(f.release_id))d.filesByRelease.set(f.release_id,[]);d.filesByRelease.get(f.release_id).push(f);}
      d.obsById=new Map(d.obs.map(x=>[x.observation_id,x]));d.obsBySeries=new Map();for(const o of d.obs){if(!d.obsBySeries.has(o.series_id))d.obsBySeries.set(o.series_id,[]);d.obsBySeries.get(o.series_id).push(o);}
      for(const rows of d.obsBySeries.values())rows.sort((a,b)=>String(a.period_start||'').localeCompare(String(b.period_start||''))||String(a.period_end||'').localeCompare(String(b.period_end||''))||String(a.published_at||'').localeCompare(String(b.published_at||'')));
      return d;
    })();return dataPromise;
  }
  function currentSeries(d){const key=seriesKey();return d.seriesByCode.get(key)||d.seriesById.get(key)||null;}
  function canonicalObservations(rows){
    const superseded=new Set(rows.map(o=>o.supersedes_observation_id).filter(Boolean));
    const groups=new Map();for(const o of rows){const k=periodKey(o);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(o);}
    return [...groups.values()].map(group=>{
      const unsup=group.filter(o=>!superseded.has(o.observation_id));const pool=unsup.length?unsup:group;
      return [...pool].sort((a,b)=>String(a.published_at||a.ingested_at||'').localeCompare(String(b.published_at||b.ingested_at||''))).at(-1);
    }).filter(Boolean).sort((a,b)=>(dateValue(a)??0)-(dateValue(b)??0)||String(a.period_start||'').localeCompare(String(b.period_start||'')));
  }
  function revisionRows(rows){const supersededIds=new Set(rows.map(o=>o.supersedes_observation_id).filter(Boolean));return rows.filter(o=>supersededIds.has(o.observation_id));}
  function rangeIndexes(rows,range){if(!rows.length)return[0,0];if(range==='MAX'||range==='CUSTOM')return[0,rows.length-1];const years={ '1Y':1,'5Y':5,'12Y':12 }[range]||5,end=dateValue(rows.at(-1));if(end===null)return[Math.max(0,rows.length-years*12),rows.length-1];const d=new Date(end);d.setFullYear(d.getFullYear()-years);let i=rows.findIndex(o=>(dateValue(o)??Infinity)>=d.valueOf());if(i<0)i=0;return[i,rows.length-1];}
  function transformRows(rows,kind,unit){
    if(kind==='level')return rows.map(o=>({...o,displayValue:Number(o.value),displayUnit:unit}));
    if(kind==='index'){const base=rows.find(o=>Number.isFinite(Number(o.value))&&Number(o.value)!==0);if(!base)return[];return rows.map(o=>({...o,displayValue:Number(o.value)/Number(base.value)*100,displayUnit:{code:'index',name:`Index (${base.period_label}=100)`,symbol:''}}));}
    const out=[];for(let i=1;i<rows.length;i++){const prev=Number(rows[i-1].value),cur=Number(rows[i].value);if(!Number.isFinite(prev)||!Number.isFinite(cur))continue;if(kind==='pct'&&prev!==0)out.push({...rows[i],displayValue:(cur/prev-1)*100,displayUnit:{code:'percent',name:'Percent change',symbol:'%'}});if(kind==='pp'&&unit?.code==='percent')out.push({...rows[i],displayValue:cur-prev,displayUnit:{code:'pp',name:'Percentage-point change',symbol:'pp'}});}return out;
  }
  function transformLabel(kind){return{level:'Level','pct':'% change','pp':'pp change',index:'Index = 100'}[kind]||kind;}
  function valueLabel(v,unit){if(unit?.code==='pp')return`${Number(v).toLocaleString('en-KE',{maximumFractionDigits:2})} pp`;return fmt(v,unit);}
  function sourceForObservation(o,d){const rel=d.releaseById.get(o.source_release_id)||null,files=d.filesByRelease.get(o.source_release_id)||[],file=files[0]||null;return{release:rel,file,url:o.source_url||file?.original_url||rel?.release_url||null};}
  function citation(o,s,indicator,geo,d){const p=sourceForObservation(o,d),title=p.release?.title||p.file?.original_filename||'Published source',url=p.url?` ${p.url}`:'';return`Kenya Data Atlas — ${indicator?.name||s.series_code}, ${geo?.name||'Kenya'}, ${o.period_label||o.period_end}: ${o.value}. Source: ${title}.${url}`;}
  function chartSvg(primary,overlay,meta){
    const all=[...primary,...overlay].filter(x=>Number.isFinite(Number(x.displayValue)));if(!all.length)return'<div class="sv2-empty">No published observations in this view.</div>';
    const w=860,h=330,left=58,right=overlay.length?68:28,top=24,bottom=46;
    const times=all.map(x=>dateValue(x)).filter(x=>x!==null),xmin=Math.min(...times),xmax=Math.max(...times),xspan=Math.max(1,xmax-xmin);
    const domain=rows=>{const vals=rows.map(x=>Number(x.displayValue)).filter(Number.isFinite);let min=Math.min(...vals),max=Math.max(...vals);if(min===max){min-=Math.abs(min||1)*.05;max+=Math.abs(max||1)*.05;}return{min,max,span:Math.max(1e-12,max-min)};};
    const d1=domain(primary),d2=overlay.length?domain(overlay):d1,x=o=>left+(((dateValue(o)??xmin)-xmin)/xspan)*(w-left-right),y=(v,d)=>top+((d.max-v)/d.span)*(h-top-bottom);
    const path=(rows,d)=>rows.map((o,i)=>`${i?'L':'M'}${x(o).toFixed(1)} ${y(Number(o.displayValue),d).toFixed(1)}`).join(' ');
    const points=(rows,d,kind)=>rows.map((o,i)=>`<circle class="sv2-point ${kind}" tabindex="0" data-series-kind="${kind}" data-observation-id="${esc(o.observation_id)}" cx="${x(o).toFixed(1)}" cy="${y(Number(o.displayValue),d).toFixed(1)}" r="4.5"><title>${esc(o.period_label||o.period_end)}: ${esc(valueLabel(o.displayValue,o.displayUnit))}</title></circle>`).join('');
    const rev=meta.revisions.map(o=>{const current=primary.find(p=>periodKey(p)===periodKey(o));if(!current)return'';const v=meta.transformRevision(o,current,primary);if(v===null)return'';const yy=y(v,d1),xx=x(current);return`<line class="sv2-revision-link" x1="${xx.toFixed(1)}" y1="${yy.toFixed(1)}" x2="${xx.toFixed(1)}" y2="${y(Number(current.displayValue),d1).toFixed(1)}"></line><circle class="sv2-revision-point" data-observation-id="${esc(o.observation_id)}" cx="${xx.toFixed(1)}" cy="${yy.toFixed(1)}" r="5"><title>Prior published value: ${esc(o.value)}</title></circle>`;}).join('');
    return`<svg class="sv2-chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(meta.aria)}"><g class="sv2-grid"><line x1="${left}" y1="${top}" x2="${left}" y2="${h-bottom}"/><line x1="${left}" y1="${h-bottom}" x2="${w-right}" y2="${h-bottom}"/>${[0,.25,.5,.75,1].map(t=>`<line x1="${left}" y1="${(top+t*(h-top-bottom)).toFixed(1)}" x2="${w-right}" y2="${(top+t*(h-top-bottom)).toFixed(1)}"/>`).join('')}</g><path class="sv2-line primary" d="${path(primary,d1)}"/>${overlay.length?`<path class="sv2-line overlay" d="${path(overlay,d2)}"/>`:''}${rev}${points(primary,d1,'primary')}${points(overlay,d2,'overlay')}<text class="sv2-axis-label" x="${left}" y="${h-14}">${esc(primary[0]?.period_label||'')}</text><text class="sv2-axis-label end" x="${w-right}" y="${h-14}">${esc(primary.at(-1)?.period_label||'')}</text><text class="sv2-axis-title" x="${left}" y="14">${esc(meta.leftUnit)}</text>${overlay.length?`<text class="sv2-axis-title right" x="${w-right}" y="14">${esc(meta.rightUnit)}</text>`:''}</svg>`;
  }
  function transformRevision(old,current,displayRows){
    if(state.transform==='level')return Number(old.value);
    if(state.transform==='index'){const base=displayRows[0];const baseRaw=Number(base?.value);return baseRaw?Number(old.value)/baseRaw*100:null;}
    return null;
  }
  function syncHash(s){const r=route(),p=new URLSearchParams(r.params||'');p.set('srange',state.range);p.set('stransform',state.transform);if(state.overlay)p.set('overlay',state.overlay);else p.delete('overlay');if(state.revisions)p.set('revisions','1');else p.delete('revisions');p.set('sfrom',String(state.start));p.set('sto',String(state.end));history.replaceState(null,'',R.build('series',s.series_code,p));}
  function restore(s,rows){const p=route().params||new URLSearchParams();state.range=['1Y','5Y','12Y','MAX','CUSTOM'].includes(p.get('srange'))?p.get('srange'):'5Y';state.transform=['level','pct','pp','index'].includes(p.get('stransform'))?p.get('stransform'):'level';state.overlay=p.get('overlay')||'';state.revisions=p.get('revisions')==='1';const [a,b]=rangeIndexes(rows,state.range);state.start=Math.max(a,Math.min(Number(p.get('sfrom')),rows.length-1));if(!Number.isFinite(state.start))state.start=a;state.end=Math.max(state.start,Math.min(Number(p.get('sto')),rows.length-1));if(!Number.isFinite(state.end))state.end=b;if(!p.has('sfrom'))state.start=a;if(!p.has('sto'))state.end=b;}
  function overlayOptions(s,d){return d.series.filter(x=>x.series_id!==s.series_id&&x.geography_id===s.geography_id&&(d.obsBySeries.get(x.series_id)?.length||0)&&x.status==='active').sort((a,b)=>(d.indById.get(a.indicator_id)?.name||a.series_code).localeCompare(d.indById.get(b.indicator_id)?.name||b.series_code));}
  function buildShell(root){root.innerHTML=`<div class="sv2-header" data-sv2-header></div><div class="sv2-controls" data-sv2-controls></div><div class="sv2-chart-card"><div class="sv2-legend" data-sv2-legend></div><div class="sv2-readout" data-sv2-readout aria-live="polite">Hover, focus or tap a point to inspect its source.</div><div class="sv2-chart" data-sv2-chart></div><div class="sv2-brush" data-sv2-brush></div><div class="sv2-source" data-sv2-source></div></div>`;root.classList.add('sv2-workbench');}
  function updateBrushLabels(rows,host){const labels=$$('.sv2-brush-label',host);if(labels[0])labels[0].textContent=rows[state.start]?.period_label||'';if(labels[1])labels[1].textContent=rows[state.end]?.period_label||'';}
  function wirePoints(host,s,indicator,geo,d,displayById){
    const read=$('[data-sv2-readout]',host);$$('.sv2-point',host).forEach(pt=>{const show=()=>{const o=d.obsById.get(pt.dataset.observationId);if(!o)return;const p=sourceForObservation(o,d),file=p.file?.original_filename||'',rel=p.release?.title||'',display=displayById.get(o.observation_id);read.innerHTML=`<strong>${esc(o.period_label||o.period_end)} · ${esc(valueLabel(display?.displayValue??o.value,display?.displayUnit||d.unitById.get(s.unit_id)))}</strong><span>Released ${esc(o.published_at||p.release?.published_at||'date not recorded')}${rel?` · ${esc(rel)}`:''}${file?` · ${esc(file)}`:''}</span>${p.url?`<a href="${esc(p.url)}" target="_blank" rel="noopener">Open source ↗</a>`:''}`;};pt.addEventListener('pointerenter',show);pt.addEventListener('focus',show);pt.addEventListener('click',show);pt.addEventListener('contextmenu',async e=>{e.preventDefault();const o=d.obsById.get(pt.dataset.observationId);if(!o)return;const text=citation(o,s,indicator,geo,d);try{await navigator.clipboard.writeText(text);read.textContent='Citation copied to clipboard.';}catch(_){read.textContent=text;}});});
  }
  function renderWorkbench(s,d){
    const root=$('#series');if(!root)return;const card=$('.series-card',root);if(!card)return;
    const allRaw=d.obsBySeries.get(s.series_id)||[],canonical=canonicalObservations(allRaw);if(!canonical.length)return;restore(s,canonical);
    buildShell(card);const indicator=d.indById.get(s.indicator_id),unit=d.unitById.get(s.unit_id),geo=d.geoById.get(s.geography_id),agency=d.agencyById.get(s.agency_id),dataset=d.datasetById.get(s.dataset_id),revs=revisionRows(allRaw);
    const overlays=overlayOptions(s,d),overlayS=overlays.find(x=>x.series_code===state.overlay)||null;if(state.overlay&&!overlayS)state.overlay='';
    $('[data-sv2-header]',card).innerHTML=`<div><span class="badge ${String(canonical.at(-1)?.badge||'missing').toLowerCase()}">${esc(canonical.at(-1)?.badge||'N/A')}</span><p class="eyebrow">${esc(geo?.name||'Series')}</p><h3>${esc(indicator?.name||s.series_code)}</h3><p>${esc(s.series_code)} · ${canonical.length.toLocaleString('en-KE')} current published observations · ${esc(s.frequency||'')}</p></div><div class="sv2-latest"><small>Latest</small><strong>${esc(fmt(canonical.at(-1).value,unit))}</strong><span>${esc(canonical.at(-1).period_label||'')}</span></div>`;
    const pp=unit?.code==='percent';
    $('[data-sv2-controls]',card).innerHTML=`<div class="sv2-preset" role="group" aria-label="Range">${['1Y','5Y','12Y','MAX'].map(x=>`<button type="button" data-range="${x}" class="${state.range===x?'active':''}">${x}</button>`).join('')}</div><div class="sv2-transform" role="group" aria-label="Transform">${[['level','Level'],['pct','% change'],['pp','pp change'],['index','Index=100']].map(([k,l])=>`<button type="button" data-transform="${k}" ${k==='pp'&&!pp?'disabled':''} class="${state.transform===k?'active':''}">${l}</button>`).join('')}</div><label class="sv2-overlay">Overlay<select data-overlay><option value="">No second series</option>${overlays.slice(0,240).map(x=>`<option value="${esc(x.series_code)}"${state.overlay===x.series_code?' selected':''}>${esc(d.indById.get(x.indicator_id)?.name||x.series_code)} · ${esc(x.series_code)}</option>`).join('')}</select></label><button type="button" class="sv2-revisions ${state.revisions?'active':''}" data-revisions ${revs.length?'':'disabled'}>Revisions ${revs.length?`(${revs.length})`:'—'}</button><button type="button" data-csv>↓ CSV</button>`;
    const start=Math.min(state.start,state.end),end=Math.max(state.start,state.end),rawSlice=canonical.slice(start,end+1),primary=transformRows(rawSlice,state.transform,unit);const primaryIds=new Map(primary.map(x=>[x.observation_id,x]));
    let overlay=[];let overlayUnit=null;if(overlayS){overlayUnit=d.unitById.get(overlayS.unit_id);const overCanon=canonicalObservations(d.obsBySeries.get(overlayS.series_id)||[]);const minDate=dateValue(rawSlice[0]),maxDate=dateValue(rawSlice.at(-1));overlay=transformRows(overCanon.filter(o=>(dateValue(o)??-Infinity)>=(minDate??-Infinity)&&(dateValue(o)??Infinity)<=(maxDate??Infinity)),state.transform,overlayUnit);}
    const diffUnits=overlayS&&overlayUnit?.unit_id!==unit?.unit_id&&overlayUnit?.code!==unit?.code;
    $('[data-sv2-legend]',card).innerHTML=`<span><i class="primary"></i>${esc(indicator?.short_name||indicator?.name||s.series_code)} · ${esc(transformLabel(state.transform))}</span>${overlayS?`<span><i class="overlay"></i>${esc(d.indById.get(overlayS.indicator_id)?.short_name||d.indById.get(overlayS.indicator_id)?.name||overlayS.series_code)}</span>`:''}${diffUnits?'<b class="sv2-unit-warning">Different units · right axis</b>':''}${state.revisions&&revs.length?`<b class="sv2-revision-note">${['level','index'].includes(state.transform)?'Hollow marks are superseded observations; the registry does not imply full historical vintage curves.':'Revision values are preserved, but revision marks are shown only in Level or Index views.'}</b>`:''}`;
    const leftDisplayUnit=primary[0]?.displayUnit||unit,rightDisplayUnit=overlay[0]?.displayUnit||overlayUnit;
    $('[data-sv2-chart]',card).innerHTML=chartSvg(primary,overlay,{revisions:state.revisions?revs:[],transformRevision,aria:`${indicator?.name||s.series_code}, ${rawSlice[0]?.period_label||''} to ${rawSlice.at(-1)?.period_label||''}`,leftUnit:leftDisplayUnit?.name||leftDisplayUnit?.code||'',rightUnit:rightDisplayUnit?.name||rightDisplayUnit?.code||''});
    const brush=$('[data-sv2-brush]',card);brush.innerHTML=`<div class="sv2-brush-labels"><span class="sv2-brush-label"></span><span class="sv2-brush-label"></span></div><div class="sv2-range-pair"><input type="range" min="0" max="${canonical.length-1}" value="${state.start}" step="1" data-start aria-label="Range start"><input type="range" min="0" max="${canonical.length-1}" value="${state.end}" step="1" data-end aria-label="Range end"></div>`;updateBrushLabels(canonical,brush);
    const latest=canonical.at(-1),prov=sourceForObservation(latest,d);$('[data-sv2-source]',card).innerHTML=`<span>${esc(agency?.abbreviation||agency?.name||'Published source')} · ${esc(dataset?.title||'Dataset')} · ${esc(latest.period_label||'')}</span>${prov.url?`<a href="${esc(prov.url)}" target="_blank" rel="noopener">Latest source ↗</a>`:''}`;
    wirePoints(card,s,indicator,geo,d,primaryIds);
    $$('[data-range]',card).forEach(b=>b.onclick=()=>{state.range=b.dataset.range;const [a,z]=rangeIndexes(canonical,state.range);state.start=a;state.end=z;syncHash(s);renderWorkbench(s,d);});
    $$('[data-transform]',card).forEach(b=>b.onclick=()=>{if(b.disabled)return;state.transform=b.dataset.transform;syncHash(s);renderWorkbench(s,d);});
    $('[data-overlay]',card).onchange=e=>{state.overlay=e.target.value;syncHash(s);renderWorkbench(s,d);};
    $('[data-revisions]',card).onclick=()=>{if(!revs.length)return;state.revisions=!state.revisions;syncHash(s);renderWorkbench(s,d);};
    const rerange=()=>{const a=Number($('[data-start]',brush).value),b=Number($('[data-end]',brush).value);state.start=Math.min(a,b);state.end=Math.max(a,b);state.range='CUSTOM';syncHash(s);renderWorkbench(s,d);};$('[data-start]',brush).onchange=rerange;$('[data-end]',brush).onchange=rerange;$('[data-start]',brush).oninput=()=>{state.start=Math.min(Number($('[data-start]',brush).value),state.end);updateBrushLabels(canonical,brush);};$('[data-end]',brush).oninput=()=>{state.end=Math.max(Number($('[data-end]',brush).value),state.start);updateBrushLabels(canonical,brush);};
    $('[data-csv]',card).onclick=()=>{const rows=['period_start,period_end,period_label,value,display_value,badge,release_id,source_url',...primary.map(o=>[o.period_start,o.period_end,o.period_label,o.value,o.displayValue,o.badge,o.source_release_id,o.source_url].map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(','))],blob=new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${s.series_code}-${String(state.transform).replace(/[^a-z]/gi,'')}.csv`;a.click();URL.revokeObjectURL(a.href);};
    root.dataset.sv2Ready='true';lastKey=`${s.series_code}|${route().params?.toString?.()||''}`;
  }
  async function render(){if(route().view!=='series')return;const d=await loadData(),s=currentSeries(d);if(!s)return;const key=`${s.series_code}|${route().params.toString()}`;if(key===lastKey&&$('#series')?.dataset.sv2Ready==='true')return;clearTimeout(renderTimer);renderTimer=setTimeout(()=>renderWorkbench(s,d),0);}
  window.addEventListener('kda:route',()=>render().catch(error=>console.warn('Series v2:',error?.message||error)));window.addEventListener('hashchange',()=>render().catch(()=>{}));
  window.KDASeriesV2={render,loadData};render().catch(error=>console.warn('Series v2:',error?.message||error));
})();
