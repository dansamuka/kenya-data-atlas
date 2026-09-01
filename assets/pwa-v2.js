/* Kenya Data Atlas — install/offline/share shell + v2 continuation loaders. */
(function(){
  'use strict';
  if(!document.querySelector('link[rel="manifest"]')){const l=document.createElement('link');l.rel='manifest';l.href='manifest.webmanifest';document.head.appendChild(l);}
  try{const n=Number(localStorage.getItem('kda-session-count')||0)+1;localStorage.setItem('kda-session-count',String(n));window.__KDAInstallEligible=n>=2;}catch(_){window.__KDAInstallEligible=false;}
  let deferred=null;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;if(!window.__KDAInstallEligible)return;let b=document.querySelector('#kda-install');if(!b){b=document.createElement('button');b.id='kda-install';b.type='button';b.className='kda-install';b.textContent='Add Kenya Data Atlas to Home Screen';document.body.appendChild(b);}b.onclick=async()=>{if(!deferred)return;deferred.prompt();await deferred.userChoice;deferred=null;b.remove();};});
  window.addEventListener('appinstalled',()=>document.querySelector('#kda-install')?.remove());

  const KDA=window.KDAData;let corePromise=null,crossPromise=null;
  function style(href,id){if(KDA?.loadStyle)return KDA.loadStyle(href,{id});if(document.getElementById(id))return Promise.resolve();const l=document.createElement('link');l.id=id;l.rel='stylesheet';l.href=href;document.head.appendChild(l);return Promise.resolve(l);}
  function script(src,id){if(KDA?.loadScript)return KDA.loadScript(src,{id});if(document.getElementById(id))return Promise.resolve();return new Promise((resolve,reject)=>{const s=document.createElement('script');s.id=id;s.src=src;s.onload=()=>resolve(s);s.onerror=reject;document.head.appendChild(s);});}
  function patchSearchLoader(){if(!window.KDAOptional||!window.KDASiteSearch)return;window.KDAOptional.loadSiteSearch=()=>Promise.resolve(window.KDASiteSearch).then(api=>{api?.boot?.();return api;});}
  function neutralizeLegacyQuality(){const clean=()=>document.querySelectorAll('.badge[data-v2-quality]').forEach(b=>b.removeAttribute('data-v2-quality'));clean();if(window.__KDAProvLegacyGuard)return;window.__KDAProvLegacyGuard=true;new MutationObserver(clean).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-v2-quality']});}
  function loadCore(){if(corePromise)return corePromise;corePromise=Promise.all([style('assets/provenance-v2.css','kda-provenance-v2-css'),script('assets/provenance-v2.js','kda-provenance-v2-js'),script('assets/search-unified-v2.js','kda-search-unified-v2')]).then(()=>{neutralizeLegacyQuality();patchSearchLoader();return true;}).catch(error=>{console.warn('KDA v2 continuation:',error?.message||error);return false;});return corePromise;}
  function onCompare(){const view=window.KDARouter?.current?.()?.view||window.KDARouter?.parse?.()?.view;if(view!=='compare')return;if(crossPromise)return;const base=window.KDAOptional?.loadCompare?.()||Promise.resolve();crossPromise=Promise.resolve(base).then(()=>Promise.all([style('assets/compare-cross-level.css','kda-compare-cross-level-css'),script('assets/compare-cross-level.js','kda-compare-cross-level-js')])).then(()=>window.KDACompareCross?.boot?.()).catch(error=>{console.warn('Cross-level Compare load:',error?.message||error);return null;});}
  loadCore().then(()=>{patchSearchLoader();onCompare();});
  window.addEventListener('kda:route',()=>{patchSearchLoader();onCompare();});
})();
