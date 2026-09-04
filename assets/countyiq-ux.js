/* CountyIQ premium UX — navigation, county-state hardening, print/PDF and progressive disclosure. */
(function(){
  'use strict';

  let scheduled=false;
  let observer=null;
  let observedRoot=null;
  let backTop=null;
  let listenersInstalled=false;
  let printState=null;
  let countySyncing=false;

  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  const routeRoot=()=>document.querySelector('#countyiq-view,[data-view="countyiq"],.countyiq-route');
  const isCountyIQ=()=>{
    const route=window.KDARouter?.current?.();
    return route?.view==='countyiq'||/^#\/?countyiq(?:[/?]|$)/.test(location.hash)||Boolean(routeRoot()&&!routeRoot().hidden);
  };

  function headingTarget(pattern){
    const root=routeRoot();
    if(!root)return null;
    return $$('h2,h3',root).find(node=>pattern.test(node.textContent.trim()))||null;
  }

  function targets(){
    return [
      ['Overview',$('#countyiq-profile')||$('.ciq-principle')],
      ['Economy',headingTarget(/^Gross County Product$/i)],
      ['Public finance',headingTarget(/Twelve-year fiscal experience|Public finance/i)],
      ['Outcomes',headingTarget(/Official county outcomes|Health & living standards/i)],
      ['Development',headingTarget(/Education, economy, agriculture|Broader county indicators/i)],
      ['Evidence',$('#ciq-evidence-hub')],
      ['Opportunities',$('#ciq-opportunity-finder')]
    ].filter(([,node])=>Boolean(node));
  }

  function slug(label){return`ciq-${label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`;}

  function ensureJumpNav(){
    const root=routeRoot();
    const hero=$('.ciq-hero',root||document);
    if(!root||!hero)return;
    const items=targets();
    if(items.length<3)return;
    items.forEach(([label,node])=>{node.id=node.id||slug(label);node.classList.add('ciq-ux-anchor');});
    let wrap=$('.ciq-jump-nav-wrap',root);
    if(!wrap){
      wrap=document.createElement('div');
      wrap.className='ciq-jump-nav-wrap';
      wrap.innerHTML='<nav class="ciq-jump-nav" aria-label="CountyIQ sections"></nav>';
      hero.insertAdjacentElement('afterend',wrap);
    }
    const nav=$('.ciq-jump-nav',wrap);
    const desired=items.map(([label,node])=>`${label}|${node.id}`).join(';');
    if(nav.dataset.items!==desired){
      nav.dataset.items=desired;
      nav.innerHTML=items.map(([label,node],index)=>`<a href="#${node.id}" data-ciq-tab="${slug(label)}"${index===0?' aria-current="true"':''}>${label}</a>`).join('');
    }
    if(nav.dataset.bound!=='true'){
      nav.dataset.bound='true';
      nav.addEventListener('click',event=>{
        const link=event.target.closest('a');
        if(!link)return;
        const target=document.getElementById(link.getAttribute('href').slice(1));
        if(!target)return;
        event.preventDefault();
        target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
      });
    }
  }

  function wrapFiscalTable(){
    const tableWrap=$('.ciq-fiscal-table-wrap');
    if(!tableWrap||tableWrap.closest('.ciq-history-disclosure'))return;
    const details=document.createElement('details');
    details.className='ciq-history-disclosure';
    const summary=document.createElement('summary');
    summary.textContent='View the 12-year fiscal table';
    details.appendChild(summary);
    tableWrap.parentNode.insertBefore(details,tableWrap);
    details.appendChild(tableWrap);
  }

  function progressiveList(listSelector,itemSelector,limit,label){
    const list=$(listSelector);
    if(!list)return;
    const items=$$(itemSelector,list);
    if(!items.length)return;
    if(items.length<=limit){
      const stale=list.nextElementSibling;
      if(stale?.classList.contains('ciq-disclosure-actions'))stale.remove();
      items.forEach(item=>{item.classList.add('ciq-progressive-item');item.hidden=false;});
      return;
    }
    let actions=list.nextElementSibling;
    if(!actions?.classList.contains('ciq-disclosure-actions')){
      actions=document.createElement('div');
      actions.className='ciq-disclosure-actions';
      list.insertAdjacentElement('afterend',actions);
    }
    const expanded=actions.dataset.expanded==='true';
    items.forEach((item,index)=>{
      item.classList.add('ciq-progressive-item');
      item.hidden=!expanded&&index>=limit;
    });
    let button=$('.ciq-disclosure-button',actions);
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='ciq-disclosure-button';
      actions.appendChild(button);
      button.addEventListener('click',()=>{
        actions.dataset.expanded=actions.dataset.expanded==='true'?'false':'true';
        enhance();
      });
    }
    const open=actions.dataset.expanded==='true';
    button.setAttribute('aria-expanded',String(open));
    button.textContent=open?`Show fewer ${label}`:`Show all ${items.length} ${label}`;
  }

  function ensureBackTop(){
    if(backTop?.isConnected)return;
    backTop=document.createElement('button');
    backTop.type='button';
    backTop.className='ciq-ux-backtop';
    backTop.textContent='↑ Top';
    backTop.setAttribute('aria-label','Back to top of CountyIQ');
    backTop.addEventListener('click',()=>routeRoot()?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));
    document.body.appendChild(backTop);
    syncBackTop();
  }

  function syncBackTop(){backTop?.classList.toggle('visible',isCountyIQ()&&scrollY>900);}

  function syncActiveNav(){
    const nav=$('.ciq-jump-nav');
    if(!nav)return;
    const links=$$('a',nav);
    let current=links[0];
    for(const link of links){
      const node=document.getElementById(link.getAttribute('href').slice(1));
      if(node&&node.getBoundingClientRect().top<=176)current=link;
    }
    links.forEach(link=>{if(link===current)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');});
  }

  function countyCodeFromRoute(){
    const r=window.KDARouter?.current?.()||window.KDARouter?.parse?.();
    const routed=r?.view==='countyiq'?r.params?.get?.('county'):null;
    if(/^KEN-C\d{3}$/.test(routed||''))return routed;
    try{
      const hash=location.hash||'';
      const query=hash.includes('?')?hash.slice(hash.indexOf('?')+1):'';
      const raw=new URLSearchParams(query).get('county');
      if(/^KEN-C\d{3}$/.test(raw||''))return raw;
      const stored=sessionStorage.getItem('kda:countyiq:county');
      return /^KEN-C\d{3}$/.test(stored||'')?stored:null;
    }catch(_){return null;}
  }

  function persistCounty(code){
    if(!/^KEN-C\d{3}$/.test(code||''))return;
    try{sessionStorage.setItem('kda:countyiq:county',code);}catch(_){/* privacy/storage fallback */}
    const R=window.KDARouter;
    const current=R?.current?.()||R?.parse?.();
    if(current?.view==='countyiq'&&current.params?.get?.('county')!==code&&typeof R.replace==='function'){
      const params=new URLSearchParams(current.params||'');
      params.set('county',code);
      try{R.replace('countyiq','',params,{scroll:false});}catch(_){/* rendering already succeeded */}
    }
  }

  function stampCounty(code){
    const root=routeRoot();
    const picker=$('#ciq-county-select');
    const name=picker?.selectedOptions?.[0]?.textContent?.replace(/^\s*\d{3}\s*[·\-:]\s*/,'').trim()||$('#ciq-county-title')?.textContent?.trim();
    if(root&&name)root.dataset.printCounty=name;
    try{window.dispatchEvent(new CustomEvent('kda:countyiq-county-change',{detail:{geoCode:code,name}}));}catch(_){/* old browser fallback */}
  }

  function renderCountyEverywhere(code,{persist=true}={}){
    if(countySyncing||!/^KEN-C\d{3}$/.test(code||''))return;
    countySyncing=true;
    try{
      window.KDACountyIQ?.render?.(code);
      window.KDAEvidenceHub?.render?.(code);
      window.KDAOpportunityFinder?.render?.(code);
      if(persist)persistCounty(code);
      stampCounty(code);
      scheduleFrame();
    }finally{countySyncing=false;}
  }

  function handlePickerChange(code){
    if(!/^KEN-C\d{3}$/.test(code||''))return;
    const sync=()=>{
      if(window.KDACountyIQ?.state?.().currentCode!==code)window.KDACountyIQ?.render?.(code);
      persistCounty(code);
      stampCounty(code);
      scheduleFrame();
    };
    if(typeof queueMicrotask==='function')queueMicrotask(sync);else setTimeout(sync,0);
  }

  function ensureCountyPickerHardening(){
    const picker=$('#ciq-county-select');
    if(!picker)return;
    picker.dataset.ciqHardened='true';
    const desired=countyCodeFromRoute();
    if(desired&&[...picker.options].some(option=>option.value===desired)&&picker.value!==desired){
      picker.value=desired;
      renderCountyEverywhere(desired,{persist:false});
    }
  }

  function toneFiscalSignals(){
    $$('.ciq-fiscal-insights strong,.ciq-recognition-panel .ciq-fiscal strong').forEach(node=>{
      const text=node.textContent.trim();
      node.classList.toggle('ciq-positive',/^\+/.test(text));
      node.classList.toggle('ciq-negative',/^-/.test(text));
    });
  }

  function ensurePrintControls(){
    const controls=$('.ciq-controls');
    if(!controls)return;
    let actions=$('.ciq-hero-actions',controls);
    if(!actions){
      actions=document.createElement('div');
      actions.className='ciq-hero-actions';
      actions.innerHTML='<button type="button" class="ciq-print-button" aria-label="Print CountyIQ or save as PDF"><span aria-hidden="true">↧</span> Print / PDF</button>';
      controls.appendChild(actions);
      $('.ciq-print-button',actions)?.addEventListener('click',printCountyIQ);
    }
  }

  function printCountyIQ(){
    const root=routeRoot();
    if(!root)return;
    const details=$$('details',root);
    const progressive=$$('.ciq-progressive-item',root);
    printState={details:details.map(node=>node.open),hidden:progressive.map(node=>node.hidden),title:document.title};
    details.forEach(node=>{node.open=true;});
    progressive.forEach(node=>{node.hidden=false;});
    const county=$('#ciq-county-title')?.textContent?.trim()||'County';
    root.dataset.printCounty=county;
    root.dataset.printDate=new Intl.DateTimeFormat('en-KE',{dateStyle:'medium'}).format(new Date());
    document.body.classList.add('ciq-printing');
    document.title=`${county} CountyIQ · Kenya Data Atlas`;
    requestAnimationFrame(()=>window.print());
  }

  function restoreAfterPrint(){
    if(!printState)return;
    const root=routeRoot();
    const details=$$('details',root||document);
    const progressive=$$('.ciq-progressive-item',root||document);
    details.forEach((node,index)=>{if(index<printState.details.length)node.open=printState.details[index];});
    progressive.forEach((node,index)=>{if(index<printState.hidden.length)node.hidden=printState.hidden[index];});
    document.title=printState.title;
    document.body.classList.remove('ciq-printing');
    printState=null;
  }

  function connectObserver(){
    const root=routeRoot();
    if(!observer)observer=new MutationObserver(scheduleFrame);
    if(root===observedRoot&&root?.isConnected)return;
    observer.disconnect();
    observedRoot=root||null;
    if(observedRoot)observer.observe(observedRoot,{childList:true,subtree:true});
  }

  function enhance(){
    scheduled=false;
    if(!isCountyIQ()){connectObserver();return;}
    observer?.disconnect();
    try{
      ensureJumpNav();
      wrapFiscalTable();
      progressiveList('#ciq-evidence-list','.evidence-item',4,'evidence records');
      progressiveList('#opportunity-list','.opportunity-card',4,'programmes');
      ensureBackTop();
      ensureCountyPickerHardening();
      ensurePrintControls();
      toneFiscalSignals();
      syncActiveNav();
      syncBackTop();
    }finally{
      observedRoot=null;
      connectObserver();
    }
  }

  function scheduleInitial(){
    if(scheduled)return;
    scheduled=true;
    if(typeof queueMicrotask==='function')queueMicrotask(enhance);
    else Promise.resolve().then(enhance);
  }
  function scheduleFrame(){
    if(scheduled)return;
    scheduled=true;
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(enhance);
    else setTimeout(enhance,0);
  }
  function routeSchedule(){connectObserver();scheduleInitial();setTimeout(ensureCountyPickerHardening,60);}

  function boot(){
    routeSchedule();
    if(!listenersInstalled){
      listenersInstalled=true;
      window.addEventListener('hashchange',routeSchedule);
      window.addEventListener('scroll',()=>{syncActiveNav();syncBackTop();},{passive:true});
      window.addEventListener('kda:route',routeSchedule);
      window.addEventListener('afterprint',restoreAfterPrint);
      document.addEventListener('change',event=>{
        if(event.target?.id==='ciq-county-select')handlePickerChange(event.target.value);
      },true);
    }
    return true;
  }

  window.KDACountyIQUX={boot,enhance,selectCounty:renderCountyEverywhere,print:printCountyIQ};
  boot();
})();
