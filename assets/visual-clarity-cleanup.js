/* Kenya Data Atlas — visual clarity cleanup.
 * Presentation-only progressive enhancement. Published values, ranks and tables
 * remain owned by their canonical renderers.
 */
(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const acronyms=new Map(Object.entries({
    'Baringo':'BAR','Bomet':'BOM','Bungoma':'BNG','Busia':'BUS','Elgeyo/Marakwet':'ELM','Embu':'EMB','Garissa':'GRS','Homa Bay':'HBY','Isiolo':'ISL','Kajiado':'KJD','Kakamega':'KAK','Kericho':'KRC','Kiambu':'KBU','Kilifi':'KLF','Kirinyaga':'KRG','Kisii':'KSI','Kisumu':'KSM','Kitui':'KTU','Kwale':'KWL','Laikipia':'LKP','Lamu':'LAM','Machakos':'MCK','Makueni':'MKN','Mandera':'MDR','Marsabit':'MRS','Meru':'MER','Migori':'MIG','Mombasa':'MSA',"Murang'a":'MUR','Nairobi':'NBO','Nakuru':'NKR','Nandi':'NDI','Narok':'NRK','Nyamira':'NYM','Nyandarua':'NDR','Nyeri':'NYR','Samburu':'SBR','Siaya':'SYA','Taita Taveta':'TTV','Tana River':'TNR','Tharaka-Nithi':'THN','Trans Nzoia':'TNZ','Turkana':'TRK','Uasin Gishu':'UGS','Vihiga':'VHG','Wajir':'WJR','West Pokot':'WPK'
  }));
  const acronym=name=>acronyms.get(String(name||''))||String(name||'').replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase();
  let pulsePromise=null,scheduled=false;

  function ensureStyle(){
    if($('#kda-visual-clarity-style'))return;
    const style=document.createElement('style');style.id='kda-visual-clarity-style';style.textContent=`
      .ri-spectrum-dot.kda-acronym-default .ri-spectrum-label,
      .ri-indicator-dot.kda-acronym-default .ri-indicator-label{display:block!important;font-size:.72rem!important;font-weight:800!important;letter-spacing:.025em!important;line-height:1!important;padding:.12rem .24rem!important;max-width:none!important;background:rgba(255,255,255,.92)!important;color:#31483f!important;box-shadow:0 1px 2px rgba(27,58,46,.08)!important}
      .ri-spectrum-dot.kda-acronym-default .ri-spectrum-label,
      .ri-indicator-dot.kda-acronym-default .ri-indicator-label{left:50%!important;right:auto!important;top:18px!important;bottom:auto!important;transform:translateX(-50%)!important}
      .ri-spectrum-dot.kda-edge-start .ri-spectrum-label,.ri-indicator-dot.kda-edge-start .ri-indicator-label{left:50%!important;right:auto!important;transform:none!important}
      .ri-spectrum-dot.kda-edge-end .ri-spectrum-label,.ri-indicator-dot.kda-edge-end .ri-indicator-label{left:auto!important;right:50%!important;transform:none!important}
      .ri-spectrum-dot.is-pinned .ri-spectrum-label,.ri-indicator-dot.is-pinned .ri-indicator-label{color:#7f3d31!important;background:#fff7f2!important}
      .kda-rank-hover-card{position:absolute;z-index:40;min-width:132px;max-width:245px;padding:.45rem .58rem;border:1px solid #d9d4c8;border-radius:9px;background:#fff;box-shadow:0 8px 24px rgba(27,58,46,.16);transform:translate(-50%,-100%);pointer-events:none;color:#263f36;font:500 .72rem/1.3 var(--sans,DM Sans,sans-serif)}
      .kda-rank-hover-card.below{transform:translate(-50%,0)}
      .kda-rank-hover-card small{display:block;margin-bottom:.08rem;color:#8a5b4d;font-size:.58rem;font-weight:900;letter-spacing:.065em;text-transform:uppercase}
      .kda-rank-hover-card strong{display:block;color:#173f32;font-size:.84rem;margin-bottom:.08rem}
      .kda-rank-hover-card span{display:block;color:#69736e;font-size:.64rem}
      .kda-development-pin{position:absolute;z-index:35;top:3px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;pointer-events:none}
      .kda-development-pin>span{display:block;padding:.12rem .42rem;border-radius:999px;background:#f9e8e2;color:#864738;font-size:.6rem;font-weight:900;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}
      .kda-development-pin>strong{margin-top:.12rem;color:#613b32;font-size:.76rem;white-space:nowrap}
      .kda-development-pin>i{display:block;width:1px;height:var(--leader,30px);margin-top:4px;background:#b33b2e;opacity:.66}
      #pulse-grid .metric-card .v2-card-spark,#home-glance .metric-card .v2-card-spark,#home-glance-grid .metric-card .v2-card-spark{display:none!important}
      #pulse-grid .metric-card .viz-card-spark,#home-glance .metric-card .viz-card-spark,#home-glance-grid .metric-card .viz-card-spark{margin-top:auto;padding-top:.8rem;border-top:1px solid var(--line);display:grid;grid-template-columns:minmax(120px,1fr) auto;gap:.7rem;align-items:end}
      #pulse-grid .metric-card .viz-card-spark .viz-spark,#home-glance .metric-card .viz-card-spark .viz-spark,#home-glance-grid .metric-card .viz-card-spark .viz-spark{width:100%;height:48px;overflow:visible}
      #pulse-grid .metric-card .viz-card-spark .viz-spark polyline,#home-glance .metric-card .viz-card-spark .viz-spark polyline,#home-glance-grid .metric-card .viz-card-spark .viz-spark polyline{fill:none!important;stroke:#c0603c!important;stroke-width:2.4!important;stroke-dasharray:3 4;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
      #pulse-grid .metric-card .viz-card-spark span,#home-glance .metric-card .viz-card-spark span,#home-glance-grid .metric-card .viz-card-spark span{font-size:.68rem;color:var(--muted);white-space:nowrap}
      @media(max-width:720px){.ri-spectrum-dot.kda-acronym-default .ri-spectrum-label,.ri-indicator-dot.kda-acronym-default .ri-indicator-label{font-size:.68rem!important}.kda-rank-hover-card{max-width:190px}}
      @media(prefers-reduced-motion:reduce){.kda-rank-hover-card{transition:none!important}}
    `;document.head.appendChild(style);
  }

  function countyOf(dot){
    if(dot.dataset.riCounty)return dot.dataset.riCounty;
    const aria=dot.getAttribute('aria-label')||dot.dataset.v2Tooltip||'';
    return aria.split(' · ')[0].split(',')[0].trim();
  }
  function contextOf(dot){
    const raw=dot.dataset.v2Tooltip||dot.getAttribute('aria-label')||'';
    const county=countyOf(dot);return raw.startsWith(county)?raw.slice(county.length).replace(/^\s*[·,]\s*/,''):raw;
  }

  function cleanDot(dot,labelSelector){
    const county=countyOf(dot);if(!county)return;
    dot.querySelectorAll(':scope > .sr-only').forEach(n=>n.remove());
    const label=$(labelSelector,dot);if(label&&label.textContent!==acronym(county))label.textContent=acronym(county);
    const x=parseFloat(dot.style.getPropertyValue('--x'));
    dot.classList.add('kda-acronym-default');
    dot.classList.toggle('kda-edge-start',Number.isFinite(x)&&x<=2.5);
    dot.classList.toggle('kda-edge-end',Number.isFinite(x)&&x>=97.5);
  }

  function renderDevelopmentPin(){
    const plot=$('.ri-spectrum-plot');if(!plot)return;
    let pin=$('.kda-development-pin',plot);
    const params=new URLSearchParams((location.hash.split('?')[1]||''));
    const wanted=params.get('pinned');
    const dot=$('.ri-spectrum-dot.is-pinned',plot)||(wanted?$$('.ri-spectrum-dot',plot).find(n=>n.dataset.riGeo===wanted):null);
    if(!dot){pin?.remove();return;}
    const county=countyOf(dot);if(!county)return;
    if(!pin){pin=document.createElement('div');pin.className='kda-development-pin';plot.appendChild(pin);}
    const x=dot.style.getPropertyValue('--x')||`${dot.offsetLeft}px`,leader=Math.max(18,dot.offsetTop-40);
    pin.style.left=x;pin.style.setProperty('--leader',`${leader}px`);pin.innerHTML=`<span>You are here</span><strong>${esc(county)}</strong><i aria-hidden="true"></i>`;
  }

  function cleanRankings(){
    $$('.ri-spectrum-dot').forEach(dot=>cleanDot(dot,'.ri-spectrum-label'));
    $$('.ri-indicator-dot').forEach(dot=>cleanDot(dot,'.ri-indicator-label'));
    renderDevelopmentPin();
  }

  function hoverCardFor(plot){
    let card=$('.kda-rank-hover-card',plot);if(card)return card;
    card=document.createElement('div');card.className='kda-rank-hover-card';card.hidden=true;card.setAttribute('role','status');plot.appendChild(card);return card;
  }
  function showHover(dot){
    const plot=dot.closest('.ri-spectrum-plot,.ri-indicator-plot');if(!plot)return;
    const county=countyOf(dot);if(!county)return;
    const card=hoverCardFor(plot),pinned=dot.classList.contains('is-pinned'),x=Math.max(76,Math.min(plot.clientWidth-76,dot.offsetLeft)),below=dot.offsetTop<82;
    card.innerHTML=`<small>${pinned?'You are here':'County'}</small><strong>${esc(county)}</strong>${contextOf(dot)?`<span>${esc(contextOf(dot))}</span>`:''}`;
    card.style.left=`${x}px`;card.style.top=`${below?dot.offsetTop+30:dot.offsetTop-12}px`;card.classList.toggle('below',below);card.hidden=false;
  }
  function hideHover(dot){
    const plot=dot?.closest?.('.ri-spectrum-plot,.ri-indicator-plot'),card=plot&&$('.kda-rank-hover-card',plot);if(card)card.hidden=true;
  }

  function pulseCards(){
    if(pulsePromise)return pulsePromise;
    const data=window.KDAData;
    if(!data?.initialPulse)return Promise.resolve([]);
    pulsePromise=Promise.resolve(data.initialPulse()).then(d=>d?.cards||[]).catch(()=>{pulsePromise=null;return[];});
    return pulsePromise;
  }
  function sparkMarkup(history,label){
    const rows=(history||[]).filter(o=>Number.isFinite(Number(o.value)));if(rows.length<2)return'';
    const vals=rows.map(o=>Number(o.value)),min=Math.min(...vals),max=Math.max(...vals),span=Math.max(max-min,1e-9),pts=rows.map((o,i)=>`${(i/(rows.length-1))*100},${28-((Number(o.value)-min)/span)*24}`).join(' ');
    return `<div class="viz-card-spark kda-retained-spark"><svg class="viz-spark" viewBox="0 0 100 32" role="img" aria-label="${rows.length} published points for ${esc(label)}"><polyline points="${pts}"/></svg><span>${rows.length} published points</span></div>`;
  }
  async function cleanPulse(){
    const descriptors=await pulseCards(),byCode=new Map(descriptors.map(c=>[c.series_code,c]));
    const cards=$$('#pulse-grid .metric-card,#home-glance .metric-card,#home-glance-grid .metric-card');
    for(const card of cards){
      $$('.v2-card-spark',card).forEach(n=>n.remove());
      const existing=$$('.viz-card-spark',card);existing.slice(1).forEach(n=>n.remove());
      if(existing.length)continue;
      const label=card.querySelector('.label')?.textContent.trim();
      const src=byCode.get(card.dataset.seriesCode)||descriptors.find(c=>c.label===label);
      const html=src?sparkMarkup(src.history,src.label):'';if(html)card.insertAdjacentHTML('beforeend',html);
    }
  }

  async function run(){ensureStyle();cleanRankings();await cleanPulse();document.documentElement.dataset.visualClarity='ready';}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;void run();});}

  document.addEventListener('pointerover',e=>{const dot=e.target.closest?.('.ri-spectrum-dot,.ri-indicator-dot');if(dot)showHover(dot);});
  document.addEventListener('pointerout',e=>{const dot=e.target.closest?.('.ri-spectrum-dot,.ri-indicator-dot');if(dot&&!dot.contains(e.relatedTarget)&&document.activeElement!==dot)hideHover(dot);});
  document.addEventListener('focusin',e=>{const dot=e.target.closest?.('.ri-spectrum-dot,.ri-indicator-dot');if(dot)showHover(dot);});
  document.addEventListener('focusout',e=>{const dot=e.target.closest?.('.ri-spectrum-dot,.ri-indicator-dot');if(dot)hideHover(dot);});
  document.addEventListener('click',e=>{if(e.target.closest?.('.ri-spectrum-dot,.ri-indicator-dot'))setTimeout(schedule,0);});
  window.addEventListener('kda:route',schedule);window.addEventListener('kda:pulse-ready',schedule);
  const observer=new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length||r.removedNodes.length))schedule();});observer.observe(document.body,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{void run();},{once:true});else void run();
  window.KDAVisualClarity={run,cleanRankings,cleanPulse};
})();
