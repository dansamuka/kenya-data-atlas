/* Kenya Data Atlas — shared browser data loader.
 *
 * P01 contract:
 * - every registry/JSON request shares one promise/cache;
 * - heavy registries and D3 are loaded only on demand;
 * - legacy integrations that still call fetch() are bridged through the same
 *   cache so they cannot create duplicate network downloads;
 * - failures resolve to null/[] at the caller boundary rather than taking down
 *   the static shell.
 */
(function(){
  'use strict';

  const nativeFetch=window.fetch.bind(window);
  const jsonCache=new Map();
  const textCache=new Map();
  const scriptCache=new Map();
  const styleCache=new Map();
  const metrics={networkJson:0,cacheHits:0,networkText:0,scripts:0,styles:0};

  const REGISTRY={
    geographies:'data/geography/registry/geographies.json',
    indicators:'data/indicators/registry/indicators.json',
    series:'data/indicators/registry/series.json',
    observations:'data/indicators/registry/observations.json',
    units:'data/indicators/registry/units.json',
    agencies:'data/catalogue/registry/agencies.json',
    sources:'data/catalogue/registry/sources.json',
    datasets:'data/catalogue/registry/datasets.json',
    releases:'data/catalogue/registry/releases.json',
    worldbankDisplay:'data/indicators/registry/worldbank-display.json',
    crossLevelEligibility:'data/indicators/registry/cross-level-eligibility.json'
  };
  const GEOMETRY={
    country:'data/geography/geometry/country.geojson',
    county:'data/geography/geometry/counties.geojson',
    constituency:'data/geography/geometry/constituencies.geojson',
    ward:'data/geography/geometry/wards.geojson'
  };

  function normalizeUrl(input){
    try{
      const raw=input instanceof Request?input.url:String(input);
      const url=new URL(raw,location.href);
      if(url.origin!==location.origin) return raw;
      const basePath=new URL('.',location.href).pathname;
      const rel=url.pathname.startsWith(basePath)?url.pathname.slice(basePath.length):url.pathname.replace(/^\//,'');
      return rel+url.search;
    }catch{return String(input);}
  }

  function isLocalDataJson(key){
    const clean=String(key).split('?')[0];
    return clean.startsWith('data/')&&(clean.endsWith('.json')||clean.endsWith('.geojson'));
  }

  function isLocalDataAsset(key){
    const clean=String(key).split('?')[0];
    return clean.startsWith('data/');
  }

  function requestCacheMode(key){
    // Atlas data is release-driven. Revalidate local data assets on each page
    // load so a newly deployed registry cannot remain hidden behind a stale
    // browser cache. The in-memory promise cache still guarantees one network
    // request per asset per page session, and unchanged files can resolve via
    // normal HTTP validators (ETag/Last-Modified).
    return isLocalDataAsset(key)?'no-cache':'default';
  }

  async function fetchJson(url,{required=false}={}){
    const key=normalizeUrl(url);
    if(jsonCache.has(key)){
      metrics.cacheHits+=1;
      return jsonCache.get(key);
    }
    const promise=(async()=>{
      try{
        metrics.networkJson+=1;
        const response=await nativeFetch(url,{cache:requestCacheMode(key)});
        if(!response.ok) throw new Error(`${key} (${response.status})`);
        return await response.json();
      }catch(error){
        if(required) throw error;
        console.warn('KDA data load:',error?.message||error);
        return null;
      }
    })();
    jsonCache.set(key,promise);
    return promise;
  }

  async function fetchText(url,{required=false}={}){
    const key=normalizeUrl(url);
    if(textCache.has(key)){
      metrics.cacheHits+=1;
      return textCache.get(key);
    }
    const promise=(async()=>{
      try{
        metrics.networkText+=1;
        const response=await nativeFetch(url,{cache:requestCacheMode(key)});
        if(!response.ok) throw new Error(`${key} (${response.status})`);
        return await response.text();
      }catch(error){
        if(required) throw error;
        console.warn('KDA text load:',error?.message||error);
        return null;
      }
    })();
    textCache.set(key,promise);
    return promise;
  }

  function parseCsv(text){
    if(!text) return [];
    const lines=String(text).replace(/^\uFEFF/,'').trim().split(/\r?\n/);
    const header=parseCsvLine(lines.shift()||'');
    return lines.filter(Boolean).map(line=>{
      const cells=parseCsvLine(line);
      return Object.fromEntries(header.map((name,index)=>[name,cells[index]??'']));
    });
  }

  function parseCsvLine(line){
    const cells=[];let value='';let quoted=false;
    for(let i=0;i<line.length;i+=1){
      const ch=line[i];
      if(ch==='"'){
        if(quoted&&line[i+1]==='"'){value+='"';i+=1;}
        else quoted=!quoted;
      }else if(ch===','&&!quoted){cells.push(value);value='';}
      else value+=ch;
    }
    cells.push(value);
    return cells;
  }

  async function csv(url,options){
    return parseCsv(await fetchText(url,options));
  }

  function registry(name,options){
    if(!REGISTRY[name]) throw new Error(`Unknown Atlas registry: ${name}`);
    return fetchJson(REGISTRY[name],options);
  }

  async function registries(names,options){
    return Promise.all(names.map(name=>registry(name,options)));
  }

  function geometry(level,options){
    if(!GEOMETRY[level]) throw new Error(`Unknown Atlas geometry level: ${level}`);
    return fetchJson(GEOMETRY[level],options);
  }

  function initialPulse(){
    return fetchJson('data/ui/initial-pulse.json',{required:true});
  }

  function loadStyle(href,{id}={}){
    const key=id||href;
    if(styleCache.has(key)) return styleCache.get(key);
    const promise=new Promise((resolve,reject)=>{
      const existing=id?document.getElementById(id):document.querySelector(`link[data-kda-href="${CSS.escape(href)}"]`);
      if(existing){
        if(existing.dataset.loaded==='true'||existing.sheet) return resolve(existing);
        existing.addEventListener('load',()=>resolve(existing),{once:true});
        existing.addEventListener('error',()=>reject(new Error(`Stylesheet failed: ${href}`)),{once:true});
        return;
      }
      metrics.styles+=1;
      const link=document.createElement('link');
      if(id) link.id=id;
      link.rel='stylesheet';link.href=href;link.dataset.kdaHref=href;
      link.addEventListener('load',()=>{link.dataset.loaded='true';resolve(link);},{once:true});
      link.addEventListener('error',()=>reject(new Error(`Stylesheet failed: ${href}`)),{once:true});
      document.head.appendChild(link);
    });
    styleCache.set(key,promise);
    return promise;
  }

  function loadScript(src,{id}={}){
    const key=id||src;
    if(scriptCache.has(key)) return scriptCache.get(key);
    const promise=new Promise((resolve,reject)=>{
      const existing=id?document.getElementById(id):document.querySelector(`script[data-kda-src="${CSS.escape(src)}"]`);
      if(existing){
        if(existing.dataset.loaded==='true') return resolve(existing);
        existing.addEventListener('load',()=>resolve(existing),{once:true});
        existing.addEventListener('error',()=>reject(new Error(`Script failed: ${src}`)),{once:true});
        return;
      }
      metrics.scripts+=1;
      const script=document.createElement('script');
      if(id) script.id=id;
      script.src=src;
      script.async=true;
      script.dataset.kdaSrc=src;
      script.addEventListener('load',()=>{script.dataset.loaded='true';resolve(script);},{once:true});
      script.addEventListener('error',()=>reject(new Error(`Script failed: ${src}`)),{once:true});
      document.head.appendChild(script);
    });
    scriptCache.set(key,promise);
    return promise;
  }

  async function ensureD3(){
    if(window.d3) return window.d3;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js',{id:'kda-d3'});
    if(!window.d3) throw new Error('D3 loaded without exposing window.d3');
    return window.d3;
  }

  function whenVisible(target,callback,{rootMargin='500px 0px',threshold=0.01}={}){
    const element=typeof target==='string'?document.querySelector(target):target;
    if(!element) return ()=>{};
    let fired=false;
    const run=()=>{
      if(fired) return;
      fired=true;
      Promise.resolve().then(callback).catch(error=>console.error('KDA lazy task:',error));
    };
    if(!('IntersectionObserver' in window)){
      const id=setTimeout(run,0);
      return ()=>clearTimeout(id);
    }
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){
        observer.disconnect();
        run();
      }
    },{rootMargin,threshold});
    observer.observe(element);
    return ()=>observer.disconnect();
  }

  function stats(){
    return {...metrics,jsonCacheEntries:jsonCache.size,textCacheEntries:textCache.size,scriptCacheEntries:scriptCache.size,styleCacheEntries:styleCache.size};
  }

  /* Compatibility bridge for legacy, lazily loaded integrations. Any GET for
   * a local data/*.json or *.geojson file is served through the promise cache.
   * New P01 modules call KDAData directly; this bridge prevents older optional
   * layers from re-downloading the same multi-megabyte registry. */
  window.fetch=async function(input,init){
    const method=String(init?.method||'GET').toUpperCase();
    const key=normalizeUrl(input);
    if(method==='GET'&&isLocalDataJson(key)){
      const data=await fetchJson(input,{required:true});
      return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','X-KDA-Cache':'shared'}});
    }
    return nativeFetch(input,init);
  };

  window.KDAData={
    paths:{registry:{...REGISTRY},geometry:{...GEOMETRY}},
    fetchJson,fetchText,csv,parseCsv,registry,registries,geometry,initialPulse,
    loadStyle,loadScript,ensureD3,whenVisible,stats,
    clear(url){
      const key=normalizeUrl(url);
      jsonCache.delete(key);textCache.delete(key);
    }
  };
})();
