// 神经重塑训练 - Service Worker v6.0 媒体会话修复版
// 三通道通信确保锁屏/后台通知点击可靠送达
const CACHE_NAME = 'neuro-v60';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/maskable-192x192.png',
  './icons/maskable-512x512.png'
];
const MEDIA_NOTIF_TAG = 'neuro-media-control';
const BC_NAME = 'neuro-media-bc';

// BroadcastChannel 实例（同源跨上下文通信，不受 clients 冻结影响）
let bc = null;
try { bc = new BroadcastChannel(BC_NAME); } catch(e) {}

self.addEventListener('install', event => {
  console.log('[SW] Installing v6.0...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => console.error('[SW] 缓存失败:', err));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating v6.0...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // 跳过 blob: URL 请求（index.html MediaSession artwork 使用的 Blob URL）
  if (url.startsWith('blob:')) return;

  // 跳过 data: URL 请求
  if (url.startsWith('data:')) return;

  // 跳过非同源请求
  if (!url.startsWith(self.location.origin)) return;

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

// 获取缓存的图标 URL（用于通知）
async function getCachedIconUrl() {
  // 优先使用缓存的 192x192 PNG 图标
  const cache = await caches.open(CACHE_NAME);
  const icon192 = await cache.match('./icons/icon-192x192.png');
  if (icon192) return './icons/icon-192x192.png';
  const mask192 = await cache.match('./icons/maskable-192x192.png');
  if (mask192) return './icons/maskable-192x192.png';
  // 兜底：使用内联 SVG data URI（1x1 透明像素，避免 data URL 不兼容问题）
  // 实际显示依赖系统默认图标
  return '';
}

// 判断 URL 是否为 data URL 或 blob URL（这些在 SW 通知中不可靠）
function isUnsafeIconUrl(url) {
  return !url || url.startsWith('data:') || url.startsWith('blob:');
}

// 通知点击处理：三通道确保消息送达
self.addEventListener('notificationclick', event => {
  const rawAction = event.action || 'playpause';
  console.log('[SW] 通知点击 action=', rawAction);

  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        let sentCount = 0;

        // 通道1：clients.postMessage
        if (clients.length > 0) {
          clients.forEach(client => {
            try {
              client.postMessage({ type: 'MEDIA_ACTION', action: rawAction, via: 'clients', t: Date.now() });
              sentCount++;
            } catch (e) {}
          });
        }

        // 通道2：BroadcastChannel
        if (bc) {
          try {
            bc.postMessage({ type: 'MEDIA_ACTION', action: rawAction, via: 'broadcast', t: Date.now() });
            sentCount++;
          } catch (e) {}
        }

        // 通道3：URL hash 唤醒（终极备选）
        if (sentCount === 0) {
          const hashUrl = './index.html#action=' + encodeURIComponent(rawAction) + '&t=' + Date.now();
          return self.clients.openWindow(hashUrl);
        }

        return Promise.resolve();
      })
      .catch(() => {
        const hashUrl = './index.html#action=' + encodeURIComponent(rawAction) + '&t=' + Date.now();
        return self.clients.openWindow(hashUrl);
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

    const isPlaying = payload.playing;
    const stageName = payload.title || '神经重塑';
    const title = (isPlaying ? '▶ ' : '⏸ ') + stageName.replace(/^[▶⏸]\s*/, '');
    const hint = isPlaying ? '👆 点击暂停' : '👆 点击播放';

    // 处理 icon：拒绝 data URL / blob URL，改用缓存的图标文件
    let iconUrl = payload.icon || '';
    if (isUnsafeIconUrl(iconUrl)) {
      iconUrl = await getCachedIconUrl();
    }

    // Android 锁屏通知兼容性配置
    // 注意：不同 Android 版本对 ongoing/sticky 的处理不同
    // - ongoing: true 使通知变为"进行中"，在锁屏上更持久
    // - sticky: true 防止用户滑动关闭（部分系统支持）
    await self.registration.showNotification(
      title,
      {
        body: hint + ' · ' + (payload.subtitle || '下拉查看控制'),
        icon: iconUrl,
        badge: iconUrl,
        tag: MEDIA_NOTIF_TAG,
        silent: true,
        requireInteraction: false,
        renotify: true,
        // ongoing 设为 true 确保通知在锁屏上持久显示
        ongoing: true,
        // sticky 在部分 Android 上可增强锁屏显示
        sticky: true,
        // timestamp 帮助系统排序
        timestamp: Date.now(),
        // Android TWA 适配：actions 在锁屏通知上显示为控制按钮
        actions: [
          { action: 'previoustrack', title: '⏮ 上一首' },
          { action: 'playpause', title: isPlaying ? '⏸ 暂停' : '▶ 播放' },
          { action: 'nexttrack', title: '⏭ 下一首' }
        ],
        data: { stage: payload.stage || 0, playing: isPlaying, type: 'media-control' },
        // 通知类别：transport 表示媒体传输控制，帮助系统识别
        // 注意：部分旧版 Android 不支持此字段，但不影响功能
        ...(self.registration.showNotification.length > 1 ? {} : {})
      }
    );

    console.log('[SW] 通知已更新:', title);
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

// 处理推送订阅（为未来扩展预留）
self.addEventListener('push', event => {
  console.log('[SW] Push received');
  // 当前应用不使用推送，但预留处理避免报错
  if (event.data) {
    try {
      const data = event.data.json();
      if (data.type === 'MEDIA_ACTION') {
        // 通过 BroadcastChannel 转发到页面
        if (bc) {
          bc.postMessage({ type: 'MEDIA_ACTION', action: data.action, via: 'push', t: Date.now() });
        }
      }
    } catch (e) {}
  }
});

// 处理通知关闭（清理状态）
self.addEventListener('notificationclose', event => {
  console.log('[SW] 通知已关闭');
});

console.log('[SW] v6.0 媒体会话修复版已启动');
