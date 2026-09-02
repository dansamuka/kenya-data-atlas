/* Kenya Data Atlas — public governance-overlay retirement.
 * Internal completion governance remains in the registry and CI. Public pages
 * intentionally show each metric once and omit internal programme/phase labels.
 */
(function(){
  'use strict';

  const selectors=[
    '#kda-data-programme',
    '#kda-p18-p22-profile',
    '#kda-p18-p22-ciq',
    '#kda-completion-compare-note',
    '#kda-completion-ranking-note',
    '.kda-completion-surface',
    '#compareCrossLevelView'
  ];
  const skipSelector='script,style,noscript,textarea,pre,code';
  const phaseToken=/\bP\d{2}(?:[-–—]?v\d+(?:\.\d+)*)?\b/gi;
  let crossLevelPromise=null;

  /* The router intentionally re-renders after history.replaceState(). Across
   * levels stores its own shareable sub-state in the Compare hash and already
   * manages the active panel itself. Persist those cross-level hashes with the
   * native History method so changing a geography cannot trigger a second full
   * Compare render. Critically, never let an async Compare render that finishes
   * after the user has left Compare replace the new route with a stale Compare
   * URL. Other replaces still flow through the router normally. */
  function installCompareReplaceGuard(){
    if(history.replaceState?.__kdaCompareIdempotent)return;
    const routedReplace=history.replaceState.bind(history);
    const nativeReplace=History.prototype.replaceState;
    const guarded=function(state,title,url){
      if(state===null&&typeof url==='string'){
        try{
          const target=new URL(url,location.href);
          const hash=target.hash||'';
          const compareHash=/^#\/compare(?:\?|$)/.test(hash);
          const currentHash=location.hash||'';
          const onCompare=/^#\/compare(?:\?|$)/.test(currentHash)||currentHash==='#compare';
          /* compare-cross-level.js can finish a data/render cycle after another
           * navigation has already committed. That late persist is state for the
           * old view, not a navigation request, so discard it. */
          if(compareHash&&!onCompare)return;
          const crossLevel=compareHash&&new URLSearchParams(hash.split('?')[1]||'').get('mode')==='cross-level';
          if(crossLevel)return nativeReplace.call(history,state,title,target.href);
          if(compareHash&&target.href===location.href)return;
        }catch(_){/* let the router/native implementation validate the URL */}
      }
      return routedReplace(state,title,url);
    };
    guarded.__kdaCompareIdempotent=true;
    history.replaceState=guarded;
  }

  function cleanText(value){
    if(!value||!phaseToken.test(value)){
      phaseToken.lastIndex=0;
      return value;
    }
    phaseToken.lastIndex=0;
    return value
      .replace(/\bmethodology\s+P\d{2}(?:[-–—]?v\d+(?:\.\d+)*)?\b/gi,'published methodology')
      .replace(/\(\s*P\d{2}(?:[-–—]?v\d+(?:\.\d+)*)?\s*\)/gi,'')
      .replace(phaseToken,'')
      .replace(/[ \t]{2,}/g,' ')
      .replace(/\s+([,.;:!?])/g,'$1')
      .trim();
  }

  function scrubText(root=document.body||document.documentElement){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      const parent=node.parentElement;
      if(!parent||parent.closest(skipSelector))continue;
      const cleaned=cleanText(node.nodeValue);
      if(cleaned!==node.nodeValue)node.nodeValue=cleaned;
    }
    root.querySelectorAll?.('[aria-label],[title]').forEach(node=>{
      for(const attr of ['aria-label','title']){
        if(!node.hasAttribute(attr))continue;
        const value=node.getAttribute(attr);
        const cleaned=cleanText(value);
        if(cleaned!==value)node.setAttribute(attr,cleaned);
      }
    });
  }

  function cleanup(){
    for(const selector of selectors){
      document.querySelectorAll(selector).forEach(node=>node.remove());
    }
    scrubText();
  }

  function isCompareRoute(){
    const view=window.KDARouter?.current?.()?.view;
    return view==='compare'||/^#\/compare(?:\/|\?|$)/.test(location.hash)||location.hash==='#compare';
  }

  function polishCrossLevelCompare(){
    const root=document.querySelector('#compare');
    const panel=root?.querySelector('[data-compare-panel="cross-level"]');
    const button=root?.querySelector('[data-compare-mode="cross-level"]');
    if(!panel||!button)return;

    button.textContent='Across levels';
    if(!button.dataset.routeShield){
      button.addEventListener('click',event=>event.stopPropagation());
      button.dataset.routeShield='true';
    }
    if(!panel.dataset.routeShield){
      panel.addEventListener('change',event=>event.stopPropagation());
      panel.dataset.routeShield='true';
    }

    const intro=panel.querySelector('.xlevel-intro');
    const eyebrow=intro?.querySelector('.eyebrow');
    const heading=intro?.querySelector('h3');
    const body=intro?.querySelector('p:not(.eyebrow)');
    const rule=intro?.querySelector('.xlevel-rule');
    if(eyebrow)eyebrow.textContent='Compare across geographic levels';
    if(heading)heading.textContent='County ↔ constituency ↔ ward';
    if(body)body.textContent='Choose places at different levels. The Atlas only surfaces indicators that remain meaningful and structurally comparable across the selected geographies.';
    if(rule)rule.textContent='Rates, shares, indices, per-person measures, density and the documented land-area exception can cross levels. Raw population, voter and currency totals stay within the same level.';

    const kicker=root.querySelector('.compare-kicker');
    if(kicker)kicker.textContent='Compare counties directly, see how measurable conditions differ, or switch to Across levels for comparable county → constituency → ward indicators.';
  }

  function loadCrossLevelCompare(){
    if(!isCompareRoute())return Promise.resolve(null);
    if(crossLevelPromise)return crossLevelPromise;
    const KDA=window.KDAData;
    if(!KDA)return Promise.resolve(null);

    installCompareReplaceGuard();
    crossLevelPromise=(async()=>{
      await window.KDAOptional?.loadCompare?.();
      await KDA.loadStyle('assets/compare-cross-level.css',{id:'kda-compare-cross-level-css'});
      if(!window.KDACompareCross)await KDA.loadScript('assets/compare-cross-level.js',{id:'kda-compare-cross-level'});
      await window.KDACompareCross?.boot?.();
      polishCrossLevelCompare();
      return window.KDACompareCross||null;
    })().catch(error=>{
      console.warn('Cross-level compare load:',error?.message||error);
      crossLevelPromise=null;
      return null;
    });
    return crossLevelPromise;
  }

  let observer=null;
  function boot(){
    cleanup();
    const crossLevel=loadCrossLevelCompare();
    if(!observer&&document.documentElement){
      observer=new MutationObserver(cleanup);
      observer.observe(document.documentElement,{childList:true,subtree:true});
    }
    return Promise.resolve(crossLevel).then(()=>window.KDACompletionSurface);
  }

  window.KDACompletionSurface={boot,render:cleanup,state:()=>null};
})();
