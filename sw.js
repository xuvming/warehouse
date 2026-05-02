// Service Worker v5.0 - 神经重塑训练（媒体通知增强版）
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
          try { return cache.add(new URL(asset, self.location.origin).href).catch(e => console.warn('[SW] 缓存失败:', asset, e.message)); }
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
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE).map(k => caches.delete(k))))
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
  if (cached) { fetch(request).then(r => { if (r?.status === 200) caches.open(CACHE_NAME).then(c => c.put(request, r.clone())); }).catch(() => {}); return cached; }
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
        console.log('[SW] 窗口数:', clientList.length);
        let target = clientList.find(c => c.url.includes(self.location.origin));
        if (target && 'focus' in target) {
          target.focus();
        } else if (clients.openWindow) {
          target = clients.openWindow('./index.html');
        }
        if (target) {
          (target.then ? target : Promise.resolve(target)).then(client => {
            if (client) {
              const msg = { type: 'MEDIA_ACTION', action, timestamp: Date.now() };
              console.log('[SW] 发送消息:', msg);
              client.postMessage(msg);
            }
          });
        }
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
      updateMediaNotif(event.data.payload);
      break;
    case 'CLOSE_MEDIA_NOTIFICATION':
      closeMediaNotif();
      break;
    case 'CLEAR_CACHE':
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
           .then(() => event.ports[0]?.postMessage({ success: true }));
      break;
  }
});

// ========== 🔑 媒体通知管理 ==========
const MEDIA_TAG = 'neuro-media';

async function updateMediaNotif(payload) {
  if (!payload) return;
  console.log('[SW] 更新媒体通知:', payload.title);
  await closeMediaNotif();
  
  try {
    const options = {
      body: payload.body || '神经重塑训练',
      icon: payload.icon || genIcon(),
      badge: payload.icon || genIcon(),
      tag: MEDIA_TAG,
      requireInteraction: false,
      silent: false,
      vibrate: payload.playing ? [200, 100, 200] : [],
      actions: [
        { action: 'prev', title: '⏮ 上一首' },
        { action: 'playpause', title: payload.playing ? '⏸ 暂停' : '▶ 播放' },
        { action: 'next', title: '⏭ 下一首' }
      ],
      timestamp: payload.timestamp || Date.now(),
      data: { stage: payload.stage || 0, playing: payload.playing || false, type: 'media-control' }
    };
    
    await self.registration.showNotification(payload.title || '神经重塑', options);
    console.log('[SW] 媒体通知已显示，含', options.actions.length, '个按钮');
  } catch (error) {
    console.error('[SW] 媒体通知失败:', error);
    try {
      await self.registration.showNotification(payload.title || '神经重塑', {
        body: payload.body || '',
        icon: payload.icon || genIcon(),
        tag: MEDIA_TAG,
        silent: false
      });
    } catch (e2) { console.error('[SW] 回退通知也失败:', e2); }
  }
}

async function closeMediaNotif() {
  try {
    const notifications = await self.registration.getNotifications({ tag: MEDIA_TAG });
    notifications.forEach(n => n.close());
    console.log('[SW] 关闭了', notifications.length, '个旧通知');
  } catch (e) { console.error('[SW] 关闭通知失败:', e); }
}

function genIcon() {
  return 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">' +
    '<rect width="192" height="192" rx="32" fill="#00d4aa"/>' +
    '<text x="96" y="96" font-size="90" text-anchor="middle" dominant-baseline="middle" fill="#1a1a2e" font-weight="bold">🧠</text>' +
    '</svg>'
  );
}

console.log('[SW v5.0] Service Worker 已加载 - 媒体通知增强版');
