// net.js —— 双人房间中继（MQTT over WSS，免服务器免注册）
// 拓扑：host 订阅 <room>/c2h，guest 订阅 <room>/h2c；各自向对方主题发布。
// 消息一律 JSON 文本；QoS0；主题前缀固定版本，避免不同版本串台。
(function () {
  'use strict';

  var PREFIX = 'duobunker/v1/';
  // 国内优先 broker-cn，备用全球节点；两者都是 EMQX 免费公共节点
  var BROKERS = [
    'wss://broker-cn.emqx.io:8084/mqtt',
    'wss://broker.emqx.io:8084/mqtt'
  ];

  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字符

  function makeRoomCode() {
    var s = '';
    for (var i = 0; i < 5; i++) {
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return s;
  }

  function normalizeCode(raw) {
    return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  }

  /**
   * RoomChannel：一个房间连接。
   * opts: { room, role: 'host'|'guest', onMessage(msg), onStatus(status, detail), onReady(), onReconnect() }
   * status: 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'failed'
   * onReady：首次连上 broker 时触发；onReconnect：断线后重连成功时触发。
   */
  function RoomChannel(opts) {
    this.room = normalizeCode(opts.room);
    this.role = opts.role;
    this.onMessage = opts.onMessage || function () {};
    this.onStatus = opts.onStatus || function () {};
    this.onReady = opts.onReady || function () {};
    this.onReconnect = opts.onReconnect || function () {};
    this.client = null;
    this.brokerIdx = 0;
    this._closed = false;
    this._everConnected = false;

    if (!this.room || this.room.length !== 5) throw new Error('房间码必须是 5 位');
    this._connect();
  }

  RoomChannel.prototype._inTopic = function () {
    // 我订阅“对方发来”的主题
    return PREFIX + this.room + (this.role === 'host' ? '/c2h' : '/h2c');
  };
  RoomChannel.prototype._outTopic = function () {
    return PREFIX + this.room + (this.role === 'host' ? '/h2c' : '/c2h');
  };

  RoomChannel.prototype._log = function (event, url, detail) {
    try {
      if (!window.__netLog) window.__netLog = [];
      window.__netLog.push({ ts: Date.now(), event: event, url: url || '', role: this.role, detail: detail || '' });
      if (window.__netLog.length > 60) window.__netLog.shift();
    } catch (e) {}
  };

  RoomChannel.prototype._connect = function () {
    var self = this;
    if (self._closed) return;
    var url = BROKERS[self.brokerIdx % BROKERS.length];
    self._log('connect-attempt', url);
    self._setStatus(self.brokerIdx === 0 ? 'connecting' : 'reconnecting');

    var clientId = 'duobnk-' + self.role + '-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    var client = mqtt.connect(url, {
      clientId: clientId,
      clean: true,
      keepalive: 30,
      connectTimeout: 9000,
      reconnectPeriod: 2000
    });
    self.client = client;

    client.on('connect', function () {
      client.subscribe(self._inTopic(), { qos: 0 }, function (err) {
        if (err) {
          self._nextBroker();
        } else {
          self._setStatus('connected');
          self._log('connected', url);
          if (self._everConnected) {
            // 断线重连：订阅已恢复，但 QoS0 消息会丢，上层需要重新握手同步
            try { self.onReconnect(); } catch (e) {}
          } else {
            // 首次连上：上层可以立刻发送入房握手
            try { self.onReady(); } catch (e) {}
          }
          self._everConnected = true;
          self._errCount = 0;
        }
      });
    });

    client.on('message', function (topic, payload) {
      if (self._closed) return;
      var msg;
      try { msg = JSON.parse(payload.toString()); } catch (e) { return; }
      if (!msg || typeof msg !== 'object' || !msg.t) return;
      self.onMessage(msg);
    });

    client.on('reconnect', function () {
      if (!self._closed) self._setStatus('reconnecting');
    });
    client.on('offline', function () {
      if (!self._closed) self._setStatus('offline');
    });
    client.on('close', function () {
      self._log('close', url);
      // 从未成功连上过的节点：连续失败 2 轮就换下一个节点（避免卡死在坏节点）
      if (!self._everConnected && !self._closed) {
        self._errCount = (self._errCount || 0) + 1;
        if (self._errCount >= 2) { self._errCount = 0; self._nextBroker(); }
      }
    });
    client.on('error', function (e) {
      self._log('error', url, e && e.message);
    });

    // 手机上锁屏/切后台会冻结定时器导致掉线：回到前台时立刻尝试重连
    self._visHandler = function () {
      if (self._closed || !self.client) return;
      if (document.visibilityState === 'visible' && !self.client.connected) {
        try { self.client.reconnect(); } catch (e) {}
      }
    };
    document.addEventListener('visibilitychange', self._visHandler);
  };

  RoomChannel.prototype._teardown = function () {
    if (this._visHandler) {
      document.removeEventListener('visibilitychange', this._visHandler);
      this._visHandler = null;
    }
  };

  RoomChannel.prototype._nextBroker = function () {
    if (this._closed) return;
    this._teardown();
    try { this.client && this.client.end(true); } catch (e) {}
    this.brokerIdx++;
    this._connect();
  };

  RoomChannel.prototype._setStatus = function (s, detail) {
    this.onStatus(s, detail);
  };

  RoomChannel.prototype.send = function (msg) {
    if (this._closed || !this.client) return;
    msg.ts = Date.now();
    this.client.publish(this._outTopic(), JSON.stringify(msg), { qos: 0 });
  };

  RoomChannel.prototype.close = function () {
    this._closed = true;
    this._teardown();
    try { this.client && this.client.end(true); } catch (e) {}
    this.client = null;
  };

  window.DuoNet = {
    makeRoomCode: makeRoomCode,
    normalizeCode: normalizeCode,
    RoomChannel: RoomChannel
  };
})();
