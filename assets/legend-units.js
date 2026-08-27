/* Kenya Data Atlas — dynamic choropleth legend units
 * Keeps the legend's visible scale unit synchronized with the active indicator.
 * Source of truth: indicators.json + units.json.
 */
(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  let indicatorByCode=new Map(), unitById=new Map();
  let ready=false, queued=false;

  const json=async url=>{
    try{const r=await fetch(url);return r.ok?await r.json():[];}catch{return [];}
  };

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
    }[unit.code] || unit.name || unit.symbol || '';
  }

  function activeUnit(){
    const code=$('#geo-indicator')?.value;
    const indicator=indicatorByCode.get(code);
    return indicator?unitById.get(indicator.unit_id):null;
  }

  function syncLegendUnit(){
    queued=false;
    if(!ready) return;
    const legend=$('#geo-legend');
    const unit=activeUnit();
    if(!legend||!unit) return;

    let chip=legend.querySelector('.geo-legend-unit');
    if(!chip){
      chip=document.createElement('div');
      chip.className='unit-chip geo-legend-unit';
      legend.prepend(chip);
    }

    const text=`Scale · ${shortUnit(unit)}`;
    const detail=`Legend scale unit: ${longUnit(unit)}`;
    if(chip.textContent!==text) chip.textContent=text;
    if(chip.title!==detail) chip.title=detail;
    if(chip.getAttribute('aria-label')!==detail) chip.setAttribute('aria-label',detail);
    legend.setAttribute('aria-label',`${detail}. Colour classes follow.`);
  }

  function scheduleSync(){
    if(queued) return;
    queued=true;
    queueMicrotask(syncLegendUnit);
  }

  async function boot(){
    const [indicators,units]=await Promise.all([
      json('data/indicators/registry/indicators.json'),
      json('data/indicators/registry/units.json')
    ]);
    indicatorByCode=new Map(indicators.map(i=>[i.indicator_code,i]));
    unitById=new Map(units.map(u=>[u.unit_id,u]));
    ready=true;

    const legend=$('#geo-legend');
    if(legend) new MutationObserver(scheduleSync).observe(legend,{childList:true,subtree:true});
    $('#geo-indicator')?.addEventListener('change',()=>setTimeout(syncLegendUnit,0));
    window.addEventListener('hashchange',()=>setTimeout(syncLegendUnit,0));

    syncLegendUnit();
    setTimeout(syncLegendUnit,350);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
