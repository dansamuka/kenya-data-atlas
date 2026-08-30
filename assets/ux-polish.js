/* Kenya Data Atlas — UX polish layer. */
(function(){
  'use strict';
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let publicCleanTimer=null;

  function loadRefinementStyles(){
    if(document.querySelector('link[data-mobile-refinements]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';link.href='assets/mobile-refinements.css';link.dataset.mobileRefinements='true';
    document.head.appendChild(link);
  }
  function setText(el,value){if(el&&el.textContent!==value)el.textContent=value;}
  function cleanCountyIQGeneratedCopy(){
    const root=$('#countyiq-view');if(!root)return;
    const failure=$('.ciq-error',root);
    if(failure&&/CountyIQ could not initialize|Cannot read properties|toFixed/i.test(failure.textContent||'')){
      failure.innerHTML='<strong>County details are temporarily unavailable.</strong><br>Please refresh the page or choose another county.';
      const mode=$('#ciq-mode');if(mode){mode.className='ciq-mode error';mode.innerHTML='<i></i><span>County data unavailable</span>';}
    }
    $$('.ciq-p05-group h3',root).forEach(h=>{
      const value=h.textContent.trim();
      if(value==='Peer & national standing (P06)')setText(h,'Peer & national standing');
      else if(value==='Gaps & evidence narrative (P07)')setText(h,'Strengths, gaps & recent change');
      else if(value.startsWith('Fiscal delivery & accountability (P10)'))setText(h,'Fiscal delivery & accountability');
      else if(value.startsWith('Administration-period scorecard & recognition (P11)'))setText(h,'Administration-period trends & recognition');
    });
    $$('.ciq-p05-group header span',root).forEach(span=>{
      if(/^P09\s*·/i.test(span.textContent||''))setText(span,'latest county snapshot');
    });
    $$('.ciq-peer-note',root).forEach(note=>{
      const value=(note.textContent||'').trim();
      if(value.startsWith('P09 snapshot gate:')||value.startsWith('Longitudinal composite:'))note.remove();
      else if(value.startsWith('This county does not currently qualify for a published P11'))setText(note,'This county does not currently qualify for a recognition category.');
    });
    $$('.ciq-p05-metric span',root).forEach(span=>{
      if(/\bprovenance\b/i.test(span.textContent||''))setText(span,span.textContent.replace(/\s*·\s*[A-Z]\s+provenance/i,' · official source').replace(/\bprovenance\b/ig,'source'));
    });
    const pill=$('.ciq-beta-pill',root);if(pill)pill.remove();
    $$('small',root).forEach(s=>{if(s.textContent.trim()==='Current P10 fiscal score')setText(s,'Current fiscal score');});
  }
  function cleanPublicSurface(){
    $('.demo-banner')?.remove();
    $('.footer-note')?.remove();
    $('#compare-legacy')?.remove();
    $('#rankings-legacy')?.remove();
    $$('[data-county-dashboard-link]').forEach(el=>el.remove());

    setText($('#geo-eyebrow'),'Explore Kenya');
    setText($('#geo-heading'),'Choose a place and indicator.');
    const geoSource=$('#geo-source-note');if(geoSource&&/remain outside the initial page-load path|load/i.test(geoSource.textContent||''))setText(geoSource,'Select an indicator to view available county data on the map.');

    const availability=$('.availability-card');
    if(availability){setText($('h3',availability),'Some data is only available at county level.');const p=$('p',availability);if(p)setText(p,'Where a local statistic is not published, the Atlas leaves it blank rather than assigning a broader-area value.');}
    const lifeLimit=$('.life-limitations');if(lifeLimit)setText(lifeLimit,'This view compares published county statistics only. It does not predict your personal salary, costs, safety or healthcare experience.');

    const catalogueCopy=$('.catalogue-copy>p');if(catalogueCopy)setText(catalogueCopy,'Browse documented datasets, inspect coverage and download the observations used across the Atlas.');

    const riNote=$('.ri-hero-note');
    if(riNote){setText($('small',riNote),'Coverage');setText($('strong',riNote),'47 counties');setText($('span',riNote),'Results are shown where the underlying data is complete; missing inputs remain unscored.');}
    const indicatorHead=$('[data-ri-panel="indicator"] .ri-panel-head');if(indicatorHead){const h=$('h2',indicatorHead),p=$('p',indicatorHead);if(h)setText(h,'Compare counties on any ranked indicator.');if(p)setText(p,'Choose an indicator to see national rank, percentile, peer position and trend where history is available.');}
    const gapHead=$('[data-ri-panel="gaps"] .ri-panel-head p');if(gapHead)setText(gapHead,'These highlights use the county statistics and benchmark comparisons shown in the Atlas.');

    const ciqPrinciple=$('.ciq-principle');
    if(ciqPrinciple){const spans=$$('span',ciqPrinciple);if(spans[0])spans[0].innerHTML='<strong>County data, with context.</strong> Compare the selected county with national and peer benchmarks.';if(spans[1])setText(spans[1],'Economic, fiscal, voter, health, education, agriculture and connectivity indicators retain their published source periods.');}
    const socialNote=$('.ciq-social-card .ciq-trend-note');if(socialNote)setText(socialNote,'County estimates are shown with their source periods. Survey point estimates are not ranked.');
    const breadthCard=$('.ciq-p05-card');if(breadthCard){setText($('.ciq-card-head small',breadthCard),'Broader county indicators');setText($('.ciq-card-head p',breadthCard),'Published county data across education, economic structure, agriculture and connectivity.');setText($('.ciq-p05-note',breadthCard),'Counts and rates are shown as published and are not combined into a single overall score.');}
    const evidenceHead=$('#ciq-evidence-hub .ciq-card-head');if(evidenceHead){setText($('small',evidenceHead),'Official documents');setText($('p',evidenceHead),'Planning, budget and accountability documents linked to their official sources.');}
    const evidenceDiscipline=$('.ciq-evidence');if(evidenceDiscipline)evidenceDiscipline.closest('.ciq-card')?.remove();
    cleanCountyIQGeneratedCopy();
  }
  function schedulePublicClean(){clearTimeout(publicCleanTimer);publicCleanTimer=setTimeout(cleanPublicSurface,0);}

  function installMapMeta(){
    const panel=$('.geo-map-panel'), wrap=$('.geo-map-wrap'), legend=$('#geo-legend'), source=$('#geo-source-note');
    if(!panel||!wrap||!legend||!source) return;
    let meta=$('.geo-map-meta',panel);
    if(!meta){meta=document.createElement('div');meta.className='geo-map-meta';meta.setAttribute('aria-label','Map legend and source');wrap.insertAdjacentElement('afterend',meta);}
    legend.removeAttribute('aria-hidden');
    if(legend.parentElement!==meta) meta.appendChild(legend);
    if(source.parentElement!==meta) meta.appendChild(source);
    const coverage=$('#sprint1-coverage');if(coverage&&coverage.parentElement!==meta) meta.appendChild(coverage);
    const old=$('.geo-map-overlay',panel);if(old) old.remove();
  }

  function clearMapHover(){
    const tip=$('#geo-tooltip');
    if(tip){tip.hidden=true;tip.innerHTML='';tip.style.removeProperty('left');tip.style.removeProperty('top');}
    $$('.geo-feature.hovered-linked').forEach(el=>el.classList.remove('hovered-linked'));
    $$('.geo-ranking-list button.hovered').forEach(el=>el.classList.remove('hovered'));
  }

  function installHoverCleanup(){
    const section=$('#geo-explorer'), wrap=$('.geo-map-wrap'), svg=$('#geo-svg'), ranking=$('.geo-ranking-panel');
    if(!section||section.dataset.hoverCleanup==='true') return;
    section.dataset.hoverCleanup='true';
    wrap?.addEventListener('pointerleave',clearMapHover);svg?.addEventListener('pointerleave',clearMapHover);ranking?.addEventListener('pointerleave',clearMapHover);section.addEventListener('mouseleave',clearMapHover);
    section.addEventListener('focusout',event=>{if(!section.contains(event.relatedTarget)) clearMapHover();});
    $('#geo-indicator')?.addEventListener('change',clearMapHover);window.addEventListener('hashchange',clearMapHover);
    document.addEventListener('pointermove',event=>{const tip=$('#geo-tooltip');if(tip&&!tip.hidden&&!event.target.closest('.geo-feature')) clearMapHover();},{passive:true});
    if(svg)new MutationObserver(clearMapHover).observe(svg,{childList:true});
  }

  function enhanceSparkline(){
    const el=$('.sparkline');if(!el||el.classList.contains('is-sparse')) return;
    const bars=$$('i',el);
    if(bars.length>0&&bars.length<4){const n=bars.length;el.classList.add('is-sparse');el.innerHTML=`<span class="sparkline-sparse-note"><b>${n} observations on file</b><span>Trend chart appears once more history accumulates.</span></span>`;el.setAttribute('aria-label',`Insufficient history for a trend chart; ${n} observations on file.`);}
  }

  function enhanceSummary(){
    const el=$('#geo-selected-summary');if(!el) return;
    el.classList.add('kda-card');el.setAttribute('aria-live','polite');
    const empty=!el.hidden&&/Data not currently available/i.test(el.textContent||'');el.classList.toggle('is-empty',empty);
    let badge=$('.geo-empty-badge',el);
    if(empty&&!badge){badge=document.createElement('span');badge.className='badge missing geo-empty-badge';badge.textContent='N/A';el.prepend(badge);}else if(!empty&&badge){badge.remove();}
  }

  function applyCardSystem(){$$('.metric-card,.quick-facts article,.dataset,.chart-card,.availability-card,#geo-selected-summary').forEach(el=>el.classList.add('kda-card'));}

  function animateNewMapNodes(){
    const svg=$('#geo-svg');if(!svg||svg.dataset.uxMotion==='true') return;
    svg.dataset.uxMotion='true';
    const animate=nodes=>{if(reduced) return;nodes.forEach(node=>{const paths=node.matches?.('.geo-feature')?[node]:$$('.geo-feature',node);paths.forEach(path=>{if(path.dataset.uxAnimated) return;path.dataset.uxAnimated='true';path.animate([{opacity:0},{opacity:1}],{duration:180,easing:'ease-out'});});});};
    new MutationObserver(ms=>ms.forEach(m=>animate([...m.addedNodes].filter(n=>n.nodeType===1)))).observe(svg,{childList:true,subtree:true});
  }

  function animateSearchResults(){
    const el=$('#search-results');if(!el||el.dataset.uxMotion==='true') return;
    el.dataset.uxMotion='true';
    new MutationObserver(()=>{if(!el.hidden&&!reduced)el.animate([{opacity:0,transform:'translateY(-4px) scale(.985)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:150,easing:'ease-out'});}).observe(el,{attributes:true,attributeFilter:['hidden']});
  }

  function enhanceTwoPointSeries(){
    const wrap=$('.large-chart'), svg=$('.large-chart svg');if(!wrap||!svg) return;
    const circles=$$('circle',svg);wrap.classList.toggle('two-point-series',circles.length===2);
    if(circles.length===2){wrap.setAttribute('role','img');wrap.setAttribute('aria-label','Two observations on file; points shown without interpolation.');}
  }

  function colorCatalogue(){
    const palette=['#537f70','#b86b4b','#697da8','#9b7a45','#6c8f4f','#866c9f','#4c8992'];
    $$('.dataset').forEach(card=>{const topic=(card.querySelector('p')?.textContent||card.querySelector('.dataset-icon')?.textContent||'data').split('·')[0].trim();let hash=0;for(const ch of topic)hash=(hash*31+ch.charCodeAt(0))>>>0;card.style.setProperty('--dataset-accent',palette[hash%palette.length]);card.dataset.topic=topic.toLowerCase().replace(/[^a-z0-9]+/g,'-');card.classList.add('kda-card');});
  }

  function loadPlaceProfile(){
    if(document.querySelector('script[data-place-profile-loader]')) return;
    const script=document.createElement('script');script.src='assets/place-profile.js';script.async=false;script.dataset.placeProfileLoader='true';document.body.appendChild(script);
  }

  function installMobileNavigation(){
    const menu=$('.menu-button'),nav=$('#main-nav'),header=$('.site-header');
    if(!menu||!nav||!header||header.dataset.mobileNavPolish==='true') return;
    header.dataset.mobileNavPolish='true';
    const sync=()=>{const open=nav.classList.contains('open');menu.setAttribute('aria-expanded',String(open));menu.textContent=open?'Close':'Menu';menu.setAttribute('aria-label',open?'Close main navigation':'Open main navigation');};
    const close=({focus=false}={})=>{if(!nav.classList.contains('open')){sync();return;}nav.classList.remove('open');sync();if(focus)menu.focus({preventScroll:true});};
    new MutationObserver(sync).observe(nav,{attributes:true,attributeFilter:['class']});
    menu.addEventListener('click',()=>queueMicrotask(sync));
    document.addEventListener('pointerdown',event=>{if(nav.classList.contains('open')&&!header.contains(event.target))close();},{passive:true});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&nav.classList.contains('open')){event.preventDefault();close({focus:true});}});
    window.addEventListener('kda:route',()=>close());
    const desktop=window.matchMedia?.('(min-width:901px)');const onDesktop=event=>{if(event.matches)close();};if(desktop?.addEventListener)desktop.addEventListener('change',onDesktop);else if(desktop?.addListener)desktop.addListener(onDesktop);sync();
  }

  function installObservers(){
    const spark=$('.sparkline');if(spark)new MutationObserver(enhanceSparkline).observe(spark,{childList:true});
    const summary=$('#geo-selected-summary');if(summary)new MutationObserver(enhanceSummary).observe(summary,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
    const pulse=$('#pulse-grid');if(pulse)new MutationObserver(applyCardSystem).observe(pulse,{childList:true});
    const facts=$('.quick-facts');if(facts)new MutationObserver(applyCardSystem).observe(facts,{childList:true});
    const datasets=$('#dataset-list');if(datasets)new MutationObserver(()=>{applyCardSystem();colorCatalogue();}).observe(datasets,{childList:true});
    const chart=$('.large-chart svg');if(chart)new MutationObserver(enhanceTwoPointSeries).observe(chart,{childList:true,subtree:true});
    const panel=$('.geo-map-panel');if(panel)new MutationObserver(installMapMeta).observe(panel,{childList:true,subtree:true});
    new MutationObserver(schedulePublicClean).observe(document.body,{childList:true,subtree:true});
  }

  function boot(){
    loadRefinementStyles();cleanPublicSurface();installMapMeta();installHoverCleanup();clearMapHover();applyCardSystem();enhanceSparkline();enhanceSummary();animateNewMapNodes();animateSearchResults();enhanceTwoPointSeries();colorCatalogue();installMobileNavigation();installObservers();loadPlaceProfile();
    window.addEventListener('kda:route',schedulePublicClean);
    setTimeout(()=>{installMapMeta();clearMapHover();applyCardSystem();enhanceSparkline();enhanceSummary();enhanceTwoPointSeries();colorCatalogue();installMobileNavigation();cleanPublicSurface();},650);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
