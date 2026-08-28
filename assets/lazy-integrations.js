/* Kenya Data Atlas — optional integration loader (P01).
 *
 * Unit annotations and the World Bank/cross-level layer remain available, but
 * they no longer participate in first paint. CountyIQ is also loaded only when
 * its route is requested and uses the shared Atlas data loader rather than a
 * separate application stack.
 */
(function(){
  'use strict';
  const KDA=window.KDAData;
  if(!KDA)return;

  let promise=null,countyIqPromise=null;
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
  function countyIqFailure(error){
    console.warn('CountyIQ route load:',error?.message||error);
    const root=document.querySelector('#ciq-metrics');
    const mode=document.querySelector('#ciq-mode');
    if(mode){mode.className='ciq-mode error';mode.innerHTML='<i></i><span>CountyIQ view unavailable</span>';}
    if(root)root.innerHTML='<div class="ciq-error" style="grid-column:1/-1"><strong>CountyIQ could not initialize.</strong><br>The rest of Kenya Data Atlas remains available.</div>';
    return null;
  }
  function loadCountyIQ(){
    if(window.KDACountyIQ)return window.KDACountyIQ.boot();
    if(countyIqPromise)return countyIqPromise;
    countyIqPromise=KDA.loadScript('assets/countyiq-view.js',{id:'kda-countyiq-view'})
      .then(()=>window.KDACountyIQ?.boot?.()||null)
      .catch(countyIqFailure);
    return countyIqPromise;
  }

  const geo=document.querySelector('#geo-explorer');
  if(geo)KDA.whenVisible(geo,loadOptionalIntegrations,{rootMargin:'100px 0px'});
  const routeNeedsOptional=hash=>/^#\/(?:pulse|explore|series|data)(?:\/|\?|$)/.test(hash)||/^#(?:map\/|series|catalogue)/.test(hash);
  const routeNeedsCountyIQ=hash=>/^#\/countyiq(?:\/|\?|$)/.test(hash)||/^#(?:countyiq|county-dashboard)$/.test(hash);
  if(routeNeedsOptional(location.hash))loadOptionalIntegrations();
  if(routeNeedsCountyIQ(location.hash))loadCountyIQ();
  window.addEventListener('hashchange',()=>{if(routeNeedsOptional(location.hash))loadOptionalIntegrations();if(routeNeedsCountyIQ(location.hash))loadCountyIQ();});
  window.addEventListener('kda:route',event=>{
    if(['pulse','explore','series','data'].includes(event.detail?.view))loadOptionalIntegrations();
    if(event.detail?.view==='countyiq')loadCountyIQ();
  });
  window.KDAOptional={load:loadOptionalIntegrations,loadCountyIQ};
})();
