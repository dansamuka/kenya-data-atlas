/* Kenya Data Atlas — optional integration loader (P01).
 *
 * Unit annotations and the World Bank/cross-level layer remain available, but
 * they no longer participate in first paint. Sprint 1 and Sprint 2 runtime
 * overlays are deliberately not loaded: those releases are already compiled
 * into the canonical registries and their essential user-facing disclosures
 * are handled by the current shell/Geo Explorer.
 */
(function(){
  'use strict';
  const KDA=window.KDAData;
  if(!KDA)return;

  let promise=null;
  function loadOptionalIntegrations(){
    if(promise)return promise;
    promise=Promise.allSettled([
      KDA.loadScript('assets/unit-system.js',{id:'kda-unit-system'}),
      KDA.loadScript('assets/worldbank-integration.js',{id:'kda-worldbank-integration'})
    ]).then(results=>{
      const failures=results.filter(r=>r.status==='rejected');
      if(failures.length)console.warn('Optional Atlas integration load:',failures.map(r=>r.reason?.message||r.reason).join('; '));
      document.body.dataset.optionalIntegrations=failures.length?'partial':'ready';
      return results;
    });
    return promise;
  }

  const geo=document.querySelector('#geo-explorer');
  if(geo)KDA.whenVisible(geo,loadOptionalIntegrations,{rootMargin:'100px 0px'});
  if(/^#(?:map\/|series|catalogue)/.test(location.hash))loadOptionalIntegrations();
  window.addEventListener('hashchange',()=>{
    if(/^#(?:map\/|series|catalogue)/.test(location.hash))loadOptionalIntegrations();
  });
  window.KDAOptional={load:loadOptionalIntegrations};
})();
