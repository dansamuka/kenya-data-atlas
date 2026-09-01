/* Kenya Data Atlas — v2 canonical provenance doorway.
 * Progressive enhancement over every A–E badge. Registry data is loaded only
 * after explicit interaction, preserving the static shell and first paint.
 */
(function(){
  'use strict';
  const KDA=window.KDAData,R=window.KDARouter;
  if(!KDA)return;
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm=v=>String(v??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const gradeMeaning={A:'Official direct',B:'Official derived',C:'Spatially derived',D:'Modelled or approximate',E:'External or secondary'};
  let dataPromise=null,panel=null,lastTrigger=null;

  function ensurePanel(){
    if(panel)return panel;
    panel=document.createElement('aside');
    panel.id='kda-provenance-v2';
    panel.className='kda-provenance-v2';
    panel.hidden=true;
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','false');
    panel.setAttribute('aria-labelledby','kda-provenance-title');
    panel.innerHTML='<div class="kda-prov-handle" aria-hidden="true"></div><button type="button" class="kda-prov-close" aria-label="Close provenance">×</button><div class="kda-prov-body"><p class="eyebrow">Trace this figure</p><h3 id="kda-provenance-title">Loading provenance…</h3><p class="source-note">Reading the canonical Atlas registries.</p></div>';
    document.body.appendChild(panel);
    $('.kda-prov-close',panel).onclick=close;
    return panel;
  }
  function close(){
    if(!panel)return;
    panel.hidden=true;panel.classList.remove('open');
    if(lastTrigger){lastTrigger.setAttribute('aria-expanded','false');try{lastTrigger.focus({preventScroll:true});}catch(_){}}
    lastTrigger=null;
  }
  function route(){return R?.current?.()||R?.parse?.()||{view:'home',rest:'',params:new URLSearchParams()};}
  function cardFor(badge){return badge.closest('.metric-card,.pulse-card,.quick-facts article,.chart-card,.series-card,.ciq-stat,.ciq-card,.ri-card,.ri-recognition-card,.compare-matrix tr,article,section')||badge.parentElement;}
  function candidateLabel(card){
    if(!card)return '';
    const el=card.querySelector('.label,.metric-label,.compare-metric-name,h3,h4,[data-indicator-name]');
    return el?.textContent?.trim()||'';
  }
  function periodText(card){
    if(!card)return '';
    const candidates=[...card.querySelectorAll('small,.source-note,.compare-cell-meta,.delta')].map(x=>x.textContent.trim()).filter(Boolean);
    return candidates.find(t=>/\b(19|20)\d{2}\b|FY\s?\d{4}|Q[1-4]|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i.test(t))||'';
  }
  function sourceHint(card){
    if(!card)return '';
    const text=card.textContent||'';
    return text;
  }
  async function loadData(){
    if(dataPromise)return dataPromise;
    dataPromise=(async()=>{
      const [agencies,sources,datasets,releases,indicators,series,geographies]=await KDA.registries(['agencies','sources','datasets','releases','indicators','series','geographies'],{required:false});
      const safe=x=>Array.isArray(x)?x:[];
      const d={agencies:safe(agencies),sources:safe(sources),datasets:safe(datasets),releases:safe(releases),indicators:safe(indicators),series:safe(series),geographies:safe(geographies)};
      d.agencyById=new Map(d.agencies.map(x=>[x.agency_id,x]));
      d.sourceById=new Map(d.sources.map(x=>[x.source_id,x]));
      d.datasetById=new Map(d.datasets.map(x=>[x.dataset_id,x]));
      d.indicatorById=new Map(d.indicators.map(x=>[x.indicator_id,x]));
      d.geoById=new Map(d.geographies.map(x=>[x.geography_id,x]));
      d.releasesByDataset=new Map();
      d.releases.forEach(x=>{if(!d.releasesByDataset.has(x.dataset_id))d.releasesByDataset.set(x.dataset_id,[]);d.releasesByDataset.get(x.dataset_id).push(x);});
      d.releasesByDataset.forEach(rows=>rows.sort((a,b)=>String(a.published_at||a.reference_period_end||'').localeCompare(String(b.published_at||b.reference_period_end||''))));
      return d;
    })();
    return dataPromise;
  }
  function exactSeriesForRoute(d){
    const r=route();if(r.view!=='series'||!r.rest)return null;
    const key=decodeURIComponent(r.rest);return d.series.find(s=>s.series_code===key||s.series_id===key)||null;
  }
  function matchIndicator(d,label){
    const n=norm(label);if(!n)return null;
    const exact=d.indicators.filter(i=>[i.name,i.short_name,i.indicator_code].some(v=>norm(v)===n));
    if(exact.length===1)return exact[0];
    const contained=d.indicators.filter(i=>{const names=[i.name,i.short_name].map(norm).filter(Boolean);return names.some(v=>v.length>4&&(n.includes(v)||v.includes(n)));});
    return contained.length===1?contained[0]:null;
  }
  function chooseSeries(d,indicator,card){
    const routeSeries=exactSeriesForRoute(d);if(routeSeries)return routeSeries;
    if(!indicator)return null;
    let rows=d.series.filter(s=>s.indicator_id===indicator.indicator_id);
    const text=norm(card?.textContent||'');
    const geos=d.geographies.filter(g=>g.name&&text.includes(norm(g.name))).sort((a,b)=>norm(b.name).length-norm(a.name).length);
    if(geos.length){const atGeo=rows.filter(s=>s.geography_id===geos[0].geography_id);if(atGeo.length)rows=atGeo;}
    const country=rows.filter(s=>d.geoById.get(s.geography_id)?.level==='country');
    if(country.length===1)return country[0];
    return rows.length===1?rows[0]:null;
  }
  function chooseRelease(d,dataset,period){
    if(!dataset)return null;
    const rows=d.releasesByDataset.get(dataset.dataset_id)||[];if(!rows.length)return null;
    const p=norm(period);
    if(p){
      const match=[...rows].reverse().find(x=>[x.title,x.reference_period_start,x.reference_period_end,x.published_at,x.version_label].some(v=>v&&p.includes(norm(v))));
      if(match)return match;
    }
    return [...rows].reverse().find(x=>x.release_status==='published'||x.release_status==='approved')||rows.at(-1)||null;
  }
  function sourceFromHints(d,dataset,series,card){
    const direct=d.sourceById.get(series?.source_id)||d.sourceById.get(dataset?.source_id);if(direct)return direct;
    const hint=norm(sourceHint(card));
    const matches=d.sources.filter(s=>[s.name,s.source_code,d.agencyById.get(s.agency_id)?.name,d.agencyById.get(s.agency_id)?.abbreviation].some(v=>v&&hint.includes(norm(v))));
    return matches.length===1?matches[0]:null;
  }
  function lineageText(source,dataset,release){
    const parts=[];
    if(source)parts.push(source.name||source.source_code);
    if(dataset)parts.push(dataset.title||dataset.dataset_code);
    if(release)parts.push(release.title||release.release_code);
    return parts.length?parts.join(' → '):'Canonical lineage is not exposed by this card.';
  }
  function render(trigger,d){
    const p=ensurePanel(),card=cardFor(trigger),grade=String(trigger.textContent||trigger.dataset.grade||'').trim().charAt(0).toUpperCase();
    const label=candidateLabel(card),period=periodText(card),indicator=matchIndicator(d,label),series=chooseSeries(d,indicator,card),dataset=d.datasetById.get(series?.dataset_id)||null,release=chooseRelease(d,dataset,period),source=sourceFromHints(d,dataset,series,card),agency=d.agencyById.get(series?.agency_id||source?.agency_id)||null;
    const geo=d.geoById.get(series?.geography_id)||null;
    const sourceUrl=release?.release_url||source?.landing_page_url||null;
    const body=$('.kda-prov-body',p);
    body.innerHTML=`<p class="eyebrow">Trace this figure</p><div class="kda-prov-title-row"><span class="badge ${esc(grade.toLowerCase())}">${esc(grade||'?')}</span><h3 id="kda-provenance-title">${esc(label||'Published figure')}</h3></div><p class="kda-prov-grade"><strong>${esc(gradeMeaning[grade]||'Quality grade')}</strong></p><dl><div><dt>Publishing agency</dt><dd>${esc(agency?.name||agency?.abbreviation||'Not exposed by this card')}</dd></div><div><dt>Reference period</dt><dd>${esc(period||release?.reference_period_end||release?.reference_period_start||'Not exposed by this card')}</dd></div><div><dt>Geography</dt><dd>${esc(geo?`${geo.name} · ${geo.level}`:'Not deterministically resolved')}</dd></div><div><dt>Series</dt><dd>${esc(series?.series_code||'Not deterministically resolved')}</dd></div></dl><div class="kda-prov-lineage"><small>Lineage</small><p>${esc(lineageText(source,dataset,release))}</p></div>${release?.published_at?`<p class="kda-prov-date"><strong>Release date:</strong> ${esc(release.published_at)}</p>`:''}${sourceUrl?`<a class="kda-prov-source" href="${esc(sourceUrl)}" target="_blank" rel="noopener">Open source page ↗</a>`:'<p class="source-note">No source URL is exposed for this resolved lineage.</p>'}<p class="source-note">The Atlas does not infer a lineage when the canonical registries do not resolve one unambiguously.</p>`;
    p.hidden=false;requestAnimationFrame(()=>p.classList.add('open'));
  }
  async function open(trigger){
    lastTrigger=trigger;trigger.setAttribute('aria-expanded','true');
    const p=ensurePanel(),body=$('.kda-prov-body',p);p.hidden=false;requestAnimationFrame(()=>p.classList.add('open'));
    body.innerHTML='<p class="eyebrow">Trace this figure</p><h3 id="kda-provenance-title">Loading canonical lineage…</h3><div class="kda-prov-skeleton" aria-hidden="true"><i></i><i></i><i></i></div>';
    try{render(trigger,await loadData());}catch(error){body.innerHTML=`<p class="eyebrow">Trace this figure</p><h3 id="kda-provenance-title">Lineage unavailable</h3><p>${esc(error?.message||'The canonical provenance registries could not be loaded.')}</p>`;}
  }
  function prepareBadges(){
    $$('.badge').forEach(b=>{if(b.dataset.provenanceV2)return;b.dataset.provenanceV2='1';b.tabIndex=b.tabIndex>=0?b.tabIndex:0;b.setAttribute('role','button');b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-expanded','false');b.title='Open provenance';});
  }
  document.addEventListener('click',event=>{
    const badge=event.target.closest?.('.badge');
    if(badge&&!badge.classList.contains('missing')&&!badge.classList.contains('demo')){event.preventDefault();event.stopImmediatePropagation();open(badge);return;}
    if(panel&&!panel.hidden&&!event.target.closest('#kda-provenance-v2'))close();
  },true);
  document.addEventListener('keydown',event=>{
    const badge=event.target.closest?.('.badge');
    if(badge&&(event.key==='Enter'||event.key===' ')){event.preventDefault();event.stopImmediatePropagation();open(badge);return;}
    if(event.key==='Escape'&&panel&&!panel.hidden){event.preventDefault();close();}
  },true);
  new MutationObserver(prepareBadges).observe(document.body,{childList:true,subtree:true});
  prepareBadges();
  window.KDAProvenanceV2={open,close,loadData};
})();