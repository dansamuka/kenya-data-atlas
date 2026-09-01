/* Kenya Data Atlas — public completion-overlay retirement.
 * Completion governance remains in the data registry and CI, but is intentionally
 * not rendered as a second set of county values on public pages.
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

  function cleanup(){
    for(const selector of selectors){
      document.querySelectorAll(selector).forEach(node=>node.remove());
    }
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
