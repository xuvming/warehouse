// 神经重塑训练 - Service Worker v5.9 鸿蒙专用适配版
// 三通道通信确保锁屏/后台通知点击可靠送达
const CACHE_NAME = 'neuro-v59';
const STATIC_ASSETS = ['./', './index.html', './manifest.json'];
const MEDIA_NOTIF_TAG = 'neuro-media-control';
const BC_NAME = 'neuro-media-bc';

// BroadcastChannel 实例（同源跨上下文通信，不受 clients 冻结影响）
let bc = null;
try { bc = new BroadcastChannel(BC_NAME); } catch(e) {}

self.addEventListener('install', event => {
  console.log('[SW] Installing v5.9...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => console.error('[SW] 缓存失败:', err));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating v5.9...');
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

// 🔔 通知点击处理：三通道确保消息送达
self.addEventListener('notificationclick', event => {
  const rawAction = event.action || 'playpause';
  console.log('[SW] 🔔 通知点击 action=', rawAction);
  
  event.notification.close();
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        let sentCount = 0;
        
        // 通道1：clients.postMessage
        if (clients.length > 0) {
          clients.forEach(client => {
            try {
              client.postMessage({ type: 'MEDIA_ACTION', action: rawAction, via: 'clients', t: Date.now() });
              sentCount++;
            } catch (e) {}
          });
        }
        
        // 通道2：BroadcastChannel
        if (bc) {
          try {
            bc.postMessage({ type: 'MEDIA_ACTION', action: rawAction, via: 'broadcast', t: Date.now() });
            sentCount++;
          } catch (e) {}
        }
        
        // 通道3：URL hash 唤醒（终极备选）
        if (sentCount === 0) {
          const hashUrl = './index.html#action=' + encodeURIComponent(rawAction) + '&t=' + Date.now();
          return self.clients.openWindow(hashUrl);
        }
        
        return Promise.resolve();
      })
      .catch(() => {
        const hashUrl = './index.html#action=' + encodeURIComponent(rawAction) + '&t=' + Date.now();
        return self.clients.openWindow(hashUrl);
      })
  );
});

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
    
    const isPlaying = payload.playing;
    const stageName = payload.title || '神经重塑';
    const title = (isPlaying ? '▶ ' : '⏸ ') + stageName.replace(/^[▶⏸]\s*/, '');
    const hint = isPlaying ? '👆 点击暂停' : '👆 点击播放';
    
    await self.registration.showNotification(
      title,
      {
        body: hint + ' · 下拉查看 ⏮ ⏭',
        icon: payload.icon || '',
        badge: payload.icon || '',
        tag: MEDIA_NOTIF_TAG,
        silent: true,
        requireInteraction: false,
        renotify: true,
        ongoing: true,
        sticky: true,
        priority: 'max',
        timestamp: Date.now(),
        actions: [
          { action: 'prev', title: '⏮' },
          { action: 'playpause', title: isPlaying ? '⏸' : '▶' },
          { action: 'next', title: '⏭' }
        ],
        data: { stage: payload.stage || 0, playing: isPlaying, type: 'media-control' }
      }
    );
    
    console.log('[SW] 通知已更新:', title);
  } catch (e) {
    console.error('[SW] 通知失败:', e);
  }
}

async function closeMediaNotification() {
  try {
    const notifs = await self.registration.getNotifications({ tag: MEDIA_NOTIF_TAG });
    notifs.forEach(n => n.close());
  } catch (e) {}
}

console.log('[SW] v5.9 鸿蒙专用适配版已启动');

