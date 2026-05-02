// Service Worker v4.2 - 神经重塑训练（媒体通知按钮版）
const CACHE_VERSION = 'neuro-v4.2';
const CACHE_NAME = CACHE_VERSION;
const RUNTIME_CACHE = 'neuro-runtime-v4.2';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js'
];

const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a|aac|flac|webm|oga|opus)(\?.*)?$/i;
const MEDIA_NOTIF_TAG = 'neuro-media-control';

// ========== 安装 ==========
self.addEventListener('install', (event) => {
  console.log('[SW v4.2] 安装中...');
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
  console.log('[SW v4.2] 激活中...');
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

// ========== 🔑 通知点击处理 ==========
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 通知点击, action:', event.action, 'tag:', event.notification.tag);
  event.notification.close();
  
  const action = event.action || 'default';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        console.log('[SW] 找到窗口:', clientList.length);
        let targetClient = clientList.find(c => c.url.includes(self.location.origin));
        
        const sendAction = (client) => {
          if (client) {
            const msg = { type: 'MEDIA_ACTION', action: action, timestamp: Date.now() };
            console.log('[SW] 发送消息:', msg);
            client.postMessage(msg);
          }
        };
        
        if (targetClient) {
          if ('focus' in targetClient) targetClient.focus();
          sendAction(targetClient);
        } else if (clients.openWindow) {
          clients.openWindow('./index.html').then(newClient => {
            setTimeout(() => sendAction(newClient), 1500);
          });
        }
        
        return Promise.resolve();
      })
  );
});

// ========== 消息处理 ==========
self.addEventListener('message', (event) => {
  if (!event.data) return;
  console.log('[SW] 收到消息:', event.data.type);
  
  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'UPDATE_MEDIA_NOTIFICATION':
      handleUpdateMediaNotification(event.data.payload);
      break;
      
    case 'CLEAR_CACHE':
      caches.keys()
        .then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => event.ports?.[0]?.postMessage({ success: true }));
      break;
  }
});

async function handleUpdateMediaNotification(payload) {
  if (!payload) return;
  console.log('[SW] 更新媒体通知:', payload.title);
  
  try {
    const oldNotifs = await self.registration.getNotifications({ tag: MEDIA_NOTIF_TAG });
    oldNotifs.forEach(n => n.close());
    
    await self.registration.showNotification(payload.title || '神经重塑', {
      body: payload.body || '',
      icon: payload.icon || '',
      badge: payload.icon || '',
      tag: MEDIA_NOTIF_TAG,
      requireInteraction: false,
      silent: false,
      vibrate: payload.playing ? [200, 100, 200] : [],
      actions: [
        { action: 'prev', title: '⏮ 上一首' },
        { action: 'playpause', title: payload.playing ? '⏸ 暂停' : '▶ 播放' },
        { action: 'next', title: '⏭ 下一首' }
      ],
      timestamp: Date.now(),
      data: { type: 'media-control', stage: payload.stage, playing: payload.playing }
    });
    
    console.log('[SW] 媒体通知已显示');
  } catch (error) {
    console.error('[SW] 显示媒体通知失败:', error);
  }
}

console.log('[SW v4.2] Service Worker 已加载 - 媒体通知按钮版');
