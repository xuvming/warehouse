// 神经重塑训练 - Service Worker v5.6 点击控制+按钮提示版
const CACHE_NAME = 'neuro-v56';
const STATIC_ASSETS = ['./', './index.html', './manifest.json'];
const MEDIA_NOTIF_TAG = 'neuro-media-control';

self.addEventListener('install', event => {
  console.log('[SW] Installing v5.6...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.error('[SW] 缓存失败:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating v5.6...');
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

// 通知点击处理：直接点击通知 → 播放/暂停；按钮点击 → 对应操作
self.addEventListener('notificationclick', event => {
  console.log('[SW] 🔔 通知被点击:', event.action || '播放/暂停');
  event.notification.close();
  
  // 没有按具体按钮 → 执行播放/暂停
  const action = event.action || 'playpause';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) {
        clients[0].postMessage({ type: 'MEDIA_ACTION', action: action });
        return clients[0].focus();
      } else {
        return self.clients.openWindow('./index.html').then(client => {
          if (client) {
            setTimeout(() => {
              client.postMessage({ type: 'MEDIA_ACTION', action: action });
            }, 1500);
          }
        });
      }
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
    
    // 动态提示文字
    const actionHint = payload.playing 
      ? '👆点我暂停 ⏸  |  下拉查看 ⏮ ⏭' 
      : '👆点我播放 ▶  |  下拉查看 ⏮ ⏭';
    
    const fullBody = (payload.body || '') + '\n' + actionHint;
    
    await self.registration.showNotification(
      payload.title || '🎵 神经重塑训练',
      {
        body: fullBody,
        icon: payload.icon || '',
        badge: payload.icon || '',
        tag: MEDIA_NOTIF_TAG,
        silent: true,
        requireInteraction: false,
        renotify: true,
        timestamp: Date.now(),
        // 按钮仍保留，下拉通知栏后可看到
        actions: [
          { action: 'prev', title: '⏮' },
          { action: 'playpause', title: payload.playing ? '⏸' : '▶' },
          { action: 'next', title: '⏭' }
        ],
        data: { 
          stage: payload.stage || 0, 
          playing: payload.playing || false, 
          type: 'media-control' 
        }
      }
    );
    
    console.log('[SW] ✅ v5.6 通知已发送，含操作提示');
    
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

console.log('[SW] v5.6 点击控制+按钮提示版已启动');
