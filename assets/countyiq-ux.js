/* CountyIQ UX pass — progressive enhancement only; data and provenance remain canonical. */
(function(){
  'use strict';
  let scheduled=false;
  let observer=null;
  let backTop=null;

  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  const routeRoot=()=>document.querySelector('[data-view="countyiq"], .countyiq-route');
  const isCountyIQ=()=>/^#\/?countyiq(?:[/?]|$)/.test(location.hash)||Boolean(routeRoot()?.classList.contains('active'));

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
      nav.innerHTML=items.map(([label,node],index)=>`<a href="#${node.id}"${index===0?' aria-current="true"':''}>${label}</a>`).join('');
      nav.addEventListener('click',event=>{
        const link=event.target.closest('a');
        if(!link)return;
        const target=document.getElementById(link.getAttribute('href').slice(1));
        if(!target)return;
        event.preventDefault();
        target.scrollIntoView({behavior:'smooth',block:'start'});
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
    let actions=list.nextElementSibling;
    if(!actions?.classList.contains('ciq-disclosure-actions')){
      actions=document.createElement('div');
      actions.className='ciq-disclosure-actions';
      list.insertAdjacentElement('afterend',actions);
    }
    const state=actions.dataset.expanded==='true';
    items.forEach((item,index)=>{
      item.classList.add('ciq-progressive-item');
      item.hidden=!state&&index>=limit;
    });
    if(items.length<=limit){actions.remove();return;}
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
    const expanded=actions.dataset.expanded==='true';
    button.setAttribute('aria-expanded',String(expanded));
    button.textContent=expanded?`Show fewer ${label}`:`Show all ${items.length} ${label}`;
  }

  function ensureBackTop(){
    if(backTop?.isConnected)return;
    backTop=document.createElement('button');
    backTop.type='button';
    backTop.className='ciq-ux-backtop';
    backTop.textContent='↑ Top';
    backTop.setAttribute('aria-label','Back to top of CountyIQ');
    backTop.addEventListener('click',()=>routeRoot()?.scrollIntoView({behavior:'smooth',block:'start'}));
    document.body.appendChild(backTop);
    const sync=()=>backTop?.classList.toggle('visible',isCountyIQ()&&scrollY>900);
    window.addEventListener('scroll',sync,{passive:true});
    sync();
  }

  function syncActiveNav(){
    const nav=$('.ciq-jump-nav');
    if(!nav)return;
    const links=$$('a',nav);
    let current=links[0];
    for(const link of links){
      const node=document.getElementById(link.getAttribute('href').slice(1));
      if(node&&node.getBoundingClientRect().top<=170)current=link;
    }
    links.forEach(link=>{if(link===current)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');});
  }

  function enhance(){
    scheduled=false;
    if(!isCountyIQ())return;
    ensureJumpNav();
    wrapFiscalTable();
    progressiveList('#ciq-evidence-list','.evidence-item',4,'evidence records');
    progressiveList('#opportunity-list','.opportunity-card',4,'programmes');
    ensureBackTop();
    syncActiveNav();
  }

  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(enhance);}

  function boot(){
    schedule();
    if(!observer){
      observer=new MutationObserver(schedule);
      observer.observe(document.body,{childList:true,subtree:true});
      window.addEventListener('hashchange',schedule);
      window.addEventListener('scroll',syncActiveNav,{passive:true});
      window.addEventListener('kda:route',schedule);
    }
    return true;
  }

  window.KDACountyIQUX={boot,enhance};
  boot();
})();
