/* Kenya Data Atlas — static hash router.
 * GitHub Pages-compatible view routing with legacy-hash canonicalisation.
 */
(function(){
  'use strict';
  const VIEW_IDS=new Set(['home','pulse','explore','compare','series','data','rankings','countyiq']);
  const TITLES={home:'Kenya Data Atlas — Understand Kenya through data',pulse:'National Pulse — Kenya Data Atlas',explore:'Explore places — Kenya Data Atlas',compare:'Compare places — Kenya Data Atlas',series:'Series Explorer — Kenya Data Atlas',data:'Data Catalogue — Kenya Data Atlas',rankings:'County Rankings & Insights — Kenya Data Atlas',countyiq:'CountyIQ — Kenya Data Atlas'};
  const DYNAMIC_VIEW_IDS=new Map([['cross-level-compare','explore']]);
  const rawPush=history.pushState.bind(history),rawReplace=history.replaceState.bind(history);
  let current=null,rendering=false;

  function canonicalHash(input){
    let hash=String(input||'');
    if(hash==='#main')return current?.hash||'#/';
    if(hash==='#/methods'||hash.startsWith('#/methods?'))return hash.replace('#/methods','#/rankings');
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
    document.querySelectorAll('main [data-view]').forEach(el=>{el.hidden=el.dataset.view!==next.view;});
    document.querySelectorAll('[data-view-link]').forEach(link=>{
      const active=link.dataset.viewLink===next.view;
      link.classList.toggle('active',active);
      if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    });
    document.body.hidden=false;
    document.body.dataset.view=next.view;
    if(document.title!==TITLES[next.view])document.title=TITLES[next.view];
    current=next;rendering=false;
    if(options.scroll!==false&&previous&&previous!==next.view)window.scrollTo({top:0,left:0,behavior:'auto'});
    dispatch(next);
    if(next.view==='rankings')loadRankingsVisualV2();
    return next;
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
  function focusGlobalSearch(){
    const input=document.querySelector('#atlas-search');
    if(!input||input.closest('[hidden]'))return false;
    try{input.focus({preventScroll:true});}catch(_){input.focus();}
    return document.activeElement===input;
  }
  function openGlobalSearch(){
    if((current?.view||parse().view)!=='home')navigate('home');
    focusGlobalSearch();
    queueMicrotask(focusGlobalSearch);
    requestAnimationFrame(focusGlobalSearch);
  }
  function isGlobalSearchShortcut(event){
    if(!(event.ctrlKey||event.metaKey))return false;
    return String(event.code||'')==='KeyK'||String(event.key||'').toLowerCase()==='k';
  }
  function handleGlobalSearchShortcut(event){
    if(!isGlobalSearchShortcut(event))return;
    event.preventDefault();event.stopImmediatePropagation();openGlobalSearch();
  }
  function protectCompareCriticalPaint(){
    const KDA=window.KDAData;
    if(!KDA||KDA.__compareCriticalPaintGuard||typeof KDA.registries!=='function')return;
    const original=KDA.registries.bind(KDA);
    let guarded=false;
    KDA.registries=async function(names,options){
      const list=Array.isArray(names)?names:[];
      const heavy=list.includes('series')&&list.includes('observations');
      const compare=(current?.view||parse().view)==='compare';
      if(heavy&&compare&&!guarded){
        guarded=true;
        if(document.readyState!=='complete'){
          await new Promise(resolve=>window.addEventListener('load',()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)),{once:true}));
        }else{
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        }
      }
      return original(names,options);
    };
    KDA.__compareCriticalPaintGuard=true;
  }
  function installV2CriticalCompatibility(){
    if(document.querySelector('style[data-kda-v2-p16-critical]'))return;
    const style=document.createElement('style');style.dataset.kdaV2P16Critical='true';
    style.textContent='@media(max-width:767px){html body{padding-bottom:0!important}html body .site-header .menu-button{display:inline-grid!important}html body .site-header #main-nav:not(.open){display:none!important}html body .site-header #main-nav.open{display:flex!important}html body .kda-v2-bottom-nav{display:none!important}html body[data-view="compare"] .compare-mode-switch{position:static!important;top:auto!important}}';
    document.head.appendChild(style);
  }
  function loadSiteV2(){
    if(document.querySelector('script[data-kda-site-v2]'))return;
    installV2CriticalCompatibility();
    const css=document.createElement('link');css.rel='stylesheet';css.href='assets/site-v2.css';css.dataset.kdaSiteV2='true';document.head.appendChild(css);
    const compatCss=document.createElement('link');compatCss.rel='stylesheet';compatCss.href='assets/v2-p16-compat.css';compatCss.dataset.kdaV2P16Compat='true';document.head.appendChild(compatCss);
    const script=document.createElement('script');script.src='assets/site-v2.js';script.defer=true;script.dataset.kdaSiteV2='true';document.head.appendChild(script);
    const routeCss=document.createElement('link');routeCss.rel='stylesheet';routeCss.href='assets/site-v2-route.css';routeCss.dataset.kdaSiteV2Route='true';document.head.appendChild(routeCss);
    const routeScript=document.createElement('script');routeScript.src='assets/site-v2-route.js';routeScript.defer=true;routeScript.dataset.kdaSiteV2Route='true';document.head.appendChild(routeScript);
    const pwa=document.createElement('script');pwa.src='assets/pwa-v2.js';pwa.defer=true;pwa.dataset.kdaPwaV2='true';document.head.appendChild(pwa);
  }
  function loadRankingsVisualV2(){
    if((current?.view||parse().view)!=='rankings'||document.querySelector('script[data-kda-rankings-visual-v2]'))return;
    const script=document.createElement('script');script.src='assets/rankings-visual-v2.js';script.defer=true;script.dataset.kdaRankingsVisualV2='true';script.onerror=()=>script.remove();document.head.appendChild(script);
  }

  history.pushState=function(state,title,url){const result=rawPush(state,title,canonicalUrl(url));queueMicrotask(()=>render({scroll:false}));return result;};
  history.replaceState=function(state,title,url){const result=rawReplace(state,title,canonicalUrl(url));queueMicrotask(()=>render({scroll:false}));return result;};
  window.addEventListener('hashchange',()=>render());
  window.addEventListener('popstate',()=>render());
  /* Own the global-search chord at the router so every route follows the same
   * Home → #atlas-search contract. Firefox can consume Ctrl/Cmd+K before a
   * page keydown reaches document in automation/OS shortcut paths, while its
   * keyup is still delivered; listen to both phases. The handler is idempotent. */
  document.addEventListener('keydown',handleGlobalSearchShortcut,true);
  document.addEventListener('keyup',handleGlobalSearchShortcut,true);

  new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(ownDynamicView))).observe(document.body,{childList:true,subtree:true});

  document.addEventListener('click',event=>{
    const trigger=event.target.closest?.('[data-focus-search]');
    if(!trigger||(current?.view||parse().view)==='home')return;
    event.preventDefault();event.stopImmediatePropagation();openGlobalSearch();
  },true);

  window.KDARouter={parse,render,navigate,replace,build,current:()=>current,canonicalHash};
  render({scroll:false});
  protectCompareCriticalPaint();
  loadSiteV2();
})();