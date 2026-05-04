// 神经重塑训练 - Service Worker v5.2 锁屏增强版
const CACHE_NAME = 'neuro-v52';
const STATIC_ASSETS = ['./', './index.html', './manifest.json'];
const MEDIA_NOTIF_TAG = 'neuro-media-control';

// 安装和缓存
self.addEventListener('install', event => {
  console.log('[SW] Installing v5.2...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.error('[SW] 缓存失败:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating v5.2...');
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
            console.log('[SW] 客户端响应超时');
            resolve();
          }, 3000);
          
          // 消息接收确认
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
        // 打开新窗口并发送操作
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

// 🔑 接收主应用消息
self.addEventListener('message', event => {
  if (event.data?.type === 'UPDATE_MEDIA_NOTIFICATION') {
    updateMediaNotification(event.data.payload);
  }
  if (event.data?.type === 'CLOSE_MEDIA_NOTIFICATION') {
    closeMediaNotification();
  }
});

// 🔑🔑🔑 方案二核心：requireInteraction=false, priority=high, category=transport
async function updateMediaNotification(payload) {
  try {
    // 关闭旧通知
    const oldNotifs = await self.registration.getNotifications({ tag: MEDIA_NOTIF_TAG });
    oldNotifs.forEach(n => n.close());
    
    // 🔑 方案二关键设置
    const notificationOptions = {
      body: payload.body || '训练中...',
      icon: payload.icon || '',
      badge: payload.icon || '',
      tag: MEDIA_NOTIF_TAG,
      
      // 🔑 改为 false，允许锁屏时显示完整通知
      requireInteraction: false,
      
      // 🔑 不静音
      silent: false,
      
      // 🔑 震动提示
      vibrate: [100, 50, 100],
      
      // 🔑 高优先级（Android 8.0+ 有效）
      priority: 'high',
      
      // 🔑 媒体传输类别（让系统识别这是媒体控制）
      category: 'transport',
      
      // 🔑 每次更新重新提醒
      renotify: true,
      
      // 🔑 时间戳
      timestamp: Date.now(),
      
      // 🔑 操作按钮
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
      
      // 🔑 通知数据
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
    
    console.log('[SW] ✅ 方案二通知已发送', {
      requireInteraction: false,
      priority: 'high',
      category: 'transport',
      actions: 3
    });
    
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

console.log('[SW] Service Worker v5.2 方案二 已加载');
