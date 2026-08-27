/* Kenya Data Atlas — registry-driven unit presentation
 * Makes units explicit across indicator surfaces without duplicating them on
 * every number. The source of truth remains indicators.json + units.json.
 */
(function(){
  'use strict';
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
  let indicators=[], units=[], indicatorByCode=new Map(), unitById=new Map();

  const json=async url=>{
    try{const r=await fetch(url);return r.ok?await r.json():[];}catch{return [];}
  };

  const normalize=s=>String(s||'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'');

  function shortUnit(unit){
    if(!unit) return '';
    return {
      persons:'persons',
      percent:'%',
      kes_per_usd:'KES/USD',
      km2:'km²',
      kes_per_litre:'KES/L',
      kes_million:'KSh mn'
    }[unit.code] || unit.symbol || unit.name || '';
  }

  function longUnit(unit){
    if(!unit) return '';
    return {
      persons:'Persons',
      percent:'Percent (%)',
      kes_per_usd:'Kenya shillings per US dollar (KES/USD)',
      km2:'Square kilometres (km²)',
      kes_per_litre:'Kenya shillings per litre (KES/L)',
      kes_million:'Kenya shillings, million (KSh mn)'
    }[unit.code] || [unit.name,unit.symbol&&`(${unit.symbol})`].filter(Boolean).join(' ');
  }

  function unitForIndicator(indicator){return indicator?unitById.get(indicator.unit_id):null;}
  function indicatorForCode(code){return indicatorByCode.get(code)||null;}

  function bestIndicatorForLabel(label){
    const key=normalize(label);
    if(!key) return null;
    let best=null,score=0;
    for(const ind of indicators){
      for(const candidate of [ind.name,ind.short_name]){
        const c=normalize(candidate);
        if(!c) continue;
        let s=0;
        if(key===c) s=100;
        else if(key.includes(c)||c.includes(key)) s=Math.min(key.length,c.length);
        if(s>score){score=s;best=ind;}
      }
    }
    return score>=5?best:null;
  }

  function makeChip(unit,extraClass){
    const chip=document.createElement('span');
    chip.className=`unit-chip${extraClass?` ${extraClass}`:''}`;
    chip.textContent=shortUnit(unit);
    chip.title=`Unit of measurement: ${longUnit(unit)}`;
    chip.setAttribute('aria-label',`Unit of measurement: ${longUnit(unit)}`);
    return chip;
  }

  function annotateIndicatorOptions(){
    const select=$('#geo-indicator');
    if(!select) return;
    [...select.options].forEach(option=>{
      const ind=indicatorForCode(option.value);
      const unit=unitForIndicator(ind);
      if(!ind||!unit) return;
      const base=option.dataset.baseLabel||ind.name||option.textContent.split(' · ')[0];
      option.dataset.baseLabel=base;
      option.textContent=`${base} · ${shortUnit(unit)}`;
    });
  }

  function activeMapUnit(){
    const code=$('#geo-indicator')?.value;
    return unitForIndicator(indicatorForCode(code));
  }

  function annotateMapContext(){
    annotateIndicatorOptions();
    const unit=activeMapUnit();
    if(!unit) return;

    const meta=$('.geo-map-meta');
    if(meta){
      let note=$('#geo-unit-context',meta);
      if(!note){
        note=document.createElement('div');
        note.id='geo-unit-context';
        note.className='geo-unit-context';
        meta.prepend(note);
      }
      note.innerHTML=`<span>Unit</span><strong>${longUnit(unit)}</strong>`;
    }

    const panel=$('.geo-ranking-panel');
    const title=$('#geo-ranking-title');
    if(panel&&title){
      let chip=$('.geo-ranking-unit',panel);
      if(!chip){chip=makeChip(unit,'geo-ranking-unit');title.insertAdjacentElement('afterend',chip);}
      chip.textContent=shortUnit(unit);
      chip.title=`Unit of measurement: ${longUnit(unit)}`;
      chip.setAttribute('aria-label',`Unit of measurement: ${longUnit(unit)}`);
    }

    const summary=$('#geo-selected-summary');
    if(summary&&!summary.hidden){
      let chip=$('.geo-summary-unit',summary);
      if(!chip){chip=makeChip(unit,'geo-summary-unit');summary.appendChild(chip);}
      chip.textContent=shortUnit(unit);
      chip.title=`Unit of measurement: ${longUnit(unit)}`;
    }

    const tooltip=$('#geo-tooltip');
    if(tooltip&&!tooltip.hidden&&tooltip.textContent.trim()){
      let chip=$('.geo-tooltip-unit',tooltip);
      if(!chip){chip=makeChip(unit,'geo-tooltip-unit');tooltip.appendChild(chip);}
      chip.textContent=`Unit · ${shortUnit(unit)}`;
      chip.title=`Unit of measurement: ${longUnit(unit)}`;
    }
  }

  function annotateCard(card,labelSelector){
    const label=$(labelSelector,card);
    if(!label) return;
    const value=$('strong,.feature-value',card);
    if(value&&/^\s*[—-]\s*$/.test(value.textContent||'')) return;
    if(/per person/i.test(label.textContent||'')) return; // no matching per-capita indicator in the registry yet
    const ind=bestIndicatorForLabel(label.textContent);
    const unit=unitForIndicator(ind);
    if(!unit) return;
    let chip=$('.unit-chip.metric-unit',card);
    if(!chip){chip=makeChip(unit,'metric-unit');label.insertAdjacentElement('afterend',chip);}
    chip.textContent=shortUnit(unit);
    chip.title=`Unit of measurement: ${longUnit(unit)}`;
  }

  function annotateCards(){
    $$('#pulse-grid .metric-card').forEach(card=>annotateCard(card,'.label'));
    const hero=$('.pulse-card'); if(hero) annotateCard(hero,'.metric-label');
    $$('.quick-facts article').forEach(card=>annotateCard(card,'span:first-child'));
    const chart=$('.chart-card'); if(chart) annotateCard(chart,'.card-head h3');
  }

  function annotateSeries(){
    const heading=$('.series-side h3');
    const ind=heading?bestIndicatorForLabel(heading.textContent):null;
    const unit=unitForIndicator(ind);
    if(!unit) return;
    const spans=$$('.series-meta>span');
    const cell=spans.find(s=>$('small',s)?.textContent.trim()==='Unit');
    if(cell) cell.innerHTML=`<small>Unit</small>${longUnit(unit)}`;
    let chip=$('.series-unit-chip','.series-side');
    if(!chip&&heading){chip=makeChip(unit,'series-unit-chip');heading.insertAdjacentElement('afterend',chip);}
    if(chip) chip.textContent=shortUnit(unit);
  }

  function annotateSearch(){
    $$('#search-results [data-kind="indicator"]').forEach(row=>{
      const ind=indicatorForCode(row.dataset.code);
      const unit=unitForIndicator(ind);
      const small=$('small',row);
      if(!unit||!small) return;
      const base=small.dataset.baseText||small.textContent.split(' · Unit:')[0];
      small.dataset.baseText=base;
      small.textContent=`${base} · Unit: ${shortUnit(unit)}`;
    });
  }

  function refresh(){
    annotateMapContext();
    annotateCards();
    annotateSeries();
    annotateSearch();
  }

  function installObservers(){
    const watch=(node,opts)=>node&&new MutationObserver(()=>queueMicrotask(refresh)).observe(node,opts);
    watch($('#geo-indicator'),{childList:true,subtree:true});
    watch($('.geo-map-panel'),{childList:true,subtree:true});
    watch($('#geo-ranking-list'),{childList:true});
    watch($('#geo-selected-summary'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
    watch($('#geo-tooltip'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
    watch($('#pulse-grid'),{childList:true,subtree:true});
    watch($('.quick-facts'),{childList:true,subtree:true});
    watch($('.chart-card'),{childList:true,subtree:true});
    watch($('.series-meta'),{childList:true,subtree:true});
    watch($('#search-results'),{childList:true,subtree:true});
    $('#geo-indicator')?.addEventListener('change',()=>setTimeout(refresh,0));
    window.addEventListener('hashchange',()=>setTimeout(refresh,0));
  }

  async function boot(){
    [indicators,units]=await Promise.all([
      json('data/indicators/registry/indicators.json'),
      json('data/indicators/registry/units.json')
    ]);
    indicatorByCode=new Map(indicators.map(i=>[i.indicator_code,i]));
    unitById=new Map(units.map(u=>[u.unit_id,u]));
    refresh();
    installObservers();
    setTimeout(refresh,350);
    setTimeout(refresh,900);
    window.KDAUnits={shortUnit,longUnit,unitForIndicator,indicatorForCode};
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
