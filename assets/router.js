/* Kenya Data Atlas — static hash router.
 * GitHub Pages-compatible view routing with legacy-hash canonicalisation.
 */
(function(){
  'use strict';
  const VIEW_IDS=new Set(['home','pulse','explore','compare','series','data','methods','countyiq']);
  const TITLES={home:'Kenya Data Atlas — Understand Kenya through data',pulse:'National Pulse — Kenya Data Atlas',explore:'Explore places — Kenya Data Atlas',compare:'Compare places — Kenya Data Atlas',series:'Series Explorer — Kenya Data Atlas',data:'Data Catalogue — Kenya Data Atlas',methods:'Methods & Comparability — Kenya Data Atlas',countyiq:'CountyIQ — Kenya Data Atlas'};
  const DYNAMIC_VIEW_IDS=new Map([['cross-level-compare','explore']]);
  const rawPush=history.pushState.bind(history),rawReplace=history.replaceState.bind(history);
  let current=null,rendering=false;

  function canonicalHash(input){
    let hash=String(input||'');
    if(hash==='#main')return current?.hash||'#/';
    if(!hash||hash==='#'||hash==='#home')return '#/';
    if(hash.startsWith('#map/'))return '#/explore/'+hash.slice(5);
    const legacy={ '#explore':'#/explore','#geo-explorer':'#/explore','#profile':'#/explore','#compare':'#/compare','#series':'#/series/KDA-CPI-YOY-KEN','#catalogue':'#/data','#data':'#/data','#methods':'#/methods','#countyiq':'#/countyiq','#county-dashboard':'#/countyiq' };
    return legacy[hash]||hash;
  }
  function canonicalUrl(url){
    if(typeof url!=='string')return url;
    const i=url.indexOf('#');if(i<0)return url;
    return url.slice(0,i)+canonicalHash(url.slice(i));
  }
  function parse(hash=location.hash){
    const canonical=canonicalHash(hash);
    const raw=canonical.replace(/^#\//,'');
    const q=raw.indexOf('?');
    const path=(q>=0?raw.slice(0,q):raw).replace(/^\/+|\/+$/g,'');
    const query=q>=0?raw.slice(q+1):'';
    const parts=path?path.split('/').map(decodeURIComponent):[];
    const view=VIEW_IDS.has(parts[0])?parts[0]:'home';
    const rest=parts.slice(1).join('/');
    return{view,rest,parts,params:new URLSearchParams(query),hash:canonical};
  }
  function dispatch(route){
    try{window.dispatchEvent(new CustomEvent('kda:route',{detail:route}));}catch(_){/* test/minimal browser fallback */}
  }
  function render(options={}){
    if(rendering)return current;
    rendering=true;
    const canonical=canonicalHash(location.hash);
    if(canonical!==location.hash)rawReplace(null,'',canonical);
    const next=parse(canonical),previous=current?.view;
    document.querySelectorAll('[data-view]').forEach(el=>{el.hidden=el.dataset.view!==next.view;});
    document.querySelectorAll('[data-view-link]').forEach(link=>{
      const active=link.dataset.viewLink===next.view;
      link.classList.toggle('active',active);
      if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    });
    document.body.dataset.view=next.view;
    if(document.title!==TITLES[next.view])document.title=TITLES[next.view];
    current=next;rendering=false;
    if(options.scroll!==false&&previous&&previous!==next.view)window.scrollTo({top:0,left:0,behavior:'auto'});
    dispatch(next);return next;
  }
  function setHash(hash,{replace=false,scroll=true}={}){
    const canonical=canonicalHash(hash);
    (replace?rawReplace:rawPush)(null,'',canonical);
    return render({scroll});
  }
  function build(view,rest='',params=null){
    const safe=VIEW_IDS.has(view)?view:'home';
    const path=safe==='home'?'#/':`#/${safe}${rest?`/${String(rest).split('/').map(encodeURIComponent).join('/')}`:''}`;
    const query=params instanceof URLSearchParams?params.toString():params?new URLSearchParams(params).toString():'';
    return query?`${path}?${query}`:path;
  }
  function navigate(view,rest='',params=null,options={}){return setHash(build(view,rest,params),options);}
  function replace(view,rest='',params=null,options={}){return navigate(view,rest,params,{...options,replace:true});}
  function ownDynamicView(node){
    if(!(node instanceof Element))return;
    const candidates=[node,...node.querySelectorAll('[id]')];
    for(const el of candidates){
      const view=DYNAMIC_VIEW_IDS.get(el.id);if(!view||el.dataset.view)continue;
      el.dataset.view=view;el.hidden=(current?.view||parse().view)!==view;
    }
  }
  function openGlobalSearch(){
    if((current?.view||parse().view)!=='home')navigate('home');
    requestAnimationFrame(()=>document.querySelector('#atlas-search')?.focus());
  }

  history.pushState=function(state,title,url){const result=rawPush(state,title,canonicalUrl(url));queueMicrotask(()=>render({scroll:false}));return result;};
  history.replaceState=function(state,title,url){const result=rawReplace(state,title,canonicalUrl(url));queueMicrotask(()=>render({scroll:false}));return result;};
  window.addEventListener('hashchange',()=>render());
  window.addEventListener('popstate',()=>render());

  new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(ownDynamicView))).observe(document.body,{childList:true,subtree:true});

  document.addEventListener('click',event=>{
    const trigger=event.target.closest?.('[data-focus-search]');
    if(!trigger||(current?.view||parse().view)==='home')return;
    event.preventDefault();event.stopImmediatePropagation();openGlobalSearch();
  },true);
  document.addEventListener('keydown',event=>{
    if(!(event.ctrlKey||event.metaKey)||String(event.key).toLowerCase()!=='k'||(current?.view||parse().view)==='home')return;
    event.preventDefault();event.stopImmediatePropagation();openGlobalSearch();
  },true);

  window.KDARouter={parse,render,navigate,replace,build,current:()=>current,canonicalHash};
  render({scroll:false});
})();
