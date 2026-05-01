// Service Worker v5.0 - 神经重塑训练（媒体通知按钮版）
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

// ========== 安装 ==========
self.addEventListener('install', (event) => {
  console.log('[SW v5.0] 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(
        CORE_ASSETS.map(asset => {
          try { return cache.add(new URL(asset, self.location.origin).href).catch(err => console.warn('[SW] 缓存失败:', asset, err.message)); }
          catch (e) { return Promise.resolve(); }
        })
      ))
      .then(() => self.skipWaiting())
  );
});

// ========== 激活 ==========
self.addEventListener('activate', (event) => {
  console.log('[SW v5.0] 激活中...');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE)
            .map(key => { console.log('[SW] 清理旧缓存:', key); return caches.delete(key); })
      ))
      .then(() => self.clients.claim())
  );
});

// ========== 请求拦截 ==========
self.addEventListener('fetch', (event) => {
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

// ========== 🔑 核心：通知点击处理（支持按钮操作） ==========
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 通知被点击, action:', event.action, ', tag:', event.notification.tag);
  
  // 必须关闭通知
  event.notification.close();
  
  const action = event.action || 'default';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        console.log('[SW] 找到窗口数:', clientList.length);
        
        // 查找已有窗口
        let target = clientList.find(c => c.url.includes(self.location.origin));
        
        // 发送操作命令
        const sendCommand = (client) => {
          if (client) {
            const msg = {
              type: 'MEDIA_ACTION',
              action: action,
              timestamp: Date.now()
            };
            console.log('[SW] 发送媒体操作:', msg);
            client.postMessage(msg);
          }
        };
        
        if (target) {
          if ('focus' in target) target.focus();
          sendCommand(target);
        } else if (clients.openWindow) {
          clients.openWindow('./index.html').then(newClient => {
            // 等待窗口加载
            setTimeout(() => sendCommand(newClient), 1500);
          });
        }
        
        return Promise.resolve();
      })
  );
});

// ========== 消息处理 ==========
self.addEventListener('message', (event) => {
  if (!event.data) return;
  
  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      caches.keys()
        .then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => event.ports[0]?.postMessage({ success: true }));
      break;
      
    case 'GET_VERSION':
      event.ports[0]?.postMessage({ version: CACHE_VERSION });
      break;
  }
});

console.log('[SW v5.0] Service Worker 已加载 - 媒体通知按钮版');
