/* Kenya Data Atlas — install/offline/share shell. */
(function(){
  'use strict';
  if(!document.querySelector('link[rel="manifest"]')){const l=document.createElement('link');l.rel='manifest';l.href='manifest.webmanifest';document.head.appendChild(l);}
  try{const n=Number(localStorage.getItem('kda-session-count')||0)+1;localStorage.setItem('kda-session-count',String(n));window.__KDAInstallEligible=n>=2;}catch(_){window.__KDAInstallEligible=false;}
  let deferred=null;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;if(!window.__KDAInstallEligible)return;let b=document.querySelector('#kda-install');if(!b){b=document.createElement('button');b.id='kda-install';b.type='button';b.className='kda-install';b.textContent='Add Kenya Data Atlas to Home Screen';document.body.appendChild(b);}b.onclick=async()=>{if(!deferred)return;deferred.prompt();await deferred.userChoice;deferred=null;b.remove();};});
  window.addEventListener('appinstalled',()=>document.querySelector('#kda-install')?.remove());
})();
