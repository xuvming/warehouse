// 神经重塑训练 - Service Worker v5.0
const CACHE_NAME = 'neuro-v50';
const STATIC_ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', event => {
  console.log('[SW] Installing v50...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.error('[SW] 缓存失败:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating v50...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith(self.location.origin)) return;
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

const MEDIA_NOTIF_TAG = 'neuro-media-control';

// 🔑 通知按钮点击处理
self.addEventListener('notificationclick', event => {
  console.log('[SW] 🔔 通知按钮点击:', event.action);
  event.notification.close();
  
  const action = event.action || 'default';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) {
        const client = clients[0];
        client.postMessage({ type: 'MEDIA_ACTION', action: action });
        return client.focus();
      } else {
        return self.clients.openWindow('./index.html').then(newClient => {
          if (newClient) {
            return new Promise(resolve => {
              setTimeout(() => {
                newClient.postMessage({ type: 'MEDIA_ACTION', action: action });
                resolve();
              }, 2000);
            });
          }
        });
      }
    })
  );
});

// 🔑 接收主应用消息更新通知
self.addEventListener('message', event => {
  if (event.data?.type === 'UPDATE_MEDIA_NOTIFICATION') {
    updateMediaNotification(event.data.payload);
  }
  if (event.data?.type === 'CLOSE_MEDIA_NOTIFICATION') {
    closeMediaNotification();
  }
});

async function updateMediaNotification(payload) {
  try {
    const oldNotifs = await self.registration.getNotifications({ tag: MEDIA_NOTIF_TAG });
    oldNotifs.forEach(n => n.close());
    
    // 🔑 silent: false 确保按钮可见
    await self.registration.showNotification(payload.title || '🎵 神经重塑', {
      body: payload.body || '训练中...',
      icon: payload.icon || '',
      badge: payload.icon || '',
      tag: MEDIA_NOTIF_TAG,
      requireInteraction: false,
      silent: false,
      vibrate: [100, 50, 100],
      actions: [
        { action: 'prev', title: '⏮ 上一首' },
        { action: 'playpause', title: payload.playing ? '⏸ 暂停' : '▶ 播放' },
        { action: 'next', title: '⏭ 下一首' }
      ],
      data: { stage: payload.stage || 0, playing: payload.playing || false, type: 'media-control' }
    });
    
    console.log('[SW] ✅ 通知已更新（带按钮，silent=false）');
  } catch (e) {
    console.error('[SW] 通知更新失败:', e);
  }
}

async function closeMediaNotification() {
  try {
    const notifs = await self.registration.getNotifications({ tag: MEDIA_NOTIF_TAG });
    notifs.forEach(n => n.close());
  } catch (e) {}
}

console.log('[SW] Service Worker v5.0 已加载');
