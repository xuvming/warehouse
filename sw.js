const CACHE_VERSION = 'neuro-remodel-v3.2';
const CACHE_NAME = CACHE_VERSION;
const RUNTIME_CACHE = 'neuro-runtime-v3.2';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js'
];

const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i;

self.addEventListener('install', (event) => {
  console.log('[SW] 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        CORE_ASSETS.map(asset => {
          try {
            const url = new URL(asset, self.location.origin);
            return cache.add(url.href).catch(err => console.warn('[SW] 缓存失败:', asset, err.message));
          } catch (e) { return Promise.resolve(); }
        })
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] 激活中...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE && key !== CACHE_VERSION)
            .map(key => { console.log('[SW] 清理旧缓存:', key); return caches.delete(key); })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!request.url.startsWith('http')) return;
  
  const url = new URL(request.url);
  
  if (AUDIO_EXTENSIONS.test(url.pathname)) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }
  
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstStrategy(request, './index.html'));
    return;
  }
  
  event.respondWith(cacheFirstStrategy(request));
});

async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    fetch(request).then(response => {
      if (response?.status === 200) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    }).catch(() => {});
    return cachedResponse;
  }
  try {
    const networkResponse = await fetch(request);
    if (networkResponse?.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('离线不可用', { status: 503 });
  }
}

async function networkFirstStrategy(request, fallbackUrl) {
  try {
    const networkResponse = await fetch(request, { cache: 'no-cache' });
    if (networkResponse?.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch (error) {}
  
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;
  
  if (fallbackUrl) {
    const fallback = await caches.match(fallbackUrl);
    if (fallback) return fallback;
  }
  
  return new Response('离线不可用', { status: 503 });
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
         .then(() => event.ports[0]?.postMessage({ success: true }));
  }
});
