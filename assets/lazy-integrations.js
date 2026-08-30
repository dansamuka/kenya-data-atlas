/* Kenya Data Atlas — optional integration loader.
 * Heavy integrations load only when the relevant route needs them.
 */
(function(){
  'use strict';
  const KDA=window.KDAData;
  if(!KDA)return;

  let promise=null,countyIqPromise=null,evidenceHubPromise=null,opportunityPromise=null,rankingsPromise=null,mapVotersPromise=null,seriesBrowserPromise=null;
  let countyIqDataGuardInstalled=false;

  function finiteValue(value){
    return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  }
  function hardenCountyIQMart(mart){
    if(!mart||!Array.isArray(mart.counties))return mart;
    for(const county of mart.counties){
      for(const metric of Object.values(county?.metrics||{})){
        const ranking=metric?.ranking;
        if(!ranking)continue;
        if(ranking.eligible===true&&!finiteValue(ranking.percentile))ranking.eligible=false;
        if(ranking.peer_group&&!finiteValue(ranking.peer_group.percentile))ranking.peer_group=null;
      }
    }
    return mart;
  }
  function installCountyIQDataGuard(){
    if(countyIqDataGuardInstalled||typeof KDA.fetchJson!=='function')return;
    const original=KDA.fetchJson.bind(KDA);
    KDA.fetchJson=async function(url,options){
      const result=await original(url,options);
      return String(url||'').includes('data/countyiq/county-summary.json')?hardenCountyIQMart(result):result;
    };
    countyIqDataGuardInstalled=true;
  }

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
  function loadRankings(){
    if(window.KDARankings)return window.KDARankings.boot();
    if(rankingsPromise)return rankingsPromise;
    rankingsPromise=KDA.loadScript('assets/rankings-insights.js',{id:'kda-rankings-insights'})
      .then(()=>window.KDARankings?.boot?.()||null)
      .catch(error=>{console.warn('Rankings & Insights load:',error?.message||error);return null;});
    return rankingsPromise;
  }
  function countyIqFailure(error){
    console.warn('CountyIQ route load:',error?.message||error);
    const root=document.querySelector('#ciq-metrics');
    const mode=document.querySelector('#ciq-mode');
    if(mode){mode.className='ciq-mode error';mode.innerHTML='<i></i><span>County data unavailable</span>';}
    if(root)root.innerHTML='<div class="ciq-error" style="grid-column:1/-1"><strong>County details are temporarily unavailable.</strong><br>Please refresh the page or choose another county.</div>';
    return null;
  }
  function loadEvidenceHub(){
    if(window.KDAEvidenceHub)return window.KDAEvidenceHub.boot();
    if(evidenceHubPromise)return evidenceHubPromise;
    evidenceHubPromise=KDA.loadScript('assets/evidence-hub.js',{id:'kda-evidence-hub'})
      .then(()=>window.KDAEvidenceHub?.boot?.()||null)
      .catch(error=>{console.warn('Evidence Hub load:',error?.message||error);return null;});
    return evidenceHubPromise;
  }
  function loadOpportunityFinder(){
    if(window.KDAOpportunityFinder)return window.KDAOpportunityFinder.boot();
    if(opportunityPromise)return opportunityPromise;
    opportunityPromise=KDA.loadScript('assets/opportunity-finder.js',{id:'kda-opportunity-finder'})
      .then(()=>window.KDAOpportunityFinder?.boot?.()||null)
      .catch(error=>{console.warn('Opportunity Finder load:',error?.message||error);return null;});
    return opportunityPromise;
  }
  function loadCountyIQ(){
    installCountyIQDataGuard();
    if(window.KDACountyIQ)return Promise.resolve(window.KDACountyIQ.boot()).then(()=>Promise.allSettled([loadEvidenceHub(),loadOpportunityFinder()]));
    if(countyIqPromise)return countyIqPromise;
    countyIqPromise=KDA.loadScript('assets/countyiq-view.js',{id:'kda-countyiq-view'})
      .then(()=>window.KDACountyIQ?.boot?.()||null)
      .then(()=>Promise.allSettled([loadEvidenceHub(),loadOpportunityFinder()]))
      .catch(countyIqFailure);
    return countyIqPromise;
  }

  const geo=document.querySelector('#geo-explorer');
  if(geo)KDA.whenVisible(geo,loadOptionalIntegrations,{rootMargin:'100px 0px'});
  const routeNeedsOptional=hash=>/^#\/(?:pulse|explore|series|data)(?:\/|\?|$)/.test(hash)||/^#(?:map\/|series|catalogue)/.test(hash);
  const routeNeedsExplore=hash=>/^#\/explore(?:\/|\?|$)/.test(hash)||/^#map\//.test(hash);
  const routeNeedsSeries=hash=>/^#\/series(?:\/|\?|$)/.test(hash)||/^#series(?:\/|\?|$)/.test(hash);
  const routeNeedsRankings=hash=>/^#\/rankings(?:\/|\?|$)/.test(hash)||/^#rankings$/.test(hash);
  const routeNeedsCountyIQ=hash=>/^#\/countyiq(?:\/|\?|$)/.test(hash)||/^#countyiq$/.test(hash);
  if(routeNeedsOptional(location.hash))loadOptionalIntegrations();
  if(routeNeedsExplore(location.hash))loadMapVoters();
  if(routeNeedsSeries(location.hash))loadSeriesBrowser();
  if(routeNeedsRankings(location.hash))loadRankings();
  if(routeNeedsCountyIQ(location.hash))loadCountyIQ();
  window.addEventListener('hashchange',()=>{if(routeNeedsOptional(location.hash))loadOptionalIntegrations();if(routeNeedsExplore(location.hash))loadMapVoters();if(routeNeedsSeries(location.hash))loadSeriesBrowser();if(routeNeedsRankings(location.hash))loadRankings();if(routeNeedsCountyIQ(location.hash))loadCountyIQ();});
  window.addEventListener('kda:route',event=>{
    if(['pulse','explore','series','data'].includes(event.detail?.view))loadOptionalIntegrations();
    if(event.detail?.view==='explore')loadMapVoters();
    if(event.detail?.view==='series')loadSeriesBrowser();
    if(event.detail?.view==='rankings')loadRankings();
    if(event.detail?.view==='countyiq')loadCountyIQ();
  });
  window.KDAOptional={load:loadOptionalIntegrations,loadMapVoters,loadSeriesBrowser,loadRankings,loadCountyIQ,loadOpportunityFinder};
})();
