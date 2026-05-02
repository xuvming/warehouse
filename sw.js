// Service Worker v4.1 - 神经重塑训练（媒体通知按钮版）
const CACHE_VERSION = 'neuro-v4.1';
const CACHE_NAME = CACHE_VERSION;
const RUNTIME_CACHE = 'neuro-runtime-v4.1';

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
  console.log('[SW v4.1] 安装中...');
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
  console.log('[SW v4.1] 激活中...');
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

// ========== 🔑 核心：通知点击处理 ==========
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 通知点击，action:', event.action, 'tag:', event.notification.tag);
  
  // 重要：点击通知时必须关闭
  event.notification.close();
  
  const action = event.action || 'default';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        console.log('[SW] 找到窗口:', clientList.length);
        
        // 查找已有的窗口
        let targetClient = clientList.find(c => c.url.includes(self.location.origin));
        
        // 发送操作命令
        const sendAction = (client) => {
          if (client) {
            const msg = { type: 'MEDIA_ACTION', action: action, timestamp: Date.now() };
            console.log('[SW] 发送消息:', msg);
            client.postMessage(msg);
          }
        };
        
        if (targetClient) {
          // 聚焦已有窗口
          if ('focus' in targetClient) {
            targetClient.focus();
          }
          sendAction(targetClient);
        } else if (clients.openWindow) {
          // 打开新窗口
          clients.openWindow('./index.html').then(newClient => {
            // 等待新窗口加载完成后发送消息
            setTimeout(() => sendAction(newClient), 1000);
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
      // 更新媒体通知
      updateMediaNotification(event.data.payload);
      break;
      
    case 'CLOSE_MEDIA_NOTIFICATION':
      // 关闭媒体通知
      closeMediaNotification();
      break;
      
    case 'CLEAR_CACHE':
      caches.keys()
        .then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => event.ports[0]?.postMessage({ success: true }));
      break;
  }
});

// ========== 媒体通知管理 ==========
let currentMediaTag = 'neuro-media-control';

async function updateMediaNotification(payload) {
  if (!payload) return;
  
  console.log('[SW] 更新媒体通知:', payload.title);
  
  // 先关闭旧通知
  await closeMediaNotification();
  
  const { title, body, icon, stage, playing } = payload;
  
  try {
    // 🔑 使用 requireInteraction 和 actions
    const options = {
      body: body || '神经重塑训练',
      icon: icon || generateIcon(),
      badge: icon || generateIcon(),
      tag: currentMediaTag,
      requireInteraction: false,  // 允许用户滑动清除
      silent: false,               // 🔑 非静默！显示在锁屏
      vibrate: playing ? [200, 100, 200] : [],
      // 🔑 关键：三个操作按钮对应播放控制
      actions: [
        { action: 'prev', title: '⏮ 上一首' },
        { action: 'playpause', title: playing ? '⏸ 暂停' : '▶ 播放' },
        { action: 'next', title: '⏭ 下一首' }
      ],
      timestamp: Date.now(),
      // 🔑 设置为 ongoing（持续通知），不会被轻易滑动清除
      data: {
        stage: stage || 0,
        playing: playing || false,
        type: 'media-control'
      }
    };
    
    await self.registration.showNotification(title || '神经重塑', options);
    console.log('[SW] 媒体通知已显示，actions:', options.actions.length);
    
  } catch (error) {
    console.error('[SW] 显示媒体通知失败:', error);
    // 回退：不带 actions 的基础通知
    try {
      await self.registration.showNotification(title || '神经重塑', {
        body: body || '',
        icon: icon || generateIcon(),
        tag: currentMediaTag,
        requireInteraction: false,
        silent: false
      });
    } catch (e2) {
      console.error('[SW] 回退通知也失败:', e2);
    }
  }
}

async function closeMediaNotification() {
  try {
    const notifications = await self.registration.getNotifications({ tag: currentMediaTag });
    notifications.forEach(n => {
      console.log('[SW] 关闭旧通知:', n.tag);
      n.close();
    });
  } catch (e) {
    console.error('[SW] 关闭通知失败:', e);
  }
}

function generateIcon() {
  // 返回一个简单的 SVG data URL
  return 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">' +
    '<rect width="192" height="192" rx="32" fill="#00d4aa"/>' +
    '<text x="96" y="96" font-size="90" text-anchor="middle" dominant-baseline="middle" fill="#1a1a2e" font-weight="bold">🧠</text>' +
    '</svg>'
  );
}

console.log('[SW v4.1] Service Worker 已加载 - 媒体通知按钮版');
