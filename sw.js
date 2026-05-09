// 神经重塑训练 - Service Worker v6.1 原生锁屏控制版
// 仅保留缓存和通信通道，不再发送自定义通知
const CACHE_NAME = 'neuro-v61';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/maskable-192x192.png',
  './icons/maskable-512x512.png'
];
const BC_NAME = 'neuro-media-bc';

let bc = null;
try { bc = new BroadcastChannel(BC_NAME); } catch(e) {}

self.addEventListener('install', event => {
  console.log('[SW] Installing v6.1...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => console.error('[SW] 缓存失败:', err));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating v6.1...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (url.startsWith('blob:') || url.startsWith('data:')) return;
  if (!url.startsWith(self.location.origin)) return;
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) return response;
      return fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// 保留通知点击处理（如果将来需要恢复SW通知，可以启用）
self.addEventListener('notificationclick', event => {
  const rawAction = event.action || 'playpause';
  console.log('[SW] 通知点击（当前未启用自定义通知）', rawAction);
  event.notification.close();
  // 转发动作到页面
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      let sent = false;
      clients.forEach(client => {
        try { client.postMessage({ type: 'MEDIA_ACTION', action: rawAction, via: 'sw' }); sent = true; } catch (e) {}
      });
      if (bc) { try { bc.postMessage({ type: 'MEDIA_ACTION', action: rawAction, via: 'bc' }); } catch (e) {} }
      if (!sent) {
        const url = './index.html#action=' + encodeURIComponent(rawAction);
        return self.clients.openWindow(url);
      }
    })
  );
});

self.addEventListener('message', event => {
  // 不再处理 UPDATE_MEDIA_NOTIFICATION 消息
  if (event.data?.type === 'CLOSE_MEDIA_NOTIFICATION') {
    self.registration.getNotifications().then(notifs => notifs.forEach(n => n.close()));
  }
});

console.log('[SW] v6.1 原生媒体控制版已启动');
