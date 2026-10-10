// Scope every cache key to this installation (e.g. /Anchor/), not the host root.
const base = new URL('./', self.location.href);
const shellCache = `anchor-shell-v3:${base.pathname}`;
const readerCache = `anchor-readers-v2:${base.pathname}`;
const shell = [
  '',
  'index.html',
  'styles.css',
  'guide.css',
  'account-ui.css',
  'continuity.css',
  'app.js',
  'guide.js',
  'account.js',
  'account-ui.js',
  'engine.js',
  'platform.js',
  'data.js',
  'continuity.js',
  'continuity-view.js',
  'supabase-transport.js',
  'config.js',
  'icon.svg',
  'manifest.webmanifest',
].map((path) => new URL(path, base).href);
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(shellCache)
      .then((cache) => cache.addAll(shell))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key.startsWith('anchor-shell-') &&
                  key !== shellCache &&
                  (!key.includes(':') || key.endsWith(`:${base.pathname}`)),
              )
              .map((key) => caches.delete(key)),
          ),
        ),
    ]),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Supabase and Google are cross-origin: never intercept or cache their data.
  if (
    event.request.method !== 'GET' ||
    url.origin !== base.origin ||
    !url.pathname.startsWith(base.pathname)
  )
    return;
  const relative = url.pathname.slice(base.pathname.length);
  if (
    relative.startsWith('api/') ||
    ['callback', 'signin-with-chatgpt', 'signout-with-chatgpt'].includes(relative)
  )
    return;
  if (relative.startsWith('vendor/')) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then(async (response) => {
            if (response.ok)
              await (await caches.open(readerCache)).put(event.request, response.clone());
            return response;
          }),
      ),
    );
    return;
  }
  if (shell.includes(url.href) || event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.ok)
            await (await caches.open(shellCache)).put(event.request, response.clone());
          return response;
        })
        .catch(
          async () =>
            (await caches.match(event.request)) ||
            (event.request.mode === 'navigate'
              ? await caches.match(new URL('index.html', base).href)
              : Response.error()),
        ),
    );
  }
});
