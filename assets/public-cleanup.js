/* Kenya Data Atlas — public-facing copy cleanup. */
(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const set=(el,value)=>{if(el&&el.textContent!==value)el.textContent=value;};
  let timer=null,countyIqUxPromise=null;

  function loadCountyIQUX(){
    if(window.KDACountyIQUX){window.KDACountyIQUX.boot?.();return Promise.resolve(window.KDACountyIQUX);}
    if(countyIqUxPromise)return countyIqUxPromise;
    const KDA=window.KDAData;
    if(!KDA?.loadStyle||!KDA?.loadScript)return Promise.resolve(null);
    countyIqUxPromise=Promise.all([
      KDA.loadStyle('assets/countyiq-ux.css',{id:'kda-countyiq-ux-css'}),
      KDA.loadScript('assets/countyiq-ux.js',{id:'kda-countyiq-ux'})
    ]).then(()=>{window.KDACountyIQUX?.boot?.();return window.KDACountyIQUX||null;})
      .catch(error=>{console.warn('CountyIQ UX load:',error?.message||error);countyIqUxPromise=null;return null;});
    return countyIqUxPromise;
  }

  function cleanCountyIQ(){
    const root=$('#countyiq-view');if(!root)return;
    const failure=$('.ciq-error',root);
    if(failure&&/CountyIQ could not initialize|Cannot read properties|toFixed/i.test(failure.textContent||'')){
      failure.innerHTML='<strong>County details are temporarily unavailable.</strong><br>Please refresh the page or choose another county.';
      const mode=$('#ciq-mode');if(mode){mode.className='ciq-mode error';mode.innerHTML='<i></i><span>County data unavailable</span>';}
    }
    $$('.ciq-p05-group h3',root).forEach(h=>{
      const value=h.textContent.trim();
      if(value==='Peer & national standing (P06)')set(h,'Peer & national standing');
      else if(value==='Gaps & evidence narrative (P07)')set(h,'Strengths, gaps & recent change');
      else if(value.startsWith('Fiscal delivery & accountability (P10)'))set(h,'Fiscal delivery & accountability');
      else if(value.startsWith('Administration-period scorecard & recognition (P11)'))set(h,'Administration-period trends & recognition');
    });
    $$('.ciq-p05-group header span',root).forEach(span=>{if(/^P09\s*·/i.test(span.textContent||''))set(span,'latest county snapshot');});
    $$('.ciq-peer-note',root).forEach(note=>{
      const value=(note.textContent||'').trim();
      if(value.startsWith('P09 snapshot gate:')||value.startsWith('Longitudinal composite:'))note.remove();
      else if(value.startsWith('This county does not currently qualify for a published P11'))set(note,'This county does not currently qualify for a recognition category.');
    });
    $$('.ciq-p05-metric span',root).forEach(span=>{if(/\bprovenance\b/i.test(span.textContent||''))set(span,span.textContent.replace(/\s*·\s*[A-Z]\s+provenance/i,' · official source').replace(/\bprovenance\b/ig,'source'));});
    $('.ciq-beta-pill',root)?.remove();
    $$('small',root).forEach(s=>{if(s.textContent.trim()==='Current P10 fiscal score')set(s,'Current fiscal score');});
  }

  function clean(){
    $('.demo-banner')?.remove();$('.footer-note')?.remove();
    $$('[data-county-dashboard-link]').forEach(el=>el.remove());
    set($('#geo-eyebrow'),'Explore Kenya');set($('#geo-heading'),'Choose a place and indicator.');
    const geoSource=$('#geo-source-note');if(geoSource&&/remain outside the initial page-load path|load/i.test(geoSource.textContent||''))set(geoSource,'Select an indicator to view available county data on the map.');
    const availability=$('.availability-card');if(availability){set($('h3',availability),'Some data is only available at county level.');set($('p',availability),'Where a local statistic is not published, the Atlas leaves it blank rather than assigning a broader-area value.');}
    set($('.life-limitations'),'This view compares published county statistics only. It does not predict your personal salary, costs, safety or healthcare experience.');
    set($('.catalogue-copy>p'),'Browse documented datasets, inspect coverage and download the observations used across the Atlas.');
    const coverage=$$('.catalogue-copy .coverage>div');if(coverage.length>=3){set($('strong',coverage[0]),'Public');set($('span',coverage[0]),'indicator catalogue');set($('strong',coverage[1]),'Open');set($('span',coverage[1]),'downloadable data');set($('span',coverage[2]),'geographic levels');}
    const riNote=$('.ri-hero-note');if(riNote){set($('small',riNote),'Coverage');set($('strong',riNote),'47 counties');set($('span',riNote),'Results are shown where the underlying data is complete; missing inputs remain unscored.');}
    const indicatorHead=$('[data-ri-panel="indicator"] .ri-panel-head');if(indicatorHead){set($('h2',indicatorHead),'Compare counties on any ranked indicator.');set($('p',indicatorHead),'Choose an indicator to see national rank, percentile, peer position and trend where history is available.');}
    set($('[data-ri-panel="gaps"] .ri-panel-head p'),'These highlights use the county statistics and benchmark comparisons shown in the Atlas.');
    const principle=$('.ciq-principle');if(principle){const spans=$$('span',principle);if(spans[0])spans[0].innerHTML='<strong>County data, with context.</strong> Compare the selected county with national and peer benchmarks.';set(spans[1],'Economic, fiscal, voter, health, education, agriculture and connectivity indicators retain their published source periods.');}
    set($('.ciq-social-card .ciq-trend-note'),'County estimates are shown with their source periods. Survey point estimates are not ranked.');
    const breadth=$('.ciq-p05-card');if(breadth){set($('.ciq-card-head small',breadth),'Broader county indicators');set($('.ciq-card-head p',breadth),'Published county data across education, economic structure, agriculture and connectivity.');set($('.ciq-p05-note',breadth),'Counts and rates are shown as published and are not combined into a single overall score.');}
    const evidence=$('#ciq-evidence-hub .ciq-card-head');if(evidence){set($('small',evidence),'Official documents');set($('p',evidence),'Planning, budget and accountability documents linked to their official sources.');}
    const discipline=$('.ciq-evidence');if(discipline)discipline.closest('.ciq-card')?.remove();
    cleanCountyIQ();
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(clean,0);}
  function boot(){loadCountyIQUX();clean();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});window.addEventListener('kda:route',schedule);setTimeout(clean,650);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
