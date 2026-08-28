/* Kenya Data Atlas — lazy Geo Explorer (P01).
 *
 * The map is intentionally outside the first-paint path. D3, the master
 * registry tables and each geometry level load only when the explorer is near
 * the viewport, explicitly selected or opened through a map route. The public
 * KDAGeo facade exists immediately so search can safely target the map before
 * it has booted.
 */
(function(){
  'use strict';
  const KDA=window.KDAData;
  const root=document.querySelector('#geo-explorer');
  const $=(sel,r=document)=>r.querySelector(sel);
  const $$=(sel,r=document)=>[...r.querySelectorAll(sel)];
  const VIEW_W=800,VIEW_H=780,PAD=18;
  const CHOROPLETH_RANGE=['#eaf2ec','#c3ddce','#8fc0a7','#4f9575','#123c32'];

  let d3=null,svg=null,bootPromise=null,booted=false,bootError=null,voterSupplementPromise=null;
  let geographies=[],indicators=[],series=[],observations=[],units=[],agencies=[],sources=[],datasets=[];
  let geoById=new Map(),indicatorById=new Map(),indicatorByCode=new Map(),unitById=new Map(),observationById=new Map();
  const childrenOf=new Map(),seriesByGeoIndicator=new Map(),geometryCache={country:null,county:null,constituency:null,ward:null};
  let currentGeographyId=null,currentIndicatorId=null,renderGeneration=0;

  function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));}
  function childLevelOf(level){return{country:'county',county:'constituency',constituency:'ward'}[level]||null;}
  function badgeLabel(letter){return{A:'Official direct',B:'Official derived',C:'Spatially derived',D:'Modelled',E:'External'}[letter]||'Not available';}

  function setLoading(message='Loading map data on demand…'){
    const heading=$('#geo-heading'),eyebrow=$('#geo-eyebrow'),ranking=$('#geo-ranking-list'),source=$('#geo-source-note'),select=$('#geo-indicator');
    if(heading&&!booted)heading.textContent=message;
    if(eyebrow&&!booted)eyebrow.textContent='Geo Explorer · lazy data loading';
    if(select&&!select.options.length)select.innerHTML='<option>Loading map data…</option>';
    if(ranking&&!ranking.children.length)ranking.innerHTML='<li class="geo-rank-nodata" style="padding:1rem">Map rankings load with the explorer.</li>';
    if(source&&!source.textContent)source.textContent='The rest of Kenya Data Atlas remains usable while map data loads.';
  }

  function renderUnavailable(error){
    bootError=error instanceof Error?error:new Error(String(error||'Map unavailable'));
    const heading=$('#geo-heading'),eyebrow=$('#geo-eyebrow'),wrap=$('.geo-map-wrap'),ranking=$('#geo-ranking-list'),legend=$('#geo-legend'),source=$('#geo-source-note'),select=$('#geo-indicator');
    if(eyebrow)eyebrow.textContent='Geo Explorer temporarily unavailable';
    if(heading)heading.textContent='The map could not be initialized.';
    if(wrap)wrap.innerHTML='<div class="geo-map-unavailable" role="status" style="min-height:360px;display:grid;place-items:center;padding:2rem;text-align:center;border:1px solid var(--line);background:var(--paper)"><div><strong style="display:block;font-family:var(--serif);font-size:1.5rem;margin-bottom:.5rem">Map unavailable</strong><span style="color:var(--muted)">Search, county profiles, Compare, Series and Data remain available.</span></div></div>';
    if(ranking)ranking.innerHTML='<li class="geo-rank-nodata" style="padding:1rem">Ranking unavailable because the map data did not initialize.</li>';
    if(legend)legend.innerHTML='';
    if(source)source.textContent=bootError.message;
    if(select){select.disabled=true;select.innerHTML='<option>Map unavailable</option>';}
    if(root)root.dataset.geoState='error';
  }

  function parseHash(){
    const match=location.hash.match(/^#map\/([^?]+)(?:\?indicator=(.+))?$/);if(!match)return{};
    const geoCode=decodeURIComponent(match[1]),indicatorCode=match[2]?decodeURIComponent(match[2]):null;
    const geo=geographies.find(g=>g.geo_code===geoCode),indicator=indicatorCode?indicatorByCode.get(indicatorCode):null;
    return{geoId:geo?.geography_id||null,indicatorId:indicator?.indicator_id||null};
  }
  function hashFor(geographyId,indicatorId){
    const geo=geoById.get(geographyId),indicator=indicatorById.get(indicatorId);if(!geo)return null;
    return`#map/${geo.geo_code}${indicator?`?indicator=${indicator.indicator_code}`:''}`;
  }
  function updateHashInPlace(){const hash=hashFor(currentGeographyId,currentIndicatorId);if(hash)history.replaceState(null,'',hash);}
  function pushHash(){const hash=hashFor(currentGeographyId,currentIndicatorId);if(hash)history.pushState(null,'',hash);}

  async function ensureGeometry(level){
    if(geometryCache[level])return geometryCache[level];
    const data=await KDA.geometry(level,{required:true});geometryCache[level]=data;return data;
  }
  function filterFeatures(collection,idSet){const ids=new Set(idSet);return{type:'FeatureCollection',features:(collection?.features||[]).filter(f=>ids.has(f.properties.geography_id))};}
  function findFeature(collection,id){return(collection?.features||[]).find(f=>f.properties.geography_id===id)||null;}

  function signedRingArea(ring){let area=0;for(let i=0;i<(ring?.length||0)-1;i+=1){const a=ring[i],b=ring[i+1];area+=(a[0]*b[1])-(b[0]*a[1]);}return area/2;}
  function normalizeRingForD3(ring,isExterior){
    const copy=(ring||[]).map(position=>Array.isArray(position)?position.slice():position);if(copy.length<4)return copy;
    const area=signedRingArea(copy);if(area===0)return copy;const clockwise=area<0;if(clockwise!==isExterior)copy.reverse();return copy;
  }
  function normalizeGeometryForD3(geometry){
    if(!geometry)return geometry;
    if(geometry.type==='Polygon')return{...geometry,coordinates:geometry.coordinates.map((ring,index)=>normalizeRingForD3(ring,index===0))};
    if(geometry.type==='MultiPolygon')return{...geometry,coordinates:geometry.coordinates.map(polygon=>polygon.map((ring,index)=>normalizeRingForD3(ring,index===0)))};
    if(geometry.type==='GeometryCollection')return{...geometry,geometries:geometry.geometries.map(normalizeGeometryForD3)};
    return geometry;
  }
  function normalizeFeatureForD3(feature){return feature?{...feature,properties:feature.properties,geometry:normalizeGeometryForD3(feature.geometry)}:feature;}

  async function ensureVoterSupplement(){
    if(window.KDASprint2Voters)return window.KDASprint2Voters.ready;
    if(voterSupplementPromise)return voterSupplementPromise;
    voterSupplementPromise=KDA.loadScript('assets/sprint2-voters.js',{id:'kda-sprint2-voters'})
      .then(()=>window.KDASprint2Voters?.ready||null)
      .catch(error=>{console.warn('Geo voter drill-down:',error?.message||error);return null;});
    return voterSupplementPromise;
  }
  function obsFor(geographyId,indicatorId){
    if(!indicatorId)return null;
    const s=seriesByGeoIndicator.get(`${geographyId}|${indicatorId}`);
    if(s?.latest_observation_id){const o=observationById.get(s.latest_observation_id);if(o)return{series:s,obs:o};}
    const voter=indicatorByCode.get('IND-REGISTERED-VOTERS');
    if(voter?.indicator_id===indicatorId)return window.KDASprint2Voters?.valuesByGeographyId?.get(geographyId)||null;
    return null;
  }
  function agencyNameFor(seriesRow){
    if(!seriesRow)return'Unknown';const dataset=datasets.find(d=>d.dataset_id===seriesRow.dataset_id),source=dataset?sources.find(s=>s.source_id===dataset.source_id):null;
    const agency=source?agencies.find(a=>a.agency_id===source.agency_id):agencies.find(a=>a.agency_id===seriesRow.agency_id);return agency?.abbreviation||agency?.name||'Unknown';
  }
  function formatVal(value,unitCode){
    const unit=units.find(u=>u.code===unitCode),dp=unit?.decimal_places??0,n=Number(value);if(!Number.isFinite(n))return'—';
    if(unitCode==='persons'&&Math.abs(n)>=1e6)return`${(n/1e6).toFixed(2)}m`;
    if(unitCode==='persons'&&Math.abs(n)>=1e3)return`${(n/1e3).toFixed(0)}k`;
    return n.toLocaleString('en-KE',{minimumFractionDigits:dp,maximumFractionDigits:dp});
  }

  function populateIndicatorSelect(){
    const select=$('#geo-indicator');if(!select)return;
    select.disabled=false;select.innerHTML=indicators.filter(i=>i.lifecycle_status==='active').map(i=>`<option value="${esc(i.indicator_code)}">${esc(i.name)}</option>`).join('');
  }
  function syncIndicatorSelect(){const select=$('#geo-indicator'),indicator=indicatorById.get(currentIndicatorId);if(select&&indicator)select.value=indicator.indicator_code;}
  function updateIndicatorAvailability(renderList){
    const select=$('#geo-indicator'),features=renderList?.features||[];if(!select||!features.length)return;
    for(const option of select.options){
      const indicator=indicatorByCode.get(option.value);if(!indicator)continue;
      const count=features.reduce((sum,feature)=>sum+(obsFor(feature.properties.geography_id,indicator.indicator_id)?1:0),0);
      option.textContent=count?indicator.name:`${indicator.name} · no data at this level`;
      option.disabled=count===0&&indicator.indicator_id!==currentIndicatorId;
    }
  }

  async function boot(){
    if(bootPromise)return bootPromise;
    setLoading();if(root)root.dataset.geoState='loading';
    bootPromise=(async()=>{
      if(!KDA)throw new Error('Shared Atlas data loader is unavailable.');
      d3=await KDA.ensureD3();
      svg=d3.select('#geo-svg');
      const loaded=await KDA.registries(['geographies','indicators','series','observations','units','agencies','sources','datasets'],{required:true});
      [geographies,indicators,series,observations,units,agencies,sources,datasets]=loaded;
      if(![geographies,indicators,series,observations,units].every(Array.isArray))throw new Error('Published map registries are incomplete.');

      geoById=new Map(geographies.map(g=>[g.geography_id,g]));
      childrenOf.clear();for(const g of geographies){if(!g.parent_id)continue;if(!childrenOf.has(g.parent_id))childrenOf.set(g.parent_id,[]);childrenOf.get(g.parent_id).push(g.geography_id);}
      indicatorById=new Map(indicators.map(i=>[i.indicator_id,i]));indicatorByCode=new Map(indicators.map(i=>[i.indicator_code,i]));unitById=new Map(units.map(u=>[u.unit_id,u]));observationById=new Map(observations.map(o=>[o.observation_id,o]));
      seriesByGeoIndicator.clear();for(const s of series){const key=`${s.geography_id}|${s.indicator_id}`,existing=seriesByGeoIndicator.get(key);if(!existing||(s.observation_count||0)>(existing.observation_count||0))seriesByGeoIndicator.set(key,s);}

      populateIndicatorSelect();
      const country=geographies.find(g=>g.level==='country'),defaultIndicator=indicatorByCode.get('IND-POPULATION')||indicators.find(i=>i.lifecycle_status==='active')||indicators[0];
      currentIndicatorId=defaultIndicator?.indicator_id||null;
      const initial=parseHash(),startGeoId=initial.geoId||country?.geography_id;if(initial.indicatorId)currentIndicatorId=initial.indicatorId;syncIndicatorSelect();
      const select=$('#geo-indicator');if(select)select.onchange=()=>{const ind=indicatorByCode.get(select.value);if(ind)currentIndicatorId=ind.indicator_id;renderCurrent();updateHashInPlace();};
      if(startGeoId)await selectGeographyInternal(startGeoId,{pushHash:false});
      booted=true;bootError=null;if(root)root.dataset.geoState='ready';
      window.KDAGeo.ready=true;window.KDAGeo.failed=false;
      return window.KDAGeo;
    })().catch(error=>{console.error('Geo Explorer:',error);renderUnavailable(error);window.KDAGeo.failed=true;throw error;});
    return bootPromise;
  }

  async function selectGeographyInternal(geographyId,options={}){
    const geo=geoById.get(geographyId);if(!geo)return false;currentGeographyId=geographyId;if(options.indicatorId)currentIndicatorId=options.indicatorId;syncIndicatorSelect();await renderCurrent();
    if(options.pushHash===false)updateHashInPlace();else pushHash();return true;
  }
  async function selectGeography(geographyId,options){await boot();return selectGeographyInternal(geographyId,options);}

  async function renderCurrent(){
    const generation=++renderGeneration,geo=geoById.get(currentGeographyId);if(!geo)return;
    const indicator=indicatorById.get(currentIndicatorId),unit=indicator?unitById.get(indicator.unit_id):null;
    if(indicator?.indicator_code==='IND-REGISTERED-VOTERS'&&geo.level!=='country')await ensureVoterSupplement();
    let renderList,contextFeature=null,mode;
    if(geo.level==='country'){mode='children';renderList=filterFeatures(await ensureGeometry('county'),childrenOf.get(geo.geography_id)||[]);}
    else if(geo.level==='county'){mode='children';renderList=filterFeatures(await ensureGeometry('constituency'),childrenOf.get(geo.geography_id)||[]);contextFeature=findFeature(await ensureGeometry('county'),geo.geography_id);}
    else if(geo.level==='constituency'){mode='children';renderList=filterFeatures(await ensureGeometry('ward'),childrenOf.get(geo.geography_id)||[]);contextFeature=findFeature(await ensureGeometry('constituency'),geo.geography_id);}
    else{mode='siblings';const parent=geoById.get(geo.parent_id);renderList=filterFeatures(await ensureGeometry('ward'),childrenOf.get(parent?.geography_id)||[]);contextFeature=findFeature(await ensureGeometry('constituency'),parent?.geography_id);}
    if(generation!==renderGeneration)return;
    updateIndicatorAvailability(renderList);
    renderBreadcrumb(geo);renderHeading(geo,indicator);if(indicator)renderSourceNote(indicator,geo,renderList);drawMap(renderList,contextFeature,indicator,unit,mode,geo);renderRankingAndSummary(renderList,indicator,unit,geo);
  }

  function renderBreadcrumb(geo){
    const chain=[];let current=geo;while(current){chain.unshift(current);current=current.parent_id?geoById.get(current.parent_id):null;}
    const el=$('#geo-breadcrumb');if(!el)return;el.innerHTML=chain.map((item,index)=>(index?'<span aria-hidden="true">›</span>':'')+`<button data-geo-id="${esc(item.geography_id)}"${index===chain.length-1?' disabled aria-current="location"':''}>${esc(item.name)}</button>`).join('');
    $$('button[data-geo-id]',el).forEach(button=>button.onclick=()=>{if(!button.disabled)selectGeographyInternal(button.dataset.geoId);});
  }
  function renderHeading(geo,indicator){
    const heading=$('#geo-heading'),eyebrow=$('#geo-eyebrow');if(!heading||!eyebrow)return;const name=indicator?indicator.name.toLowerCase():'this indicator';
    heading.textContent=geo.level==='country'?`How does ${name} vary across Kenya?`:geo.level==='county'?`How does ${name} vary across ${geo.name} County?`:geo.level==='constituency'?`How does ${name} vary across ${geo.name} Constituency?`:`${geo.name} Ward`;
    const child=childLevelOf(geo.level);if(geo.level==='ward'){const parent=geoById.get(geo.parent_id);eyebrow.textContent=`Compared with other wards in ${parent?.name||''} Constituency`;}
    else{const count=(childrenOf.get(geo.geography_id)||[]).length,label={county:'counties',constituency:'constituencies',ward:'wards'}[child]||'places',pair=indicator?obsFor(geo.geography_id,indicator.indicator_id):null;eyebrow.textContent=`${count} ${label}${pair?' · '+pair.obs.period_label:''}`;}
  }
  function renderSourceNote(indicator,geo,renderList){
    const el=$('#geo-source-note');if(!el)return;
    const features=renderList?.features||[],pairs=features.map(feature=>obsFor(feature.properties.geography_id,indicator.indicator_id)).filter(Boolean),representative=pairs[0]||obsFor(geo.geography_id,indicator.indicator_id);
    const fallbackSeries=series.find(sr=>sr.indicator_id===indicator.indicator_id),fallbackObs=fallbackSeries?.latest_observation_id?observationById.get(fallbackSeries.latest_observation_id):null;
    const sourceSeries=representative?.series||fallbackSeries,sourceObs=representative?.obs||fallbackObs;
    let text=sourceSeries?(sourceObs?`Source: ${agencyNameFor(sourceSeries)} · ${sourceObs.badge} — ${badgeLabel(sourceObs.badge)}`:`Source: ${agencyNameFor(sourceSeries)}`):'Source unavailable';
    const targetLevel=geo.level==='ward'?'ward':childLevelOf(geo.level),targetLabel={county:'counties',constituency:'constituencies',ward:'wards'}[targetLevel]||'places';
    text+=` · Coverage in this view: ${pairs.length}/${features.length} ${targetLabel}`;
    if(indicator.indicator_code==='IND-REGISTERED-VOTERS'){
      const s2=window.KDASprint2Voters;
      if(geo?.geo_code==='KEN-C009'||String(geo?.geo_code||'').startsWith('KEN-C009-'))text+=' · Mandera East/Lafey: 10 official ward rows remain in statistical totals but are withheld from current ward polygons pending boundary reconciliation.';
      else if(geo?.level==='country')text+=' · Constituency and ward values load only when you drill below county; they are never inherited from county totals.';
      else if(s2?.error)text+=` · Lower-level voter source could not load: ${s2.error}`;
      else if(s2)text+=` · Sprint 2 verified: ${s2.coverage.constituencies} constituencies and ${s2.coverage.mapped_wards}/${s2.coverage.source_wards} ward rows safely connected; ${s2.coverage.held_wards} held.`;
    }
    el.textContent=text;
  }

  function ensureDefs(){
    const defs=svg.append('defs'),pattern=defs.append('pattern').attr('id','geo-no-data-pattern').attr('width',6).attr('height',6).attr('patternTransform','rotate(45)').attr('patternUnits','userSpaceOnUse');
    pattern.append('rect').attr('width',6).attr('height',6).attr('fill','#e7e9e6');pattern.append('line').attr('x1',0).attr('y1',0).attr('x2',0).attr('y2',6).attr('stroke','#c7cbc6').attr('stroke-width',2);
  }
  function buildColorScale(values){if(!values.length)return null;const unique=[...new Set(values)];if(unique.length===1)return()=>CHOROPLETH_RANGE[2];return d3.scaleQuantile().domain(values).range(CHOROPLETH_RANGE);}
  function setHover(geographyId){$$('.geo-feature').forEach(el=>el.classList.toggle('hovered-linked',geographyId!==null&&el.getAttribute('data-geo-id')===geographyId));$$('.geo-ranking-list button').forEach(el=>el.classList.toggle('hovered',geographyId!==null&&el.dataset.geoId===geographyId));}

  function drawMap(renderList,contextFeature,indicator,unit,mode,geo){
    if(!svg)return;svg.selectAll('*').remove();ensureDefs();const features=(renderList?.features||[]).map(normalizeFeatureForD3),context=contextFeature?normalizeFeatureForD3(contextFeature):null;if(!features.length)return;
    const fit={type:'FeatureCollection',features:context?[...features,context]:features},projection=d3.geoMercator().fitExtent([[PAD,PAD],[VIEW_W-PAD,VIEW_H-PAD]],fit),path=d3.geoPath(projection);
    if(context)svg.append('path').datum(context).attr('class','geo-feature context').attr('d',path);
    const values=[];for(const feature of features){const pair=indicator?obsFor(feature.properties.geography_id,indicator.indicator_id):null;if(pair)values.push(pair.obs.value);}const colorScale=buildColorScale(values),selectedId=mode==='siblings'?geo.geography_id:null;
    svg.append('g').selectAll('path.geo-feature-item').data(features).join('path')
      .attr('class',feature=>{const gid=feature.properties.geography_id,pair=indicator?obsFor(gid,indicator.indicator_id):null;let c='geo-feature';if(!pair)c+=' no-data';if(mode==='siblings')c+=gid===selectedId?' selected':' sibling-muted';return c;})
      .attr('data-geo-id',feature=>feature.properties.geography_id)
      .attr('fill',feature=>{const pair=indicator?obsFor(feature.properties.geography_id,indicator.indicator_id):null;return pair&&colorScale?colorScale(pair.obs.value):null;})
      .attr('d',path).attr('tabindex',0).attr('role','button')
      .attr('aria-label',feature=>{const gid=feature.properties.geography_id,place=geoById.get(gid),pair=indicator?obsFor(gid,indicator.indicator_id):null;return pair?`${place?.name||feature.properties.name} — ${indicator.name} ${formatVal(pair.obs.value,unit?.code||'')}`:`${place?.name||feature.properties.name} — no data`;})
      .on('mouseenter',(event,feature)=>{setHover(feature.properties.geography_id);showTooltip(event,feature,indicator,unit);}).on('mousemove',moveTooltip).on('mouseleave',()=>{setHover(null);hideTooltip();})
      .on('click',(event,feature)=>selectGeographyInternal(feature.properties.geography_id)).on('keydown',(event,feature)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectGeographyInternal(feature.properties.geography_id);}});
    renderLegend(colorScale,values);
  }

  function renderLegend(scale,values){
    const el=$('#geo-legend');if(!el)return;if(!values.length||!scale){el.innerHTML='<div class="geo-legend-item"><i style="background:#e7e9e6"></i><span>No data available for this view</span></div>';return;}
    const min=Math.min(...values),max=Math.max(...values),bounds=[min,...(scale.quantiles?scale.quantiles():[]),max];let html='';for(let i=0;i<CHOROPLETH_RANGE.length;i+=1){if(bounds[i]===undefined||bounds[i+1]===undefined)continue;html+=`<div class="geo-legend-item"><i style="background:${CHOROPLETH_RANGE[i]}"></i><span>${formatVal(bounds[i],'')}–${formatVal(bounds[i+1],'')}</span></div>`;}html+='<div class="geo-legend-item"><i style="background:#e7e9e6"></i><span>No data</span></div>';el.innerHTML=html;
  }
  function showTooltip(event,feature,indicator,unit){
    const tip=$('#geo-tooltip');if(!tip)return;const gid=feature.properties.geography_id,place=geoById.get(gid),pair=indicator?obsFor(gid,indicator.indicator_id):null;
    tip.innerHTML=`<strong>${esc(place?.name||feature.properties.name)}</strong>${indicator?`${esc(indicator.name)}<br>`:''}${pair?`${esc(formatVal(pair.obs.value,unit?.code||''))} · ${esc(pair.obs.period_label)}<span class="geo-tooltip-badge">${esc(pair.obs.badge)} · ${esc(agencyNameFor(pair.series))}</span>`:'Data not currently available'}`;tip.hidden=false;moveTooltip(event);
  }
  function moveTooltip(event){const tip=$('#geo-tooltip'),wrap=$('.geo-map-wrap');if(!tip||!wrap)return;const rect=wrap.getBoundingClientRect(),pad=12,x=Math.min(Math.max(event.clientX-rect.left,pad),rect.width-pad),y=Math.min(Math.max(event.clientY-rect.top,pad),rect.height-pad);tip.style.left=`${x}px`;tip.style.top=`${y}px`;}
  function hideTooltip(){const tip=$('#geo-tooltip');if(tip)tip.hidden=true;}

  function renderRankingAndSummary(renderList,indicator,unit,geo){
    const list=$('#geo-ranking-list'),title=$('#geo-ranking-title'),note=$('#geo-ranking-note');if(!list||!title||!note)return;
    const child=childLevelOf(geo.level)||'ward',label={county:'Counties',constituency:'Constituencies',ward:'Wards'}[child]||'Places';title.textContent=`${label} (${renderList.features.length})`;
    const rows=renderList.features.map(feature=>{const gid=feature.properties.geography_id,place=geoById.get(gid),pair=indicator?obsFor(gid,indicator.indicator_id):null;return{gid,name:place?.name||feature.properties.name,pair};});
    const withData=rows.filter(r=>r.pair).sort((a,b)=>b.pair.obs.value-a.pair.obs.value),withoutData=rows.filter(r=>!r.pair).sort((a,b)=>a.name.localeCompare(b.name)),periods=new Set(withData.map(r=>r.pair.obs.period_label));
    note.hidden=periods.size<=1;if(periods.size>1)note.textContent="Mixed reference periods — each figure is that area's latest available observation.";
    list.innerHTML=withData.map((row,index)=>`<li><button data-geo-id="${esc(row.gid)}" role="option"><span class="geo-rank-num">${index+1}</span><span>${esc(row.name)}</span><span class="geo-rank-value">${esc(formatVal(row.pair.obs.value,unit?.code||''))}</span></button></li>`).join('')+withoutData.map(row=>`<li><button data-geo-id="${esc(row.gid)}" role="option"><span class="geo-rank-num">—</span><span>${esc(row.name)}</span><span class="geo-rank-value geo-rank-nodata">No data</span></button></li>`).join('');
    $$('button[data-geo-id]',list).forEach(button=>{button.onclick=()=>selectGeographyInternal(button.dataset.geoId);button.onmouseenter=()=>setHover(button.dataset.geoId);button.onmouseleave=()=>setHover(null);button.onfocus=()=>setHover(button.dataset.geoId);button.onblur=()=>setHover(null);});
    renderSummary(geo,indicator,unit);
  }
  function renderSummary(geo,indicator,unit){
    const el=$('#geo-selected-summary');if(!el)return;if(!geo.parent_id||!indicator){el.hidden=true;return;}
    const pair=obsFor(geo.geography_id,indicator.indicator_id),siblingIds=childrenOf.get(geo.parent_id)||[],siblingVals=siblingIds.map(id=>{const p=obsFor(id,indicator.indicator_id);return p?{id,value:p.obs.value}:null;}).filter(Boolean).sort((a,b)=>b.value-a.value),rank=pair?siblingVals.findIndex(s=>s.id===geo.geography_id)+1:null;
    let share='';if(pair&&unit?.dimension==='count'&&siblingVals.length===siblingIds.length){const total=siblingVals.reduce((sum,s)=>sum+s.value,0),parent=geoById.get(geo.parent_id);if(total>0)share=`<div><dt>Share of ${esc(parent?.name||'parent')}</dt><dd>${((pair.obs.value/total)*100).toFixed(1)}%</dd></div>`;}
    const profile=geo.level==='county'&&window.KDASelectCountyProfile?'<div class="geo-summary-source"><button class="text-link" id="geo-view-profile" style="padding:0">View full county profile →</button></div>':'';
    el.hidden=false;el.innerHTML=`<h4>${esc(geo.name)}</h4>${pair?`<div><dt>${esc(indicator.name)}</dt><dd>${esc(formatVal(pair.obs.value,unit?.code||''))}</dd></div>`:`<div><dt>${esc(indicator.name)}</dt><dd>—</dd></div>`}${rank?`<div><dt>Rank</dt><dd>#${rank} of ${siblingVals.length}</dd></div>`:''}${share}${pair?`<div class="geo-summary-source">${esc(pair.obs.period_label)} · ${esc(agencyNameFor(pair.series))} · <b>${esc(pair.obs.badge)}</b> — ${esc(badgeLabel(pair.obs.badge))}</div>`:`<div class="geo-summary-source">Data not currently available for ${esc(indicator.name.toLowerCase())} at ${esc(geo.level)} level.</div>`}${profile}`;
    const button=$('#geo-view-profile',el);if(button)button.onclick=()=>window.KDASelectCountyProfile(geo.name);
  }

  window.KDAGeo={ready:false,failed:false,boot,selectGeography,normalizeFeatureForD3};
  setLoading('Map data loads as you approach this section.');
  if(root){root.addEventListener('pointerdown',()=>boot().catch(()=>{}),{once:true});root.addEventListener('focusin',()=>boot().catch(()=>{}),{once:true});}
  if(KDA&&root)KDA.whenVisible(root,()=>boot(),{rootMargin:'700px 0px'});
  if(location.hash.startsWith('#map/'))boot().catch(()=>{});
  window.addEventListener('hashchange',()=>{
    if(!location.hash.startsWith('#map/'))return;
    boot().then(()=>{const state=parseHash();if(state.geoId&&(state.geoId!==currentGeographyId||state.indicatorId&&state.indicatorId!==currentIndicatorId))selectGeographyInternal(state.geoId,{pushHash:false,indicatorId:state.indicatorId});}).catch(()=>{});
  });
})();