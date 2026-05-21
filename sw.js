const CACHE_NAME = 'neuro-v8.0.4';
const STATIC_ASSETS = ['./', './index.html', './manifest.json', './cover.jpg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);
  if (url.protocol === 'chrome-extension:' || url.protocol === 'blob:' || url.protocol === 'data:') return;
  if (request.method !== 'GET') return;
  e.respondWith(caches.match(request).then(cached => {
    const fp = fetch(request).then(nr => {
      if (nr && nr.ok && nr.status !== 206) {
        const c = nr.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, c));
      }
      return nr;
    }).catch(() => cached);
    return cached || fp;
  }));
});

// ===== 通知栏按钮点击处理 =====
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const a = e.action;
  if (a === 'prev' || a === 'toggle' || a === 'next') {
    // 向所有客户端发送消息
    e.waitUntil(self.clients.matchAll({ type: 'window' }).then(clients => {
      clients.forEach(client => client.postMessage({ type: 'ACTION', action: a }));
    }));
  }
});

// 来自主线程的消息（创建/更新通知）
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'MEDIA') {
    const { title, body, icon, playing, cur } = e.data;
    // 显示带操作按钮的通知
    self.registration.showNotification(title, {
      body: body,
      icon: icon,
      tag: 'nr-media',
      requireInteraction: true,
      actions: [
        { action: 'prev', title: '⏮ 上一首' },
        { action: 'toggle', title: playing ? '⏸ 暂停' : '▶ 播放' },
        { action: 'next', title: '⏭ 下一首' }
      ]
    }).catch(() => {
      // actions 不支持时降级
      self.registration.showNotification(title, { body, icon, tag: 'nr-media', requireInteraction: true });
    });
  }
});
