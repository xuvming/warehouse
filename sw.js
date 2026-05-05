// 神经重塑训练 - Service Worker v5.8 锁屏标题点击控制
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

// 🔔 通知点击处理：不解锁、不亮屏、只发消息控制播放
self.addEventListener('notificationclick', event => {
  const rawAction = event.action || 'playpause';
  console.log('[SW] 🔔 通知被点击, action=', rawAction);
  
  // 立即关闭旧通知，后续由主页面触发重新发送新状态的通知
  event.notification.close();
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) {
        // 客户端已存在：只发消息，不 focus()，不解锁
        const client = clients[0];
        client.postMessage({ type: 'MEDIA_ACTION', action: rawAction });
        // 返回 Promise.resolve() 而不 focus()，保持锁屏状态
        return Promise.resolve();
      } else {
        // 客户端不存在（罕见）：需要打开窗口
        console.log('[SW] 无活跃客户端，打开窗口...');
        return self.clients.openWindow('./index.html').then(client => {
          if (client) {
            setTimeout(() => {
              client.postMessage({ type: 'MEDIA_ACTION', action: rawAction });
            }, 1800);
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

// 🔑 更新媒体通知（标题即状态，点击标题即可控制）
async function updateMediaNotification(payload) {
  try {
    const oldNotifs = await self.registration.getNotifications({ tag: MEDIA_NOTIF_TAG });
    oldNotifs.forEach(n => n.close());
    
    const isPlaying = payload.playing;
    const stageName = payload.title || '神经重塑';
    // 标题前带播放状态图标，锁屏上直接可见
    const title = (isPlaying ? '▶ ' : '⏸ ') + stageName.replace(/^[▶⏸]\s*/, '');
    
    // 正文提示点击操作
    const hint = isPlaying 
      ? '👆 点击本通知暂停 ⏸' 
      : '👆 点击本通知播放 ▶';
    const subHint = '下拉通知栏 ⏮ ⏭ 切歌';
    const body = hint + '\n' + subHint;
    
    await self.registration.showNotification(
      title,
      {
        body: body,
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
        // actions 在部分系统锁屏不显示，但保留给下拉状态栏使用
        actions: [
          { action: 'prev', title: '⏮ 上首' },
          { action: 'playpause', title: isPlaying ? '⏸ 暂停' : '▶ 播放' },
          { action: 'next', title: '⏭ 下首' }
        ],
        data: { 
          stage: payload.stage || 0, 
          playing: isPlaying, 
          type: 'media-control' 
        }
      }
    );
    
    console.log('[SW] ✅ 通知已更新:', title, isPlaying ? '(播放中)' : '(已暂停)');
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

console.log('[SW] v5.8 锁屏标题点击控制已启动');
