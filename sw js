// 神经重塑训练 - Service Worker v5.5 点击通知控制版
const CACHE_NAME = 'neuro-v55';
const STATIC_ASSETS = ['./', './index.html', './manifest.json'];
const MEDIA_NOTIF_TAG = 'neuro-media-control';

self.addEventListener('install', event => {
  console.log('[SW] Installing v5.5...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.error('[SW] 缓存失败:', err);
      });
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

// 🔑🔑🔑 核心：点击通知 → 播放/暂停
self.addEventListener('notificationclick', event => {
  console.log('[SW] 🔔 通知被点击:', event.action || '默认点击');
  event.notification.close();
  
  // 🔑 关键改动：如果用户直接点击通知（不点按钮），执行播放/暂停
  const action = event.action || 'playpause';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) {
        // 已有打开的窗口，直接发送命令
        clients[0].postMessage({ type: 'MEDIA_ACTION', action: action });
        return clients[0].focus();
      } else {
        // 没有窗口，打开并发送命令
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
    
    // 🔑 在通知内容中添加操作提示
    const statusText = payload.playing ? '点击暂停 ⏸' : '点击播放 ▶';
    
    await self.registration.showNotification(
      payload.title || '🎵 神经重塑训练',
      {
        body: (payload.body || '训练中...') + '\n━━━━━━━━━━\n👆 点击通知' + statusText,
        icon: payload.icon || '',
        badge: payload.icon || '',
        tag: MEDIA_NOTIF_TAG,
        silent: true,
        requireInteraction: false,
        renotify: true,
        timestamp: Date.now(),
        // 保留按钮用于下拉通知栏时
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
    
    console.log('[SW] ✅ v5.5 通知已发送（点击通知即可控制）');
    
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

console.log('[SW] v5.5 点击通知控制版已启动');
