/**
 * 神经重塑训练 - Service Worker v7.0
 * 功能：PWA离线支持 + MediaSession锁屏控制消息转发
 */

const CACHE_NAME = 'neuro-v7.0.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// 安装：缓存核心资源
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v7.0.0');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Cache addAll failed:', err);
      });
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v7.0.0');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// 拦截请求：优先网络，失败时回退缓存
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // 跳过 chrome-extension 和跨域请求
  if (url.protocol === 'chrome-extension:' || 
      url.protocol === 'blob:' ||
      url.protocol === 'data:') {
    return;
  }

  // 音频请求：网络优先
  if (request.destination === 'audio' || url.pathname.match(/\.(mp3|wav|ogg|m4a|aac)$/i)) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // 静态资源：Stale-While-Revalidate
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok && networkResponse.status !== 206) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return networkResponse;
        }).catch(() => cached);
        
        return cached || fetchPromise;
      })
    );
    return;
  }
});

// ============ MediaSession 后台消息转发 ============
// Service Worker 本身不能直接控制 MediaSession，
// 但它可以在页面被关闭时向 BroadcastChannel 发送消息

// 监听来自页面的消息
self.addEventListener('message', (event) => {
  const { data } = event;
  
  if (!data) return;
  
  switch (data.type) {
    case 'KEEP_ALIVE':
      // 页面保活心跳
      console.log('[SW] Keep alive received');
      break;
      
    case 'MEDIA_ACTION':
      // 转发媒体动作到其他客户端
      broadcastToClients(data);
      break;
      
    case 'GET_VERSION':
      if (event.source) {
        event.source.postMessage({
          type: 'SW_VERSION',
          version: '7.0.0'
        });
      }
      break;
  }
});

// 使用 BroadcastChannel 在页面间转发媒体消息（支持同源页面通信）
let bc = null;
try {
  if ('BroadcastChannel' in self) {
    bc = new BroadcastChannel('neuro-media-sw');
    bc.addEventListener('message', (event) => {
      if (event.data?.type === 'MEDIA_ACTION') {
        // 转发给所有客户端
        broadcastToClients(event.data);
      }
    });
  }
} catch (e) {
  console.warn('[SW] BroadcastChannel not available');
}

// 向所有客户端广播消息
function broadcastToClients(data) {
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => {
      try {
        client.postMessage(data);
      } catch (e) {}
    });
  });
  
  // 同时通过 BroadcastChannel 广播
  if (bc) {
    try { bc.postMessage(data); } catch (e) {}
  }
}

// 后台同步（用于训练数据保存）
self.addEventListener('sync', (event) => {
  if (event.tag === 'save-training-data') {
    event.waitUntil(
      broadcastToClients({ type: 'SYNC_SAVE_DATA' })
    );
  }
});

// 推送通知（用于训练提醒 - 可选）
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || '神经重塑训练', {
        body: data.body || '记得今天完成你的训练！',
        icon: './icons/icon-192x192.png',
        badge: './icons/icon-96x96.png',
        tag: data.tag || 'training-reminder',
        requireInteraction: false,
        actions: data.actions || [
          { action: 'start', title: '开始训练' },
          { action: 'dismiss', title: '稍后再说' }
        ],
        data: data.payload || {}
      })
    );
  } catch (e) {
    event.waitUntil(
      self.registration.showNotification('神经重塑训练', {
        body: event.data.text() || '训练提醒',
        icon: './icons/icon-192x192.png',
        badge: './icons/icon-96x96.png'
      })
    );
  }
});

// 通知点击处理
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const action = event.action;
  const notificationData = event.notification.data || {};
  
  if (action === 'dismiss') {
    return;
  }
  
  // 打开或聚焦主窗口
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const hadWindowToFocus = clients.some((client) => {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.focus();
          // 发送动作消息
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            action: action || 'start',
            data: notificationData
          });
          return true;
        }
        return false;
      });
      
      if (!hadWindowToFocus) {
        self.clients.openWindow('./index.html').then((client) => {
          if (client) {
            setTimeout(() => {
              client.postMessage({
                type: 'NOTIFICATION_CLICK',
                action: action || 'start',
                data: notificationData
              });
            }, 1000);
          }
        });
      }
    })
  );
});

// 周期性后台同步（每天提醒训练）
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'daily-training-reminder') {
    event.waitUntil(
      self.registration.showNotification('神经重塑训练', {
        body: '🧠 今天完成训练了吗？坚持就是胜利！',
        icon: './icons/icon-192x192.png',
        badge: './icons/icon-96x96.png',
        tag: 'daily-reminder',
        requireInteraction: false,
        actions: [
          { action: 'start', title: '🏃 开始训练' },
          { action: 'dismiss', title: '⏰ 稍后' }
        ]
      })
    );
  }
});

console.log('[SW] Service Worker v7.0.0 loaded');
