// Service Worker v5.0 - 神经重塑训练
const CACHE_VERSION = 'neuro-v5.0';
const CACHE_NAME = CACHE_VERSION;
const RUNTIME_CACHE = 'neuro-runtime-v5.0';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js'
];

const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a|aac|flac|webm|oga|opus)(\?.*)?$/i;

self.addEventListener('install', event => {
  console.log('[SW v5.0] 安装');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(CORE_ASSETS.map(a => {
        try { return cache.add(new URL(a, self.location.origin).href).catch(e => console.warn('[SW] 缓存失败:', a, e.message)); }
        catch (e) { return Promise.resolve(); }
      })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW v5.0] 激活');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (!request.url.startsWith('http')) return;
  const url = new URL(request.url);
  if (AUDIO_EXTENSIONS.test(url.pathname)) { event.respondWith(networkFirst(request)); return; }
  if (request.mode === 'navigate') { event.respondWith(networkFirst(request, './index.html')); return; }
  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    fetch(request).then(r => { if (r?.status === 200) caches.open(CACHE_NAME).then(c => c.put(request, r.clone())); }).catch(() => {});
    return cached;
  }
  try {
    const network = await fetch(request);
    if (network?.status === 200) { const cache = await caches.open(CACHE_NAME); cache.put(request, network.clone()); }
    return network;
  } catch (e) { return new Response('离线不可用', { status: 503 }); }
}

async function networkFirst(request, fallbackUrl) {
  try {
    const network = await fetch(request, { cache: 'no-cache' });
    if (network?.status === 200) { const cache = await caches.open(RUNTIME_CACHE); cache.put(request, network.clone()); return network; }
  } catch (e) {}
  const cached = await caches.match(request);
  if (cached) return cached;
  if (fallbackUrl) {
    try { const fb = await caches.match(new URL(fallbackUrl, self.location.origin).href); if (fb) return fb; } catch (e) {}
  }
  return new Response('离线不可用', { status: 503 });
}

// 🔑 通知点击处理
self.addEventListener('notificationclick', event => {
  console.log('[SW] 通知点击 action:', event.action);
  event.notification.close();
  const action = event.action || 'default';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      let target = clientList.find(c => c.url.includes(self.location.origin));
      const sendMsg = (client) => {
        if (client) {
          // 使用 then 兼容
          Promise.resolve(client).then(c => {
            c.postMessage({ type: 'MEDIA_ACTION', action, timestamp: Date.now() });
          });
        }
      };
      if (target && 'focus' in target) {
        target.focus();
        sendMsg(target);
      } else if (clients.openWindow) {
        clients.openWindow('./index.html').then(newClient => {
          setTimeout(() => sendMsg(newClient), 1000);
        });
      }
    })
  );
});

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => event.ports[0]?.postMessage({ success: true }));
  }
});

console.log('[SW v5.0] 已加载');
