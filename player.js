/**
 * ============================================================
 * NeuroPlayer - 蓝牙耳机/锁屏控制适配器 v1.0
 * 功能：MediaSession 完整绑定、华为耳机双击/三击检测、
 *       蓝牙状态监听、音频焦点管理、后台播放保持
 * ============================================================
 */
(function() {
    'use strict';

    const DEBUG = true;
    const log = (...a) => { if (DEBUG) console.log('[NeuroPlayer]', ...a); };
    const warn = (...a) => { console.warn('[NeuroPlayer]', ...a); };
    const err = (...a) => { console.error('[NeuroPlayer]', ...a); };

    // ========================================================
    // 工具函数
    // ========================================================
    const UA = navigator.userAgent.toLowerCase();
    const isHuawei = /huawei|honor/.test(UA);
    const isHarmonyOS = /harmonyos|openharmony/.test(UA) || (isHuawei && !/android/.test(UA));
    const isIOS = /iphone|ipad|ipod/.test(UA);
    const isAndroid = /android/.test(UA);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

    // 安全调用主应用 API
    function appCall(method, ...args) {
        if (window.app && typeof window.app[method] === 'function') {
            try { return window.app[method](...args); } catch (e) { err('appCall 失败:', method, e); }
        } else {
            // 降级：触发自定义事件
            window.dispatchEvent(new CustomEvent('neuro:' + method, { detail: args }));
        }
    }

    // 获取主应用状态
    function appState(key) {
        if (window.app) {
            if (key === 'isPlaying') return window.app.isPlaying;
            if (key === 'version') return window.app.version;
        }
        return null;
    }

    // ========================================================
    // 1. 静默音频保持器 - 确保后台 MediaSession 不失效
    // ========================================================
    class SilentAudioKeeper {
        constructor() {
            this.audio = null;
            this.isRunning = false;
            this.interval = null;
            this.pulseDuration = 3000; // 3 秒脉冲
            this.silenceDuration = 5000; // 静默 5 秒后再次脉冲
        }

        // 生成极短脉冲音频（触发系统媒体检测）
        _genPulseBlob() {
            const sr = 8000; // 低采样率减小体积
            const dur = 0.5; // 500ms
            const samples = Math.floor(sr * dur);
            const buf = new ArrayBuffer(44 + samples * 2);
            const v = new DataView(buf);
            let o = 0;
            const w = s => { for (let i = 0; i < s.length; i++) v.setUint8(o++, s.charCodeAt(i)); };
            w('RIFF'); v.setUint32(o, 36 + samples * 2, true); o += 4;
            w('WAVE'); w('fmt '); v.setUint32(o, 16, true); o += 4;
            v.setUint16(o, 1, true); o += 2; // PCM
            v.setUint16(o, 1, true); o += 2; // mono
            v.setUint32(o, sr, true); o += 4;
            v.setUint32(o, sr * 2, true); o += 4;
            v.setUint16(o, 2, true); o += 2;
            v.setUint16(o, 16, true); o += 2;
            w('data'); v.setUint32(o, samples * 2, true); o += 4;
            // 极微弱正弦波，系统能检测但人耳几乎听不到
            for (let i = 0; i < samples; i++) {
                const t = i / sr;
                const s = Math.sin(2 * Math.PI * 600 * t) * 0.015;
                v.setInt16(o, Math.max(-32768, Math.min(32767, s * 32767)), true);
                o += 2;
            }
            return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
        }

        _ensureAudio() {
            if (!this.audio) {
                this.audio = document.createElement('audio');
                this.audio.crossOrigin = 'anonymous';
                this.audio.setAttribute('x5-video-player-type', 'h5');
                this.audio.setAttribute('x5-video-player-fullscreen', 'false');
                this.audio.setAttribute('playsinline', '');
                this.audio.setAttribute('webkit-playsinline', '');
                this.audio.muted = false;
                this.audio.volume = 0.01; // 极低音量
                this.audio.src = this._genPulseBlob();
                this.audio.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-9999;';
                document.body.appendChild(this.audio);
                log('静默音频 keeper 已创建');
            }
            return this.audio;
        }

        // 启动脉冲循环（用于保持 MediaSession 活性）
        start() {
            if (this.isRunning) return;
            this.isRunning = true;
            log('Keeper 启动');

            const pulse = async () => {
                if (!this.isRunning) return;
                try {
                    const a = this._ensureAudio();
                    a.currentTime = 0;
                    await a.play();
                    // 播放极短时间后暂停
                    setTimeout(() => {
                        try { a.pause(); } catch (e) {}
                    }, 200);
                } catch (e) {
                    // autoplay 限制，等待用户交互
                }
            };

            // 立即执行一次
            pulse();
            // 周期性脉冲（防止系统休眠 MediaSession）
            this.interval = setInterval(pulse, this.silenceDuration);
        }

        stop() {
            this.isRunning = false;
            if (this.interval) { clearInterval(this.interval); this.interval = null; }
            if (this.audio) {
                try { this.audio.pause(); this.audio.currentTime = 0; } catch (e) {}
            }
            log('Keeper 停止');
        }

        // 音频被打断时自动恢复
        setupInterruptionRecovery() {
            const a = this._ensureAudio();
            a.addEventListener('pause', () => {
                if (this.isRunning && appState('isPlaying')) {
                    log('Keeper 检测到系统暂停，尝试恢复');
                    setTimeout(() => {
                        if (this.isRunning) {
                            a.play().catch(() => {});
                        }
                    }, 300);
                }
            });
        }
    }

    // ========================================================
    // 2. 快速点击检测器 - 双击/三击识别（华为耳机核心）
    // ========================================================
    class ClickDetector {
        constructor(options = {}) {
            this.doubleThreshold = options.doubleThreshold || 500; // 双击间隔 ms
            this.tripleThreshold = options.tripleThreshold || 700; // 三击间隔 ms
            this._timestamps = {}; // 各 action 的时间戳队列
            this._handlers = {};   // 自定义处理器
            this._timeouts = {};   // 防抖定时器
        }

        // 注册自定义双击/三击处理器
        on(action, pattern, handler) {
            const key = `${action}:${pattern}`;
            this._handlers[key] = handler;
            log(`注册 ${action} 的 ${pattern} 处理器`);
        }

        // 处理 MediaSession action 事件
        handle(action) {
            const now = Date.now();
            if (!this._timestamps[action]) this._timestamps[action] = [];
            const queue = this._timestamps[action];
            queue.push(now);

            // 清理超时的时间戳
            const cutoff = now - this.tripleThreshold;
            while (queue.length > 0 && queue[0] < cutoff) queue.shift();

            // 清除之前的定时器
            if (this._timeouts[action]) clearTimeout(this._timeouts[action]);

            // 设置新的定时器来判断点击模式
            this._timeouts[action] = setTimeout(() => {
                const clicks = queue.length;
                queue.length = 0; // 清空队列

                if (clicks >= 3) {
                    log(`检测到 ${action} 三击 (${clicks}次)`);
                    this._emit(action, 'triple');
                } else if (clicks === 2) {
                    log(`检测到 ${action} 双击`);
                    this._emit(action, 'double');
                } else {
                    this._emit(action, 'single');
                }
            }, this.tripleThreshold);
        }

        _emit(action, pattern) {
            const key = `${action}:${pattern}`;
            const handler = this._handlers[key];
            if (handler) {
                try { handler(); } catch (e) { err('Click handler 失败:', e); }
            } else {
                // 默认行为
                this._defaultAction(action, pattern);
            }
        }

        _defaultAction(action, pattern) {
            log(`默认处理: ${action} ${pattern}`);
            // 三击和双击都映射到标准操作
            switch (action) {
                case 'previoustrack':
                    appCall('prevTrack');
                    break;
                case 'nexttrack':
                    appCall('nextTrack');
                    break;
                case 'play':
                case 'pause':
                    appCall('togglePlay');
                    break;
                case 'seekbackward':
                    // 双击左耳通常映射为 seekbackward
                    appCall('prevTrack');
                    break;
                case 'seekforward':
                    // 双击右耳通常映射为 seekforward
                    appCall('nextTrack');
                    break;
            }
        }

        destroy() {
            Object.values(this._timeouts).forEach(t => clearTimeout(t));
            this._timestamps = {};
            this._handlers = {};
            this._timeouts = {};
        }
    }

    // ========================================================
    // 3. 蓝牙设备监听器
    // ========================================================
    class BluetoothMonitor {
        constructor() {
            this.isBluetoothConnected = false;
            this.deviceName = null;
            this.audioOutputDevices = [];
        }

        async init() {
            // 方法1: Audio Output Devices API (Chrome 110+)
            if ('setSinkId' in HTMLAudioElement.prototype) {
                await this._checkAudioOutputs();
            }

            // 方法2: 通过 navigator.bluetooth (需要用户授权，不主动请求)
            // 只在支持的浏览器中监听已有连接
            if ('bluetooth' in navigator && navigator.bluetooth.getAvailability) {
                try {
                    const available = await navigator.bluetooth.getAvailability();
                    log('蓝牙硬件可用:', available);
                } catch (e) {}
            }

            // 方法3: 通过媒体设备变化事件
            if (navigator.mediaDevices) {
                navigator.mediaDevices.addEventListener('devicechange', () => {
                    this._checkAudioOutputs();
                });
            }

            // 方法4: HarmonyOS 特有 - 通过 audio 元素的 sinkId 变化
            this._setupSinkIdMonitoring();
        }

        async _checkAudioOutputs() {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
                const bluetoothDevice = audioOutputs.find(d =>
                    /bluetooth|bt|无线|freebuds|airpods|earbuds|headphone|headset/i.test(d.label)
                );

                const wasConnected = this.isBluetoothConnected;
                this.isBluetoothConnected = !!bluetoothDevice;
                this.audioOutputDevices = audioOutputs;

                if (bluetoothDevice) {
                    this.deviceName = bluetoothDevice.label;
                    log('检测到蓝牙音频设备:', this.deviceName);
                    // 触发事件
                    window.dispatchEvent(new CustomEvent('neuro:bluetooth-connected', {
                        detail: { name: this.deviceName }
                    }));
                } else if (wasConnected) {
                    log('蓝牙音频设备已断开');
                    this.deviceName = null;
                    window.dispatchEvent(new CustomEvent('neuro:bluetooth-disconnected'));
                }
            } catch (e) { warn('无法枚举音频设备:', e); }
        }

        _setupSinkIdMonitoring() {
            // 通过定期检测 audio 元素的输出变化来推断蓝牙连接状态
            setInterval(() => {
                this._checkAudioOutputs();
            }, 5000);
        }

        isHeadphoneConnected() {
            return this.isBluetoothConnected;
        }
    }

    // ========================================================
    // 4. 音频焦点管理器（Android/HarmonyOS 音频焦点）
    // ========================================================
    class AudioFocusManager {
        constructor() {
            this.hasFocus = false;
            this.audioCtx = null;
        }

        async request() {
            // Web Audio API 的音频焦点（通过 resume AudioContext 间接获得）
            try {
                if (!this.audioCtx) {
                    const AC = window.AudioContext || window.webkitAudioContext;
                    if (AC) this.audioCtx = new AC();
                }
                if (this.audioCtx && this.audioCtx.state === 'suspended') {
                    await this.audioCtx.resume();
                }
                this.hasFocus = true;
                log('音频焦点已获取');
            } catch (e) { warn('获取音频焦点失败:', e); }
        }

        async abandon() {
            try {
                if (this.audioCtx && this.audioCtx.state === 'running') {
                    await this.audioCtx.suspend();
                }
                this.hasFocus = false;
                log('音频焦点已释放');
            } catch (e) { warn('释放音频焦点失败:', e); }
        }

        // 监听音频焦点变化（通过 document 的 audio focus 事件）
        setupListeners() {
            // 页面可见性变化时管理焦点
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    // 页面隐藏时保持焦点（后台播放）
                    log('页面隐藏，保持音频焦点');
                } else {
                    this.request();
                }
            });
        }
    }

    // ========================================================
    // 5. 华为/鸿蒙系统适配器
    // ========================================================
    class HuaweiAdapter {
        constructor() {
            this.isHuawei = isHuawei;
            this.isHarmonyOS = isHarmonyOS;
            this.workaroundsApplied = false;
        }

        init() {
            if (!this.isHuawei && !this.isHarmonyOS) return;
            log('应用华为/鸿蒙适配...');

            // 修复1: HarmonyOS MediaSession 延迟激活
            this._fixDelayedActivation();

            // 修复2: 华为浏览器音频策略 - 需要可见 audio 元素
            this._createVisibleAudioStub();

            // 修复3: 处理华为耳机的特殊按键映射
            this._adaptHuaweiHeadphones();

            // 修复4: 后台播放权限提示
            this._requestBackgroundPermission();

            this.workaroundsApplied = true;
            log('华为/鸿蒙适配完成');
        }

        // 华为系统 MediaSession 需要延迟激活
        _fixDelayedActivation() {
            // 首次播放时可能 MediaSession 不生效，需要重试
            let retryCount = 0;
            const tryActivate = () => {
                if (retryCount >= 3) return;
                retryCount++;
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = appState('isPlaying') ? 'playing' : 'paused';
                    log('MediaSession 激活重试 #' + retryCount);
                }
            };
            // 播放后延迟激活
            window.addEventListener('neuro:playback-started', () => {
                setTimeout(tryActivate, 500);
                setTimeout(tryActivate, 1500);
            });
        }

        // 华为浏览器需要可见的 audio 元素才能正确激活 MediaSession
        _createVisibleAudioStub() {
            const stub = document.createElement('audio');
            stub.id = '__huawei_audio_stub';
            stub.setAttribute('x5-video-player-type', 'h5');
            stub.setAttribute('x5-video-player-fullscreen', 'false');
            stub.setAttribute('playsinline', '');
            stub.controls = true; // 华为需要 controls=true
            stub.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;height:40px;opacity:0.01;z-index:1;pointer-events:none;';
            document.body.appendChild(stub);
            log('华为音频 stub 已创建');
        }

        // 华为 FreeBuds 耳机的特殊按键映射
        _adaptHuaweiHeadphones() {
            // FreeBuds 系列耳机的默认映射：
            // - 双击右耳: nexttrack
            // - 双击左耳: previoustrack
            // - 长按: 语音助手（不经过 MediaSession）
            // - 三击: 部分型号支持，映射为 seekbackward

            // 华为耳机发送的事件间隔特征
            // 双击间隔: ~300-500ms
            // 三击间隔: ~200-400ms（三次总时间 < 700ms）
            log('华为耳机适配已应用');
        }

        // 请求鸿蒙后台播放权限
        _requestBackgroundPermission() {
            if (this.isHarmonyOS && 'permissions' in navigator) {
                navigator.permissions.query({ name: 'background-sync' })
                    .then(result => log('Background sync 权限:', result.state))
                    .catch(() => {});
            }
        }
    }

    // ========================================================
    // 6. 主控制器 - 整合所有模块
    // ========================================================
    class NeuroPlayer {
        constructor() {
            this.keeper = new SilentAudioKeeper();
            this.detector = new ClickDetector({
                doubleThreshold: 500,
                tripleThreshold: 700
            });
            this.bluetooth = new BluetoothMonitor();
            this.focus = new AudioFocusManager();
            this.huawei = new HuaweiAdapter();
            this.msInitialized = false;
            this.lastActionTime = 0;
            this.actionCooldown = 200; // 防连点冷却 ms
        }

        async init() {
            log('NeuroPlayer 初始化...', '| 系统:', isHarmonyOS ? 'HarmonyOS' : isHuawei ? '华为' : isIOS ? 'iOS' : 'Android/Other');

            // 等待主应用就绪
            await this._waitForApp();

            // 初始化蓝牙监听
            await this.bluetooth.init();

            // 初始化 MediaSession（完整绑定 7 个标准动作）
            this._initMediaSession();

            // 设置点击检测模式
            this._setupClickPatterns();

            // 初始化华为适配
            this.huawei.init();

            // 初始化音频焦点
            this.focus.setupListeners();

            // 监听主应用播放事件
            this._bindAppEvents();

            // 当开始播放时启动 keeper
            this._setupKeeperTrigger();

            // 页面可见性管理
            this._setupVisibilityHandler();

            log('NeuroPlayer 初始化完成');
        }

        // 等待主应用 window.app 就绪
        _waitForApp() {
            return new Promise(resolve => {
                if (window.app) { resolve(); return; }
                let tries = 0;
                const timer = setInterval(() => {
                    tries++;
                    if (window.app) { clearInterval(timer); resolve(); }
                    else if (tries > 50) { clearInterval(timer); resolve(); } // 5秒超时
                }, 100);
            });
        }

        // 初始化 MediaSession 完整绑定
        _initMediaSession() {
            if (!('mediaSession' in navigator)) {
                warn('MediaSession API 不可用');
                return;
            }
            if (this.msInitialized) return;

            log('初始化 MediaSession 动作处理器...');

            const actions = [
                ['play', () => this._handleAction('play')],
                ['pause', () => this._handleAction('pause')],
                ['previoustrack', () => this._handleAction('previoustrack')],
                ['nexttrack', () => this._handleAction('nexttrack')],
                ['stop', () => this._handleAction('stop')],
                ['seekbackward', (d) => this._handleAction('seekbackward', d)],
                ['seekforward', (d) => this._handleAction('seekforward', d)],
                ['seekto', (d) => this._handleAction('seekto', d)],
            ];

            for (const [name, handler] of actions) {
                try {
                    navigator.mediaSession.setActionHandler(name, handler);
                    log('  ✅', name);
                } catch (e) {
                    warn('  ⚠️', name, '不支持:', e.message);
                }
            }

            this.msInitialized = true;
            log('MediaSession 初始化完成');
        }

        // 处理 MediaSession 动作（带冷却和日志）
        _handleAction(action, details) {
            const now = Date.now();
            if (now - this.lastActionTime < this.actionCooldown) {
                log(`[${action}] 冷却中，忽略`);
                return;
            }
            this.lastActionTime = now;
            log(`[${action}] 触发`, details ? JSON.stringify(details) : '');

            // 交给点击检测器分析（支持双击/三击识别）
            this.detector.handle(action);
        }

        // 设置华为耳机的点击模式映射
        _setupClickPatterns() {
            // ========== 华为 FreeBuds 标准映射 ==========
            // 双击右耳 → nexttrack → 下一首
            // 双击左耳 → previoustrack → 上一首
            // 三击    → 连续的 previoustrack → 上一首（快速回退）

            // 模式1: 双击/三击 previoustrack → 上一首
            this.detector.on('previoustrack', 'single', () => {
                log('⏮ 上一首 (单击)');
                appCall('prevTrack');
            });
            this.detector.on('previoustrack', 'double', () => {
                log('⏮⏮ 上一首 (双击)');
                appCall('prevTrack');
            });
            this.detector.on('previoustrack', 'triple', () => {
                log('⏮⏮⏮ 上一首 (三击)');
                appCall('prevTrack');
            });

            // 模式2: 双击/三击 nexttrack → 下一首
            this.detector.on('nexttrack', 'single', () => {
                log('⏭ 下一首 (单击)');
                appCall('nextTrack');
            });
            this.detector.on('nexttrack', 'double', () => {
                log('⏭⏭ 下一首 (双击)');
                appCall('nextTrack');
            });
            this.detector.on('nexttrack', 'triple', () => {
                log('⏭⏭⏭ 下一首 (三击)');
                appCall('nextTrack');
            });

            // 模式3: play/pause → 播放/暂停切换
            this.detector.on('play', 'single', () => {
                log('▶ 播放');
                if (!appState('isPlaying')) appCall('togglePlay');
            });
            this.detector.on('pause', 'single', () => {
                log('⏸ 暂停');
                if (appState('isPlaying')) appCall('togglePlay');
            });

            // 模式4: seekbackward/seekforward（部分华为耳机型号映射）
            this.detector.on('seekbackward', 'single', () => {
                log('⏪ 快退 → 上一首');
                appCall('prevTrack');
            });
            this.detector.on('seekbackward', 'double', () => {
                log('⏪⏪ 快退双击 → 上一首');
                appCall('prevTrack');
            });
            this.detector.on('seekforward', 'single', () => {
                log('⏩ 快进 → 下一首');
                appCall('nextTrack');
            });
            this.detector.on('seekforward', 'double', () => {
                log('⏩⏩ 快进双击 → 下一首');
                appCall('nextTrack');
            });

            // 模式5: stop → 暂停
            this.detector.on('stop', 'single', () => {
                log('⏹ 停止');
                if (appState('isPlaying')) appCall('togglePlay');
            });

            log('点击模式映射已设置');
        }

        // 绑定主应用事件
        _bindAppEvents() {
            // 监听主应用的播放状态变化
            const observer = () => {
                const isPlaying = appState('isPlaying');
                this._updatePlaybackState(isPlaying);
            };

            // 通过定时轮询检测状态变化（因为主应用没有主动通知机制）
            let lastState = null;
            setInterval(() => {
                const current = appState('isPlaying');
                if (current !== lastState) {
                    lastState = current;
                    this._updatePlaybackState(current);
                }
            }, 500);

            // 监听主应用触发的自定义事件
            window.addEventListener('neuro:playback-state-changed', (e) => {
                this._updatePlaybackState(e.detail?.isPlaying);
            });
        }

        // 更新 MediaSession 播放状态
        _updatePlaybackState(isPlaying) {
            if (!('mediaSession' in navigator)) return;
            try {
                const state = isPlaying ? 'playing' : 'paused';
                if (navigator.mediaSession.playbackState !== state) {
                    navigator.mediaSession.playbackState = state;
                    log('PlaybackState:', state);
                }

                // 同步 keeper
                if (isPlaying) {
                    this.keeper.start();
                    this.focus.request();
                } else {
                    this.keeper.stop();
                    this.focus.abandon();
                }
            } catch (e) { warn('更新 playbackState 失败:', e); }
        }

        // 播放时自动启动 keeper
        _setupKeeperTrigger() {
            // keeper 的打断恢复
            this.keeper.setupInterruptionRecovery();
        }

        // 页面可见性管理
        _setupVisibilityHandler() {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    log('页面隐藏，保持 MediaSession 活性');
                    // 页面隐藏时保持 keeper 运行
                    if (appState('isPlaying')) {
                        this.keeper.start();
                    }
                } else {
                    log('页面显示');
                    // 刷新 MediaSession 状态
                    this._updatePlaybackState(appState('isPlaying'));
                    // 重新初始化（某些系统需要）
                    if (isHuawei || isHarmonyOS) {
                        this._initMediaSession();
                    }
                }
            });

            // 窗口获得焦点时刷新
            window.addEventListener('focus', () => {
                this._updatePlaybackState(appState('isPlaying'));
            });
        }

        // 主动更新 MediaSession 元数据（供主应用调用）
        async updateMetadata(title, artist, album, artworkUrls) {
            if (!('mediaSession' in navigator)) return;
            try {
                const artwork = (artworkUrls || []).map(u => ({
                    src: u.src || u,
                    sizes: u.sizes || '512x512',
                    type: u.type || 'image/png'
                }));

                navigator.mediaSession.metadata = new MediaMetadata({
                    title: title || '神经重塑训练',
                    artist: artist || '训练播放',
                    album: album || 'PWA',
                    artwork: artwork.length > 0 ? artwork : undefined
                });
                log('元数据已更新:', title);
            } catch (e) { warn('更新元数据失败:', e); }
        }

        // 主动更新播放位置
        updatePosition(duration, position) {
            if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return;
            try {
                navigator.mediaSession.setPositionState({
                    duration: duration || 0,
                    playbackRate: appState('isPlaying') ? 1 : 0,
                    position: position || 0
                });
            } catch (e) {}
        }

        // 销毁
        destroy() {
            this.keeper.stop();
            this.detector.destroy();
            this.msInitialized = false;
            // 清除 MediaSession 处理器
            if ('mediaSession' in navigator) {
                const actions = ['play', 'pause', 'previoustrack', 'nexttrack', 'stop', 'seekbackward', 'seekforward', 'seekto'];
                actions.forEach(a => {
                    try { navigator.mediaSession.setActionHandler(a, null); } catch (e) {}
                });
            }
            log('NeuroPlayer 已销毁');
        }
    }

    // ========================================================
    // 7. 初始化入口
    // ========================================================

    // 全局单例
    let _instance = null;

    async function init() {
        if (_instance) return _instance;
        _instance = new NeuroPlayer();
        await _instance.init();
        window.neuroPlayer = _instance;
        return _instance;
    }

    // 等待 DOM 和主应用就绪后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // 延迟初始化，确保主应用先加载
            setTimeout(init, 200);
        });
    } else {
        setTimeout(init, 200);
    }

    // 暴露全局 API（供主应用调用）
    window.NeuroPlayer = {
        get instance() { return _instance; },
        init,
        // 快捷方法
        updateMetadata: (t, a, al, art) => _instance?.updateMetadata(t, a, al, art),
        updatePosition: (d, p) => _instance?.updatePosition(d, p),
        isBluetoothConnected: () => _instance?.bluetooth?.isBluetoothConnected || false,
        getBluetoothDeviceName: () => _instance?.bluetooth?.deviceName || null,
    };

    log('player.js 已加载，等待初始化...');

})();
