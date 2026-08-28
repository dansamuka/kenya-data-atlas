/* Kenya Data Atlas — UX polish layer
 * Presentation-only enhancements. No registry/data values are modified.
 */
(function(){
  'use strict';
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function installMapMeta(){
    const panel=$('.geo-map-panel'), wrap=$('.geo-map-wrap'), legend=$('#geo-legend'), source=$('#geo-source-note');
    if(!panel||!wrap||!legend||!source) return;
    let meta=$('.geo-map-meta',panel);
    if(!meta){
      meta=document.createElement('div');
      meta.className='geo-map-meta';
      meta.setAttribute('aria-label','Map legend and source');
      wrap.insertAdjacentElement('afterend',meta);
    }
    legend.removeAttribute('aria-hidden');
    if(legend.parentElement!==meta) meta.appendChild(legend);
    if(source.parentElement!==meta) meta.appendChild(source);
    const coverage=$('#sprint1-coverage');
    if(coverage&&coverage.parentElement!==meta) meta.appendChild(coverage);
    const old=$('.geo-map-overlay',panel);
    if(old) old.remove();
  }

  function clearMapHover(){
    const tip=$('#geo-tooltip');
    if(tip){
      tip.hidden=true;
      tip.innerHTML='';
      tip.style.removeProperty('left');
      tip.style.removeProperty('top');
    }
    $$('.geo-feature.hovered-linked').forEach(el=>el.classList.remove('hovered-linked'));
    $$('.geo-ranking-list button.hovered').forEach(el=>el.classList.remove('hovered'));
  }

  function installHoverCleanup(){
    const section=$('#geo-explorer'), wrap=$('.geo-map-wrap'), svg=$('#geo-svg'), ranking=$('.geo-ranking-panel');
    if(!section||section.dataset.hoverCleanup==='true') return;
    section.dataset.hoverCleanup='true';
    wrap?.addEventListener('pointerleave',clearMapHover);
    svg?.addEventListener('pointerleave',clearMapHover);
    ranking?.addEventListener('pointerleave',clearMapHover);
    section.addEventListener('mouseleave',clearMapHover);
    section.addEventListener('focusout',event=>{
      if(!section.contains(event.relatedTarget)) clearMapHover();
    });
    $('#geo-indicator')?.addEventListener('change',clearMapHover);
    window.addEventListener('hashchange',clearMapHover);
    document.addEventListener('pointermove',event=>{
      const tip=$('#geo-tooltip');
      if(tip&&!tip.hidden&&!event.target.closest('.geo-feature')) clearMapHover();
    },{passive:true});
    if(svg){
      new MutationObserver(clearMapHover).observe(svg,{childList:true});
    }
  }

  function enhanceSparkline(){
    const el=$('.sparkline');
    if(!el||el.classList.contains('is-sparse')) return;
    const bars=$$('i',el);
    if(bars.length>0&&bars.length<4){
      const n=bars.length;
      el.classList.add('is-sparse');
      el.innerHTML=`<span class="sparkline-sparse-note"><b>${n} observations on file</b><span>Trend chart appears once more history accumulates.</span></span>`;
      el.setAttribute('aria-label',`Insufficient history for a trend chart; ${n} observations on file.`);
    }
  }

  function enhanceSummary(){
    const el=$('#geo-selected-summary');
    if(!el) return;
    el.classList.add('kda-card');
    el.setAttribute('aria-live','polite');
    const empty=!el.hidden&&/Data not currently available/i.test(el.textContent||'');
    el.classList.toggle('is-empty',empty);
    let badge=$('.geo-empty-badge',el);
    if(empty&&!badge){
      badge=document.createElement('span');
      badge.className='badge missing geo-empty-badge';
      badge.textContent='N/A';
      el.prepend(badge);
    }else if(!empty&&badge){badge.remove();}
  }

  function applyCardSystem(){
    $$('.metric-card,.quick-facts article,.dataset,.chart-card,.availability-card,#geo-selected-summary').forEach(el=>el.classList.add('kda-card'));
  }

  function animateNewMapNodes(){
    const svg=$('#geo-svg');
    if(!svg||svg.dataset.uxMotion==='true') return;
    svg.dataset.uxMotion='true';
    const animate=nodes=>{
      if(reduced) return;
      nodes.forEach(node=>{
        const paths=node.matches?.('.geo-feature')?[node]:$$('.geo-feature',node);
        paths.forEach(path=>{
          if(path.dataset.uxAnimated) return;
          path.dataset.uxAnimated='true';
          path.animate([{opacity:0},{opacity:1}],{duration:180,easing:'ease-out'});
        });
      });
    };
    new MutationObserver(ms=>ms.forEach(m=>animate([...m.addedNodes].filter(n=>n.nodeType===1))))
      .observe(svg,{childList:true,subtree:true});
  }

  function animateSearchResults(){
    const el=$('#search-results');
    if(!el||el.dataset.uxMotion==='true') return;
    el.dataset.uxMotion='true';
    new MutationObserver(()=>{
      if(!el.hidden&&!reduced){
        el.animate([{opacity:0,transform:'translateY(-4px) scale(.985)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:150,easing:'ease-out'});
      }
    }).observe(el,{attributes:true,attributeFilter:['hidden']});
  }

  function enhanceTwoPointSeries(){
    const wrap=$('.large-chart'), svg=$('.large-chart svg');
    if(!wrap||!svg) return;
    const circles=$$('circle',svg);
    wrap.classList.toggle('two-point-series',circles.length===2);
    if(circles.length===2){
      wrap.setAttribute('role','img');
      wrap.setAttribute('aria-label','Two observations on file; points shown without interpolation.');
    }
  }

  function colorCatalogue(){
    const palette=['#537f70','#b86b4b','#697da8','#9b7a45','#6c8f4f','#866c9f','#4c8992'];
    $$('.dataset').forEach(card=>{
      const topic=(card.querySelector('p')?.textContent||card.querySelector('.dataset-icon')?.textContent||'data').split('·')[0].trim();
      let hash=0; for(const ch of topic) hash=(hash*31+ch.charCodeAt(0))>>>0;
      card.style.setProperty('--dataset-accent',palette[hash%palette.length]);
      card.dataset.topic=topic.toLowerCase().replace(/[^a-z0-9]+/g,'-');
      card.classList.add('kda-card');
    });
  }

  function loadPlaceProfile(){
    if(document.querySelector('script[data-place-profile-loader]')) return;
    const script=document.createElement('script');
    script.src='assets/place-profile.js';
    script.async=false;
    script.dataset.placeProfileLoader='true';
    document.body.appendChild(script);
  }

  function installCountyDashboardLink(){
    const nav=$('#main-nav');
    if(!nav||nav.querySelector('[data-county-dashboard-link]')) return;
    const link=document.createElement('a');
    link.href='county-dashboard.html';
    link.textContent='County Dashboard';
    link.dataset.countyDashboardLink='true';
    link.setAttribute('aria-label','Open County Dashboard');
    nav.appendChild(link);
  }

  function installObservers(){
    const spark=$('.sparkline');
    if(spark) new MutationObserver(enhanceSparkline).observe(spark,{childList:true});
    const summary=$('#geo-selected-summary');
    if(summary) new MutationObserver(enhanceSummary).observe(summary,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
    const pulse=$('#pulse-grid');
    if(pulse) new MutationObserver(applyCardSystem).observe(pulse,{childList:true});
    const facts=$('.quick-facts');
    if(facts) new MutationObserver(applyCardSystem).observe(facts,{childList:true});
    const datasets=$('#dataset-list');
    if(datasets) new MutationObserver(()=>{applyCardSystem();colorCatalogue();}).observe(datasets,{childList:true});
    const chart=$('.large-chart svg');
    if(chart) new MutationObserver(enhanceTwoPointSeries).observe(chart,{childList:true,subtree:true});
    const panel=$('.geo-map-panel');
    if(panel) new MutationObserver(installMapMeta).observe(panel,{childList:true,subtree:true});
  }

  function boot(){
    installMapMeta();
    installHoverCleanup();
    clearMapHover();
    applyCardSystem();
    enhanceSparkline();
    enhanceSummary();
    animateNewMapNodes();
    animateSearchResults();
    enhanceTwoPointSeries();
    colorCatalogue();
    installCountyDashboardLink();
    installObservers();
    loadPlaceProfile();
    setTimeout(()=>{installMapMeta();clearMapHover();applyCardSystem();enhanceSparkline();enhanceSummary();enhanceTwoPointSeries();colorCatalogue();installCountyDashboardLink();},650);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
