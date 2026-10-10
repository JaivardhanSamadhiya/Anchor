const SHELL_CACHE = 'anchor-shell-v2';
const SHELL = ['/', '/index.html', '/styles.css', '/guide.css', '/account-ui.css', '/app.js', '/guide.js', '/account.js', '/account-ui.js', '/engine.js', '/platform.js', '/data.js', '/icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', event => {event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('anchor-shell-')&&key!==SHELL_CACHE).map(key=>caches.delete(key))))]));});
self.addEventListener('fetch',event=>{
  const url = new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  // Auth and private account data must always reach the server, never a cache.
  if(url.pathname.startsWith('/api/')||['/signin-with-chatgpt','/signout-with-chatgpt','/callback'].includes(url.pathname))return;
  if(url.pathname.startsWith('/vendor/')){
    event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(async response=>{if(response.ok){const cache=await caches.open('anchor-readers-v1');await cache.put(event.request,response.clone());}return response;})));
    return;
  }
  if(SHELL.includes(url.pathname)||event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(async response=>{if(response.ok){const cache=await caches.open(SHELL_CACHE);await cache.put(event.request,response.clone());}return response;}).catch(()=>caches.match(event.request).then(hit=>hit||(event.request.mode==='navigate'?caches.match('/index.html'):Response.error()))));
  }
});
