/* Pre-P05 product-wide interaction, selection and place-context hardening. */
(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const countyNames=['Mombasa','Kwale','Kilifi','Tana River','Lamu','Taita Taveta','Garissa','Wajir','Mandera','Marsabit','Isiolo','Meru','Tharaka-Nithi','Embu','Kitui','Machakos','Makueni','Nyandarua','Nyeri','Kirinyaga',"Murang'a",'Kiambu','Turkana','West Pokot','Samburu','Trans Nzoia','Uasin Gishu','Elgeyo/Marakwet','Nandi','Baringo','Laikipia','Nakuru','Narok','Kajiado','Kericho','Bomet','Kakamega','Vihiga','Bungoma','Busia','Siaya','Kisumu','Homa Bay','Migori','Kisii','Nyamira','Nairobi City'];
  const aliases=new Map([['Taita/Taveta','Taita Taveta'],['Elgeyo Marakwet','Elgeyo/Marakwet'],['Muranga',"Murang'a"],['Murang’a',"Murang'a"],['Nairobi','Nairobi City'],['Tharaka Nithi','Tharaka-Nithi']]);
  const countyNo=new Map(countyNames.map((name,i)=>[name,i+1]));
  const normCounty=text=>{let s=String(text||'').replace(/^\s*\d{3}\s*[·\-:]\s*/,'').trim();return aliases.get(s)||s;};
  const countyLabel=name=>`${String(countyNo.get(name)).padStart(3,'0')} · ${name}`;

  // ------------------------ all selects gain an explicit searchable chooser
  let dialog=null,activeSelect=null;
  function ensureDialog(){
    if(dialog)return dialog;
    dialog=document.createElement('div');dialog.className='kda-select-search-dialog';dialog.hidden=true;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Search dropdown options');
    dialog.innerHTML='<div class="kda-select-search-card"><div class="kda-select-search-head"><input type="search" autocomplete="off" placeholder="Type to filter options…" aria-label="Search dropdown options"><button type="button" class="kda-select-search-close" aria-label="Close">×</button></div><div class="kda-select-search-results" role="listbox"></div></div>';
    document.body.appendChild(dialog);
    const input=$('input',dialog),close=$('.kda-select-search-close',dialog);
    const render=()=>{
      const root=$('.kda-select-search-results',dialog),q=input.value.trim().toLowerCase(),options=activeSelect?[...activeSelect.options]:[];
      const shown=options.filter(o=>!q||`${o.textContent} ${o.value}`.toLowerCase().includes(q));
      root.innerHTML=shown.length?shown.map((o,i)=>`<button type="button" role="option" class="kda-select-search-option" data-option-index="${o.index}"${o.disabled?' disabled':''} aria-selected="${o.selected?'true':'false'}"><span>${esc(o.textContent)}</span>${o.selected?'<small>Selected</small>':''}</button>`).join(''):'<div class="kda-select-search-empty">No matching options.</div>';
    };
    input.addEventListener('input',render);
    dialog.addEventListener('click',event=>{
      const btn=event.target.closest('[data-option-index]');
      if(btn&&activeSelect&&!btn.disabled){const o=activeSelect.options[Number(btn.dataset.optionIndex)];if(o){activeSelect.value=o.value;activeSelect.dispatchEvent(new Event('change',{bubbles:true}));closeDialog();}}
      else if(event.target===dialog||event.target.closest('.kda-select-search-close'))closeDialog();
    });
    document.addEventListener('keydown',event=>{if(!dialog.hidden&&event.key==='Escape')closeDialog();});
    dialog._render=render;return dialog;
  }
  function openDialog(select){activeSelect=select;ensureDialog();const input=$('input',dialog);input.value='';dialog.hidden=false;dialog._render();requestAnimationFrame(()=>input.focus());}
  function closeDialog(){if(!dialog)return;dialog.hidden=true;const select=activeSelect;activeSelect=null;select?.focus?.();}
  function upgradeCountyOptions(select){
    const options=[...select.options],matched=options.map(o=>({o,name:normCounty(o.textContent)})).filter(x=>countyNo.has(x.name));
    if(matched.length<20)return;
    const selected=select.value;
    matched.forEach(({o,name})=>{if(o.getAttribute('value')===null)o.value=name;o.textContent=countyLabel(name);o.dataset.countyNumber=String(countyNo.get(name)).padStart(3,'0');});
    const ordered=matched.sort((a,b)=>countyNo.get(a.name)-countyNo.get(b.name)).map(x=>x.o);
    ordered.forEach(o=>select.appendChild(o));
    if([...select.options].some(o=>o.value===selected))select.value=selected;
    select.dataset.countyOrdered='true';
  }
  function enhanceSelect(select){
    upgradeCountyOptions(select);
    let trigger=select.nextElementSibling;
    if(!trigger?.classList.contains('kda-select-search-trigger')){
      trigger=document.createElement('button');trigger.type='button';trigger.className='kda-select-search-trigger';trigger.textContent='⌕';trigger.title='Search this dropdown';
      const label=select.getAttribute('aria-label')||select.closest('label')?.textContent?.replace(select.textContent,'').trim()||'dropdown';
      trigger.setAttribute('aria-label',`Search ${label}`);trigger.addEventListener('click',()=>openDialog(select));select.insertAdjacentElement('afterend',trigger);
    }
    trigger.disabled=select.disabled;
    select.dataset.searchable='true';
  }

  // -------------------------------- clear axes + hover/tap point disclosures
  let tooltip=null,hideTimer=null;
  function ensureTooltip(){if(tooltip)return tooltip;tooltip=document.createElement('div');tooltip.className='kda-chart-tooltip';tooltip.hidden=true;document.body.appendChild(tooltip);return tooltip;}
  function showPoint(point,event,sticky=false){const label=point.dataset.pointLabel||$('title',point)?.textContent||point.getAttribute('aria-label');if(!label)return;ensureTooltip();tooltip.textContent=label;tooltip.hidden=false;const rect=point.getBoundingClientRect(),x=event?.clientX||rect.left+rect.width/2,y=event?.clientY||rect.top;tooltip.style.left=`${Math.max(12,Math.min(window.innerWidth-312,x+12))}px`;tooltip.style.top=`${Math.max(12,y-44)}px`;clearTimeout(hideTimer);if(sticky)hideTimer=setTimeout(()=>tooltip.hidden=true,2800);}
  function hidePoint(){clearTimeout(hideTimer);if(tooltip)tooltip.hidden=true;}
  function enhancePoints(root=document){
    $$('svg circle',root).forEach(point=>{const title=$('title',point),label=point.dataset.pointLabel||title?.textContent;if(!label||point.dataset.chartEnhanced)return;point.dataset.chartEnhanced='true';point.dataset.chartPoint='true';point.dataset.pointLabel=label;point.setAttribute('tabindex','0');point.setAttribute('role','button');point.setAttribute('aria-label',label);point.addEventListener('pointerenter',e=>showPoint(point,e));point.addEventListener('pointerleave',hidePoint);point.addEventListener('focus',e=>showPoint(point,e));point.addEventListener('blur',hidePoint);point.addEventListener('click',e=>showPoint(point,e,true));});
  }
  const svgNS='http://www.w3.org/2000/svg';
  function textNode(svg,{x,y,text,cls='kda-axis-tick',rotate=null,anchor='start'}){const n=document.createElementNS(svgNS,'text');n.setAttribute('x',x);n.setAttribute('y',y);n.setAttribute('class',cls);n.setAttribute('text-anchor',anchor);if(rotate)n.setAttribute('transform',rotate);n.textContent=text;svg.appendChild(n);return n;}
  function numericTitles(svg){return $$('circle title',svg).map(t=>{const raw=t.textContent.replaceAll(',','');const m=raw.match(/(?:KES\s*)?(-?\d+(?:\.\d+)?)(?:\s*million|%|\s*$)/i)||raw.match(/:\s*(?:KES\s*)?(-?\d+(?:\.\d+)?)/i);return m?Number(m[1]):null;}).filter(Number.isFinite);}
  function decorateAxis(svg){
    if(svg.dataset.axesEnhanced)return;let cfg=null;
    if(svg.closest('.ciq-fiscal-chart'))cfg={x:'Fiscal year',y:'Absorption (%)',top:18,bottom:176,left:34,ticks:['100%','50%','0%']};
    else if(svg.closest('.ciq-trend'))cfg={x:'Year',y:'Gross County Product (KES million)',top:24,bottom:248,left:38};
    else if(svg.closest('.chart-card'))cfg={x:'Year',y:'Gross County Product (KES million)',top:45,bottom:180,left:35};
    else if(svg.closest('.large-chart'))cfg={x:'Reference period',y:'Published value',top:25,bottom:185,left:40};
    if(!cfg)return;
    const vb=svg.viewBox?.baseVal,w=vb?.width||740,h=vb?.height||210,mid=(cfg.top+cfg.bottom)/2;
    textNode(svg,{x:w/2,y:h-3,text:cfg.x,cls:'kda-axis-title',anchor:'middle'});
    textNode(svg,{x:10,y:mid,text:cfg.y,cls:'kda-axis-title',rotate:`rotate(-90 10 ${mid})`,anchor:'middle'});
    let ticks=cfg.ticks;
    if(!ticks){const vals=numericTitles(svg);if(vals.length){const min=Math.min(...vals),max=Math.max(...vals),middle=(min+max)/2,fmt=v=>v.toLocaleString('en-KE',{maximumFractionDigits:1});ticks=[fmt(max),fmt(middle),fmt(min)];}}
    if(ticks){[cfg.top,mid,cfg.bottom].forEach((y,i)=>textNode(svg,{x:cfg.left-5,y:y+3,text:ticks[i],anchor:'end'}));}
    svg.dataset.axesEnhanced='true';
  }
  function enhanceCharts(){$$('.ciq-trend svg,.ciq-fiscal-chart svg,.chart-card svg,.large-chart svg').forEach(svg=>decorateAxis(svg));enhancePoints();}

  // ------------------------------------------ source-backed place fact panels
  let factsPromise=null,geoPromise=null,areaPromise=null;
  const getJson=url=>window.KDAData?.fetchJson?window.KDAData.fetchJson(url,{required:true}):fetch(url).then(r=>{if(!r.ok)throw new Error(`${url}: ${r.status}`);return r.json();});
  function loadFacts(){return factsPromise||(factsPromise=getJson('data/place-facts/county-key-facts.json'));}
  function loadGeo(){return geoPromise||(geoPromise=getJson('data/geography/registry/geographies.json'));}
  function loadArea(){return areaPromise||(areaPromise=getJson('data/indicators/seed/derived/area-computed.json'));}
  const fmtInt=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-KE'):'—';
  const fmtArea=v=>Number.isFinite(Number(v))?`${Number(v).toLocaleString('en-KE',{maximumFractionDigits:1})} km²`:'—';
  function factCard(label,value,meta,caution=false){return `<div class="kda-place-fact${caution?' caution':''}"><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(meta)}</span></div>`;}
  function countyPanel(f){
    const doctor=f.health.approximate_doctors_cra2011;
    return `<section class="kda-place-facts" data-place-facts-for="${esc(f.geo_code)}"><div class="kda-place-facts-head"><div><small>Place facts · County ${esc(f.county_number)}</small><h3>${esc(f.name)} at a glance</h3></div><p>Definitions and dates stay visible. County values are never copied down to constituencies or wards.</p></div><div class="kda-place-facts-grid">${[
      factCard('Official land area',fmtArea(f.land_area.value),'KNBS · 2019 census · official'),
      factCard('Facilities assessed',fmtInt(f.health.facilities_assessed_2023),'MoH Health Facility Census · 2023'),
      factCard('Hospitals · Level 4–5',fmtInt(f.health.level4_5_hospitals_2017),'MoH infrastructure baseline · 2017',true),
      factCard('Public primary schools',fmtInt(f.education.public_primary_schools_2023),'TSC establishments · 2023'),
      factCard('Public secondary schools',fmtInt(f.education.public_secondary_schools_2023),'TSC establishments · 2023'),
      factCard('Primary classroom teachers',fmtInt(f.education.primary_classroom_teachers_2023),'TSC · 2023'),
      factCard('Secondary teachers',fmtInt(f.education.secondary_teachers_2023),'TSC · 2023'),
      factCard('Doctors · historical approx.',doctor===null?'Not reported':`≈ ${fmtInt(doctor)}`,'CRA 2011 / KIPPRA 2013 · historical only',true)
    ].join('')}</div><p class="kda-place-facts-sources"><a href="${esc(f.land_area.source_url)}" target="_blank" rel="noopener">KNBS area ↗</a> · <a href="${esc(f.education.source_url)}" target="_blank" rel="noopener">TSC/MoE education ↗</a> · <a href="${esc(f.health.facilities_source_url)}" target="_blank" rel="noopener">MoH 2023 facilities ↗</a> · <a href="${esc(f.health.hospitals_source_url)}" target="_blank" rel="noopener">MoH 2017 hospital baseline ↗</a> · <a href="${esc(f.health.doctors_source_url)}" target="_blank" rel="noopener">KIPPRA doctor baseline ↗</a>. RCMRD is recorded as a spatial boundary cross-check; KNBS is the numeric county-area authority.</p></section>`;
  }
  async function renderCountyPanels(){
    let data;try{data=await loadFacts();}catch(error){console.warn('Place facts:',error);return;}
    const byCode=new Map(data.counties.map(f=>[f.geo_code,f])),byName=new Map(data.counties.map(f=>[f.name,f]));
    const ciq=$('#ciq-county-select'),ciqHost=$('#ciq-metrics');if(ciq&&ciqHost){const f=byCode.get(ciq.value)||byName.get(normCounty(ciq.options[ciq.selectedIndex]?.textContent));let panel=$('#ciq-place-facts');if(!panel){panel=document.createElement('div');panel.id='ciq-place-facts';ciqHost.insertAdjacentElement('afterend',panel);}if(f&&panel.dataset.geoCode!==f.geo_code){panel.innerHTML=countyPanel(f);panel.dataset.geoCode=f.geo_code;}}
    const profile=$('#county-picker'),facts=$('.quick-facts');if(profile&&facts){const f=byName.get(normCounty(profile.options[profile.selectedIndex]?.textContent))||byName.get(normCounty(profile.value));let panel=$('#profile-place-facts');if(!panel){panel=document.createElement('div');panel.id='profile-place-facts';facts.insertAdjacentElement('afterend',panel);}if(f&&panel.dataset.geoCode!==f.geo_code){panel.innerHTML=countyPanel(f);panel.dataset.geoCode=f.geo_code;}}
  }
  async function renderSmallArea(){
    const summary=$('#geo-selected-summary');if(!summary||summary.hidden||!summary.dataset.geoCode)return;
    try{
      const [facts,geos,areas]=await Promise.all([loadFacts(),loadGeo(),loadArea()]);const code=summary.dataset.geoCode,geo=geos.find(g=>g.geo_code===code);if(!geo)return;
      let box=$('.kda-small-area-facts',summary);if(!box){box=document.createElement('div');box.className='kda-small-area-facts';summary.appendChild(box);}
      if(geo.level==='county'){const f=facts.counties.find(x=>x.geo_code===code);box.innerHTML=f?`<strong>Official land area:</strong> ${esc(fmtArea(f.land_area.value))} · KNBS 2019. <span>Institutional county facts are available in the full county profile.</span>`:'';}
      else {const row=areas.results.find(x=>x.geo_code===code);box.innerHTML=`<strong>${esc(geo.level[0].toUpperCase()+geo.level.slice(1))} area:</strong> ${esc(fmtArea(row?.area_km2))} · boundary-derived estimate. <span>County school, teacher, hospital, facility and doctor counts are not inherited to this ${esc(geo.level)}.</span>`;}
    }catch(error){console.warn('Small-area facts:',error);}
  }

  let refreshPending=false;
  function refresh(){refreshPending=false;$$('select').forEach(enhanceSelect);enhanceCharts();renderCountyPanels();renderSmallArea();}
  function schedule(){if(refreshPending)return;refreshPending=true;requestAnimationFrame(refresh);}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','hidden','data-geo-code']});
  document.addEventListener('change',event=>{if(event.target.matches('select'))setTimeout(()=>{schedule();renderCountyPanels();renderSmallArea();},0);},true);
  window.addEventListener('kda:route',schedule);window.addEventListener('hashchange',()=>setTimeout(renderSmallArea,50));
  schedule();
})();
