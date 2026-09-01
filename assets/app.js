/* Kenya Data Atlas — first-paint shell interactions (P01).
 *
 * The shell no longer downloads the multi-megabyte master series/observation
 * registries at startup. National pulse cards come from a compact generated
 * display product; county profile basics come from the frozen Sprint 1 CSVs.
 * Universal search is loaded only after explicit search interaction.
 * Compare and the Geo Explorer own their heavier on-demand data lifecycles.
 */
(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const $$=s=>[...document.querySelectorAll(s)];
  const KDA=window.KDAData;

  let timer;
  function toast(msg){
    const t=$('#toast'); if(!t)return;
    t.textContent=msg;t.classList.add('show');
    clearTimeout(timer);timer=setTimeout(()=>t.classList.remove('show'),3200);
  }
  $$('[data-toast]').forEach(b=>b.onclick=()=>toast(b.dataset.toast));

  function download(name,rows){
    const blob=new Blob([rows],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);
  }
  function badgeHtml(letter){
    if(letter==='Demo')return '<span class="badge demo">Demo</span>';
    if(!letter)return '<span class="badge missing">N/A</span>';
    return `<span class="badge ${String(letter).toLowerCase()}">${letter}</span>`;
  }
  function badgeLabel(letter){return {A:'Official direct',B:'Official derived',C:'Spatially derived',D:'Modelled',E:'External'}[letter]||'Not available';}
  function number(value,dp=0){return Number(value).toLocaleString('en-KE',{minimumFractionDigits:dp,maximumFractionDigits:dp});}
  function formatValue(value,unit){
    const n=Number(value);
    if(!Number.isFinite(n))return '—';
    if(unit==='persons')return n>=1e6?`${(n/1e6).toFixed(2)}m`:n>=1e3?`${(n/1e3).toFixed(0)}k`:number(n);
    if(unit==='percent')return `${number(n,Math.abs(n-Math.round(n))>0.0001?1:0)}%`;
    if(unit==='kes_per_usd')return number(n,2);
    if(unit==='usd')return n>=1e9?`US$${(n/1e9).toFixed(1)}bn`:`US$${number(n,0)}`;
    if(unit==='usd_per_person')return `US$${number(n,0)}`;
    if(unit==='kes_million')return n>=1000?`KES ${(n/1000).toFixed(1)}bn`:`KES ${number(n,1)}mn`;
    return number(n,2);
  }
  function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}

  const menu=$('.menu-button'),nav=$('#main-nav');
  if(menu&&nav){
    const closeMenu=({focus=false}={})=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');if(focus)menu.focus();};
    menu.onclick=()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));};
    nav.onclick=()=>closeMenu();
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&nav.classList.contains('open')){event.preventDefault();closeMenu({focus:true});}});
    window.addEventListener('kda:route',()=>closeMenu());
  }

  function renderPulse(cards){
    const grid=$('#pulse-grid');
    if(!grid)return;
    if(!cards?.length){grid.innerHTML='<div class="source-note">National pulse data is temporarily unavailable. The rest of the Atlas remains usable.</div>';return;}
    grid.innerHTML=cards.map(card=>{
      const history=card.history||[];const latest=history.at(-1);const previous=history.length>1?history.at(-2):null;
      if(!latest)return '';
      const delta=previous?Number(latest.value)-Number(previous.value):null;
      const deltaText=delta===null?'Latest published observation':`${delta>0?'↑':delta<0?'↓':'→'} ${Math.abs(delta).toLocaleString('en-KE',{maximumFractionDigits:3})}${card.unit_code==='percent'?' pp':''} from ${previous.period_label}`;
      return `<article class="metric-card" data-series-code="${esc(card.series_code)}" data-pulse-category="${esc(card.category||'core')}">${badgeHtml(card.badge)}<span class="label">${esc(card.label)}</span><strong>${esc(formatValue(latest.value,card.unit_code))}</strong><span class="delta">${esc(deltaText)}</span><small>${esc(latest.period_label)} · ${esc(card.source)}</small></article>`;
    }).join('');

    const inflation=cards.find(card=>card.series_code==='KDA-CPI-YOY-KEN');
    const latest=inflation?.history?.at(-1),previous=inflation?.history?.length>1?inflation.history.at(-2):null;
    if(latest){
      const label=$('.pulse-card .metric-label');if(label)label.textContent=inflation.label;
      const value=$('.pulse-card .feature-value');if(value)value.innerHTML=`${latest.value}<span>%</span>`;
      const trend=$('.pulse-card .trend');if(trend)trend.innerHTML=previous?`<span>${latest.value>=previous.value?'↑':'↓'} ${Math.abs(latest.value-previous.value).toFixed(1)} pp</span> from ${esc(previous.period_label)}`:'<span>Latest published observation</span>';
      const spark=$('.sparkline');if(spark){
        const max=Math.max(...inflation.history.map(o=>Number(o.value)),1);
        spark.innerHTML=inflation.history.map(o=>`<i style="height:${Math.max(18,(Number(o.value)/max)*100)}%" title="${esc(o.period_label)}: ${o.value}%"></i>`).join('');
        spark.setAttribute('aria-label',`Published inflation observations: ${inflation.history.map(o=>`${o.period_label} ${o.value}%`).join(', ')}`);
      }
      const dl=$('.pulse-card dl');if(dl)dl.innerHTML=`<div><dt>Reference period</dt><dd>${esc(latest.period_label)}</dd></div><div><dt>Source</dt><dd>${esc(inflation.source)} · ${badgeLabel(inflation.badge)}</dd></div>`;
    }
    window.dispatchEvent(new CustomEvent('kda:pulse-ready',{detail:{cards}}));
  }

  function makeCountyRows(gcp,budget,voters){
    const b=new Map((budget||[]).map(r=>[r.geo_code,r]));
    const v=new Map((voters||[]).map(r=>[r.geo_code,r]));
    return (gcp||[]).map(r=>{
      const br=b.get(r.geo_code)||{},vr=v.get(r.geo_code)||{};
      const years=[2020,2021,2022,2023,2024].map(year=>({year,value:Number(r[String(year)])}));
      return {
        geo_code:r.geo_code,name:r.name,gcp:years,
        budget:Number(br.budget_total_ksh_mn),expenditure:Number(br.expenditure_total_ksh_mn),
        devAbsorption:Number(br.development_absorption_pct),absorption:Number(br.overall_absorption_pct),
        voters:Number(vr.value)
      };
    }).filter(r=>r.geo_code&&r.name).sort((a,b)=>a.name.localeCompare(b.name));
  }

  function gcpTrendSvg(points){
    if(!points?.length)return '';
    const values=points.map(p=>p.value),min=Math.min(...values),max=Math.max(...values),range=Math.max(1,max-min);
    const coords=points.map((p,i)=>({x:35+i*(650/(points.length-1||1)),y:180-((p.value-min)/range)*135,...p}));
    const line=coords.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 720 220" role="img" aria-label="Gross County Product trend from ${points[0].year} to ${points.at(-1).year}"><path d="M35 180H685" stroke="#e3e7e3" fill="none"/><path d="${line}" stroke="var(--green2)" stroke-width="4" fill="none"/>${coords.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="5" fill="#fff" stroke="var(--green2)" stroke-width="3"><title>${p.year}: KES ${number(p.value)} million</title></circle>`).join('')}</svg><div style="display:flex;justify-content:space-between;color:var(--muted);font-size:.7rem">${points.map(p=>`<span>${p.year}</span>`).join('')}</div>`;
  }

  function wireCountyProfiles(counties){
    if(!counties.length)return;
    const byName=new Map(counties.map(c=>[c.name,c]));
    const picker=$('#county-picker');
    if(picker)picker.innerHTML=counties.map(c=>`<option${c.name==='Nakuru'?' selected':''}>${esc(c.name)}</option>`).join('');
    let current=byName.has('Nakuru')?'Nakuru':counties[0].name;

    function render(name){
      const c=byName.get(name)||counties[0];current=c.name;
      const latest=c.gcp.at(-1),previous=c.gcp.at(-2);const growth=previous?.value?((latest.value/previous.value)-1)*100:null;
      const crumb=$('#profile-breadcrumb-county');if(crumb)crumb.textContent=c.name;
      const eyebrow=$('#profile-eyebrow');if(eyebrow)eyebrow.textContent=`Area profile · ${c.geo_code}`;
      const title=$('#profile-title');if(title)title.textContent=`${c.name} County`;
      if(picker&&picker.value!==c.name)picker.value=c.name;
      const facts=$('.quick-facts');if(facts)facts.innerHTML=[
        `<article><span>Gross County Product</span><strong>${formatValue(latest.value,'kes_million')}</strong><small>2024 preliminary · current prices · KNBS</small><b class="badge a">A</b></article>`,
        `<article><span>GCP growth</span><strong>${growth===null?'—':`${growth.toFixed(1)}%`}</strong><small>2023 → 2024 · derived from published GCP</small><b class="badge b">B</b></article>`,
        `<article><span>Registered voters</span><strong>${formatValue(c.voters,'persons')}</strong><small>2022 county schedule · IEBC</small><b class="badge a">A</b></article>`,
        `<article><span>Budget absorption</span><strong>${formatValue(c.absorption,'percent')}</strong><small>FY2024/25 · Controller of Budget</small><b class="badge a">A</b></article>`
      ].join('');
      const chart=$('.chart-card');if(chart)chart.innerHTML=`<div class="card-head"><div><small>Economic scale</small><h3>Gross County Product</h3></div><span class="badge a">A · Official direct</span></div>${gcpTrendSvg(c.gcp)}<p class="source-note" style="margin-top:1rem">2020–2024 current-price GCP · 2024 preliminary. Economic size is not a performance score.</p>`;
    }

    if(picker)picker.onchange=()=>render(picker.value);
    render(current);
    window.KDASelectCountyProfile=name=>{render(name);document.getElementById('profile')?.scrollIntoView({behavior:'smooth',block:'start'});};

    const dl=$('#profile-download');if(dl)dl.onclick=()=>{
      const c=byName.get(current);if(!c)return;
      const rows=['indicator,value,unit,reference_period,badge'];
      rows.push(`gross_county_product,${c.gcp.at(-1).value},KES_million,2024,A`);
      rows.push(`registered_voters,${c.voters},persons,2022,A`);
      rows.push(`budget_total,${c.budget},KES_million,FY2024/25,A`);
      rows.push(`expenditure_total,${c.expenditure},KES_million,FY2024/25,A`);
      rows.push(`overall_absorption,${c.absorption},percent,FY2024/25,A`);
      rows.push(`development_absorption,${c.devAbsorption},percent,FY2024/25,A`);
      download(`kenya-data-atlas-${c.name.toLowerCase().replace(/\s+/g,'-')}.csv`,rows.join('\n'));
    };
  }

  function renderSeries(cards){
    const cpi=cards?.find(card=>card.series_code==='KDA-CPI-YOY-KEN');
    const latest=cpi?.history?.at(-1);if(!latest)return;
    const badge=$('.series-side .badge');if(badge)badge.outerHTML=`<span class="badge ${cpi.badge.toLowerCase()}">${cpi.badge} · ${badgeLabel(cpi.badge)}</span>`;
    const sv=$('.series-value');if(sv)sv.textContent=`${latest.value}%`;
    const sm=$('.series-side > small');if(sm)sm.textContent=`${latest.period_label} · Monthly`;
    const chart=$('.large-chart svg');
    if(chart&&cpi.history.length>=2){
      const a=cpi.history[0],b=cpi.history.at(-1),min=Math.min(a.value,b.value)-.3,max=Math.max(a.value,b.value)+.3;
      const y=v=>220-((v-min)/(max-min||1))*180;
      chart.innerHTML=`<path class="grid" d="M30 40H780M30 100H780M30 160H780M30 220H780"/><path class="series-line" d="M60 ${y(a.value)} L740 ${y(b.value)}"/><circle cx="60" cy="${y(a.value)}" r="5" fill="var(--red)"/><circle cx="740" cy="${y(b.value)}" r="5" fill="var(--red)"/>`;
    }
    const cp=$('.current-point');if(cp)cp.textContent=`${latest.value}%`;
    const meta=$('.series-meta');if(meta)meta.innerHTML=`<span><small>Series ID</small>${cpi.series_code}</span><span><small>Unit</small>Percent</span><span><small>Source</small>${esc(cpi.source)}</span><span><small>Reference</small>${esc(latest.period_label)}</span>`;
  }

  function wireCatalogue(){
    const root=$('#catalogue');if(!root||!KDA)return;
    KDA.whenVisible(root,async()=>{
      const datasets=await KDA.registry('datasets');
      if(!Array.isArray(datasets))return;
      const shown=datasets.filter(d=>['approved','published'].includes(d.publication_status)).slice(0,6);
      const list=$('#dataset-list');if(list)list.innerHTML=shown.map(x=>`<article class="dataset"><span class="dataset-icon">${esc(String(x.topic||'DA').slice(0,2))}</span><div><h3>${esc(x.title)}</h3><p>${esc(x.topic)} · ${esc((x.geographic_coverage||[]).join(', '))} · ${esc(x.publication_status)}</p></div><button aria-label="Open ${esc(x.title)}" data-toast="Registry code: ${esc(x.dataset_code)}. ${esc(x.known_limitations||'')}">→</button></article>`).join('');
      $$('#dataset-list [data-toast]').forEach(b=>b.onclick=()=>toast(b.dataset.toast));
    },{rootMargin:'700px 0px'});
  }

  function wireSearch(){
    const input=$('#atlas-search'),results=$('#search-results');if(!input||!results||!KDA)return;
    input.placeholder='Search places, indicators, datasets or documents…';
    let activated=false,activationPromise=null;
    const activate=()=>{
      if(window.KDASiteSearch){window.KDASiteSearch.boot?.();return Promise.resolve(window.KDASiteSearch);}
      if(activationPromise)return activationPromise;
      activated=true;
      const loader=window.KDAOptional?.loadSiteSearch?window.KDAOptional.loadSiteSearch():KDA.loadScript('assets/site-search.js',{id:'kda-site-search'}).then(()=>window.KDASiteSearch||null);
      activationPromise=Promise.resolve(loader).then(api=>{api?.boot?.();return api;}).catch(error=>{console.warn('Atlas search:',error?.message||error);return null;});
      return activationPromise;
    };
    const firstFocus=()=>{input.removeEventListener('focus',firstFocus);activate();};
    const firstInput=async event=>{input.removeEventListener('input',firstInput);const api=await activate();api?.search?.(event.target.value);};
    input.addEventListener('focus',firstFocus);
    input.addEventListener('input',firstInput);
    $$('[data-search]').forEach(button=>button.onclick=async()=>{input.value=button.dataset.search||'';input.focus();const api=await activate();api?.search?.(input.value);});
    $$('[data-focus-search]').forEach(button=>button.onclick=async()=>{await activate();input.focus();scrollTo({top:0,behavior:'smooth'});});
    document.addEventListener('keydown',async event=>{
      if((event.ctrlKey||event.metaKey)&&String(event.key).toLowerCase()==='k'){
        event.preventDefault();await activate();input.focus();scrollTo({top:0,behavior:'smooth'});
      }
    });
    if(!activated)results.hidden=true;
  }

  async function boot(){
    if(!KDA){document.body.dataset.bootError='Shared data loader missing';return;}
    /* Search and catalogue wiring must exist before any asynchronous first-paint
     * data completes. Otherwise a fast keyboard/focus interaction can happen
     * before the lazy search trigger has been attached (observed in Firefox). */
    wireCatalogue();wireSearch();
    const grid=$('#pulse-grid');if(grid)grid.innerHTML='<div class="source-note">Loading compact first-paint data…</div>';
    const [pulse,gcp,budget,voters]=await Promise.all([
      KDA.initialPulse().catch(()=>null),
      KDA.csv('data/sprint1/gcp-2020-2024.csv'),
      KDA.csv('data/sprint1/county-budget-fy2024-25.csv'),
      KDA.csv('data/sprint1/voters-2022.csv')
    ]);
    renderPulse(pulse?.cards||[]);
    wireCountyProfiles(makeCountyRows(gcp,budget,voters));
    renderSeries(pulse?.cards||[]);
    document.body.dataset.shellReady='true';
  }

  boot().catch(error=>{
    console.error('Atlas shell:',error);
    document.body.dataset.bootError=error?.message||String(error);
    const grid=$('#pulse-grid');if(grid)grid.innerHTML='<div class="source-note">Some headline data could not load. Search, navigation and the remaining Atlas sections are still available.</div>';
  });
})();
