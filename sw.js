// Service Worker v3.3 - 神经重塑训练（锁屏控制优化）
const CACHE_VERSION = 'neuro-v3.3-lockscreen';
const CACHE_NAME = CACHE_VERSION;
const RUNTIME_CACHE = 'neuro-runtime-v3.3';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js'
];

const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a|aac|flac|webm|oga|opus)(\?.*)?$/i;

// 安装
self.addEventListener('install', (event) => {
  console.log('[SW v3.3] 安装...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        CORE_ASSETS.map(asset => {
          try {
            const url = new URL(asset, self.location.origin).href;
            return cache.add(url).catch(err => console.warn('[SW] 缓存失败:', asset, err.message));
          } catch (e) { return Promise.resolve(); }
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// 激活
self.addEventListener('activate', (event) => {
  console.log('[SW v3.3] 激活...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE)
            .map(k => { console.log('[SW] 清理:', k); return caches.delete(k); })
      );
    }).then(() => self.clients.claim())
  );
});

// 请求拦截
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
  const cached = await caches.match(request);
  if (cached) {
    fetch(request).then(r => { if (r?.status === 200) caches.open(CACHE_NAME).then(c => c.put(request, r.clone())); }).catch(() => {});
    return cached;
  }
  try {
    const network = await fetch(request);
    if (network?.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, network.clone());
    }
    return network;
  } catch (e) {
    return new Response('离线不可用', { status: 503 });
  }
}

async function networkFirstStrategy(request, fallbackUrl) {
  try {
    const network = await fetch(request, { cache: 'no-cache' });
    if (network?.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, network.clone());
      return network;
    }
  } catch (e) {}
  
  const cached = await caches.match(request);
  if (cached) return cached;
  
  if (fallbackUrl) {
    try {
      const fb = await caches.match(new URL(fallbackUrl, self.location.origin).href);
      if (fb) return fb;
    } catch (e) {}
  }
  
  return new Response('离线不可用', { status: 503 });
}

// 通知点击处理（支持媒体操作）
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 通知点击:', event.action);
  event.notification.close();
  
  const action = event.action || 'default';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // 找主窗口
        let target = clientList.find(c => c.url.includes(self.location.origin));
        
        if (target && 'focus' in target) {
          target.focus();
        } else if (clients.openWindow) {
          target = clients.openWindow('./index.html');
        }
        
        // 发送媒体操作命令
        if (target) {
          (target.then ? target : Promise.resolve(target)).then(c => {
            if (c) {
              c.postMessage({ type: 'MEDIA_ACTION', action });
            }
          });
        }
      })
  );
});

// 消息处理
self.addEventListener('message', (event) => {
  if (!event.data) return;
  
  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'CLEAR_CACHE':
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
           .then(() => event.ports[0]?.postMessage({ success: true }));
      break;
    case 'GET_VERSION':
      event.ports[0]?.postMessage({ version: CACHE_VERSION });
      break;
  }
});

console.log('[SW v3.3] 已加载 - 锁屏控制优化版');
