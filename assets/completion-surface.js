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
