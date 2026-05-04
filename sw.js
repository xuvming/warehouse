// 神经重塑训练 - Service Worker v5.3 MediaSession增强版
const CACHE_NAME = 'neuro-v53';
const STATIC_ASSETS = ['./', './index.html', './manifest.json'];
const MEDIA_NOTIF_TAG = 'neuro-media-control';

// 安装和缓存
self.addEventListener('install', event => {
  console.log('[SW] Installing v5.3...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.error('[SW] 缓存失败:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating v5.3...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

// 网络请求处理
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

// 通知按钮点击处理
self.addEventListener('notificationclick', event => {
  console.log('[SW] 🔔 通知按钮点击:', event.action);
  event.notification.close();
  
  const action = event.action || 'default';
  
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

// 更新媒体通知（简洁版，依靠MediaSession实现锁屏控制）
async function updateMediaNotification(payload) {
  try {
    // 关闭旧通知
    const oldNotifs = await self.registration.getNotifications({ tag: MEDIA_NOTIF_TAG });
    oldNotifs.forEach(n => n.close());
    
    // 发送简洁通知
    await self.registration.showNotification(
      payload.title || '🎵 神经重塑训练',
      {
        body: payload.body || '训练中...',
        icon: payload.icon || '',
        badge: payload.icon || '',
        tag: MEDIA_NOTIF_TAG,
        silent: true,
        requireInteraction: false,
        priority: 'high',
        category: 'transport',
        // 保留actions用于下拉通知栏时显示
        actions: [
          { action: 'prev', title: '⏮ 上一首' },
          { action: 'playpause', title: payload.playing ? '⏸ 暂停' : '▶ 播放' },
          { action: 'next', title: '⏭ 下一首' }
        ],
        data: { 
          stage: payload.stage || 0, 
          playing: payload.playing || false, 
          type: 'media-control' 
        }
      }
    );
    
    console.log('[SW] ✅ MediaSession优先方案通知已发送');
    
  } catch (e) {
    console.error('[SW] 通知发送失败:', e);
  }
}

// 关闭媒体通知
async function closeMediaNotification() {
  try {
    const notifs = await self.registration.getNotifications({ tag: MEDIA_NOTIF_TAG });
    notifs.forEach(n => n.close());
    console.log('[SW] 媒体通知已关闭');
  } catch (e) {
    console.error('[SW] 关闭通知失败:', e);
  }
}

console.log('[SW] Service Worker v5.3 MediaSession优先方案已启动');
