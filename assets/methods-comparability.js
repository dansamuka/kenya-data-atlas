/* Kenya Data Atlas — Methods & Comparability explorer.
 *
 * Makes the P12 canonical policy and P06 dynamic ranking/trend evidence visible
 * without duplicating analytical rules in the browser. Static semantics come
 * from data/policy/indicator-policy.json; county ranking/trend values come from
 * the canonical CountyIQ mart; cross-level decisions come from the same P12
 * series policy registry consumed by the comparison layer.
 */
(function(){
  'use strict';
  const KDA=window.KDAData,R=window.KDARouter;
  if(!KDA)return;
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const fmt=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-KE',{maximumFractionDigits:2}):'—';
  const signed=v=>Number.isFinite(Number(v))?`${Number(v)>0?'+':''}${Number(v).toLocaleString('en-KE',{maximumFractionDigits:2})}`:'—';
  let bootPromise=null,base=null,martPromise=null,activeTab='policy',seriesLimit=80;

  function pill(text,tone='neutral'){return `<span class="methods-pill ${tone}">${esc(text)}</span>`;}
  function directionLabel(direction){
    if(direction===true)return pill('Higher is better','positive');
    if(direction===false)return pill('Lower is better','positive');
    return pill('Positional only','neutral');
  }
  function yesNo(value,yes='Allowed',no='Withheld'){return value?pill(yes,'positive'):pill(no,'withheld');}
  function route(){return R?.current?.()||R?.parse?.()||{view:'methods'};}
  function byId(rows,key='indicator_id'){return new Map((rows||[]).map(x=>[x[key],x]));}

  async function loadBase(){
    if(base)return base;
    const [policy,indicators,series,geographies]=await Promise.all([
      KDA.fetchJson('data/policy/indicator-policy.json',{required:true}),
      KDA.registry('indicators'),KDA.registry('series'),KDA.registry('geographies')
    ]);
    const indicatorById=byId(indicators),indicatorByCode=new Map(indicators.map(i=>[i.indicator_code,i]));
    const seriesById=byId(series,'series_id'),geoById=byId(geographies,'geography_id');
    const policySeriesByIndicator=new Map();
    for(const row of policy.series||[]){
      if(!policySeriesByIndicator.has(row.indicator_code))policySeriesByIndicator.set(row.indicator_code,[]);
      policySeriesByIndicator.get(row.indicator_code).push(row);
    }
    base={policy,indicators,series,geographies,indicatorById,indicatorByCode,seriesById,geoById,policySeriesByIndicator};
    return base;
  }
  function loadMart(){
    if(!martPromise)martPromise=KDA.fetchJson('data/countyiq/county-summary.json',{required:true});
    return martPromise;
  }

  function renderSummary(d){
    const root=$('#methods-summary');if(!root)return;
    const indicators=d.policy.indicators||[],series=d.policy.series||[];
    const cross=series.filter(s=>s.cross_level_comparison?.eligible).length;
    const rankable=indicators.filter(i=>i.ranking?.allowed).length;
    const trendable=indicators.filter(i=>i.trend?.allowed).length;
    const composite=indicators.filter(i=>i.composite?.eligible).length;
    root.innerHTML=[
      ['Indicator policies',indicators.length,'all canonical indicators'],
      ['Observed series governed',series.length,'series with published observations'],
      ['Ranking policy',rankable,`${indicators.length-rankable} statically withheld`],
      ['Trend policy',trendable,`${indicators.length-trendable} statically withheld`],
      ['Composite eligible',composite,'directional indicators only'],
      ['Cross-level eligible series',cross,`${series.length-cross} same-level only`]
    ].map(([label,value,note])=>`<article><small>${esc(label)}</small><strong>${Number(value).toLocaleString('en-KE')}</strong><span>${esc(note)}</span></article>`).join('');
    $('#methods-policy-version').textContent=d.policy.policy_version||'Canonical policy';
    $('#methods-principle-note').textContent='A policy permission is not itself a published rank or trend: dynamic coverage, common-period, provenance, history and uncertainty checks still have to pass.';
  }

  function indicatorRows(d){
    const q=($('#methods-policy-search')?.value||'').trim().toLowerCase();
    const domain=$('#methods-domain-filter')?.value||'all';
    const rule=$('#methods-rule-filter')?.value||'all';
    return (d.policy.indicators||[]).filter(p=>{
      const indicator=d.indicatorByCode.get(p.indicator_code)||{};
      const seriesRows=d.policySeriesByIndicator.get(p.indicator_code)||[];
      const cross=seriesRows.some(s=>s.cross_level_comparison?.eligible);
      const text=[p.indicator_code,p.name,p.domain,indicator.topic,indicator.subtopic,p.direction?.basis].filter(Boolean).join(' ').toLowerCase();
      if(q&&!text.includes(q))return false;
      if(domain!=='all'&&p.domain!==domain)return false;
      if(rule==='rankable'&&!p.ranking?.allowed)return false;
      if(rule==='directional'&&p.direction?.higher_is_better===null)return false;
      if(rule==='positional'&&p.direction?.higher_is_better!==null)return false;
      if(rule==='trend'&&!p.trend?.allowed)return false;
      if(rule==='composite'&&!p.composite?.eligible)return false;
      if(rule==='cross-level'&&!cross)return false;
      if(rule==='withheld'&&p.ranking?.allowed&&p.trend?.allowed&&cross)return false;
      return true;
    });
  }
  function renderPolicyTable(d){
    const body=$('#methods-policy-body'),count=$('#methods-policy-count');if(!body)return;
    const rows=indicatorRows(d);if(count)count.textContent=`${rows.length} of ${d.policy.indicators.length} indicators`;
    body.innerHTML=rows.map(p=>{
      const indicator=d.indicatorByCode.get(p.indicator_code)||{};
      const seriesRows=d.policySeriesByIndicator.get(p.indicator_code)||[];
      const crossRows=seriesRows.filter(s=>s.cross_level_comparison?.eligible);
      const firstSeries=seriesRows[0];
      const rank=p.ranking?.allowed?(p.ranking.mode==='directional'?pill('Directional rank','positive'):pill('Positional rank','neutral')):pill('Ranking withheld','withheld');
      const trend=yesNo(p.trend?.allowed,'Trend permitted','Trend withheld');
      const composite=yesNo(p.composite?.eligible,'Composite eligible','Excluded');
      const cross=seriesRows.length?pill(`${crossRows.length}/${seriesRows.length} cross-level`,crossRows.length?'positive':'withheld'):pill('No observed series','withheld');
      const reason=p.ranking?.static_reason_not_allowed||p.trend?.static_reason_not_allowed||'No static withholding reason.';
      const crossBasis=[...new Set(seriesRows.map(s=>s.cross_level_comparison?.rule_basis).filter(Boolean))].join(' · ')||'No observed series policy.';
      return `<tr>
        <td><strong>${esc(p.name)}</strong><small>${esc(p.indicator_code)}${indicator.topic?` · ${esc(indicator.topic)}`:''}</small></td>
        <td>${pill(p.domain||'unclassified')}</td>
        <td>${rank}<small>${esc(p.ranking?.allowed?'Dynamic county evidence must still pass.':reason)}</small></td>
        <td>${directionLabel(p.direction?.higher_is_better)}<small>${esc(p.direction?.basis||'No directional claim.')}</small></td>
        <td>${trend}<small>${esc(p.trend?.rule||p.trend?.static_reason_not_allowed||'')}</small></td>
        <td>${composite}</td>
        <td>${cross}<small>${esc(crossBasis)}</small></td>
        <td>${pill(p.publication_status||'unknown',p.publication_status==='published'?'positive':'neutral')}${firstSeries?`<button type="button" class="methods-series-link" data-methods-series="${esc(firstSeries.series_code)}">Open series →</button>`:''}</td>
      </tr>`;
    }).join('')||'<tr><td colspan="8" class="methods-empty">No indicators match the current filters.</td></tr>';
  }

  function selectedCounty(mart){
    const code=$('#methods-county-select')?.value;
    return (mart.counties||[]).find(c=>c.geography?.geo_code===code)||(mart.counties||[])[0]||null;
  }
  function rankingRows(county){
    const q=($('#methods-ranking-search')?.value||'').trim().toLowerCase();
    const mode=$('#methods-ranking-filter')?.value||'all';
    return Object.entries(county?.metrics||{}).map(([code,m])=>({code,m})).filter(({code,m})=>{
      const text=[code,m.name,m.domain,m.trend?.direction,m.eligibility?.reason_not_eligible].filter(Boolean).join(' ').toLowerCase();
      if(q&&!text.includes(q))return false;
      if(mode==='ranked'&&!m.ranking?.eligible)return false;
      if(mode==='trend'&&!m.trend?.eligible)return false;
      if(mode==='withheld'&&(m.ranking?.eligible||m.trend?.eligible))return false;
      return true;
    }).sort((a,b)=>String(a.m.domain||'').localeCompare(String(b.m.domain||''))||String(a.m.name||a.code).localeCompare(String(b.m.name||b.code)));
  }
  function renderCountyRanking(mart){
    const county=selectedCounty(mart),body=$('#methods-ranking-body'),meta=$('#methods-county-meta'),count=$('#methods-ranking-count');if(!county||!body)return;
    const peer=county.benchmarks?.peer_group;
    if(meta)meta.innerHTML=`<strong>${esc(county.geography?.name||'County')}</strong><span>${peer?`${esc(peer.tier_label||`Tier ${peer.tier}`)} · `:''}P06 rankings use common-period county evidence; peer grouping is population-size only.</span>`;
    const rows=rankingRows(county);if(count)count.textContent=`${rows.length} of ${Object.keys(county.metrics||{}).length} CountyIQ metrics`;
    body.innerHTML=rows.map(({code,m})=>{
      const r=m.ranking||{},t=m.trend||{},peerRank=r.peer_group;
      const rank=r.eligible?`#${r.rank} of ${r.eligible_count}`:'Withheld';
      const rankNote=r.eligible?`${fmt(r.percentile)}th pct · ${esc(r.period_key||m.latest?.period_label||'')}`:(m.eligibility?.reason_not_eligible||'Dynamic ranking gate did not pass.');
      const peerText=peerRank?`#${peerRank.rank} of ${peerRank.eligible_count}`:'—';
      const trendText=t.eligible?(t.direction||'classified'):'Withheld';
      const trendTone=t.eligible?(['improving','rising'].includes(t.direction)?'positive':['worsening','falling'].includes(t.direction)?'warning':'neutral'):'withheld';
      return `<tr>
        <td><strong>${esc(m.name||code)}</strong><small>${esc(code)} · ${esc(m.domain||'')}</small></td>
        <td><strong>${esc(fmt(m.latest?.value))}</strong><small>${esc(m.latest?.period_label||'')}</small></td>
        <td>${r.eligible?pill(rank,'positive'):pill(rank,'withheld')}<small>${esc(rankNote)}</small></td>
        <td>${esc(peerText)}${peerRank?`<small>${fmt(peerRank.percentile)}th pct in tier</small>`:''}</td>
        <td>${pill(trendText,trendTone)}<small>${t.eligible?`1-period ${signed(t.one_period_change)} · medium ${signed(t.medium_term_change)}${Number.isFinite(t.medium_term_years)?` over ${t.medium_term_years}y`:''}`:'Needs at least two numeric observations and a permitted trend policy.'}</small></td>
        <td>${directionLabel(m.eligibility?.higher_is_better)}</td>
      </tr>`;
    }).join('')||'<tr><td colspan="6" class="methods-empty">No CountyIQ metrics match the current filters.</td></tr>';
  }
  async function ensureRankingPanel(){
    const root=$('#methods-ranking-panel');if(!root||root.dataset.ready==='true')return;
    root.dataset.ready='loading';
    try{
      const mart=await loadMart();
      const select=$('#methods-county-select');
      select.innerHTML=(mart.counties||[]).slice().sort((a,b)=>String(a.geography?.name).localeCompare(String(b.geography?.name))).map(c=>`<option value="${esc(c.geography?.geo_code)}">${esc(c.geography?.name)}</option>`).join('');
      const nakuru=(mart.counties||[]).find(c=>c.geography?.geo_code==='KEN-C032');if(nakuru)select.value='KEN-C032';
      select.onchange=()=>renderCountyRanking(mart);
      $('#methods-ranking-search').oninput=()=>renderCountyRanking(mart);
      $('#methods-ranking-filter').onchange=()=>renderCountyRanking(mart);
      renderCountyRanking(mart);root.dataset.ready='true';
    }catch(error){root.dataset.ready='error';$('#methods-ranking-body').innerHTML=`<tr><td colspan="6" class="methods-empty">County ranking/trend evidence could not load: ${esc(error?.message||error)}</td></tr>`;}
  }

  function seriesRows(d){
    const q=($('#methods-series-search')?.value||'').trim().toLowerCase();
    const state=$('#methods-series-filter')?.value||'all';
    return (d.policy.series||[]).filter(p=>{
      const s=d.seriesById.get(p.series_id)||{},geo=d.geoById.get(s.geography_id)||{};
      const eligible=p.cross_level_comparison?.eligible===true;
      if(state==='eligible'&&!eligible)return false;
      if(state==='same-level'&&eligible)return false;
      const text=[p.series_code,p.indicator_code,p.unit_code,p.transformation,p.aggregation,p.cross_level_comparison?.rule_basis,geo.name,geo.level].filter(Boolean).join(' ').toLowerCase();
      return !q||text.includes(q);
    });
  }
  function renderSeriesPolicies(d,{reset=false}={}){
    if(reset)seriesLimit=80;
    const root=$('#methods-series-list'),count=$('#methods-series-count'),more=$('#methods-series-more');if(!root)return;
    const rows=seriesRows(d);if(count)count.textContent=`${Math.min(rows.length,seriesLimit)} shown · ${rows.length.toLocaleString('en-KE')} matching · ${(d.policy.series||[]).length.toLocaleString('en-KE')} governed`;
    root.innerHTML=rows.slice(0,seriesLimit).map(p=>{
      const s=d.seriesById.get(p.series_id)||{},geo=d.geoById.get(s.geography_id)||{},eligible=p.cross_level_comparison?.eligible===true;
      return `<article class="methods-series-card"><div><strong>${esc(p.series_code)}</strong><span>${esc(p.indicator_code)} · ${esc(geo.name||'Unknown place')} · ${esc(geo.level||'')}</span></div><div>${pill(eligible?'Cross-level eligible':'Same-level only',eligible?'positive':'withheld')}<small>${esc(p.cross_level_comparison?.rule_basis||'No rule basis')}</small></div><button type="button" data-methods-series="${esc(p.series_code)}">Open series →</button></article>`;
    }).join('')||'<div class="methods-empty">No series match the current filters.</div>';
    if(more){more.hidden=rows.length<=seriesLimit;more.onclick=()=>{seriesLimit+=80;renderSeriesPolicies(d);};}
  }

  function activateTab(name){
    activeTab=name;
    $$('[data-methods-tab]').forEach(btn=>{const on=btn.dataset.methodsTab===name;btn.classList.toggle('active',on);btn.setAttribute('aria-selected',String(on));});
    $$('[data-methods-panel]').forEach(panel=>panel.hidden=panel.dataset.methodsPanel!==name);
    if(name==='ranking')ensureRankingPanel();
  }
  function bind(d){
    $('#methods-policy-search').oninput=()=>renderPolicyTable(d);
    $('#methods-domain-filter').onchange=()=>renderPolicyTable(d);
    $('#methods-rule-filter').onchange=()=>renderPolicyTable(d);
    $('#methods-series-search').oninput=()=>renderSeriesPolicies(d,{reset:true});
    $('#methods-series-filter').onchange=()=>renderSeriesPolicies(d,{reset:true});
    $('#methods-tabs').onclick=e=>{const btn=e.target.closest('[data-methods-tab]');if(btn)activateTab(btn.dataset.methodsTab);};
    $('#methods').addEventListener('click',e=>{const btn=e.target.closest('[data-methods-series]');if(!btn)return;const code=btn.dataset.methodsSeries;if(R?.navigate)R.navigate('series',code);else location.hash=`#/series/${encodeURIComponent(code)}`;});
  }
  async function boot(){
    if(bootPromise)return bootPromise;
    bootPromise=(async()=>{
      const d=await loadBase();renderSummary(d);renderPolicyTable(d);renderSeriesPolicies(d,{reset:true});bind(d);activateTab(activeTab);return d;
    })().catch(error=>{console.error('Methods & Comparability:',error);const root=$('#methods-load-state');if(root)root.textContent=`Methods registry unavailable: ${error?.message||error}`;return null;});
    return bootPromise;
  }
  window.addEventListener('kda:route',event=>{if(event.detail?.view==='methods')boot();});
  window.KDAMethods={boot};
  if(route().view==='methods')boot();
})();
