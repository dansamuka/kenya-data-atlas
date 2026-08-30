/* Kenya Data Atlas — optional integration loader (P01).
 *
 * Unit annotations and the World Bank/cross-level layer remain available, but
 * they no longer participate in first paint. CountyIQ is also loaded only when
 * its route is requested and uses the shared Atlas data loader rather than a
 * separate application stack. The small Sprint 2 voter drill-down adapter is
 * Explore-only and does not reinstate the retired registry fetch overlay.
 * Series discovery is likewise route-only: its dataset browser reuses the
 * canonical catalogue/series registries through the shared loader.
 */
(function(){
  'use strict';
  const KDA=window.KDAData;
  if(!KDA)return;

  let promise=null,countyIqPromise=null,evidenceHubPromise=null,methodsPromise=null,mapVotersPromise=null,seriesBrowserPromise=null;
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
  function loadMapVoters(){
    if(window.KDASprint2Voters)return window.KDASprint2Voters.ready;
    if(mapVotersPromise)return mapVotersPromise;
    mapVotersPromise=KDA.loadScript('assets/sprint2-voters.js',{id:'kda-sprint2-voters'})
      .then(()=>window.KDASprint2Voters?.ready||null)
      .catch(error=>{console.warn('Explore voter drill-down load:',error?.message||error);return null;});
    return mapVotersPromise;
  }
  function loadSeriesBrowser(){
    if(window.KDASeriesBrowser)return window.KDASeriesBrowser.boot();
    if(seriesBrowserPromise)return seriesBrowserPromise;
    seriesBrowserPromise=KDA.loadScript('assets/series-browser.js',{id:'kda-series-browser'})
      .then(()=>window.KDASeriesBrowser?.boot?.()||null)
      .catch(error=>{console.warn('Series dataset browser load:',error?.message||error);return null;});
    return seriesBrowserPromise;
  }
  function loadMethods(){
    if(window.KDAMethods)return window.KDAMethods.boot();
    if(methodsPromise)return methodsPromise;
    methodsPromise=KDA.loadScript('assets/methods-comparability.js',{id:'kda-methods-comparability'})
      .then(()=>window.KDAMethods?.boot?.()||null)
      .catch(error=>{console.warn('Methods & Comparability load:',error?.message||error);return null;});
    return methodsPromise;
  }
  function countyIqFailure(error){
    console.warn('CountyIQ route load:',error?.message||error);
    const root=document.querySelector('#ciq-metrics');
    const mode=document.querySelector('#ciq-mode');
    if(mode){mode.className='ciq-mode error';mode.innerHTML='<i></i><span>CountyIQ view unavailable</span>';}
    if(root)root.innerHTML='<div class="ciq-error" style="grid-column:1/-1"><strong>CountyIQ could not initialize.</strong><br>The rest of Kenya Data Atlas remains available.</div>';
    return null;
  }
  function loadEvidenceHub(){
    if(window.KDAEvidenceHub)return window.KDAEvidenceHub.boot();
    if(evidenceHubPromise)return evidenceHubPromise;
    evidenceHubPromise=KDA.loadScript('assets/evidence-hub.js',{id:'kda-evidence-hub'})
      .then(()=>window.KDAEvidenceHub?.boot?.()||null)
      .catch(error=>{console.warn('P13 Evidence Hub load:',error?.message||error);return null;});
    return evidenceHubPromise;
  }
  function loadCountyIQ(){
    if(window.KDACountyIQ)return Promise.resolve(window.KDACountyIQ.boot()).then(()=>loadEvidenceHub());
    if(countyIqPromise)return countyIqPromise;
    countyIqPromise=KDA.loadScript('assets/countyiq-view.js',{id:'kda-countyiq-view'})
      .then(()=>window.KDACountyIQ?.boot?.()||null)
      .then(()=>loadEvidenceHub())
      .catch(countyIqFailure);
    return countyIqPromise;
  }

  const geo=document.querySelector('#geo-explorer');
  if(geo)KDA.whenVisible(geo,loadOptionalIntegrations,{rootMargin:'100px 0px'});
  const routeNeedsOptional=hash=>/^#\/(?:pulse|explore|series|data)(?:\/|\?|$)/.test(hash)||/^#(?:map\/|series|catalogue)/.test(hash);
  const routeNeedsExplore=hash=>/^#\/explore(?:\/|\?|$)/.test(hash)||/^#map\//.test(hash);
  const routeNeedsSeries=hash=>/^#\/series(?:\/|\?|$)/.test(hash)||/^#series(?:\/|\?|$)/.test(hash);
  const routeNeedsMethods=hash=>/^#\/methods(?:\/|\?|$)/.test(hash)||/^#methods$/.test(hash);
  const routeNeedsCountyIQ=hash=>/^#\/countyiq(?:\/|\?|$)/.test(hash)||/^#(?:countyiq|county-dashboard)$/.test(hash);
  if(routeNeedsOptional(location.hash))loadOptionalIntegrations();
  if(routeNeedsExplore(location.hash))loadMapVoters();
  if(routeNeedsSeries(location.hash))loadSeriesBrowser();
  if(routeNeedsMethods(location.hash))loadMethods();
  if(routeNeedsCountyIQ(location.hash))loadCountyIQ();
  window.addEventListener('hashchange',()=>{if(routeNeedsOptional(location.hash))loadOptionalIntegrations();if(routeNeedsExplore(location.hash))loadMapVoters();if(routeNeedsSeries(location.hash))loadSeriesBrowser();if(routeNeedsMethods(location.hash))loadMethods();if(routeNeedsCountyIQ(location.hash))loadCountyIQ();});
  window.addEventListener('kda:route',event=>{
    if(['pulse','explore','series','data'].includes(event.detail?.view))loadOptionalIntegrations();
    if(event.detail?.view==='explore')loadMapVoters();
    if(event.detail?.view==='series')loadSeriesBrowser();
    if(event.detail?.view==='methods')loadMethods();
    if(event.detail?.view==='countyiq')loadCountyIQ();
  });
  window.KDAOptional={load:loadOptionalIntegrations,loadMapVoters,loadSeriesBrowser,loadMethods,loadCountyIQ};
})();