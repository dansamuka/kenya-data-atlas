/* Kenya Data Atlas offline app shell. Same-origin GET requests only. */
const CACHE_NAME='kenya-data-atlas-v2-20260901-pulse';
const APP_SHELL=['./','./index.html','./assets/styles.css','./assets/router.js','./assets/app.js','./assets/pulse-carousel.css','./assets/pulse-carousel.js','./assets/data-loader.js','./assets/site-v2.css','./assets/site-v2.js','./assets/site-v2-route.css','./assets/site-v2-route.js','./assets/pwa-v2.js','./manifest.webmanifest'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const requestUrl=new URL(event.request.url);
  if(requestUrl.origin!==self.location.origin)return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));}
    return response;
  }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html'))));
});
