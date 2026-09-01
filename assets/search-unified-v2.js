/* Kenya Data Atlas — one alias-aware search system for desktop + mobile. */
(function(){
  'use strict';
  const KDA=window.KDAData,R=window.KDARouter;if(!KDA)return;
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm=v=>String(v??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const pages=[
    ['Home','Kenya Data Atlas overview and national snapshot','#/','home overview national snapshot kenya'],
    ['National Pulse','Headline Kenya indicators and national series','#/pulse','pulse inflation exchange rate treasury bill population voters'],
    ['Explore Kenya','County, constituency and ward map explorer','#/explore','explore map county constituency ward geography'],
    ['Compare places','Compare places within and across geographic levels','#/compare','compare county constituency ward eligibility'],
    ['Series Explorer','Time series, observations and sources','#/series/KDA-CPI-YOY-KEN','series history revisions observations trend'],
    ['Data & sources','Dataset catalogue and source lineage','#/data','data sources catalogue datasets download lineage'],
    ['County Rankings & Insights','Rankings, development snapshot and fiscal delivery','#/rankings','rankings development fiscal delivery'],
    ['CountyIQ','County context, evidence, opportunities and fiscal history','#/countyiq','countyiq evidence opportunities fiscal']
  ].map(([label,sub,route,keywords])=>({kind:'page',label,sub,route,keywords}));
  let indexPromise=null,lastQuery='',activeIndex=-1,currentItems=[];
  const recentKey='kda-v2-search-recent';
  function recent(){try{return JSON.parse(sessionStorage.getItem(recentKey)||'[]');}catch(_){return[];}}
  function remember(item){try{const key=`${item.kind}|${item.label}|${item.route||''}`,rows=[{kind:item.kind,label:item.label,sub:item.sub,route:item.route,geoCode:item.geoCode,geoId:item.geoId,countyCode:item.countyCode,searchText:item.searchText,keywords:item.keywords},...recent().filter(x=>`${x.kind}|${x.label}|${x.route||''}`!==key)].slice(0,6);sessionStorage.setItem(recentKey,JSON.stringify(rows));}catch(_){}}
  function score(item,q){const label=norm(item.label),text=norm(`${item.label} ${item.sub||''} ${item.keywords||''} ${item.code||''}`);if(!q)return 0;if(!text.includes(q))return 0;if(label===q)return 120;if(label.startsWith(q))return 95;if(label.split(' ').some(x=>x.startsWith(q)))return 72;if(text.split(' ').some(x=>x.startsWith(q)))return 50;return 24;}
  async function buildIndex(){
    if(indexPromise)return indexPromise;
    indexPromise=(async()=>{
      const [[geographies,indicators,series,datasets],aliases,evidence,opps]=await Promise.all([
        KDA.registries(['geographies','indicators','series','datasets'],{required:true}),
        KDA.fetchJson('data/geography/registry/aliases.json',{required:false}),
        KDA.fetchJson('data/evidence/county-documents.json',{required:false}),
        KDA.fetchJson('data/opportunities/opportunity-registry.json',{required:false})
      ]);
      const geos=Array.isArray(geographies)?geographies:[],inds=Array.isArray(indicators)?indicators:[],ss=Array.isArray(series)?series:[],sets=Array.isArray(datasets)?datasets:[],als=Array.isArray(aliases)?aliases:[];
      const aliasByGeo=new Map();for(const a of als){if(!aliasByGeo.has(a.geography_id))aliasByGeo.set(a.geography_id,[]);aliasByGeo.get(a.geography_id).push(a.alias||a.normalized_alias);}
      const geoById=new Map(geos.map(x=>[x.geography_id,x])),indicatorById=new Map(inds.map(x=>[x.indicator_id,x]));
      const countryIds=new Set(geos.filter(g=>g.level==='country').map(g=>g.geography_id)),preferredSeries=new Map();
      for(const s of ss){const cur=preferredSeries.get(s.indicator_id);if(!cur||countryIds.has(s.geography_id))preferredSeries.set(s.indicator_id,s);}
      const rows=[...pages];
      for(const g of geos){const aliasesFor=(aliasByGeo.get(g.geography_id)||[]).filter(Boolean);rows.push({kind:'geo',label:g.name,sub:`${String(g.level||'place').replace(/^./,c=>c.toUpperCase())} · ${g.geo_code||''}`,route:'#/explore',geoId:g.geography_id,geoCode:g.geo_code,keywords:`${g.level||''} ${g.geo_code||''} ${aliasesFor.join(' ')}`});}
      for(const i of inds){const s=preferredSeries.get(i.indicator_id);rows.push({kind:'indicator',label:i.name,sub:`Indicator · ${i.topic||'Data'}${s?` · ${s.series_code}`:''}`,route:s?`#/series/${encodeURIComponent(s.series_code)}`:'#/data',code:i.indicator_code,keywords:`${i.short_name||''} ${i.topic||''} ${i.subtopic||''} ${i.indicator_code||''}`});}
      for(const s of ss)if(countryIds.has(s.geography_id)){const i=indicatorById.get(s.indicator_id),g=geoById.get(s.geography_id);rows.push({kind:'series',label:i?.name||s.series_code,sub:`Series · ${g?.name||'Kenya'} · ${s.series_code}`,route:`#/series/${encodeURIComponent(s.series_code)}`,code:s.series_code,keywords:`${i?.short_name||''} ${i?.topic||''} ${s.series_code}`});}
      for(const d of sets)if(['approved','published'].includes(d.publication_status))rows.push({kind:'dataset',label:d.title,sub:`Dataset · ${d.topic||'Data'} · ${d.dataset_code||''}`,route:'#/data',code:d.dataset_code,keywords:`${d.topic||''} ${(d.geographic_coverage||[]).join(' ')} ${d.publisher||''} ${d.known_limitations||''}`});
      for(const county of evidence?.counties||[])for(const d of county.documents||[])rows.push({kind:'evidence',label:d.title,sub:`Official evidence · ${county.county_name} · ${d.publisher||''}`,route:'#/countyiq',countyCode:county.geo_code,searchText:d.title,keywords:`${d.family||''} ${d.period||''} ${d.publisher||''} ${county.county_name||''}`});
      for(const p of opps?.programmes||[])rows.push({kind:'opportunity',label:p.name,sub:`Opportunity · ${p.provider||''}`,route:'#/countyiq',keywords:`${p.opportunity_type||''} ${(p.beneficiaries||[]).join(' ')} ${p.terms_note||''} ${p.window_note||''}`});
      return rows;
    })().catch(error=>{console.warn('Unified Atlas search:',error?.message||error);return pages;});
    return indexPromise;
  }
  async function results(q){const query=norm(q);if(!query)return recent();const idx=await buildIndex();return idx.map(item=>({item,s:score(item,query)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s||a.item.label.localeCompare(b.item.label)).slice(0,30).map(x=>x.item);}
  function render(root,items,{mobile=false}={}){currentItems=items;activeIndex=items.length?0:-1;root._kdaSearchItems=items;root.innerHTML=items.length?items.map((x,i)=>`<button class="search-result site-search-result${i===0?' active':''}" role="option" aria-selected="${i===0?'true':'false'}" data-site-result="${i}" data-kind="${esc(x.kind)}"><span><b>${esc(x.label)}</b><em>${esc(x.kind)}</em></span><small>${esc(x.sub||'')}</small></button>`).join(''):`<div class="search-result site-search-empty"><span>No results found</span><small>Try a place, alias, indicator, dataset, document or opportunity.</small></div>`;root.hidden=false;$$('[data-site-result]',root).forEach(button=>button.onclick=e=>activate(items[Number(button.dataset.siteResult)],{pinOnly:(e.metaKey||e.ctrlKey),mobile}));}
  function move(root,delta){if(!currentItems.length)return;activeIndex=(activeIndex+delta+currentItems.length)%currentItems.length;$$('[data-site-result]',root).forEach((b,i)=>{const on=i===activeIndex;b.classList.toggle('active',on);b.setAttribute('aria-selected',on?'true':'false');if(on)b.scrollIntoView({block:'nearest'});});}
  function keydown(e,root,mobile){if(e.key==='ArrowDown'){e.preventDefault();move(root,1);}else if(e.key==='ArrowUp'){e.preventDefault();move(root,-1);}else if(e.key==='Enter'&&activeIndex>=0){e.preventDefault();activate(currentItems[activeIndex],{pinOnly:e.metaKey||e.ctrlKey,mobile});}else if(e.key==='Escape'){root.hidden=true;}}
  function setCounty(code){if(!code)return;let tries=0;const run=()=>{const select=$('#ciq-county-select');if(select&&[...select.options].some(o=>o.value===code)){select.value=code;select.dispatchEvent(new Event('change',{bubbles:true}));return;}if(tries++<30)setTimeout(run,120);};run();}
  function selectGeography(geoId){if(!geoId)return;let tries=0;const run=async()=>{if(window.KDAGeo?.selectGeography){try{await window.KDAGeo.selectGeography(geoId);return;}catch(_){}}if(tries++<40)setTimeout(run,100);};run();}
  async function activate(item,{pinOnly=false,mobile=false}={}){
    if(!item)return;remember(item);
    if(pinOnly&&item.kind==='geo'&&window.KDAV2?.pin){await window.KDAV2.pin(item.geoCode||item.geoId);closeAll();return;}
    location.hash=item.route||'#/';
    if(item.kind==='geo'&&item.geoId)selectGeography(item.geoId);
    if(item.kind==='evidence'){setCounty(item.countyCode);let tries=0;const reveal=()=>{const field=$('#ciq-evidence-search');if(field){field.value=item.searchText||item.label;field.dispatchEvent(new Event('input',{bubbles:true}));field.scrollIntoView({behavior:'smooth',block:'center'});return;}if(tries++<30)setTimeout(reveal,120);};reveal();}
    if(item.kind==='opportunity'){let tries=0;const reveal=()=>{const card=$('#ciq-opportunity-finder');if(card){card.scrollIntoView({behavior:'smooth',block:'start'});return;}if(tries++<30)setTimeout(reveal,120);};reveal();}
    closeAll();
  }
  function closeAll(){const home=$('#search-results');if(home)home.hidden=true;const sheet=$('#kda-v2-search-sheet');if(sheet){sheet.hidden=true;document.body.classList.remove('v2-sheet-open');}}
  async function search(q,{root=$('#search-results'),mobile=false}={}){lastQuery=String(q||'');if(!root)return;const query=lastQuery;if(query.trim())root.innerHTML='<div class="search-result"><span>Searching the Atlas…</span><small>Canonical places + aliases, indicators, datasets, documents and opportunities</small></div>';const items=await results(query);if(String(lastQuery)!==query)return;render(root,items,{mobile});}
  function bindHome(){const input=$('#atlas-search'),root=$('#search-results');if(!input||!root||input.dataset.unifiedV2)return;input.dataset.unifiedV2='1';input.oninput=e=>search(e.target.value,{root});input.onfocus=()=>search(input.value,{root});input.onkeydown=e=>keydown(e,root,false);$$('[data-search]').forEach(b=>b.onclick=()=>{input.value=b.dataset.search||'';input.focus();search(input.value,{root});});}
  function enhanceMobileSheet(sheet){if(!sheet||sheet.dataset.unifiedV2)return;sheet.dataset.unifiedV2='1';const input=$('#kda-v2-search-input',sheet),root=$('#kda-v2-search-results',sheet);if(!input||!root)return;input.oninput=e=>search(e.target.value,{root,mobile:true});input.onkeydown=e=>keydown(e,root,true);$$('.v2-search-chips button',sheet).forEach(b=>b.onclick=()=>{input.value=b.textContent;search(input.value,{root,mobile:true});});if(('webkitSpeechRecognition'in window)||('SpeechRecognition'in window)){const mic=document.createElement('button');mic.type='button';mic.className='v2-search-voice';mic.setAttribute('aria-label','Search by voice');mic.textContent='🎙';input.insertAdjacentElement('afterend',mic);mic.onclick=()=>{const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition,r=new Recognition();r.lang='en-KE';r.onresult=e=>{input.value=e.results?.[0]?.[0]?.transcript||'';search(input.value,{root,mobile:true});};r.start();};}search('',{root,mobile:true});}
  function open(){const input=$('#atlas-search');if((R?.current?.()?.view||R?.parse?.()?.view)!=='home')location.hash='#/';setTimeout(()=>{input?.focus();if(input)search(input.value,{root:$('#search-results')});},0);}
  function boot(){bindHome();$$('#kda-v2-search-sheet').forEach(enhanceMobileSheet);}
  new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n instanceof Element){if(n.id==='kda-v2-search-sheet')enhanceMobileSheet(n);n.querySelectorAll?.('#kda-v2-search-sheet').forEach(enhanceMobileSheet);}}).observe(document.body,{childList:true,subtree:true});
  window.KDASiteSearch={boot,search,open,buildIndex};boot();
})();
