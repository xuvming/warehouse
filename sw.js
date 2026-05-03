// 神经重塑训练 - Service Worker v5.1 锁屏控制增强版
const CACHE_NAME = 'neuro-v51';
const STATIC_ASSETS = ['./', './index.html', './manifest.json'];
const MEDIA_NOTIF_TAG = 'neuro-media-control';

// 安装和缓存
self.addEventListener('install', event => {
  console.log('[SW] Installing v5.1...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.error('[SW] 缓存失败:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating v5.1...');
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

// 🔑 增强的通知按钮点击处理
self.addEventListener('notificationclick', event => {
  console.log('[SW] 🔔 通知按钮点击:', event.action);
  event.notification.close();
  
  const action = event.action || 'default';
  const notificationData = event.notification.data || {};
  
  event.waitUntil(
    self.clients.matchAll({ 
      type: 'window', 
      includeUncontrolled: true 
    }).then(clients => {
      // 发送操作命令到客户端
      const sendAction = (client) => {
        return new Promise(resolve => {
          // 设置消息接收超时
          const timeout = setTimeout(() => {
            console.log('[SW] 客户端响应超时，直接执行后备操作');
            resolve();
          }, 3000);
          
          // 创建一次性消息监听器
          const messageHandler = (event) => {
            if (event.data.type === 'ACTION_RECEIVED') {
              clearTimeout(timeout);
              self.removeEventListener('message', messageHandler);
              resolve();
            }
          };
          
          self.addEventListener('message', messageHandler);
          client.postMessage({ 
            type: 'MEDIA_ACTION', 
            action: action,
            timestamp: Date.now()
          });
        });
      };
      
      if (clients.length > 0) {
        const client = clients[0];
        return client.focus().then(() => sendAction(client));
      } else {
        // 没有打开窗口时，打开新窗口并延迟发送操作
        return self.clients.openWindow('./index.html').then(newClient => {
          if (newClient) {
            return new Promise(resolve => {
              setTimeout(() => {
                newClient.postMessage({ 
                  type: 'MEDIA_ACTION', 
                  action: action,
                  stage: notificationData.stage 
                });
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

// 🔑 增强的通知更新函数
async function updateMediaNotification(payload) {
  try {
    // 关闭旧通知
    const oldNotifs = await self.registration.getNotifications({ tag: MEDIA_NOTIF_TAG });
    oldNotifs.forEach(n => n.close());
    
    // 创建通知选项
    const notificationOptions = {
      body: payload.body || '训练中...',
      icon: payload.icon || '',
      badge: payload.icon || '',
      tag: MEDIA_NOTIF_TAG,
      requireInteraction: true, // 🔑 保持通知显示
      silent: false,
      vibrate: [100, 50, 100],
      // 🔑 使用更大的图片增强通知显示
      image: payload.artwork || payload.icon,
      // 🔑 关键：设置常驻通知
      ongoing: true,
      // 🔑 时间戳确保通知更新
      timestamp: Date.now(),
      actions: [
        { 
          action: 'prev', 
          title: '⏮ 上一首'
        },
        { 
          action: 'playpause', 
          title: payload.playing ? '⏸ 暂停' : '▶ 播放'
        },
        { 
          action: 'next', 
          title: '⏭ 下一首'
        }
      ],
      data: { 
        stage: payload.stage || 0, 
        playing: payload.playing || false, 
        type: 'media-control',
        updated: Date.now()
      }
    };
    
    await self.registration.showNotification(
      payload.title || '🎵 神经重塑训练',
      notificationOptions
    );
    
    console.log('[SW] ✅ 媒体控制通知已更新（带操作按钮）');
  } catch (e) {
    console.error('[SW] 通知更新失败:', e);
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

console.log('[SW] Service Worker v5.1 已加载 - 支持锁屏控制');
