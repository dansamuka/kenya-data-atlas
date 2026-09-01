/* Kenya-wide signal carousel. Reads the compact product generated from canonical registries. */
(() => {
  'use strict';
  const homeRoot=document.querySelector('.hero .pulse-card');if(!homeRoot)return;
  const pulseMount=document.querySelector('#pulse-signal-carousel');
  const pulseRoot=pulseMount?homeRoot.cloneNode(true):null;
  if(pulseRoot){pulseRoot.classList.add('pulse-page-card');pulseMount.append(pulseRoot);}
  [homeRoot,pulseRoot].filter(Boolean).forEach(root=>{
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let cards=[],index=0,timer=null,paused=false;
  const fmt=(value,unit)=>{const n=Number(value);if(unit==='percent')return `${n.toLocaleString('en-KE',{maximumFractionDigits:2})}%`;if(unit==='kes_per_usd')return n.toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});if(unit==='usd')return `US$${(n/1e9).toFixed(1)}bn`;if(unit==='usd_per_person')return `US$${n.toLocaleString('en-KE',{maximumFractionDigits:0})}`;return n.toLocaleString('en-KE');};
  function chart(history,label,unit){
    if(history.length<2)return `<span class="pulse-history-gap">Trend pending<br><small>Only ${history.length} observation in the Atlas</small></span>`;
    const values=history.map(o=>Number(o.value)),min=Math.min(...values),max=Math.max(...values),range=max-min||1;
    const pts=history.map((o,i)=>`${(i/(history.length-1))*100},${88-((Number(o.value)-min)/range)*72}`).join(' ');
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Five-year ${esc(label)} trend, ${history.length} published observations"><polygon points="0,100 ${pts} 100,100" class="pulse-chart-area"/><polyline points="${pts}" class="pulse-chart-line" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function render(next,manual=false){
    if(!cards.length)return;index=(next+cards.length)%cards.length;const card=cards[index],history=card.history||[],latest=history.at(-1),previous=history.at(-2);
    root.dataset.accent=card.accent||'green';root.classList.remove('pulse-changing');void root.offsetWidth;root.classList.add('pulse-changing');
    root.querySelector('.metric-label').textContent=card.label;
    root.querySelector('.feature-value').textContent=fmt(latest.value,card.unit_code);
    const trend=root.querySelector('.trend');trend.innerHTML=previous?`<span>${latest.value>=previous.value?'↑':'↓'} ${esc(fmt(Math.abs(latest.value-previous.value),card.unit_code))}</span> from ${esc(previous.period_label)}`:'<span>Latest published observation</span>';
    root.querySelector('.sparkline').innerHTML=chart(history,card.label,card.unit_code);
    root.querySelector('.sparkline').setAttribute('aria-label',`${card.label}: ${history.length} observations in the latest five-year window`);
    root.querySelector('dl').innerHTML=`<div><dt>Reference period</dt><dd>${esc(latest.period_label)}</dd></div><div><dt>Source</dt><dd>${esc(card.source)} · ${esc(card.badge)}</dd></div>`;
    const link=root.querySelector('[data-series]');link.dataset.series=card.series_code;link.setAttribute('aria-label',`Open ${card.label} series`);
    root.querySelectorAll('.pulse-dot').forEach((dot,i)=>{dot.classList.toggle('active',i===index);dot.setAttribute('aria-selected',String(i===index));dot.tabIndex=i===index?0:-1;});
    if(manual)restart();
  }
  function restart(){clearInterval(timer);if(!reduced.matches)timer=setInterval(()=>{if(!paused)render(index+1);},6500);}
  function boot(data){cards=(data||[]).filter(c=>c.hero&&c.history?.length);if(!cards.length)return;root.querySelector('.pulse-dots').innerHTML=cards.map((c,i)=>`<button type="button" class="pulse-dot${i?'':' active'}" role="tab" aria-selected="${i?'false':'true'}" aria-label="Show ${esc(c.label)}" data-index="${i}"></button>`).join('');render(0);restart();}
  root.addEventListener('mouseenter',()=>paused=true);root.addEventListener('mouseleave',()=>paused=false);root.addEventListener('focusin',()=>paused=true);root.addEventListener('focusout',e=>{if(!root.contains(e.relatedTarget))paused=false;});
  root.addEventListener('click',e=>{const dot=e.target.closest('.pulse-dot');if(dot)render(Number(dot.dataset.index),true);if(e.target.closest('[data-pulse-prev]'))render(index-1,true);if(e.target.closest('[data-pulse-next]'))render(index+1,true);});
  root.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();render(index-1,true);}if(e.key==='ArrowRight'){e.preventDefault();render(index+1,true);}});
  reduced.addEventListener?.('change',restart);
  window.addEventListener('kda:pulse-ready',e=>boot(e.detail.cards));
  });
})();
