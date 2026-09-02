/* Kenya Data Atlas — route-aware optional integration loader.
 * Heavy UI modules and their styles stay completely off the homepage cold path.
 */
(function(){
  'use strict';
  const KDA=window.KDAData;
  if(!KDA)return;

  let promise=null,countyIqPromise=null,evidenceHubPromise=null,opportunityPromise=null,rankingsPromise=null,mapVotersPromise=null,seriesBrowserPromise=null,vizPromise=null;
  let comparePromise=null,geoPromise=null,hardeningPromise=null,polishPromise=null,publicCleanupPromise=null,siteSearchPromise=null,placeProfilePromise=null,completionSurfacePromise=null,visualClarityPromise=null;
  let countyIqDataGuardInstalled=false;

  function finiteValue(value){return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));}
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
  function redriveRoute(){
    const route=window.KDARouter?.current?.()||window.KDARouter?.parse?.();
    if(!route)return;
    try{window.dispatchEvent(new CustomEvent('kda:route',{detail:route}));}catch(_){/* minimal browser fallback */}
  }
  function styles(entries){return Promise.all(entries.map(([href,id])=>KDA.loadStyle(href,{id})));}

  function loadPolish(){
    if(window.KDAUxPolish)return Promise.resolve(window.KDAUxPolish);
    if(polishPromise)return polishPromise;
    polishPromise=KDA.loadScript('assets/ux-polish.js',{id:'kda-ux-polish'}).catch(error=>{console.warn('UI polish load:',error?.message||error);return null;});
    return polishPromise;
  }
  function loadViz(){
    if(window.KDAVizEnhancements)return Promise.resolve(window.KDAVizEnhancements);
    if(vizPromise)return vizPromise;
    vizPromise=Promise.all([
      KDA.loadStyle('assets/viz-enhancements.css',{id:'kda-viz-enhancements-css'}),
      KDA.loadScript('assets/viz-enhancements.js',{id:'kda-viz-enhancements'})
    ]).then(()=>window.KDAVizEnhancements||null)
      .catch(error=>{console.warn('Visualisation enhancements load:',error?.message||error);return null;});
    return vizPromise;
  }
  function loadVisualClarity(){
    if(window.KDAVisualClarity){window.KDAVisualClarity.run?.();return Promise.resolve(window.KDAVisualClarity);}
    if(visualClarityPromise)return visualClarityPromise;
    visualClarityPromise=KDA.loadScript('assets/visual-clarity-cleanup.js',{id:'kda-visual-clarity-cleanup'})
      .then(()=>{window.KDAVisualClarity?.run?.();return window.KDAVisualClarity||null;})
      .catch(error=>{console.warn('Visual clarity cleanup load:',error?.message||error);visualClarityPromise=null;return null;});
    return visualClarityPromise;
  }
  function loadHardening(){
    if(hardeningPromise)return hardeningPromise;
    hardeningPromise=Promise.allSettled([
      KDA.loadStyle('assets/pre-p05-hardening.css',{id:'kda-pre-p05-hardening-css'}),
      KDA.loadScript('assets/pre-p05-hardening.js',{id:'kda-pre-p05-hardening'})
    ]);
    return hardeningPromise;
  }
  function loadPublicCleanup(){
    if(publicCleanupPromise)return publicCleanupPromise;
    publicCleanupPromise=KDA.loadScript('assets/public-cleanup.js',{id:'kda-public-cleanup'}).catch(error=>{console.warn('Public copy cleanup:',error?.message||error);return null;});
    return publicCleanupPromise;
  }
  function loadSiteSearch(){
    if(window.KDASiteSearch){window.KDASiteSearch.boot?.();return Promise.resolve(window.KDASiteSearch);}
    if(siteSearchPromise)return siteSearchPromise;
    siteSearchPromise=KDA.loadScript('assets/site-search.js',{id:'kda-site-search'})
      .then(()=>{window.KDASiteSearch?.boot?.();return window.KDASiteSearch||null;})
      .catch(error=>{console.warn('Atlas search load:',error?.message||error);return null;});
    return siteSearchPromise;
  }
  function loadPlaceProfile(){
    if(window.KDAPlaceProfile)return Promise.resolve(window.KDAPlaceProfile);
    if(placeProfilePromise)return placeProfilePromise;
    placeProfilePromise=KDA.loadStyle('assets/place-profile.css',{id:'kda-place-profile-css'})
      .then(()=>KDA.loadScript('assets/place-profile.js',{id:'kda-place-profile'}))
      .then(()=>window.KDAPlaceProfile||null)
      .catch(error=>{console.warn('Place profile load:',error?.message||error);return null;});
    return placeProfilePromise;
  }
  function loadCompletionSurface(){
    if(window.KDACompletionSurface)return Promise.resolve(window.KDACompletionSurface.boot?.()).then(()=>window.KDACompletionSurface);
    if(completionSurfacePromise)return completionSurfacePromise;
    completionSurfacePromise=KDA.loadStyle('assets/completion-surface.css',{id:'kda-completion-surface-css'})
      .then(()=>KDA.loadScript('assets/completion-surface.js',{id:'kda-completion-surface'}))
      .then(()=>window.KDACompletionSurface?.boot?.()||null)
      .catch(error=>{console.warn('P18–P22 completion surface load:',error?.message||error);return null;});
    return completionSurfacePromise;
  }

  function loadOptionalIntegrations(){
    if(promise)return promise;
    promise=Promise.allSettled([
      KDA.loadStyle('assets/unit-system.css',{id:'kda-unit-system-css'}),
      KDA.loadStyle('assets/worldbank-integration.css',{id:'kda-worldbank-integration-css'}),
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
  function loadCompare(){
    if(window.KDACompare)return Promise.resolve(window.KDACompare.boot?.()).then(()=>window.KDACompare);
    if(comparePromise)return comparePromise;
    comparePromise=Promise.all([
      styles([['assets/compare.css','kda-compare-css'],['assets/compare-life-natural.css','kda-compare-life-css']]),
      loadHardening(),
      loadPolish()
    ]).then(()=>KDA.loadScript('assets/compare.js',{id:'kda-compare'}))
      .then(()=>window.KDACompare?.boot?.()||null)
      .then(value=>{loadCompletionSurface();redriveRoute();return value;})
      .catch(error=>{console.warn('Compare load:',error?.message||error);return null;});
    return comparePromise;
  }
  function loadMapVoters(){
    if(window.KDASprint2Voters)return window.KDASprint2Voters.ready;
    if(mapVotersPromise)return mapVotersPromise;
    mapVotersPromise=KDA.loadScript('assets/sprint2-voters.js',{id:'kda-sprint2-voters'})
      .then(()=>window.KDASprint2Voters?.ready||null)
      .catch(error=>{console.warn('Explore voter drill-down load:',error?.message||error);return null;});
    return mapVotersPromise;
  }
  function loadGeo(){
    if(window.KDAGeo)return Promise.all([Promise.resolve(window.KDAGeo.boot?.()),loadPlaceProfile(),loadCompletionSurface()]).then(()=>window.KDAGeo);
    if(geoPromise)return geoPromise;
    geoPromise=Promise.all([
      KDA.loadStyle('assets/geo-explorer.css',{id:'kda-geo-css'}),
      loadHardening(),
      loadPolish()
    ]).then(()=>KDA.loadScript('assets/geo-explorer.js',{id:'kda-geo-explorer'}))
      .then(()=>Promise.all([window.KDAGeo?.boot?.()||null,loadPlaceProfile(),loadCompletionSurface()]))
      .then(values=>{loadMapVoters();redriveRoute();return values[0];})
      .catch(error=>{console.warn('Explore load:',error?.message||error);return null;});
    return geoPromise;
  }
  function loadSeriesBrowser(){
    if(window.KDASeriesBrowser)return window.KDASeriesBrowser.boot();
    if(seriesBrowserPromise)return seriesBrowserPromise;
    seriesBrowserPromise=Promise.all([
      KDA.loadStyle('assets/series-browser.css',{id:'kda-series-browser-css'}),
      loadHardening(),loadPolish()
    ]).then(()=>KDA.loadScript('assets/series-browser.js',{id:'kda-series-browser'}))
      .then(()=>window.KDASeriesBrowser?.boot?.()||null)
      .catch(error=>{console.warn('Series dataset browser load:',error?.message||error);return null;});
    return seriesBrowserPromise;
  }
  function loadRankings(){
    if(window.KDARankings)return window.KDARankings.boot();
    if(rankingsPromise)return rankingsPromise;
    rankingsPromise=Promise.all([
      KDA.loadStyle('assets/rankings-insights.css',{id:'kda-rankings-css'}),loadPolish()
    ]).then(()=>KDA.loadScript('assets/rankings-insights.js',{id:'kda-rankings-insights'}))
      .then(()=>window.KDARankings?.boot?.()||null)
      .then(value=>{loadCompletionSurface();redriveRoute();return value;})
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
    evidenceHubPromise=KDA.loadStyle('assets/evidence-hub.css',{id:'kda-evidence-hub-css'})
      .then(()=>KDA.loadScript('assets/evidence-hub.js',{id:'kda-evidence-hub'}))
      .then(()=>window.KDAEvidenceHub?.boot?.()||null)
      .catch(error=>{console.warn('Evidence Hub load:',error?.message||error);return null;});
    return evidenceHubPromise;
  }
  function loadOpportunityFinder(){
    if(window.KDAOpportunityFinder)return window.KDAOpportunityFinder.boot();
    if(opportunityPromise)return opportunityPromise;
    opportunityPromise=KDA.loadStyle('assets/opportunity-finder.css',{id:'kda-opportunity-css'})
      .then(()=>KDA.loadScript('assets/opportunity-finder.js',{id:'kda-opportunity-finder'}))
      .then(()=>window.KDAOpportunityFinder?.boot?.()||null)
      .catch(error=>{console.warn('Opportunity Finder load:',error?.message||error);return null;});
    return opportunityPromise;
  }
  function loadCountyIQUX(){
    if(window.KDACountyIQUX){window.KDACountyIQUX.boot?.();return Promise.resolve(window.KDACountyIQUX);}
    return Promise.all([
      KDA.loadStyle('assets/countyiq-ux.css',{id:'kda-countyiq-ux-css'}),
      KDA.loadScript('assets/countyiq-ux.js',{id:'kda-countyiq-ux'})
    ]).then(()=>{window.KDACountyIQUX?.boot?.();return window.KDACountyIQUX||null;});
  }
  function loadCountyIQ(){
    installCountyIQDataGuard();
    if(window.KDACountyIQ)return Promise.all([Promise.resolve(window.KDACountyIQ.boot()),loadCountyIQUX()]).then(()=>Promise.allSettled([loadEvidenceHub(),loadOpportunityFinder(),loadPublicCleanup(),loadHardening(),loadCompletionSurface()]));
    if(countyIqPromise)return countyIqPromise;
    countyIqPromise=Promise.all([
      styles([['assets/countyiq-view.css','kda-countyiq-css'],['assets/p05-breadth.css','kda-p05-breadth-css']]),
      loadCountyIQUX(),loadHardening(),loadPolish()
    ]).then(()=>KDA.loadScript('assets/countyiq-view.js',{id:'kda-countyiq-view'}))
      .then(()=>window.KDACountyIQ?.boot?.()||null)
      .then(()=>window.KDACountyIQUX?.boot?.()||null)
      .then(()=>Promise.allSettled([loadEvidenceHub(),loadOpportunityFinder(),loadPublicCleanup(),loadCompletionSurface()]))
      .then(value=>{redriveRoute();return value;})
      .catch(countyIqFailure);
    return countyIqPromise;
  }

  const routeNeedsOptional=hash=>/^#\/(?:pulse|series|data)(?:\/|\?|$)/.test(hash)||/^#(?:series|catalogue)/.test(hash);
  const routeNeedsExplore=hash=>/^#\/explore(?:\/|\?|$)/.test(hash)||/^#map\//.test(hash);
  const routeNeedsSeries=hash=>/^#\/series(?:\/|\?|$)/.test(hash)||/^#series(?:\/|\?|$)/.test(hash);
  const routeNeedsRankings=hash=>/^#\/rankings(?:\/|\?|$)/.test(hash)||/^#rankings$/.test(hash);
  const routeNeedsCountyIQ=hash=>/^#\/countyiq(?:\/|\?|$)/.test(hash)||/^#countyiq$/.test(hash);
  const routeNeedsCompare=hash=>/^#\/compare(?:\/|\?|$)/.test(hash)||/^#compare$/.test(hash);
  const routeNeedsViz=hash=>/^#\/(?:pulse|explore|compare|series|rankings)(?:\/|\?|$)/.test(hash)||/^#(?:map\/|compare$|series|rankings$)/.test(hash);
  const routeNeedsCompletion=hash=>/^#\/(?:explore|data|compare|rankings|countyiq)(?:\/|\?|$)/.test(hash)||/^#(?:map\/|catalogue|compare$|rankings$|countyiq$)/.test(hash);
  const routeNeedsVisualClarity=hash=>!hash||hash==='#'||hash==='#/'||/^#\/(?:pulse|rankings)(?:\/|\?|$)/.test(hash)||/^#(?:pulse|rankings)$/.test(hash);
  function loadForHash(hash){
    if(routeNeedsOptional(hash))loadOptionalIntegrations();
    if(routeNeedsExplore(hash))loadGeo();
    if(routeNeedsSeries(hash))loadSeriesBrowser();
    if(routeNeedsRankings(hash))loadRankings();
    if(routeNeedsCountyIQ(hash))loadCountyIQ();
    if(routeNeedsCompare(hash))loadCompare();
    if(routeNeedsViz(hash))loadViz();
    if(routeNeedsCompletion(hash))loadCompletionSurface();
    if(routeNeedsVisualClarity(hash))loadVisualClarity();
  }
  loadForHash(location.hash);
  window.addEventListener('hashchange',()=>loadForHash(location.hash));
  window.addEventListener('kda:route',event=>{
    const view=event.detail?.view;
    if(['pulse','series','data'].includes(view))loadOptionalIntegrations();
    if(view==='explore')loadGeo();
    if(view==='series')loadSeriesBrowser();
    if(view==='rankings')loadRankings();
    if(view==='countyiq')loadCountyIQ();
    if(view==='compare')loadCompare();
    if(['pulse','explore','compare','series','rankings'].includes(view))loadViz();
    if(['explore','data','compare','rankings','countyiq'].includes(view))loadCompletionSurface();
    if(['home','pulse','rankings'].includes(view))loadVisualClarity();
  });
  window.KDAOptional={load:loadOptionalIntegrations,loadCompare,loadGeo,loadMapVoters,loadSeriesBrowser,loadRankings,loadCountyIQ,loadOpportunityFinder,loadSiteSearch,loadHardening,loadViz,loadVisualClarity,loadPlaceProfile,loadCompletionSurface};
})();
