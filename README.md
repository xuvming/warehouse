# 神经重塑训练 v7.0 - MediaSession 锁屏控制完整版

## 文件结构

```
/
├── index.html      # 主应用（MediaSession 完整修复版）
├── manifest.json   # PWA 配置清单
├── sw.js           # Service Worker（离线支持 + 消息转发）
├── icons/          # 图标文件夹（需自行生成或使用工具）
│   ├── icon-48x48.png
│   ├── icon-72x72.png
│   ├── icon-96x96.png
│   ├── icon-128x128.png
│   ├── icon-144x144.png
│   ├── icon-152x152.png
│   ├── icon-192x192.png
│   ├── icon-384x384.png
│   └── icon-512x512.png
└── screenshots/    # 截图文件夹（PWABuilder 用）
    ├── screenshot-wide.png
    └── screenshot-narrow.png
```

## v7.0 修复的问题

### 1. MediaSession 绑定不完整（已修复）
| 问题 | 修复 |
|------|------|
| `seekbackward` 未注册 | ✅ 新增支持，回调内处理 -10s 快退 |
| `seekforward` 未注册 | ✅ 新增支持，回调内处理 +10s 快进 |
| `seekto` 未注册 | ✅ 新增支持，拖动进度条时同步 |
| 初始化过早 | ✅ 改为用户点击播放后懒初始化，符合 autoplay 策略 |

### 2. 缺少关键播放触发（已修复）
| 问题 | 修复 |
|------|------|
| Pulse WAV 音量 0.02 太低 | ✅ 提升至 0.05（10ms 脉冲），确保系统检测到 |
| Pulse 时长 2 秒 | ✅ 延长至 5 秒，提高检测可靠性 |
| 隐藏音频 `volume` 太低 | ✅ 提升至 0.3 |
| 缺少 `crossOrigin` 属性 | ✅ 新增 `crossOrigin="anonymous"` |
| 播放链未确保 SessionAudio | ✅ 在 `play()` 函数开头显式调用 `startSessionAudio()` |

### 3. 华为/鸿蒙适配不全（已修复）
| 问题 | 修复 |
|------|------|
| 缺少 HarmonyOS 检测 | ✅ 新增 `isHarmonyOS` 标志，通过 UA 检测 |
| 缺少 `x5-video-player-type` | ✅ 隐藏音频元素新增 `x5-video-player-type="h5"` |
| 缺少 `x5-video-player-fullscreen` | ✅ 新增 `x5-video-player-fullscreen="false"` |
| 缺少 `webkit-playsinline` | ✅ 新增备用 playsinline 属性 |
| 诊断面板缺少 Session 状态 | ✅ 新增"隐藏音频"诊断行 |
| 华为提示缺少第3步 | ✅ 补充"点击开始训练激活锁屏控制" |
| Meta 标签 | ✅ 新增 `<meta name="harmonyos-media-session" content="enable">` |

## PWABuilder 打包步骤

### 步骤 1：生成图标
使用 [PWABuilder Image Generator](https://www.pwabuilder.com/imageGenerator) 或类似工具：
1. 上传一张 512x512 的图标图片
2. 下载生成的所有尺寸图标
3. 放入 `icons/` 文件夹

### 步骤 2：准备截图
1. 使用浏览器 DevTools 的设备模拟模式
2. 截取一张横屏（1280x720）和一张竖屏（750x1334）截图
3. 放入 `screenshots/` 文件夹

### 步骤 3：上传到 PWABuilder
1. 打开 https://www.pwabuilder.com
2. 输入你的网站 URL，或打包所有文件后上传
3. 检查清单分数（应达到 100%）
4. 点击"生成包"
5. 选择 Android（TWA）平台

### 步骤 4：Android 设置
打包完成后，安装 APK 到手机，并进行以下设置：

```
1. 设置 → 应用 → 神经重塑 → 权限 → 通知 → 允许
2. 设置 → 应用 → 神经重塑 → 权限 → 媒体和文件 → 允许
3. 设置 → 通知 → 神经重塑 → 锁屏通知 → 显示所有通知内容
4. 设置 → 电池 → 神经重塑 → 允许后台活动
5. （鸿蒙）设置 → 应用 → 应用启动管理 → 神经重塑 → 手动管理 → 允许后台运行
```

### 步骤 5：首次使用激活
1. 从桌面图标打开（不要从浏览器打开）
2. 点击「开始训练」按钮
3. 锁屏，查看是否显示播放控件
4. 如未显示，打开诊断面板（点击"正在播放"提示条）查看状态

## 关键代码改动说明

### MediaSession 初始化（v7.0 核心改动）

```javascript
// 旧版本：页面加载时就初始化，违反 autoplay 策略
// 新版本：延迟到用户点击"开始训练"后才初始化
async function initMediaSession() {
    if (mediaSessionInitialized) return;
    
    // 注册所有 7 个标准动作处理器
    trySet('play', ...);
    trySet('pause', ...);
    trySet('previoustrack', ...);
    trySet('nexttrack', ...);
    trySet('stop', ...);
    trySet('seekbackward', ...);   // v7.0 新增
    trySet('seekforward', ...);    // v7.0 新增
    trySet('seekto', ...);          // v7.0 新增
    
    mediaSessionInitialized = true;
}
```

### 隐藏音频会话（v7.0 核心改动）

```javascript
function ensureSessionAudio() {
    _sessionAudio = document.createElement('audio');
    _sessionAudio.loop = true;
    _sessionAudio.crossOrigin = 'anonymous';
    // 华为/鸿蒙专用属性
    _sessionAudio.setAttribute('x5-video-player-type', 'h5');
    _sessionAudio.setAttribute('x5-video-player-fullscreen', 'false');
    _sessionAudio.setAttribute('playsinline', '');
    _sessionAudio.setAttribute('webkit-playsinline', '');
    // ...
}
```

### 播放触发链（v7.0 核心改动）

```javascript
async function play() {
    // 1. 先启动隐藏音频（触发系统媒体会话检测）
    await startSessionAudio();
    
    // 2. 确保 MediaSession 在用户手势中初始化
    if (!mediaSessionInitialized) await initMediaSession();
    
    // 3. 设置播放状态
    navigator.mediaSession.playbackState = 'playing';
    
    // 4. 播放实际训练音乐
    await playStageMusic(currentStage, savedTime);
    
    // 5. 更新元数据
    await updateMS(stages[currentStage], audioMeta[currentStage]);
}
```

## 兼容性

| 平台 | 版本 | 状态 |
|------|------|------|
| Android Chrome | 80+ | ✅ 完全支持 |
| Android WebView (TWA) | 80+ | ✅ 完全支持 |
| HarmonyOS 2.0 | - | ✅ 支持（需配置） |
| HarmonyOS 3.0/4.0 | - | ✅ 支持 |
| iOS Safari | 15.4+ | ⚠️ 部分支持（无 seekto） |
| iOS Standalone | 15.4+ | ⚠️ 部分支持 |
| 华为浏览器 | 11+ | ✅ 支持 |
| Samsung Internet | 13+ | ✅ 支持 |
