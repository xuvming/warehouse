// 神经重塑训练 - Service Worker v5.5 整合版
// 功能：点击锁屏通知 → 播放/暂停，下拉通知栏 → 显示按钮，MediaSession → 系统媒体控制
const CACHE_NAME = 'neuro-v55';
const STATIC_ASSETS = ['./', './index.html', './manifest.json'];
const MEDIA_NOTIF_TAG = 'neuro-media-control';

self.addEventListener('install', event => {
  console.log('[SW] Installing v5.5...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => console.error('[SW] 缓存失败:', err));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating v5.5...');
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

// 🔑 点击通知 → 默认执行播放/暂停
self.addEventListener('notificationclick', event => {
  console.log('[SW] 🔔 通知点击, action:', event.action || 'playpause');
  event.notification.close();
  
  // 如果没有点击具体按钮，就执行播放/暂停
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

// 接收主应用消息
self.addEventListener('message', event => {
  if (event.data?.type === 'UPDATE_MEDIA_NOTIFICATION') {
    updateMediaNotification(event.data.payload);
  }
  if (event.data?.type === 'CLOSE_MEDIA_NOTIFICATION') {
    closeMediaNotification();
  }
});

// 🔑 更新通知：显示点击提示 + 操作按钮
async function updateMediaNotification(payload) {
  try {
    const oldNotifs = await self.registration.getNotifications({ tag: MEDIA_NOTIF_TAG });
    oldNotifs.forEach(n => n.close());
    
    const statusHint = payload.playing ? '👆 点击通知暂停 ⏸' : '👆 点击通知播放 ▶';
    
    await self.registration.showNotification(
      payload.title || '🎵 神经重塑训练',
      {
        body: (payload.body || '训练中...') + '\n' + statusHint,
        icon: payload.icon || '',
        badge: payload.icon || '',
        tag: MEDIA_NOTIF_TAG,
        silent: true,
        requireInteraction: false,
        renotify: true,
        timestamp: Date.now(),
        actions: [
          { action: 'prev', title: '⏮' },
          { action: 'playpause', title: payload.playing ? '⏸' : '▶' },
          { action: 'next', title: '⏭' }
        ],
        data: { stage: payload.stage || 0, playing: payload.playing || false, type: 'media-control' }
      }
    );
    
    console.log('[SW] ✅ 通知已更新（点击通知条即可控制）');
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

console.log('[SW] v5.5 整合版已启动');
