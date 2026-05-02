// 神经重塑训练 - Service Worker v4.3
// 核心功能：缓存资源 + 锁屏通知按钮处理

const CACHE_NAME = 'neuro-v43';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// ========== 安装 ==========
self.addEventListener('install', event => {
  console.log('[SW] Installing v43...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      console.log('[SW] 缓存完成，skipWaiting');
      return self.skipWaiting();
    }).catch(err => {
      console.error('[SW] 缓存失败:', err);
      // 即使缓存失败也继续
      return self.skipWaiting();
    })
  );
});

// ========== 激活 ==========
self.addEventListener('activate', event => {
  console.log('[SW] Activating v43...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => {
      console.log('[SW] 已清理旧缓存');
      return self.clients.claim();
    }).catch(err => {
      console.error('[SW] 激活失败:', err);
      return self.clients.claim();
    })
  );
});

// ========== 拦截请求 ==========
self.addEventListener('fetch', event => {
  // 只处理同源请求
  if (!event.request.url.startsWith(self.location.origin)) return;
  
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) return response;
      return fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// ========== 🔑 锁屏媒体控制核心 ==========
const MEDIA_NOTIF_TAG = 'neuro-media-control';

// 监听通知按钮点击
self.addEventListener('notificationclick', event => {
  console.log('[SW] 通知点击:', event.action, 'tag:', event.notification.tag);
  event.notification.close();
  
  const action = event.action || 'default';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) {
        const client = clients[0];
        client.postMessage({ type: 'MEDIA_ACTION', action: action });
        if ('focus' in client) return client.focus();
      } else {
        return self.clients.openWindow('./index.html').then(newClient => {
          // 等待窗口加载
          return new Promise(resolve => {
            setTimeout(() => {
              if (newClient) {
                newClient.postMessage({ type: 'MEDIA_ACTION', action: action });
              }
              resolve();
            }, 1500);
          });
        });
      }
    }).catch(err => {
      console.error('[SW] 通知处理失败:', err);
    })
  );
});

// 监听来自主应用的消息
self.addEventListener('message', event => {
  console.log('[SW] 收到消息:', event.data?.type);
  
  if (event.data?.type === 'UPDATE_MEDIA_NOTIFICATION') {
    updateMediaNotification(event.data.payload);
  }
  if (event.data?.type === 'CLOSE_MEDIA_NOTIFICATION') {
    closeMediaNotification();
  }
});

// 更新媒体通知（带按钮）
async function updateMediaNotification(payload) {
  try {
    // 先关闭旧通知
    const oldNotifs = await self.registration.getNotifications({ tag: MEDIA_NOTIF_TAG });
    oldNotifs.forEach(n => n.close());
    
    // 发送新通知
    await self.registration.showNotification(payload.title || '🎵 神经重塑', {
      body: payload.body || '训练中...',
      icon: payload.icon || '',
      badge: payload.icon || '',
      tag: MEDIA_NOTIF_TAG,
      requireInteraction: false,
      silent: true,
      // 🔑 三个操作按钮
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
    });
    
    console.log('[SW] ✅ 媒体通知已更新');
  } catch (e) {
    console.error('[SW] 通知更新失败:', e);
  }
}

// 关闭媒体通知
async function closeMediaNotification() {
  try {
    const notifs = await self.registration.getNotifications({ tag: MEDIA_NOTIF_TAG });
    notifs.forEach(n => n.close());
  } catch (e) {}
}

// 保活同步
self.addEventListener('sync', event => {
  if (event.tag === 'keep-alive') {
    console.log('[SW] 保活同步');
  }
});

