(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const labelStatus=value=>String(value||'planned').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());

  function statusClass(status){
    return `roadmap-status roadmap-${String(status||'planned').replace(/_/g,'-')}`;
  }
  function countStatuses(roadmap){
    const out={};
    for(const domain of roadmap.data_domains||[]){
      for(const indicator of domain.indicators||[]) out[indicator.status]=(out[indicator.status]||0)+1;
    }
    return out;
  }
  function renderSummary(roadmap){
    const counts=countStatuses(roadmap);
    const target=(roadmap.data_domains||[]).reduce((sum,d)=>sum+(Number(d.target_indicator_count)||0),0);
    const domains=(roadmap.data_domains||[]).length;
    const stages=(roadmap.release_stages||[]).length;
    const workstreams=(roadmap.workstreams||[]).length;
    $('#roadmap-summary').innerHTML=`
      <article><small>Target evidence base</small><strong>${target}</strong><span>indicator slots across ${domains} domains</span></article>
      <article><small>Integrated / ready</small><strong>${(counts.integrated||0)+(counts.ready_to_surface||0)}</strong><span>scaffold indicator entries already usable or present</span></article>
      <article><small>Source identified</small><strong>${counts.sourced||0}</strong><span>entries needing ingestion/activation work</span></article>
      <article><small>Completion path</small><strong>${stages}</strong><span>release stages · ${workstreams} ordered workstreams</span></article>`;
  }
  function renderExperiences(roadmap){
    $('#roadmap-experiences').innerHTML=(roadmap.final_experience||[]).map(item=>`
      <article class="roadmap-card">
        <div class="roadmap-card-top"><span class="${statusClass(item.status)}">${esc(labelStatus(item.status))}</span><small>${esc(item.id)}</small></div>
        <h3>${esc(item.name)}</h3><p>${esc(item.purpose)}</p>
        ${item.blocker?`<div class="roadmap-blocker"><strong>Gate:</strong> ${esc(item.blocker)}</div>`:''}
        <div class="roadmap-tags">${(item.target_features||[]).map(x=>`<span>${esc(x)}</span>`).join('')}</div>
      </article>`).join('');
  }
  function renderDomains(roadmap){
    $('#roadmap-domains').innerHTML=(roadmap.data_domains||[]).map(domain=>{
      const items=domain.indicators||[];
      const integrated=items.filter(x=>x.status==='integrated'||x.status==='ready_to_surface').length;
      return `<article class="roadmap-domain">
        <header><div><small>${esc(domain.current_readiness.replace(/_/g,' '))}</small><h3>${esc(domain.name)}</h3></div><strong>${integrated}/${domain.target_indicator_count}</strong></header>
        <div class="roadmap-progress"><i style="width:${Math.min(100,(integrated/domain.target_indicator_count)*100)}%"></i></div>
        <div class="roadmap-indicators">${items.map(x=>`<div class="roadmap-indicator"><span class="${statusClass(x.status)}">${esc(labelStatus(x.status))}</span><div><strong>${esc(x.name)}</strong><small>${esc(x.coverage||x.dependency||x.note||'Target-state indicator')}</small></div></div>`).join('')}</div>
      </article>`;
    }).join('');
  }
  function renderWorkstreams(roadmap){
    const rows=[...(roadmap.workstreams||[])].sort((a,b)=>a.priority-b.priority);
    $('#roadmap-workstreams').innerHTML=rows.map(ws=>`
      <article class="roadmap-workstream">
        <div class="roadmap-step">${String(ws.priority).padStart(2,'0')}</div>
        <div class="roadmap-work-copy"><div class="roadmap-work-head"><h3>${esc(ws.name)}</h3><span class="${statusClass(ws.status)}">${esc(labelStatus(ws.status))}</span></div>
        <p><strong>Stage ${esc(ws.stage)}</strong>${(ws.depends_on||[]).length?` · depends on ${esc(ws.depends_on.join(', '))}`:' · no prior CountyIQ workstream dependency'}</p>
        <small>Exit gate: ${esc(ws.exit_gate)}</small></div>
      </article>`).join('');
  }
  function renderStages(roadmap){
    $('#roadmap-stages').innerHTML=(roadmap.release_stages||[]).map(stage=>`
      <article class="roadmap-stage"><span>${esc(stage.id)}</span><div><h3>${esc(stage.name)}</h3><p>${esc(stage.definition)}</p></div></article>`).join('');
  }
  function renderGuardrails(roadmap){
    $('#roadmap-guardrails').innerHTML=(roadmap.guardrails||[]).map((g,i)=>`<li><span>${i+1}</span><p>${esc(g)}</p></li>`).join('');
  }

  async function load(){
    const panel=$('#final-shape'); if(!panel)return;
    try{
      const response=await fetch('data/countyiq/roadmap.json');
      if(!response.ok)throw new Error(`roadmap.json (${response.status})`);
      const roadmap=await response.json();
      renderSummary(roadmap);renderExperiences(roadmap);renderDomains(roadmap);renderWorkstreams(roadmap);renderStages(roadmap);renderGuardrails(roadmap);
      const contract=$('#roadmap-contract');
      if(contract) contract.textContent=roadmap.product?.target_state||'';
    }catch(error){
      console.error(error);
      const root=$('#roadmap-summary');
      if(root)root.innerHTML=`<div class="iq-error"><strong>Target-state roadmap could not load.</strong><br>${esc(error.message||error)}</div>`;
    }
  }
  document.addEventListener('DOMContentLoaded',load);
})();
