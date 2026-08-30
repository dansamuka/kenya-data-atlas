/* Kenya Data Atlas — public County Rankings & Insights.
 * User-facing release surface for the actual analytical outputs already
 * produced by CountyIQ. Methodology and policy machinery stay in docs/data.
 */
(function(){
  'use strict';
  const KDA=window.KDAData,R=window.KDARouter;
  if(!KDA)return;
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const finite=v=>Number.isFinite(Number(v));
  const nfmt=(v,d=1)=>finite(v)?Number(v).toLocaleString('en-KE',{minimumFractionDigits:0,maximumFractionDigits:d}):'—';
  const signed=(v,suffix='')=>finite(v)?`${Number(v)>0?'+':''}${nfmt(v,2)}${suffix}`:'—';
  let bootPromise=null,data=null,activeTab='development';

  function fmtValue(v,unit){
    if(!finite(v))return'—';
    const n=Number(v),code=String(unit||'');
    if(code==='percent'||code.includes('percent'))return`${nfmt(n,1)}%`;
    if(code==='persons'||code==='count')return n.toLocaleString('en-KE',{maximumFractionDigits:0});
    if(code==='kes_million')return`KES ${n.toLocaleString('en-KE',{maximumFractionDigits:1})} mn`;
    if(code==='km2')return`${nfmt(n,1)} km²`;
    if(code==='hectares')return`${nfmt(n,1)} ha`;
    return n.toLocaleString('en-KE',{maximumFractionDigits:2});
  }
  function trendPill(t){
    if(!t?.eligible)return'<span class="ri-pill muted">No trend</span>';
    const good=['improving','rising'].includes(t.direction),bad=['worsening','falling'].includes(t.direction);
    return `<span class="ri-pill ${good?'good':bad?'warn':'neutral'}">${esc(String(t.direction||'stable').replaceAll('_',' '))}</span>`;
  }
  function directionText(v){return v===true?'Higher is stronger':v===false?'Lower is stronger':'Position only';}
  function route(){return R?.current?.()||R?.parse?.()||{view:'rankings'};}
  async function load(){if(data)return data;data=await KDA.fetchJson('data/results/county-results.json',{required:true});return data;}

  function renderSummary(d){
    const root=$('#ri-summary');if(!root)return;
    const c=d.coverage||{};
    root.innerHTML=[
      ['Counties compared',c.counties,'complete national coverage'],
      ['Ranked indicators',c.ranked_indicators,'full 47-county leaderboards'],
      ['Fiscal delivery scores',c.fiscal_scores,'FY2024/25 complete scores'],
      ['Evidence profiles',c.evidence_profiles,'county evidence doorways']
    ].map(([label,value,note])=>`<article><small>${esc(label)}</small><strong>${Number(value||0).toLocaleString('en-KE')}</strong><span>${esc(note)}</span></article>`).join('');
  }

  function renderDevelopment(d){
    const body=$('#ri-development-body');if(!body)return;
    body.innerHTML=(d.development_snapshot||[]).map(r=>`<tr>
      <td><strong>${esc(r.county)}</strong></td>
      <td><strong>${nfmt(r.score,1)}</strong><small>0–100</small></td>
      <td><span class="ri-band band-${esc(r.relative_position_band)}">${esc(r.relative_position_label||'—')}</span></td>
      <td><strong>#${esc(r.diagnostic_rank??'—')}</strong><small>diagnostic exact position</small></td>
      <td>#${esc(r.plausible_min_rank??'—')}–#${esc(r.plausible_max_rank??'—')}</td>
    </tr>`).join('');
    $('#ri-development-count').textContent=`${(d.development_snapshot||[]).length} counties`;
  }

  function renderFiscal(d){
    const body=$('#ri-fiscal-body');if(!body)return;
    body.innerHTML=(d.fiscal_delivery||[]).map(r=>`<tr class="${finite(r.score)?'':'ri-withheld-row'}">
      <td>${finite(r.rank)?`<strong>#${esc(r.rank)}</strong>`:'—'}</td>
      <td><strong>${esc(r.county)}</strong>${!finite(r.score)?'<small>Score withheld: incomplete published input</small>':''}</td>
      <td><strong>${finite(r.score)?nfmt(r.score,1):'Not scored'}</strong></td>
      <td>${nfmt(r.execution_score,1)}</td>
      <td>${nfmt(r.revenue_score,1)}${finite(r.osr_target_attainment_pct)?`<small>OSR target: ${nfmt(r.osr_target_attainment_pct,1)}%</small>`:''}</td>
      <td>${nfmt(r.arrears_score,1)}${finite(r.pending_bills_pct_budget)?`<small>Pending bills: ${nfmt(r.pending_bills_pct_budget,1)}% of budget</small>`:''}</td>
    </tr>`).join('');
    $('#ri-fiscal-count').textContent=`${d.coverage?.fiscal_scores||0} scored · ${(d.fiscal_delivery||[]).length-(d.coverage?.fiscal_scores||0)} withheld`;
  }

  function populateIndicatorSelector(d){
    const select=$('#ri-indicator-select');if(!select||select.options.length>1)return;
    const groups=new Map();for(const g of d.indicator_rankings||[]){const domain=g.domain||'Other';if(!groups.has(domain))groups.set(domain,[]);groups.get(domain).push(g);}
    select.innerHTML=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([domain,rows])=>`<optgroup label="${esc(domain[0].toUpperCase()+domain.slice(1))}">${rows.sort((a,b)=>a.name.localeCompare(b.name)).map(g=>`<option value="${esc(g.indicator_code)}">${esc(g.name)}</option>`).join('')}</optgroup>`).join('');
    const preferred=(d.indicator_rankings||[]).find(g=>g.indicator_code==='IND-COUNTY-BUDGET-ABSORPTION')||(d.indicator_rankings||[])[0];if(preferred)select.value=preferred.indicator_code;
  }
  function selectedIndicator(d){const code=$('#ri-indicator-select')?.value;return (d.indicator_rankings||[]).find(x=>x.indicator_code===code)||(d.indicator_rankings||[])[0];}
  function renderIndicatorRanking(d){
    const group=selectedIndicator(d),body=$('#ri-indicator-body'),meta=$('#ri-indicator-meta');if(!group||!body)return;
    const q=($('#ri-indicator-search')?.value||'').trim().toLowerCase();
    const rows=group.rows.filter(r=>!q||r.county.toLowerCase().includes(q));
    if(meta)meta.innerHTML=`<div><strong>${esc(group.name)}</strong><span>${esc(group.domain||'')} · ${rows.length} counties</span></div><p>Select another indicator to see its complete national ranking.</p>`;
    body.innerHTML=rows.map(r=>`<tr>
      <td><strong>#${esc(r.ranking.rank)}</strong></td>
      <td><strong>${esc(r.county)}</strong></td>
      <td><strong>${esc(fmtValue(r.latest?.value,r.latest?.unit_code))}</strong><small>${esc(r.latest?.period_label||'')}</small></td>
      <td>${nfmt(r.ranking.percentile,0)}th</td>
      <td>${finite(r.ranking.peer_rank)?`#${esc(r.ranking.peer_rank)} of ${esc(r.ranking.peer_eligible_count)}`:'—'}</td>
      <td>${trendPill(r.trend)}${r.trend?.eligible?`<small>${signed(r.trend.one_period_change)} latest change</small>`:''}</td>
      <td><span class="ri-direction">${esc(directionText(r.ranking.higher_is_better))}</span></td>
    </tr>`).join('')||'<tr><td colspan="7" class="ri-empty">No counties match this search.</td></tr>';
  }

  function populateCountySelectors(d){
    const opts=(d.counties||[]).slice().sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<option value="${esc(c.geo_code)}">${esc(c.name)}</option>`).join('');
    for(const id of ['#ri-gap-county','#ri-evidence-county']){const s=$(id);if(s){s.innerHTML=opts;s.value=(d.counties||[]).some(c=>c.geo_code==='KEN-C032')?'KEN-C032':s.options[0]?.value;}}
  }
  function countyByCode(d,code){return (d.counties||[]).find(c=>c.geo_code===code)||(d.counties||[])[0];}
  function renderGaps(d){
    const c=countyByCode(d,$('#ri-gap-county')?.value),root=$('#ri-gap-content');if(!c||!root)return;
    const group=(title,items,cls)=>`<article class="ri-gap-card ${cls}"><h3>${esc(title)}</h3>${items?.length?`<ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<p>No published statement in this category.</p>'}</article>`;
    root.innerHTML=`<div class="ri-selected-head"><div><small>County view</small><h2>${esc(c.name)}</h2></div><span>${esc(c.peer_group?.label||'County peer group')}</span></div><div class="ri-gap-grid">${group('Working well',c.strengths_and_gaps?.working_well,'good')}${group('Needs attention',c.strengths_and_gaps?.needs_attention,'attention')}${group('What changed',c.strengths_and_gaps?.what_changed,'change')}</div>`;
  }

  function formatRecognitionValue(x){if(!finite(x.value))return'';if(x.unit==='percentage_points')return`${signed(x.value,' pp')}`;if(x.unit==='percent'||x.unit==='percent_of_approved_budget')return`${nfmt(x.value,1)}%`;if(x.unit==='score_0_100')return`${nfmt(x.value,1)}/100`;return nfmt(x.value,1);}
  function renderRecognition(d){
    const root=$('#ri-recognition-grid');if(!root)return;
    root.innerHTML=(d.recognition||[]).map(g=>`<article class="ri-recognition-card"><div><small>County recognition</small><h3>${esc(g.label)}</h3></div><ol>${g.counties.map(x=>`<li><span>${finite(x.rank)?`#${esc(x.rank)} `:''}${esc(x.county)}</span><strong>${esc(formatRecognitionValue(x))}</strong></li>`).join('')}</ol></article>`).join('');
  }

  function renderEvidence(d){
    const c=countyByCode(d,$('#ri-evidence-county')?.value),root=$('#ri-evidence-list'),meta=$('#ri-evidence-meta');if(!c||!root)return;
    if(meta)meta.innerHTML=`<strong>${esc(c.name)}</strong><span>${c.evidence.count} indexed official evidence record${c.evidence.count===1?'':'s'} · ${c.evidence.families.length} document families</span>`;
    root.innerHTML=(c.evidence.records||[]).map(r=>{const url=r.document_url||r.source_page_url;return `<article class="ri-evidence-card"><div><small>${esc(String(r.family||'evidence').replaceAll('_',' '))} · ${esc(r.period||'current/historical')}</small><strong>${esc(r.title)}</strong><span>${esc(r.publisher||'Official source')}</span></div>${url?`<a href="${esc(url)}" target="_blank" rel="noopener">Open official source ↗</a>`:''}</article>`;}).join('')||'<div class="ri-empty">No evidence records available.</div>';
  }

  function activate(name,d){
    activeTab=name;
    $$('[data-ri-tab]').forEach(b=>{const on=b.dataset.riTab===name;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));});
    $$('[data-ri-panel]').forEach(p=>p.hidden=p.dataset.riPanel!==name);
    if(name==='indicator')renderIndicatorRanking(d);if(name==='gaps')renderGaps(d);if(name==='evidence')renderEvidence(d);
  }
  function bind(d){
    $('#ri-tabs').onclick=e=>{const b=e.target.closest('[data-ri-tab]');if(b)activate(b.dataset.riTab,d);};
    $('#ri-indicator-select').onchange=()=>renderIndicatorRanking(d);$('#ri-indicator-search').oninput=()=>renderIndicatorRanking(d);
    $('#ri-gap-county').onchange=()=>renderGaps(d);$('#ri-evidence-county').onchange=()=>renderEvidence(d);
  }
  async function boot(){
    if(bootPromise)return bootPromise;
    bootPromise=(async()=>{const d=await load();renderSummary(d);renderDevelopment(d);renderFiscal(d);populateIndicatorSelector(d);populateCountySelectors(d);renderRecognition(d);bind(d);activate(activeTab,d);return d;})().catch(error=>{console.error('Rankings & Insights:',error);const root=$('#ri-load-state');if(root)root.textContent=`Rankings are temporarily unavailable: ${error?.message||error}`;return null;});
    return bootPromise;
  }
  window.addEventListener('kda:route',e=>{if(e.detail?.view==='rankings')boot();});
  window.KDARankings={boot};
  if(route().view==='rankings')boot();
})();