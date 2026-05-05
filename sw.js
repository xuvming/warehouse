// 神经重塑训练 - Service Worker v5.8 锁屏点击优化版
const CACHE_NAME = 'neuro-v58';
const STATIC_ASSETS = ['./', './index.html', './manifest.json'];
const MEDIA_NOTIF_TAG = 'neuro-media-control';

self.addEventListener('install', event => {
  console.log('[SW] Installing v5.8...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => console.error('[SW] 缓存失败:', err));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating v5.8...');
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

// 🔔 通知点击处理：点击通知主体 = 播放/暂停；点击按钮 = 对应操作
self.addEventListener('notificationclick', event => {
  console.log('[SW] 🔔 通知被点击:', event.action || '主体点击(播放/暂停)');
  event.notification.close();
  
  // 如果没有点击特定按钮（点击通知主体），默认切换播放/暂停
  const action = event.action || 'playpause';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) {
        // 向所有客户端发送指令，不强制聚焦（避免触发解锁）
        clients.forEach(client => {
          client.postMessage({ type: 'MEDIA_ACTION', action: action });
        });
        return;
      } else {
        // 无窗口时打开（首次使用或已被关闭）
        return self.clients.openWindow('./index.html').then(client => {
          if (client) {
            setTimeout(() => {
              client.postMessage({ type: 'MEDIA_ACTION', action: action });
            }, 2000);
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

// 🔑 更新媒体通知（锁屏点击优化版）
async function updateMediaNotification(payload) {
  try {
    // 关闭旧通知，避免堆叠
    const oldNotifs = await self.registration.getNotifications({ tag: MEDIA_NOTIF_TAG });
    oldNotifs.forEach(n => n.close());
    
    const isPlaying = payload.playing;
    const stageName = payload.stageName || '神经重塑';
    
    // 标题直接显示状态和操作提示，用户一看就知道点击后会怎样
    const title = isPlaying 
      ? `⏸ 点击暂停 · ${stageName}` 
      : `▶ 点击播放 · ${stageName}`;
    
    // 正文提供操作引导
    const body = isPlaying
      ? `👆 点击此通知立即暂停\n💡 下拉通知栏可切换上一首/下一首`
      : `👆 点击此通知继续播放\n💡 下拉通知栏可切换上一首/下一首`;
    
    await self.registration.showNotification(
      title,
      {
        body: body,
        icon: payload.icon || '',
        badge: payload.icon || '',
        tag: MEDIA_NOTIF_TAG,
        silent: true,
        requireInteraction: false,  // 不需要用户交互也能保持
        renotify: true,
        ongoing: true,              // 保持通知不被滑动清除
        sticky: true,               // 粘性通知，常驻锁屏
        priority: 'max',            // 最高优先级，显示在通知栏顶部
        timestamp: Date.now(),
        vibrate: isPlaying ? [30] : [50, 30], // 轻微震动反馈，确认操作
        actions: [
          { action: 'prev', title: '⏮ 上一首' },
          { action: 'playpause', title: isPlaying ? '⏸ 暂停' : '▶ 播放' },
          { action: 'next', title: '⏭ 下一首' }
        ],
        data: { 
          stage: payload.stage || 0, 
          playing: isPlaying, 
          type: 'media-control' 
        }
      }
    );
    
    console.log('[SW] ✅ v5.8 通知已更新:', isPlaying ? '播放中' : '已暂停');
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

console.log('[SW] v5.8 锁屏点击优化版已启动');

