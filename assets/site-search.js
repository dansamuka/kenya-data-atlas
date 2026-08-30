/* Kenya Data Atlas — universal site search, loaded on demand. */
(function(){
  'use strict';
  const KDA=window.KDAData;if(!KDA)return;
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const norm=v=>String(v??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  let booted=false,indexPromise=null,lastQuery='';

  const pages=[
    {kind:'page',label:'Home',sub:'Kenya Data Atlas overview and national snapshot',route:'#/',keywords:'home overview national snapshot search kenya'},
    {kind:'page',label:'National Pulse',sub:'Headline Kenya indicators and national series',route:'#/pulse',keywords:'pulse inflation exchange rate treasury bill population voters world bank national indicators'},
    {kind:'page',label:'Explore Kenya',sub:'County, constituency and ward map explorer',route:'#/explore',keywords:'explore map county constituency ward geography choropleth'},
    {kind:'page',label:'Compare places',sub:'Compare county indicators side by side',route:'#/compare',keywords:'compare county places metrics life elsewhere'},
    {kind:'page',label:'Series Explorer',sub:'Time series, observations and sources',route:'#/series/KDA-CPI-YOY-KEN',keywords:'series history observations trend time data'},
    {kind:'page',label:'Data & sources',sub:'Dataset catalogue and downloadable registries',route:'#/data',keywords:'data sources catalogue datasets download csv api registry'},
    {kind:'page',label:'County Rankings & Insights',sub:'Rankings, development snapshot and fiscal delivery',route:'#/rankings',keywords:'rankings insights development fiscal delivery strengths gaps recognition'},
    {kind:'page',label:'CountyIQ',sub:'County context, evidence, opportunities and fiscal history',route:'#/countyiq',keywords:'countyiq county intelligence evidence documents opportunities fiscal health education agriculture connectivity'}
  ];

  function score(item,q){
    const label=norm(item.label),text=norm(`${item.label} ${item.sub||''} ${item.keywords||''} ${item.code||''}`);
    if(!text.includes(q))return 0;
    if(label===q)return 100;
    if(label.startsWith(q))return 80;
    if(label.split(' ').some(x=>x.startsWith(q)))return 62;
    if(text.split(' ').some(x=>x.startsWith(q)))return 42;
    return 20;
  }
  function routeForSeries(series,indicatorById,geoById){
    const i=indicatorById.get(series.indicator_id),g=geoById.get(series.geography_id);
    return {kind:'series',label:i?.name||series.series_code,sub:`Series · ${g?.name||'Kenya'} · ${series.series_code}`,route:`#/series/${encodeURIComponent(series.series_code)}`,code:series.series_code,keywords:`${i?.short_name||''} ${i?.topic||''} ${g?.name||''} ${series.series_code}`};
  }
  async function buildIndex(){
    if(indexPromise)return indexPromise;
    indexPromise=(async()=>{
      const base=await KDA.registries(['geographies','indicators','series','datasets']);
      const geographies=Array.isArray(base[0])?base[0]:[],indicators=Array.isArray(base[1])?base[1]:[],series=Array.isArray(base[2])?base[2]:[],datasets=Array.isArray(base[3])?base[3]:[];
      const geoById=new Map(geographies.map(x=>[x.geography_id,x])),indicatorById=new Map(indicators.map(x=>[x.indicator_id,x]));
      const countryIds=new Set(geographies.filter(g=>g.level==='country').map(g=>g.geography_id));
      const preferredSeries=new Map();
      for(const s of series){if(!preferredSeries.has(s.indicator_id)||countryIds.has(s.geography_id))preferredSeries.set(s.indicator_id,s);}
      const rows=[...pages];
      for(const g of geographies)rows.push({kind:'geo',label:g.name,sub:`${String(g.level||'place').replace(/^./,c=>c.toUpperCase())} · ${g.geo_code||''}`,route:'#/explore',geoId:g.geography_id,geoCode:g.geo_code,keywords:`${g.level||''} ${g.geo_code||''}`});
      for(const i of indicators){const s=preferredSeries.get(i.indicator_id);rows.push({kind:'indicator',label:i.name,sub:`Indicator · ${i.topic||'Data'}${s?` · ${s.series_code}`:''}`,route:s?`#/series/${encodeURIComponent(s.series_code)}`:'#/data',code:i.indicator_code,keywords:`${i.short_name||''} ${i.topic||''} ${i.subtopic||''} ${i.indicator_code||''}`});}
      for(const s of series)if(countryIds.has(s.geography_id))rows.push(routeForSeries(s,indicatorById,geoById));
      for(const d of datasets)if(['approved','published'].includes(d.publication_status))rows.push({kind:'dataset',label:d.title,sub:`Dataset · ${d.topic||'Data'} · ${d.dataset_code||''}`,route:'#/data',code:d.dataset_code,keywords:`${d.topic||''} ${(d.geographic_coverage||[]).join(' ')} ${d.publisher||''} ${d.known_limitations||''}`});

      const [evidence,opps]=await Promise.all([
        KDA.fetchJson('data/evidence/county-documents.json',{required:false}),
        KDA.fetchJson('data/opportunities/opportunity-registry.json',{required:false})
      ]);
      for(const county of evidence?.counties||[])for(const d of county.documents||[])rows.push({kind:'evidence',label:d.title,sub:`Official evidence · ${county.county_name} · ${d.publisher||''}`,route:'#/countyiq',countyCode:county.geo_code,searchText:d.title,keywords:`${d.family||''} ${d.period||''} ${d.publisher||''} ${county.county_name||''}`});
      for(const p of opps?.programmes||[])rows.push({kind:'opportunity',label:p.name,sub:`Opportunity · ${p.provider||''}`,route:'#/countyiq',keywords:`${p.opportunity_type||''} ${(p.beneficiaries||[]).join(' ')} ${p.terms_note||''} ${p.window_note||''}`});
      return rows;
    })().catch(error=>{console.warn('Atlas search index:',error?.message||error);return pages;});
    return indexPromise;
  }

  function render(items){
    const root=$('#search-results');if(!root)return;
    root.innerHTML=items.length?items.map((x,i)=>`<button class="search-result site-search-result" role="option" data-site-result="${i}" data-kind="${esc(x.kind)}"><span><b>${esc(x.label)}</b><em>${esc(x.kind)}</em></span><small>${esc(x.sub||'')}</small></button>`).join(''):'<div class="search-result site-search-empty"><span>No results found</span><small>Try a place, indicator, dataset, document, opportunity or page name.</small></div>';
    root.hidden=false;root._siteItems=items;
    $$('[data-site-result]',root).forEach(button=>button.onclick=()=>activate(root._siteItems?.[Number(button.dataset.siteResult)]));
  }
  async function search(q){
    const root=$('#search-results'),query=norm(q);lastQuery=String(q||'');if(!root)return;
    if(!query){root.hidden=true;return;}
    root.innerHTML='<div class="search-result"><span>Searching the Atlas…</span><small>Places, indicators, series, datasets, documents, opportunities and pages</small></div>';root.hidden=false;
    const index=await buildIndex();if(norm(lastQuery)!==query)return;
    const ranked=index.map(item=>({item,s:score(item,query)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s||a.item.label.localeCompare(b.item.label));
    const counts=new Map(),found=[];
    for(const x of ranked){const n=counts.get(x.item.kind)||0;if(n>=4)continue;counts.set(x.item.kind,n+1);found.push(x.item);if(found.length>=12)break;}
    render(found);
  }
  function setCounty(code){
    if(!code)return;
    let tries=0;const run=()=>{const select=$('#ciq-county-select');if(select&&[...select.options].some(o=>o.value===code)){select.value=code;select.dispatchEvent(new Event('change',{bubbles:true}));return;}if(tries++<30)setTimeout(run,120);};run();
  }
  function selectGeography(geoId){
    if(!geoId)return;
    let tries=0;const run=async()=>{
      if(window.KDAGeo?.selectGeography){try{await window.KDAGeo.selectGeography(geoId);return;}catch(_){/* retry while the route is still initializing */}}
      if(tries++<40)setTimeout(run,100);
    };run();
  }
  function activate(item){
    if(!item)return;const root=$('#search-results'),input=$('#atlas-search');if(root)root.hidden=true;if(input)input.value=item.label;
    location.hash=item.route||'#/';
    if(item.kind==='geo'&&item.geoId)selectGeography(item.geoId);
    if(item.kind==='evidence'){
      setCounty(item.countyCode);let tries=0;const reveal=()=>{const field=$('#ciq-evidence-search');if(field){field.value=item.searchText||item.label;field.dispatchEvent(new Event('input',{bubbles:true}));field.scrollIntoView({behavior:'smooth',block:'center'});return;}if(tries++<30)setTimeout(reveal,120);};reveal();
    }
    if(item.kind==='opportunity'){let tries=0;const reveal=()=>{const card=$('#ciq-opportunity-finder');if(card){card.scrollIntoView({behavior:'smooth',block:'start'});return;}if(tries++<30)setTimeout(reveal,120);};reveal();}
  }
  function open(){const input=$('#atlas-search');if(!input)return;if((window.KDARouter?.current?.()?.view||'home')!=='home')location.hash='#/';setTimeout(()=>{input.focus();if(input.value)search(input.value);},0);}
  function boot(){
    if(booted)return;booted=true;const input=$('#atlas-search'),root=$('#search-results');if(!input||!root)return;
    input.placeholder='Search places, indicators, datasets or documents…';
    input.oninput=e=>search(e.target.value);input.onfocus=()=>{if(input.value)search(input.value);};
    $$('[data-search]').forEach(button=>button.onclick=()=>{input.value=button.dataset.search||'';input.focus();search(input.value);});
    $$('[data-focus-search]').forEach(button=>button.onclick=open);
    document.addEventListener('click',event=>{if(!event.target.closest('.search-shell')&&!event.target.closest('[data-focus-search]'))root.hidden=true;});
    document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&String(event.key).toLowerCase()==='k'){event.preventDefault();open();}});
  }
  window.KDASiteSearch={boot,search,open,buildIndex};
  boot();
})();
