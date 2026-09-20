/* Kenya Data Atlas — registry-driven place profiles.
 * County / Constituency / Ward tabs. Parent values are never inherited.
 * Public county tabs expose published/current indicators rather than internal
 * replacement placeholders; the governed taxonomy remains unchanged underneath.
 */
(function(){
  'use strict';
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state=null,currentGeo=null,currentTab='overview',rankingQueued=false;

  function ensureStyles(){
    if(document.getElementById('kda-place-profile-css')||document.querySelector('link[href="assets/place-profile.css"]'))return;
    if(window.KDAData?.loadStyle){window.KDAData.loadStyle('assets/place-profile.css',{id:'kda-place-profile-css'}).catch(()=>{});return;}
    const link=document.createElement('link');link.id='kda-place-profile-css';link.rel='stylesheet';link.href='assets/place-profile.css';document.head.appendChild(link);
  }
  ensureStyles();

  const json=async url=>{try{const r=await fetch(url);return r.ok?await r.json():null;}catch{return null;}};
  const TAB_LABEL={overview:'Overview',people:'People',education:'Education',economy:'Economy',health:'Health',finance:'Finance',representation:'Representation',infrastructure:'Infrastructure',resilience:'Resilience & Environment',local54:'All 54 Governed Indicators'};
  const BADGE_LABEL={A:'Official direct',B:'Official derived',C:'Spatially derived',D:'Modelled',E:'External source'};
  // P34 -- public badge vocabulary for the governed local-54 panel (docs/governance/data-quality-framework.md).
  // Deliberately namespaced (l54-*) so it never collides with the older A-E classes above.
  const L54_BADGE_CLASS={'Official':'l54-official','Derived from official data':'l54-derived','Secondary — verified':'l54-secondary-verified','Secondary — corroborated':'l54-secondary-corroborated','Probable value — sources conflict':'l54-probable','Estimated/modelled':'l54-modelled','Data unavailable':'l54-unavailable','Not applicable':'l54-na'};
  const ROLE_LABEL={county_woman_representative:'Woman Representative',member_of_parliament:'Member of Parliament',member_of_county_assembly:'Member of County Assembly'};
  const local54Cache=new Map();

  const COUNTY_PUBLIC_SLOTS={
    people:[
      'IND-POPULATION','IND-POP-2009','IND-HOUSEHOLD-SIZE','IND-LITERACY-RATE',
      'IND-POVERTY-RATE','IND-HOUSING-MATERIAL','IND-REGISTERED-VOTERS',
      'IND-DISABILITY-PREVALENCE','IND-HOUSEHOLDS-CASH-TRANSFER-SOCIAL-ASSISTANCE'
    ],
    education:[
      'IND-PUBLIC-PRIMARY-SCHOOLS','IND-PRIMARY-CLASSROOM-TEACHERS',
      'IND-PUBLIC-SECONDARY-SCHOOLS','IND-SECONDARY-TEACHERS'
    ],
    economy:[
      'IND-GCP-CURRENT','IND-FUEL-PETROL','IND-AGRICULTURE-GVA','IND-AGRICULTURE-GCP-SHARE',
      'IND-MANUFACTURING-GVA','IND-MANUFACTURING-GCP-SHARE','IND-MAIZE-AREA',
      'IND-MAIZE-PRODUCTION','IND-MAIZE-YIELD'
    ],
    health:[
      'IND-HEALTH-FACILITY-COUNT','IND-STUNTING-RATE','IND-IMMUNIZATION-RATE','IND-MATERNAL-HEALTH',
      'IND-HIV-PREVALENCE','IND-TEENAGE-PREGNANCY','IND-HOME-BIRTH-RATE','IND-CONTRACEPTIVE-USE',
      'IND-FGM-CHILD-MARRIAGE','IND-INPATIENT-SERVICE-AVAILABILITY'
    ],
    finance:[
      'IND-COUNTY-BUDGET-TOTAL','IND-COUNTY-EXPENDITURE-TOTAL','IND-COUNTY-BUDGET-ABSORPTION',
      'IND-COUNTY-DEVELOPMENT-ABSORPTION','IND-COUNTY-OSR','IND-COUNTY-PENDING-BILLS','IND-COUNTY-AUDIT-OPINION'
    ],
    infrastructure:[
      'IND-MAIN-GRID-ELECTRICITY','IND-WATER-ACCESS','IND-HEALTH-FACILITY-DENSITY',
      'IND-INTERNET-USE','IND-COMPUTER-USE','IND-CLASS-C-RURAL-ROAD-LENGTH',
      'IND-HOUSEHOLD-MOTORCYCLE-OWNERSHIP','IND-HOUSEHOLD-CAR-OWNERSHIP'
    ]
  };
  const COUNTY_TAB_ORDER=['overview','people','education','economy','health','finance','infrastructure'];

  function unitLabel(unit){
    if(!unit)return '';
    return {persons:'persons',percent:'%',kes_per_usd:'KES/USD',km2:'km²',kes_per_litre:'KES/L',kes_million:'KSh mn',count:'count',persons_per_household:'persons/household',index_score:'score',category:'',km:'km',hectares:'ha',tonnes:'t',tonnes_per_hectare:'t/ha',per_10000_persons:'per 10k',climate_measure:'mm / °C'}[unit.code]||unit.symbol||unit.name||'';
  }
  function formatValue(value,unit){
    if(unit?.code==='category')return String(value??'').trim()||'—';
    const v=Number(value);if(!Number.isFinite(v))return '—';
    if(unit?.code==='persons'&&v>=1e6)return `${(v/1e6).toFixed(2)}m`;
    if(unit?.code==='persons'&&v>=1e3)return `${(v/1e3).toFixed(0)}k`;
    return v.toLocaleString('en-KE',{minimumFractionDigits:unit?.decimal_places??0,maximumFractionDigits:unit?.decimal_places??2});
  }
  function agencyFor(series){
    const dataset=state.datasetById.get(series?.dataset_id),source=dataset?state.sourceById.get(dataset.source_id):null,agency=source?state.agencyById.get(source.agency_id):null;
    return agency?.abbreviation||agency?.name||'Source';
  }
  function qualityBadge(badge){
    const code=String(badge||'A').toUpperCase(),label=BADGE_LABEL[code]||'Evidence status';
    return `<span class="badge ${esc(code.toLowerCase())}" title="${esc(label)}" aria-label="${esc(label)}">${esc(code)}</span>`;
  }
  function latestPair(geoId,indicator){
    if(!indicator)return null;const list=state.seriesByGeoIndicator.get(`${geoId}|${indicator.indicator_id}`)||[];
    const pairs=list.map(s=>({series:s,obs:state.obsById.get(s.latest_observation_id)})).filter(x=>x.obs);
    pairs.sort((a,b)=>String(b.obs.period_end||b.obs.period_start).localeCompare(String(a.obs.period_end||a.obs.period_start)));
    return pairs[0]||null;
  }
  function unitFor(ind){return ind?state.unitById.get(ind.unit_id):null;}
  function chainFor(geo){const out=[];let cur=geo;while(cur){out.unshift(cur);cur=cur.parent_id?state.geoById.get(cur.parent_id):null;}return out;}
  function isEligibleConditionalTab(geo,tab){
    const subsetKey=state.taxonomy.conditional_tabs?.[tab];if(!subsetKey)return true;
    const subset=state.subsetByKey.get(subsetKey);return Boolean(subset?.members?.includes(geo.name));
  }
  function tabsFor(geo){
    if(geo.level==='county'){
      const tabs=[...COUNTY_TAB_ORDER];
      if(isEligibleConditionalTab(geo,'resilience'))tabs.push('resilience');
      tabs.push('local54');
      return tabs;
    }
    return [...(state.taxonomy.tabs?.[geo.level]||[]).filter(tab=>isEligibleConditionalTab(geo,tab)),'local54'];
  }
  function slotCodes(geo,tab){
    if(tab==='overview'){
      const base={
        county:['IND-POPULATION','IND-REGISTERED-VOTERS','IND-LAND-AREA','IND-GCP-CURRENT','IND-COUNTY-BUDGET-ABSORPTION','IND-FUEL-PETROL'],
        constituency:['IND-POPULATION','IND-REGISTERED-VOTERS','IND-LAND-AREA'],
        ward:['IND-POPULATION','IND-REGISTERED-VOTERS','IND-LAND-AREA']
      }[geo.level]||[];
      return base.filter(code=>state.indicatorByCode.has(code));
    }
    if(geo.level==='county'&&COUNTY_PUBLIC_SLOTS[tab])return COUNTY_PUBLIC_SLOTS[tab].filter(code=>state.indicatorByCode.has(code));
    return state.taxonomy.slots?.[geo.level]?.[tab]||[];
  }

  function uncertaintyHtml(ind,pair,unit){
    if(!ind?.requires_sampling_uncertainty||!pair?.obs)return '';
    const o=pair.obs;
    if(o.lower_bound!=null&&o.upper_bound!=null)return `<div class="survey-uncertainty">${esc(o.confidence_level||95)}% CI · ${esc(formatValue(o.lower_bound,unit))}–${esc(formatValue(o.upper_bound,unit))} · n=${esc(o.sample_size)}</div>`;
    const parts=['Sampling uncertainty'];
    if(o.confidence_level!=null)parts.push(`confidence ${o.confidence_level}%`);
    if(o.standard_error!=null)parts.push(`SE ${o.standard_error}`);
    if(o.sample_size!=null)parts.push(`n=${o.sample_size}`);
    return `<div class="survey-uncertainty">${esc(parts.join(' · '))}</div>`;
  }
  function cardHtml(code,geo,tab){
    const ind=state.indicatorByCode.get(code);if(!ind)return '';
    const unit=unitFor(ind),pair=latestPair(geo.geography_id,ind),life=ind.lifecycle_status||'active';
    const unitChip=unitLabel(unit)?`<span class="unit-chip" title="Unit of measurement: ${esc(unit?.name||unitLabel(unit))}">${esc(unitLabel(unit))}</span>`:'';
    if(life==='active'&&pair){
      const source=agencyFor(pair.series);
      return `<article class="place-profile-card lifecycle-active" data-indicator-code="${esc(code)}"><div class="place-card-top"><span class="place-card-label">${esc(ind.name)}</span>${qualityBadge(pair.obs.badge)}</div><div class="place-card-value-row"><div class="place-card-value">${esc(formatValue((String(pair.obs.text_value??'').trim()!==''?pair.obs.text_value:pair.obs.value),unit))}</div>${unitChip}</div><div class="place-card-meta place-card-source"><strong>${esc(pair.obs.period_label)}</strong><span>${esc(source)}</span></div>${uncertaintyHtml(ind,pair,unit)}</article>`;
    }
    if(life==='active'){
      const note=ind.expected_availability_note||`No observation is currently available for ${geo.name} at ${geo.level} level.`;
      return `<article class="place-profile-card lifecycle-missing" data-indicator-code="${esc(code)}"><div class="place-card-top"><span class="place-card-label">${esc(ind.name)}</span><span class="badge missing">N/A</span></div><div class="place-card-value-row"><div class="place-card-value missing">—</div>${unitChip}</div><div class="place-card-meta">${esc(note)}</div></article>`;
    }
    const status=life==='sourced'?'Sourced':life==='retired'?'Replaced':'Planned';
    const levels=(ind.applies_to_levels||[]).map(x=>x[0].toUpperCase()+x.slice(1)).join(', ')||'National only';
    const source=ind.expected_source||'Source not yet confirmed';
    const link=(life==='sourced'||life==='retired')&&ind.expected_source_url?`<a href="${esc(ind.expected_source_url)}" target="_blank" rel="noopener">Open source ↗</a>`:'';
    return `<article class="place-profile-card lifecycle-${esc(life)}" data-indicator-code="${esc(code)}"><div class="place-card-top"><span class="place-card-label">${esc(ind.name)}</span><span class="badge lifecycle ${esc(life)}">${status}</span></div><div class="place-card-value-row"><div class="place-card-value missing">—</div>${unitChip}</div><div class="place-card-meta"><strong>${status}</strong> · ${esc(source)}</div><button class="placeholder-explain" type="button" aria-expanded="false">More about availability ↓</button><div class="placeholder-detail" hidden><b>${esc(TAB_LABEL[tab]||tab)} · ${esc(status)}</b><div>Intended levels: ${esc(levels)}</div><div>${esc(ind.expected_availability_note||'No additional availability note.')}</div>${link}</div></article>`;
  }

  // P34 -- the governed local-54 indicator panel. Fetches a small per-geography subset
  // (data/distribution/subsets/local-54/<geo_code>.json, built by scripts/p34/build-local-54-
  // profile-subsets.mjs) rather than the ~65MB full ledger, and renders all 54 indicators —
  // including official_unavailable/not_applicable ones — plus the representative for this level.
  const UNAVAILABLE_L54_LABELS=new Set(['Data unavailable','Not applicable']);
  async function fetchLocal54(geoCode){
    if(local54Cache.has(geoCode))return local54Cache.get(geoCode);
    const data=await json(`data/distribution/subsets/local-54/${geoCode}.json`);
    local54Cache.set(geoCode,data);
    return data;
  }
  // The reason catalogue (~340KB, ~100 unique entries) is fetched once and cached, rather than
  // duplicating each closure's full reason/source/period text into every one of the 1,787
  // per-geography subsets -- the same national-source limitation applies to most geographies a
  // given indicator is closed for, so the text is shared, not per-geography.
  let local54ReasonCataloguePromise=null;
  function fetchLocal54ReasonCatalogue(){
    if(!local54ReasonCataloguePromise)local54ReasonCataloguePromise=json('data/completeness/local-54-reason-catalogue.json').then(doc=>new Map((doc?.reasons||[]).map(r=>[r.reason_id,r])));
    return local54ReasonCataloguePromise;
  }
  function local54BadgeHtml(label){
    const cls=L54_BADGE_CLASS[label]||'l54-unavailable';
    return `<span class="badge ${esc(cls)}" title="${esc(label)}" aria-label="${esc(label)}">${esc(label)}</span>`;
  }
  function local54CardHtml(ind,reasonById){
    const unavailable=UNAVAILABLE_L54_LABELS.has(ind.badge_label);
    const valueHtml=unavailable?'<strong class="missing">—</strong>':`<strong>${esc(ind.value)}</strong>`;
    const closure=ind.reason_id?reasonById?.get(ind.reason_id):null;
    const periodLabel=unavailable?closure?.period_label:ind.period_label;
    const source=unavailable?closure?.source:ind.source;
    const sourceUrl=unavailable?closure?.source_url:ind.source_url;
    const reasonHtml=closure?.reason?`<div>${esc(closure.reason)}</div>`:'';
    const conflictHtml=ind.conflict_note?`<div class="l54-conflict"><b>Conflict history</b><div>${esc(ind.conflict_note.summary)}</div></div>`:'';
    const sourceLink=sourceUrl?`<a href="${esc(sourceUrl)}" target="_blank" rel="noopener">Open source ↗</a>`:'';
    return `<article class="place-l54-card ${unavailable?(ind.badge_label==='Not applicable'?'na':'unavailable'):''}" data-indicator-code="${esc(ind.indicator_code)}"><div class="place-l54-card-top"><span>${esc(ind.indicator_name)}</span>${local54BadgeHtml(ind.badge_label)}</div><div class="place-l54-value">${valueHtml}</div><small><b>${esc(periodLabel||ind.status)}</b><span>${esc(source||'')}</span></small><button class="place-l54-explain" type="button" aria-expanded="false">Details ↓</button><div class="place-l54-detail" hidden>${reasonHtml}${conflictHtml}${sourceLink}</div></article>`;
  }
  function local54RepHtml(reps){
    if(!reps||!reps.length)return '';
    return reps.map(r=>{
      const stale=r.freshness_status&&r.freshness_status!=='current';
      return `<div class="place-l54-rep"><b>${esc(ROLE_LABEL[r.role_id]||r.role_id)}</b><span>${esc(r.person_name)}${r.party?` (${esc(r.party)})`:''}</span><span class="place-l54-rep-meta">${esc(r.status)} · verified ${esc(r.verification_date)}</span>${stale?'<span class="badge l54-stale">Not recently re-verified</span>':''}</div>`;
    }).join('');
  }
  async function renderLocal54Tab(){
    const section=$('#profile');if(!section)return;
    const geo=currentGeo,tab=currentTab;
    const head=$('.place-profile-tab-head',section);
    if(head)head.innerHTML=`<h3>${esc(TAB_LABEL.local54)}</h3><p class="place-profile-coverage">Loading…</p>`;
    const grid=$('.place-profile-grid',section);
    if(grid)grid.innerHTML='<div class="place-profile-empty">Loading the governed 54-indicator framework…</div>';
    const [subset,reasonById]=await Promise.all([fetchLocal54(geo.geo_code),fetchLocal54ReasonCatalogue()]);
    if(currentGeo!==geo||currentTab!==tab)return;
    if(!subset){
      if(head)head.innerHTML=`<h3>${esc(TAB_LABEL.local54)}</h3><p class="place-profile-coverage">unavailable</p>`;
      if(grid)grid.innerHTML=`<div class="place-profile-empty">The governed 54-indicator dataset for ${esc(geo.name)} is not available.</div>`;
      return;
    }
    const published=subset.indicators.filter(i=>!UNAVAILABLE_L54_LABELS.has(i.badge_label)).length;
    if(head)head.innerHTML=`<h3>${esc(TAB_LABEL.local54)}</h3><p class="place-profile-coverage">${published}/54 published · ${esc(geo.level)}</p>`;
    const repHtml=local54RepHtml(subset.representative);
    const cardsHtml=subset.indicators.map(ind=>local54CardHtml(ind,reasonById)).join('');
    if(grid)grid.innerHTML=`<div class="place-l54-panel"><div class="place-l54-head"><div><span class="place-l54-eyebrow">Governed 54-indicator framework</span><h3>Every indicator, every disposition</h3><p>All 54 local indicators are shown for this ${esc(geo.level)}, including those confirmed unavailable or not applicable — nothing is hidden for lacking a value. Secondary, modelled or probable values are visually distinct from official figures and every disposition is inspectable.</p></div><div class="place-l54-coverage"><strong>${published}/54</strong><span>published</span></div></div>${repHtml}<div class="place-l54-grid">${cardsHtml}</div></div>`;
  }

  function renderTab(){
    if(!currentGeo)return;const section=$('#profile');if(!section)return;
    $$('.place-profile-tabs button',section).forEach(b=>{const active=b.dataset.profileTab===currentTab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
    if(currentTab==='local54'){renderLocal54Tab();return;}
    const codes=slotCodes(currentGeo,currentTab);
    const available=codes.filter(code=>{const i=state.indicatorByCode.get(code);return i?.lifecycle_status==='active'&&latestPair(currentGeo.geography_id,i);}).length;
    const label=TAB_LABEL[currentTab]||currentTab;
    const head=$('.place-profile-tab-head',section);if(head)head.innerHTML=`<h3>${esc(label)}</h3><p class="place-profile-coverage">${available}/${codes.length} available · ${esc(currentGeo.level)}</p>`;
    const grid=$('.place-profile-grid',section);if(grid)grid.innerHTML=codes.length?codes.map(code=>cardHtml(code,currentGeo,currentTab)).join(''):`<div class="place-profile-empty">No published indicator slots are defined for this topic at ${esc(currentGeo.level)} level.</div>`;
  }

  function renderProfile(geoId,preferredTab){
    const geo=state.geoById.get(geoId);if(!geo||!['county','constituency','ward'].includes(geo.level))return;
    currentGeo=geo;const tabs=tabsFor(geo);currentTab=(preferredTab&&tabs.includes(preferredTab))?preferredTab:(tabs.includes(currentTab)?currentTab:'overview');
    const section=$('#profile');if(!section)return;section.dataset.placeProfile='true';
    const chain=chainFor(geo).map((g,i)=>`${i?'<span>›</span>':''}${esc(g.name)}`).join('');
    const placeLabel=`${geo.name}${geo.level==='county'?' County':geo.level==='constituency'?' Constituency':' Ward'}`;
    section.innerHTML=`<div class="place-profile-head"><div class="place-profile-copy"><p class="place-profile-breadcrumb">${chain}</p><span class="place-profile-level">${esc(geo.level)} · ${esc(geo.geo_code)}</span><h2>${esc(placeLabel)}</h2><p>Published observations for this place, with source and reference period kept visible. Missing local values stay missing — broader-area figures are never substituted.</p></div><div class="place-profile-actions"><button type="button" id="place-profile-download" aria-label="Download ${esc(placeLabel)} ${esc(TAB_LABEL[currentTab]||currentTab)} data as CSV">↓ Download CSV</button></div></div><nav class="place-profile-tabs" role="tablist" aria-label="${esc(geo.name)} profile topics">${tabs.map(tab=>`<button type="button" role="tab" data-profile-tab="${esc(tab)}">${esc(TAB_LABEL[tab]||tab)}</button>`).join('')}</nav><div class="place-profile-tab-head"></div><div class="place-profile-grid" role="region" aria-live="polite"></div>`;
    renderTab();
  }

  async function downloadCurrent(){
    if(!currentGeo)return;
    if(currentTab==='local54'){
      const subset=local54Cache.get(currentGeo.geo_code);if(!subset)return;
      const reasonById=await fetchLocal54ReasonCatalogue();
      const q=v=>`"${String(v??'').replaceAll('"','""')}"`;
      const rows=[['indicator_code','indicator_name','status','badge_label','value','period','source','confidence'].join(',')];
      for(const ind of subset.indicators){
        const closure=ind.reason_id?reasonById.get(ind.reason_id):null;
        rows.push([q(ind.indicator_code),q(ind.indicator_name),q(ind.status),q(ind.badge_label),q(ind.value),q(ind.period_label||closure?.period_label),q(ind.source||closure?.source),q(ind.confidence)].join(','));
      }
      const blob=new Blob([rows.join('\n')],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`kenya-data-atlas-${currentGeo.geo_code.toLowerCase()}-local54.csv`;a.click();URL.revokeObjectURL(a.href);
      return;
    }
    const codes=slotCodes(currentGeo,currentTab),rows=[['indicator_code','indicator','lifecycle','value','unit','period','source'].join(',')];
    const q=v=>`"${String(v??'').replaceAll('"','""')}"`;
    for(const code of codes){const i=state.indicatorByCode.get(code);if(!i)continue;const p=latestPair(currentGeo.geography_id,i),u=unitFor(i);rows.push([q(code),q(i.name),q(i.lifecycle_status),q((String(p?.obs?.text_value??'').trim()!==''?p.obs.text_value:(p?.obs?.value??''))),q(unitLabel(u)),q(p?.obs?.period_label??''),q(p?agencyFor(p.series):(i.expected_source||''))].join(','));}
    const blob=new Blob([rows.join('\n')],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`kenya-data-atlas-${currentGeo.geo_code.toLowerCase()}-${currentTab}.csv`;a.click();URL.revokeObjectURL(a.href);
  }

  function installProfileEvents(){
    const section=$('#profile');if(!section||section.dataset.profileEvents==='true')return;section.dataset.profileEvents='true';
    section.addEventListener('click',e=>{
      const tab=e.target.closest('[data-profile-tab]');if(tab){currentTab=tab.dataset.profileTab;renderTab();return;}
      const explain=e.target.closest('.placeholder-explain');if(explain){const detail=explain.nextElementSibling,open=detail?.hidden!==false;$$('.placeholder-detail',section).forEach(d=>d.hidden=true);$$('.placeholder-explain',section).forEach(b=>b.setAttribute('aria-expanded','false'));if(detail){detail.hidden=!open;explain.setAttribute('aria-expanded',String(open));}return;}
      const l54explain=e.target.closest('.place-l54-explain');if(l54explain){const detail=l54explain.nextElementSibling,open=detail?.hidden!==false;$$('.place-l54-detail',section).forEach(d=>d.hidden=true);$$('.place-l54-explain',section).forEach(b=>b.setAttribute('aria-expanded','false'));if(detail){detail.hidden=!open;l54explain.setAttribute('aria-expanded',String(open));}return;}
      if(e.target.closest('#place-profile-download'))downloadCurrent();
    });
    section.addEventListener('keydown',e=>{
      const tab=e.target.closest('[data-profile-tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      const tabs=$$('[data-profile-tab]',section),index=tabs.indexOf(tab);if(index<0)return;e.preventDefault();
      const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next]?.focus();tabs[next]?.click();
    });
  }

  function renderNationalPulsePlaceholders(){
    const grid=$('#pulse-grid');if(!grid)return;
    for(const code of state.taxonomy.national_pulse_slots||[]){
      if(grid.querySelector(`[data-national-placeholder="${code}"]`))continue;
      const ind=state.indicatorByCode.get(code);if(!ind||ind.lifecycle_status==='active')continue;
      const article=document.createElement('article');article.className=`metric-card national-placeholder lifecycle-${ind.lifecycle_status}`;article.dataset.nationalPlaceholder=code;
      article.innerHTML=`<span class="label">${esc(ind.name)}</span><span class="badge lifecycle ${esc(ind.lifecycle_status)}">${esc(ind.lifecycle_status)}</span><strong>—</strong><span class="delta">${esc(ind.lifecycle_status==='sourced'?'Sourced':'Planned')}</span><small>${esc(ind.expected_availability_note||ind.expected_source||'National Pulse roadmap')}</small>`;
      grid.appendChild(article);
    }
  }

  function applyRankingPolicy(){
    rankingQueued=false;const select=$('#geo-indicator'),list=$('#geo-ranking-list'),panel=$('.geo-ranking-panel');if(!select||!list||!panel)return;
    const ind=state.indicatorByCode.get(select.value),restricted=ind?.ranking_allowed===false;
    let note=$('.geo-ranking-policy',panel);if(!restricted){if(note)note.remove();return;}
    if(!note){note=document.createElement('p');note.className='geo-ranking-policy';const title=$('#geo-ranking-title',panel);title?.insertAdjacentElement('afterend',note);}
    if(note.textContent!=='Ranking disabled for this sensitive indicator. Places are listed alphabetically; the Atlas does not create a “worst offenders” table.')note.textContent='Ranking disabled for this sensitive indicator. Places are listed alphabetically; the Atlas does not create a “worst offenders” table.';
    const items=$$('li',list),sorted=[...items].sort((a,b)=>(a.querySelector('button span:nth-child(2)')?.textContent||'').localeCompare(b.querySelector('button span:nth-child(2)')?.textContent||''));
    const before=items.map(x=>x.querySelector('button span:nth-child(2)')?.textContent||'').join('|'),after=sorted.map(x=>x.querySelector('button span:nth-child(2)')?.textContent||'').join('|');
    if(before!==after)sorted.forEach(li=>list.appendChild(li));$$('.geo-rank-num',list).forEach(n=>{if(n.textContent!=='—')n.textContent='—';});
  }
  function scheduleRankingPolicy(){if(rankingQueued)return;rankingQueued=true;queueMicrotask(applyRankingPolicy);}

  function syncFromBreadcrumb(){const current=$('#geo-breadcrumb button[aria-current="location"]');if(current?.dataset.geoId)renderProfile(current.dataset.geoId);}
  function installGeoSync(){
    const crumb=$('#geo-breadcrumb');if(crumb)new MutationObserver(()=>setTimeout(syncFromBreadcrumb,0)).observe(crumb,{childList:true,subtree:true});
    const list=$('#geo-ranking-list');if(list)new MutationObserver(scheduleRankingPolicy).observe(list,{childList:true,subtree:true});
    $('#geo-indicator')?.addEventListener('change',()=>setTimeout(applyRankingPolicy,0));
    const wrap=()=>{const api=window.KDAGeo;if(!api?.selectGeography||api.selectGeography.__placeProfileWrapped)return false;const original=api.selectGeography;const wrapped=async function(id,...args){const result=await original.call(api,id,...args);renderProfile(id);return result;};wrapped.__placeProfileWrapped=true;api.selectGeography=wrapped;return true;};
    if(!wrap()){let tries=0;const t=setInterval(()=>{if(wrap()||++tries>80)clearInterval(t);},50);}
  }

  async function boot(){
    const [geographies,indicators,series,observations,units,agencies,sources,datasets,taxonomy,subsetsDoc]=await Promise.all([
      json('data/geography/registry/geographies.json'),json('data/indicators/registry/indicators.json'),json('data/indicators/registry/series.json'),json('data/indicators/registry/observations.json'),json('data/indicators/registry/units.json'),json('data/catalogue/registry/agencies.json'),json('data/catalogue/registry/sources.json'),json('data/catalogue/registry/datasets.json'),json('data/indicators/seed/placeholder-taxonomy.json'),json('data/geography/reference/geography-subsets.json')
    ]);
    if(!geographies||!indicators||!series||!observations||!taxonomy)return;
    const indicatorByCode=new Map(indicators.map(i=>[i.indicator_code,i]));
    const unitByCode=new Map((units||[]).map(u=>[u.code,u]));
    for(const u of taxonomy.units||[])if(!unitByCode.has(u.code)){const virtual={unit_id:`virtual:${u.code}`,...u,symbol:u.symbol||''};units.push(virtual);unitByCode.set(u.code,virtual);}
    for(const d of taxonomy.indicators||[])if(!indicatorByCode.has(d.code)&&d.status!=='active'){
      const u=unitByCode.get(d.unit_code);const virtual={indicator_id:`virtual:${d.code}`,indicator_code:d.code,name:d.name,short_name:d.short_name||d.name,description:d.description,topic:d.tab,subtopic:d.tab,unit_id:u?.unit_id,lifecycle_status:d.status,expected_source:d.source||'',expected_source_url:d.source_url||'',expected_availability_note:d.note||'',tab:d.tab,applies_to_levels:d.levels||[],applies_to_geography_subset:d.subset||'',requires_sampling_uncertainty:(taxonomy.survey_indicator_codes||[]).includes(d.code),ranking_allowed:!(taxonomy.sensitive_no_ranking_codes||[]).includes(d.code),active:false};indicators.push(virtual);indicatorByCode.set(d.code,virtual);
    }
    for(const d of taxonomy.indicators||[]){const i=indicatorByCode.get(d.code);if(!i)continue;i.lifecycle_status=i.lifecycle_status||d.status||'active';i.expected_source=d.source||i.expected_source||'';i.expected_source_url=d.source_url||i.expected_source_url||'';i.expected_availability_note=d.note||i.expected_availability_note||'';i.tab=d.tab||i.tab;i.applies_to_levels=d.levels||i.applies_to_levels||[];i.applies_to_geography_subset=d.subset||i.applies_to_geography_subset||'';i.requires_sampling_uncertainty=(taxonomy.survey_indicator_codes||[]).includes(d.code);i.ranking_allowed=!(taxonomy.sensitive_no_ranking_codes||[]).includes(d.code);}
    const seriesByGeoIndicator=new Map();for(const s of series){const k=`${s.geography_id}|${s.indicator_id}`;if(!seriesByGeoIndicator.has(k))seriesByGeoIndicator.set(k,[]);seriesByGeoIndicator.get(k).push(s);}
    state={taxonomy,geographies,indicators,series,observations,units,geoById:new Map(geographies.map(g=>[g.geography_id,g])),indicatorByCode,unitById:new Map(units.map(u=>[u.unit_id,u])),obsById:new Map(observations.map(o=>[o.observation_id,o])),seriesByGeoIndicator,agencyById:new Map((agencies||[]).map(a=>[a.agency_id,a])),sourceById:new Map((sources||[]).map(s=>[s.source_id,s])),datasetById:new Map((datasets||[]).map(d=>[d.dataset_id,d])),subsetByKey:new Map((subsetsDoc?.subsets||[]).map(s=>[s.key,s]))};
    installProfileEvents();installGeoSync();renderNationalPulsePlaceholders();setTimeout(renderNationalPulsePlaceholders,500);
    const initial=geographies.find(g=>g.level==='county'&&g.name==='Nakuru')||geographies.find(g=>g.level==='county');if(initial)renderProfile(initial.geography_id,'overview');
    setTimeout(syncFromBreadcrumb,650);setTimeout(applyRankingPolicy,700);
    const byName=new Map(geographies.filter(g=>g.level==='county').map(g=>[g.name.toLowerCase(),g]));window.KDASelectCountyProfile=name=>{const g=byName.get(String(name).toLowerCase());if(g){renderProfile(g.geography_id,'overview');$('#profile')?.scrollIntoView({behavior:'smooth',block:'start'});}};
    window.KDAPlaceProfile={renderProfile};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
