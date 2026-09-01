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
    '.kda-completion-surface'
  ];
  const skipSelector='script,style,noscript,textarea,pre,code';
  const phaseToken=/\bP\d{2}(?:[-–—]?v\d+(?:\.\d+)*)?\b/gi;

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

  let observer=null;
  function boot(){
    cleanup();
    if(!observer&&document.documentElement){
      observer=new MutationObserver(cleanup);
      observer.observe(document.documentElement,{childList:true,subtree:true});
    }
    return Promise.resolve(window.KDACompletionSurface);
  }

  window.KDACompletionSurface={boot,render:cleanup,state:()=>null};
})();
