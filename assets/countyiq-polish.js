(function(){
  'use strict';
  document.addEventListener('DOMContentLoaded',()=>{
    const $=s=>document.querySelector(s);
    const $$=s=>[...document.querySelectorAll(s)];

    const menu=$('.menu-button');
    const nav=$('#main-nav');
    if(menu&&nav){
      menu.addEventListener('click',()=>{
        const open=nav.classList.toggle('open');
        menu.setAttribute('aria-expanded',String(open));
      });
      nav.addEventListener('click',()=>{
        nav.classList.remove('open');
        menu.setAttribute('aria-expanded','false');
      });
    }

    const style=document.createElement('style');
    style.textContent=`
      .countyiq-page .header-search{text-decoration:none;color:var(--ink)}
      .rank-county{border:0;background:none;padding:0;color:var(--ink);font:inherit;font-weight:700;cursor:pointer;text-align:left}
      .rank-county:hover,.rank-county:focus{color:var(--green2);text-decoration:underline}
      .iq-table-wrap tr[data-selected="true"]{background:#f1f5f1}
      @media(max-width:760px){.countyiq-page #main-nav.open{display:flex}.countyiq-page #main-nav{z-index:30}}
    `;
    document.head.appendChild(style);

    const metric=$('#rank-metric');
    const body=$('#ranking-body');
    function syncRankingProvenance(){
      const derived=metric?.value==='gcpGrowth';
      $$('#ranking-body .badge').forEach(b=>{
        b.className=`badge ${derived?'b':'a'}`;
        b.textContent=derived?'B':'A';
        b.title=derived?'Official derived — calculated from published 2023 and 2024 GCP':'Official direct';
      });
    }
    metric?.addEventListener('change',()=>queueMicrotask(syncRankingProvenance));
    if(body) new MutationObserver(syncRankingProvenance).observe(body,{childList:true,subtree:true});
    syncRankingProvenance();
  });
})();