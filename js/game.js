// game.js —— 《地堡搭档》双人联机引擎
// 权威模型：房主(host)运行全部模拟；队友(guest)是纯镜像端，只发送输入。
// 阶段：home → lobby → scavenge(60s) → day(事件) → night(结算) → … → end
(function () {
  'use strict';

  var D = window.GAME_DATA;
  var DuoNet = window.DuoNet;

  // ---------- 工具 ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function vib(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  var toastTimer = null;
  function toast(text, ms) {
    var el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 1800);
  }

  var SHOW_SCREENS = ['scr-home', 'scr-join', 'scr-lobby', 'scr-scav', 'scr-day', 'scr-night', 'scr-end'];
  function showScreen(id) {
    SHOW_SCREENS.forEach(function (s) { $(s).classList.toggle('hidden', s !== id); });
  }

  // ---------- 会话 ----------
  var S = {
    role: null,          // 'host' | 'guest'
    room: '',
    chan: null,
    myName: '',
    peerName: '',
    phase: 'home',
    lastInbound: 0,
    connGood: false,
    cooldownUntil: 0     // 搜刮抓取冷却
  };

  // 房主权威游戏状态
  var G = null;
  // guest 镜像视图（形状尽量与渲染所需一致）
  var M = null;

  var hostTickTimer = null;       // 搜刮倒计时
  var hostStallTimer = null;      // 事件等待对方超时
  var beatTimer = null;
  var guestRevealTimer = null;    // guest 本地自动切换(仅视觉效果)
  var guestNightTimer = null;

  // ============================================================
  //  游戏状态构造（host）
  // ============================================================
  function newGameState() {
    return {
      day: 0,
      res: { food: 0, water: 0 },
      items: { medkit: 0, medicine: 0, mask: 0, radio: 0, flashlight: 0, battery: 0, rifle: 0, ammo: 0, cards: 0, doll: 0, generator: 0 },
      players: {
        host: { name: S.myName, health: 100, sanity: 60, alive: true },
        guest: { name: S.peerName || '等待加入…', health: 100, sanity: 60, alive: true }
      },
      scav: { items: [], timeLeft: D.SCAV_SECONDS, bag: { host: [], guest: [] }, heavyPending: {}, started: false },
      pools: {
        joint: shuffle(D.EVENTS.joint.map(function (e) { return e.id; })),
        single: shuffle(D.EVENTS.single.map(function (e) { return e.id; })),
        skill: shuffle(D.EVENTS.skill.map(function (e) { return e.id; })),
        auto: shuffle(D.EVENTS.auto.map(function (e) { return e.id; }))
      },
      curEvent: null
    };
  }

  function findEvent(type, id) {
    var pool = D.EVENTS[type];
    for (var i = 0; i < pool.length; i++) if (pool[i].id === id) return pool[i];
    return null;
  }

  function takeEvent(type) {
    var pool = G.pools[type];
    if (!pool.length) {
      // 用尽则重新洗牌（一般 10 天内不会发生）
      G.pools[type] = shuffle(D.EVENTS[type].map(function (e) { return e.id; }));
      pool = G.pools[type];
    }
    var id = pool.shift();
    return findEvent(type, id);
  }

  // ============================================================
  //  联机
  // ============================================================
  function openChannel(room, role) {
    if (S.chan) { S.chan.close(); S.chan = null; }
    S.room = DuoNet.normalizeCode(room);
    S.role = role;
    S.chan = new DuoNet.RoomChannel({
      room: S.room,
      role: role,
      onMessage: role === 'host' ? onHostMessage : onGuestMessage,
      onStatus: onConnStatus,
      onReconnect: function () {
        // 断线重连后重新握手，让对方补发当前进度快照
        setTimeout(function () {
          if (!S.chan) return;
          if (role === 'guest') {
            sendHost({ t: 'hello', name: S.myName });
            setTimeout(function () {
              if (S.chan && !S.peerName) sendHost({ t: 'hello', name: S.myName });
            }, 2500);
          } else if (S.peerName && S.phase !== 'lobby') {
            sendHost(syncPayload());
          }
        }, 400);
      }
    });
    startHeartbeat();
  }

  function startHeartbeat() {
    clearInterval(beatTimer);
    beatTimer = setInterval(function () {
      if (S.chan) S.chan.send({ t: 'heartbeat' });
      var gap = Date.now() - S.lastInbound;
      setConnState(gap < 9000);
    }, 2000);
    S.lastInbound = Date.now();
  }

  function onConnStatus(status) {
    if (status === 'connected') setConnState(true, true);
    else if (status === 'connecting' || status === 'reconnecting') setConnState(false, true, status);
    else setConnState(false, true, status);
  }

  function setConnState(good, force, tag) {
    S.connGood = good;
    var banner = $('conn-banner');
    if (good) {
      banner.classList.add('hidden');
      return;
    }
    var txt = tag === 'reconnecting' ? '网络重连中…请稍等' : (tag === 'offline' || tag === 'failed') ? '网络断开,正在重试…' : '对方信号不好…等待恢复';
    banner.textContent = txt + '（房间码 ' + S.room + '）';
    banner.classList.remove('hidden');
  }

  // ============================================================
  //  HOST：接收 guest 消息
  // ============================================================
  function onHostMessage(msg) {
    S.lastInbound = Date.now();
    if (!G) return;
    switch (msg.t) {
      case 'hello':
        var isNew = !S.peerName;
        S.peerName = (msg.name || '队友').slice(0, 8);
        G.players.guest.name = S.peerName;
        toast('队友已连接：' + S.peerName);
        vib(60);
        if (S.phase === 'lobby') {
          sendHost({ t: 'lobby', names: { host: S.myName, guest: S.peerName } });
          renderLobby();
        } else {
          sendHost(syncPayload());
        }
        break;
      case 'heartbeat':
        break;
      case 'claim':
        hostHandleClaim(msg.iid, 'guest');
        break;
      case 'heavyTap':
        hostHandleHeavyTap(msg.iid, 'guest');
        break;
      case 'choice':
        if (G.curEvent && G.curEvent.stage === 'choice' && G.curEvent.ev.id === msg.id) {
          G.curEvent.choices.guest = msg.idx;
          hostTryResolve();
        }
        break;
      case 'skillTap':
        if (G.curEvent && G.curEvent.ev.type === 'skill') {
          // msg.n 是队友的累计点击数，取 max 防乱序/重放
          G.curEvent.taps.guest = Math.max(G.curEvent.taps.guest, msg.n | 0);
          hostBroadcastSkillProgress();
        }
        break;
      case 'bye':
        S.peerName = '';
        toast('队友已离开');
        break;
    }
  }

  function sendHost(msg) { S.chan && S.chan.send(msg); }

  function hostBroadcastSkillProgress() {
    if (G && G.curEvent && G.curEvent.ev.type === 'skill') {
      var total = G.curEvent.taps.host + G.curEvent.taps.guest;
      sendHost({ t: 'progress', n: total });
    }
  }

  function syncPayload() {
    // 重连后向 guest 补发当前阶段快照
    var base = {
      t: 'sync',
      phase: S.phase,
      names: { host: S.myName, guest: S.peerName },
      res: G.res, items: G.items, players: G.players, day: G.day
    };
    if (S.phase === 'scav') {
      base.scav = {
        layout: G.scav.items.map(function (it) {
          return { iid: it.iid, id: it.id, room: it.room, x: it.x, y: it.y, taken: it.taken, by: it.by || null };
        }),
        timeLeft: G.scav.timeLeft,
        bag: G.scav.bag
      };
    }
    if (S.phase === 'day' && G.curEvent) {
      var ce = G.curEvent;
      base.event = {
        id: ce.ev.id, type: ce.ev.type, title: ce.ev.title, text: ce.ev.text,
        options: ce.ev.options || null,
        decider: ce.ev.type === 'single' ? ce.decider : null,
        choices: ce.stage === 'reveal' ? ce.choices : { host: null, guest: null },
        revealText: ce.stage === 'reveal' ? ce.revealText : null,
        revealLines: ce.stage === 'reveal' ? ce.revealLines : null
      };
    }
    return base;
  }

  // ---------- 搜刮：host 逻辑 ----------
  function buildLayout() {
    var list = [];
    var iid = 0;
    // 每个房间已放物品的位置，用于“最远点采样”减少重叠
    var placed = {};
    function samplePos(room, heavy) {
      var R = D.ROOMS[room];
      if (heavy) return { x: R.x + R.w / 2 - 4 + Math.random() * 8, y: R.y + R.h / 2 - 4 + Math.random() * 8 };
      var best = null, bestD = -1;
      for (var t = 0; t < 22; t++) {
        var px = R.x + 7 + Math.random() * (R.w - 16);
        var py = R.y + 9 + Math.random() * (R.h - 20);
        var dMin = 1e9;
        (placed[room] || []).forEach(function (p) {
          var dx = p.x - px, dy = p.y - py;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < dMin) dMin = d;
        });
        if (dMin > bestD) { bestD = dMin; best = { x: px, y: py }; }
        if (bestD > 9) break; // 已足够远，提前收工
      }
      return best;
    }
    D.SCATTER.forEach(function (entry) {
      var roomSeq = shuffle(Object.keys(D.ROOMS).filter(function (r) { return entry.rooms.indexOf(r) >= 0; }));
      for (var i = 0; i < entry.n; i++) {
        var room = roomSeq[i % roomSeq.length];
        var pos = samplePos(room, D.ITEMS[entry.id].kind === 'heavy');
        if (!placed[room]) placed[room] = [];
        placed[room].push(pos);
        list.push({
          iid: iid++,
          id: entry.id,
          room: room,
          x: pos.x, y: pos.y,
          taken: false, by: null
        });
      }
    });
    return list;
  }

  function startScav() {
    G.scav.items = buildLayout();
    G.scav.timeLeft = D.SCAV_SECONDS;
    G.scav.startTs = Date.now();
    G.scav.bag = { host: [], guest: [] };
    G.scav.heavyPending = {};
    G.scav.started = true;
    S.phase = 'scav';
    sendHost({
      t: 'scavStart',
      dur: D.SCAV_SECONDS,
      layout: G.scav.items.map(function (it) {
        return { iid: it.iid, id: it.id, room: it.room, x: it.x, y: it.y };
      }),
      bag: G.scav.bag
    });
    renderScav();
    startWatchdog();
  }

  // ---------- 房主看门狗：所有阶段推进 = 截止时间戳 + 低频轮询 ----------
  // 用墙钟而不是裸 setTimeout：被系统节流/切后台后，一旦醒来立即追平进度
  var watchdogTimer = null;
  function startWatchdog() {
    clearInterval(watchdogTimer);
    watchdogTimer = setInterval(hostWatchdog, 500);
  }
  function hostWatchdog() {
    if (!G || S.role !== 'host') return;
    var now = Date.now();
    if (S.phase === 'scav') { hostScavTick(); return; }
    if (S.phase === 'day') {
      if (!G.curEvent) {
        // 搜刮刚结束的空档：等 _nextDayAt 开启第 1 天
        if (G._nextDayAt && now >= G._nextDayAt) { G._nextDayAt = 0; beginDay(G.day + 1); }
        return;
      }
      var ce = G.curEvent;
      if (ce.stage === 'reveal' && ce.revealAt && now >= ce.revealAt) { ce.revealAt = 0; nightStep(); return; }
      if (ce.stage === 'choice' && ce.ev.type === 'skill' && now >= ce.startTs + 4000) hostTryResolve(true);
      return;
    }
    if (S.phase === 'night' && G._nextDayAt && now >= G._nextDayAt) {
      G._nextDayAt = 0;
      beginDay(G.day + 1);
    }
  }

  function hostScavTick() {
    if (!G || S.phase !== 'scav') { clearInterval(hostTickTimer); return; }
    var left = Math.ceil(D.SCAV_SECONDS - (Date.now() - G.scav.startTs) / 1000);
    left = Math.max(0, left);
    var prev = G.scav.timeLeft;
    G.scav.timeLeft = left;
    updateTimerUI(left);
    if (left !== prev || left === 0) sendHost({ t: 'tick', timeLeft: left });
    if (left <= 0) endScav();
  }

  function hostHandleClaim(iid, role) {
    if (S.phase !== 'scav') return;
    var it = G.scav.items[iid];
    if (!it || it.taken) {
      sendHost({ t: 'claimFail', iid: iid, reason: 'taken' });
      return;
    }
    if (D.ITEMS[it.id].kind === 'heavy') { hostHandleHeavyTap(iid, role); return; }
    if (G.scav.bag[role].length >= D.BAG_CAP) {
      sendHost({ t: 'claimFail', iid: iid, reason: 'full' });
      return;
    }
    it.taken = true; it.by = role;
    G.scav.bag[role].push(it.id);
    sendHost({ t: 'itemGone', iid: iid, by: role, id: it.id });
    onItemGoneLocal(iid, role, it.id);
  }

  function hostHandleHeavyTap(iid, role) {
    if (S.phase !== 'scav') return;
    var it = G.scav.items[iid];
    if (!it || it.taken || D.ITEMS[it.id].kind !== 'heavy') return;
    var pending = G.scav.heavyPending[iid];
    var now = Date.now();
    if (pending && (now - pending.ts > 6000)) { pending = null; delete G.scav.heavyPending[iid]; }
    if (!pending) {
      pending = { roles: [], ts: now };
      G.scav.heavyPending[iid] = pending;
    }
    if (pending.roles.indexOf(role) < 0) pending.roles.push(role);
    if (pending.roles.length >= 2) {
      // 两人合力成功
      it.taken = true; it.by = 'both';
      delete G.scav.heavyPending[iid];
      sendHost({ t: 'itemGone', iid: iid, by: 'both', id: it.id });
      onItemGoneLocal(iid, 'both', it.id);
    } else {
      sendHost({ t: 'heavyPending', iid: iid, roles: pending.roles, id: it.id });
      if (role === 'host') onHeavyPendingLocal(iid, pending.roles, it.id);
    }
  }

  function endScav() {
    clearInterval(hostTickTimer);
    // 合并背包 → 资源/库存
    var logs = [];
    ['host', 'guest'].forEach(function (role) {
      G.scav.bag[role].forEach(function (id) {
        if (id === 'canned') G.res.food++;
        else if (id === 'water') G.res.water++;
        else G.items[id] = (G.items[id] || 0) + 1;
      });
    });
    G.scav.items.forEach(function (it) {
      if (it.taken && it.by === 'both') {
        if (it.id === 'barrel') G.res.water += 4;
        else G.items[it.id] = (G.items[it.id] || 0) + 1;
      }
    });
    logs.push('搜刮结束：🥫×' + G.res.food + '　🧴×' + G.res.water);
    S.phase = 'day'; // 先占位，dayStart 才正式进入
    sendHost({ t: 'scavEnd', res: G.res, items: G.items, logs: logs });
    G._nextDayAt = Date.now() + 2600; // 看门狗负责 beginDay(1)
  }

  // ---------- 事件：host ----------
  function beginDay(n) {
    G.day = n;
    S.phase = 'day';
    var type = D.DAY_PLAN[n - 1] || 'single';
    var ev = takeEvent(type);
    G.curEvent = {
      ev: ev,
      stage: 'choice',
      choices: { host: null, guest: null },
      taps: { host: 0, guest: 0 },
      decider: (n % 2 === 1) ? 'host' : 'guest',
      startTs: Date.now(),
      stallCount: 0
    };
    sendHost({
      t: 'dayStart', day: n, res: G.res, items: G.items, players: G.players
    });
    sendHost({
      t: 'event',
      id: ev.id, type: ev.type, title: ev.title, text: ev.text.replace('{n}', String(n)),
      options: ev.options || null,
      decider: ev.type === 'single' ? G.curEvent.decider : null,
      threshold: ev.threshold || null
    });
    renderDayStart();
    renderEventCard(ev, n, G.curEvent.decider);
    scheduleStallWatch(ev);
    if (ev.type === 'skill') {
      clearInterval(G._skillTimer);
      var last = -1;
      G._skillTimer = setInterval(function () {
        if (!G.curEvent || G.curEvent.stage !== 'choice' || G.curEvent.ev.id !== ev.id) { clearInterval(G._skillTimer); return; }
        var total = G.curEvent.taps.host + G.curEvent.taps.guest;
        if (total !== last) { last = total; sendHost({ t: 'progress', n: total }); }
        updateSkillProgress(total, ev.threshold);
      }, 350);
    }
  }

  function scheduleStallWatch(ev) {
    clearTimeout(hostStallTimer);
    hostStallTimer = setTimeout(function () {
      if (G.curEvent && G.curEvent.stage === 'choice' && G.curEvent.ev.id === ev.id) {
        hostTryResolve(true);
      }
    }, 30000);
  }

  function hostTryResolve(force) {
    var ce = G.curEvent;
    if (!ce || ce.stage !== 'choice') return;
    var ev = ce.ev;
    if (ev.type === 'joint' && (ce.choices.host == null || ce.choices.guest == null)) {
      if (force) {
        if (ce.choices.host == null) ce.choices.host = Math.floor(Math.random() * (ev.options || ['a', 'b']).length);
        if (ce.choices.guest == null) ce.choices.guest = Math.floor(Math.random() * (ev.options || ['a', 'b']).length);
      } else return;
    }
    if (ev.type === 'single' && ce.choices[ce.decider] == null) {
      if (force) ce.choices[ce.decider] = Math.floor(Math.random() * (ev.options || ['a', 'b']).length);
      else return;
    }
    if (ev.type === 'skill') {
      if (!force) return;
      if (Date.now() - ce.startTs < 3500) return;
    }
    if (ev.type === 'auto') { /* 直接出结果 */ }

    ce.stage = 'reveal';
    ce.revealAt = Date.now() + 5200; // 看门狗负责夜间结算
    var outcome = computeOutcome(ev, ce);
    applyDeltas(outcome.deltas || {});
    ce.revealText = outcome.text;
    ce.revealLines = deltaLines(outcome.deltas || {});
    sendHost({ t: 'reveal', text: ce.revealText, lines: ce.revealLines, res: G.res, items: G.items, players: G.players });
    renderReveal(ce.revealText, ce.revealLines);
  }

  function computeOutcome(ev, ce) {
    var out = null;
    if (ev.type === 'joint') {
      var key = (ce.choices.host === 0 ? 'a' : 'b') + (ce.choices.guest === 0 ? 'a' : 'b');
      out = ev.outcomes[key] || ev.outcomes.aa;
    } else if (ev.type === 'single') {
      var k = String(ce.choices[ce.decider]);
      out = ev.outcomes[k];
    } else if (ev.type === 'skill') {
      var total = ce.taps.host + ce.taps.guest;
      out = total >= (ev.threshold || 20) ? ev.success : ev.fail;
    } else if (ev.type === 'auto') {
      out = ev.build(G);
    }
    out = Object.assign({}, out);
    if (out.cond) {
      var rep = out.cond(G);
      Object.keys(rep).forEach(function (k) {
        if (k === 'deltas') Object.assign(out.deltas = out.deltas || {}, rep[k]);
        else out[k] = rep[k];
      });
    }
    if (out.roll) {
      var r = Math.random(), acc = 0, chosen = out.roll[out.roll.length - 1][1];
      for (var i = 0; i < out.roll.length; i++) {
        acc += out.roll[i][0];
        if (r <= acc) { chosen = out.roll[i][1]; break; }
      }
      Object.assign(out, chosen);
    }
    return out;
  }

  function applyDeltas(d) {
    if (d.food) G.res.food = Math.max(0, G.res.food + d.food);
    if (d.water) G.res.water = Math.max(0, G.res.water + d.water);
    if (d.items) {
      Object.keys(d.items).forEach(function (k) {
        G.items[k] = Math.max(0, (G.items[k] || 0) + d.items[k]);
      });
    }
    ['healthA', 'healthB', 'sanityA', 'sanityB'].forEach(function (k) {
      if (!d[k]) return;
      var role = k.charAt(k.length - 1) === 'A' ? 'host' : 'guest';
      var p = G.players[role];
      if (k.indexOf('health') === 0) p.health = Math.max(0, Math.min(100, p.health + d[k]));
      else p.sanity = Math.max(0, Math.min(100, p.sanity + d[k]));
      if (p.health <= 0 && p.alive) {
        p.alive = false;
      }
    });
  }

  function deltaLines(d) {
    var lines = [];
    var names = { host: G.players.host.name, guest: G.players.guest.name };
    if (d.food) lines.push('🥫 食物 ' + fmtDelta(d.food));
    if (d.water) lines.push('🧴 饮水 ' + fmtDelta(d.water));
    if (d.items) Object.keys(d.items).forEach(function (k) {
      var def = D.ITEMS[k];
      if (def) lines.push(def.icon + ' ' + def.name + ' ' + fmtDelta(d.items[k]));
    });
    if (d.healthA) lines.push('❤️ ' + names.host + ' ' + fmtDelta(d.healthA));
    if (d.healthB) lines.push('❤️ ' + names.guest + ' ' + fmtDelta(d.healthB));
    if (d.sanityA) lines.push('🙂 ' + names.host + ' ' + fmtDelta(d.sanityA));
    if (d.sanityB) lines.push('🙂 ' + names.guest + ' ' + fmtDelta(d.sanityB));
    return lines;
  }
  function fmtDelta(n) { return (n > 0 ? '+' : '') + n; }

  // ---------- 夜晚结算：host ----------
  function nightStep() {
    var logs = [];
    var living = ['host', 'guest'].filter(function (r) { return G.players[r].alive; });
    // 消耗：每人每天 1 食 1 水
    var eat = living.length, drink = living.length;
    var foodShort = G.res.food < eat;
    var waterShort = G.res.water < drink;
    G.res.food = Math.max(0, G.res.food - eat);
    G.res.water = Math.max(0, G.res.water - drink);
    logs.push('晚餐消耗：🥫×' + eat + '　🧴×' + drink);
    if (foodShort) {
      living.forEach(function (r) { G.players[r].health = Math.max(0, G.players[r].health - 10); });
      logs.push('⚠️ 没有食物,饥肠辘辘（健康 -10）');
    }
    if (waterShort) {
      living.forEach(function (r) { G.players[r].health = Math.max(0, G.players[r].health - 15); });
      logs.push('⚠️ 没有水,嘴唇干裂（健康 -15）');
    }
    // 士气被动：基础漂移 + 物品加成（只作用存活者）
    var morale = -1;
    if (G.items.doll > 0) morale += 1;
    if (G.items.cards > 0) morale += 1;
    if (G.items.generator > 0) morale += 2;
    living.forEach(function (r) { G.players[r].sanity = Math.max(0, Math.min(100, G.players[r].sanity + morale)); });
    if (morale >= 0) logs.push('士气 +' + morale + '（🧸🃏⚡带来的安慰）');
    else logs.push('士气 ' + morale + '（地堡生活的沉闷）');
    // 死亡结算
    living = ['host', 'guest'].filter(function (r) { return G.players[r].alive; });
    living.forEach(function (r) {
      if (G.players[r].health <= 0 && G.players[r].alive) G.players[r].alive = false;
    });
    var alive2 = ['host', 'guest'].filter(function (r) { return G.players[r].alive; });
    if (alive2.length === 0) { finishGame('dead'); return; }
    if (G.day >= D.TOTAL_DAYS) { finishGame(null); return; }
    sendHost({ t: 'night', logs: logs, res: G.res, items: G.items, players: G.players, nextDay: G.day + 1 });
    renderNight(logs);
    G._nextDayAt = Date.now() + 4200; // 看门狗负责下一天
  }

  function finishGame(forced) {
    var key = forced;
    if (!key) {
      var alive = ['host', 'guest'].filter(function (r) { return G.players[r].alive; });
      if (alive.length === 2) {
        var avgH = (G.players.host.health + G.players.guest.health) / 2;
        var avgS = (G.players.host.sanity + G.players.guest.sanity) / 2;
        key = (avgH >= 50 && avgS >= 50) ? 'perfect' : 'good';
      } else key = 'rough';
    }
    var e = D.ENDINGS[key];
    S.phase = 'end';
    sendHost({ t: 'end', key: key, title: e.title, text: e.text, day: G.day, res: G.res, players: G.players });
    renderEnd(e, G);
  }

  // ============================================================
  //  GUEST：接收 host 消息（纯镜像）
  // ============================================================
  function onGuestMessage(msg) {
    S.lastInbound = Date.now();
    switch (msg.t) {
      case 'lobby':
        S.peerName = msg.names.host;
        M = { phase: 'lobby', names: msg.names };
        renderLobby();
        break;
      case 'scavStart':
        M = { phase: 'scav', layout: msg.layout, bag: msg.bag, taken: {} };
        S.phase = 'scav';
        showScreen('scr-scav');
        buildScavDom(msg.layout);
        updateTimerUI(msg.dur);
        renderBagChips();
        toast('搜刮开始！60 秒！');
        vib([80, 60, 80]);
        break;
      case 'tick':
        if (M && M.phase === 'scav') updateTimerUI(msg.timeLeft);
        break;
      case 'itemGone': onItemGoneMirror(msg); break;
      case 'claimFail': onClaimFailMirror(msg); break;
      case 'heavyPending': onHeavyPendingMirror(msg); break;
      case 'scavEnd':
        M.phase = 'waitday';
        toast('搜刮结束,进入地堡…');
        break;
      case 'sync': onSyncMirror(msg); break;
      case 'dayStart':
        S.phase = 'day';
        M.phase = 'day';
        M.day = msg.day; M.res = msg.res; M.items = msg.items; M.players = msg.players;
        showScreen('scr-day');
        renderHUD();
        clearEventCard();
        toast('第 ' + msg.day + ' 天');
        break;
      case 'event':
        M.curEvent = { id: msg.id, type: msg.type, title: msg.title, text: msg.text, options: msg.options, decider: msg.decider, threshold: msg.threshold, myChoice: null, stage: 'choice', progress: 0 };
        renderEventCardGuest(M.curEvent);
        break;
      case 'progress':
        if (M && M.curEvent && M.curEvent.type === 'skill') {
          M.curEvent.progress = msg.n;
          updateSkillProgress(msg.n, M.curEvent.threshold);
        }
        break;
      case 'reveal':
        if (M && M.curEvent) {
          M.curEvent.stage = 'reveal';
          renderRevealGuest(msg.text, msg.lines);
          M.res = msg.res; M.items = msg.items; M.players = msg.players;
          renderHUD();
        }
        break;
      case 'night':
        M.res = msg.res; M.items = msg.items; M.players = msg.players;
        renderNightGuest(msg.logs);
        break;
      case 'end':
        renderEndGuest(msg);
        break;
      case 'restart':
        S.phase = 'lobby';
        showScreen('scr-lobby');
        renderLobbyGuestWaiting();
        break;
      case 'bye':
        toast('房主已退出');
        breakHome();
        break;
    }
  }

  function onSyncMirror(msg) {
    S.phase = msg.phase;
    if (msg.phase === 'lobby') {
      S.peerName = msg.names.host;
      showScreen('scr-lobby');
      renderLobbyGuestWaiting();
      return;
    }
    M = { phase: msg.phase, day: msg.day, res: msg.res, items: msg.items, players: msg.players };
    if (msg.phase === 'scav') {
      M.layout = msg.scav.layout;
      M.bag = msg.scav.bag;
      M.taken = {};
      showScreen('scr-scav');
      buildScavDom(msg.scav.layout.map(function (it) { return { iid: it.iid, id: it.id, room: it.room, x: it.x, y: it.y, taken: it.taken }; }));
      msg.scav.layout.forEach(function (it) { if (it.taken) markItemTaken(it.iid, it.by); });
      updateTimerUI(msg.scav.timeLeft);
      renderBagChips();
    } else if (msg.phase === 'day') {
      showScreen('scr-day');
      renderHUD();
      if (msg.event) {
        M.curEvent = { id: msg.event.id, type: msg.event.type, title: msg.event.title, text: msg.event.text, options: msg.event.options, decider: msg.event.decider, threshold: null, myChoice: null, stage: msg.event.revealText ? 'reveal' : 'choice', progress: 0 };
        renderEventCardGuest(M.curEvent);
        if (msg.event.revealText) renderRevealGuest(msg.event.revealText, msg.event.revealLines || []);
      } else clearEventCard();
    } else if (msg.phase === 'end') {
      renderEndGuest(msg);
    }
    toast('已重新同步进度');
  }

  // ---------- guest 搜刮交互 ----------
  function onItemGoneMirror(msg) {
    if (!M || M.phase !== 'scav') return;
    markItemTaken(msg.iid, msg.by);
    if (M.bag) {
      if (msg.by === 'guest') M.bag.guest.push(msg.id);
      else if (msg.by === 'host') M.bag.host.push(msg.id);
    }
    if (msg.by === 'both') toast('两人合力搬回了 ' + D.ITEMS[msg.id].icon + D.ITEMS[msg.id].name + '！');
    else if (msg.by === 'guest') { toast('抢到了 ' + D.ITEMS[msg.id].icon + '！'); vib(40); }
    else toast('被房主抢先了…');
    renderBagChips();
  }
  function onClaimFailMirror(msg) {
    if (msg.reason === 'full') toast('背包满了！(上限 ' + D.BAG_CAP + ')');
  }
  function onHeavyPendingMirror(msg) {
    if (!M || M.phase !== 'scav') return;
    var roles = msg.roles || [];
    var el = $('item-' + msg.iid);
    if (!el) return;
    if (roles.indexOf('guest') >= 0) {
      // 自己已按，等房主
      el.classList.add('heavy-wait');
      el.querySelector('.ii-name').textContent = '等待搭档协力…';
    } else {
      el.classList.add('heavy-glow');
      el.querySelector('.ii-name').textContent = '搭档已就位！快点！';
      vib(50);
    }
  }

  // ============================================================
  //  渲染
  // ============================================================
  function renderLobby() {
    showScreen('scr-lobby');
    $('lob-code').textContent = S.room;
    $('lob-me').textContent = S.role === 'host' ? S.myName + '（房主）' : S.myName;
    $('lob-peer').textContent = S.peerName ? S.peerName + (S.role === 'host' ? '（队友）' : '（房主）') : '等待对方加入…';
    $('lob-share').value = location.href.split('?')[0] + '?room=' + S.room;
    var canStart = S.role === 'host' && S.peerName;
    $('btn-start').classList.toggle('hidden', S.role !== 'host');
    $('btn-start').disabled = !canStart;
    $('btn-start').textContent = canStart ? '开始搜刮！' : '等待队友加入…';
    $('lob-guest-tip').classList.toggle('hidden', S.role !== 'guest');
  }
  function renderLobbyGuestWaiting() {
    $('lob-code').textContent = S.room;
    $('lob-me').textContent = S.myName;
    $('lob-peer').textContent = S.peerName || '房主';
    $('lob-share').value = '';
    $('btn-start').classList.add('hidden');
    $('lob-guest-tip').classList.remove('hidden');
  }

  function buildScavDom(layout) {
    var house = $('house');
    var html = '';
    Object.keys(D.ROOMS).forEach(function (rk) {
      var R = D.ROOMS[rk];
      html += '<div class="room" style="left:' + R.x + '%;top:' + R.y + '%;width:' + R.w + '%;height:' + R.h + '%"><span>' + R.name + '</span></div>';
    });
    layout.forEach(function (it) {
      var def = D.ITEMS[it.id];
      html += '<button class="item' + (def.kind === 'heavy' ? ' heavy' : '') + '" id="item-' + it.iid + '" data-iid="' + it.iid + '" ' +
        'style="left:' + it.x + '%;top:' + it.y + '%">' +
        '<span class="ii-icon">' + def.icon + '</span><span class="ii-name">' + esc(def.name) + '</span></button>';
    });
    house.innerHTML = html;
    house.querySelectorAll('.item').forEach(function (el) {
      el.addEventListener('click', function () {
        onScavItemClick(parseInt(el.getAttribute('data-iid'), 10));
      });
    });
  }

  function scavItemDef(iid) {
    if (S.role === 'host') {
      var it = G && G.scav.items ? G.scav.items[iid] : null;
      return it ? D.ITEMS[it.id] : null;
    }
    if (!M || !M.layout) return null;
    var e = null;
    for (var i = 0; i < M.layout.length; i++) if (M.layout[i].iid === iid) { e = M.layout[i]; break; }
    return e ? D.ITEMS[e.id] : null;
  }

  function onScavItemClick(iid) {
    if (!S.chan || S.phase !== 'scav') return;
    var def = scavItemDef(iid);
    var isHeavy = !!(def && def.kind === 'heavy');
    if (!isHeavy && Date.now() < S.cooldownUntil) { toast('整理背包中…'); return; }
    if (S.role === 'host') {
      if (!G || !G.scav || !G.scav.items) return;
      var it = G.scav.items[iid];
      if (!it || it.taken) { toast('已经没有了…'); return; }
      if (!isHeavy) {
        if (G.scav.bag.host.length >= D.BAG_CAP) { toast('背包满了！'); return; }
        hostHandleClaim(iid, 'host');
        S.cooldownUntil = Date.now() + 900;
        return;
      }
      hostHandleHeavyTap(iid, 'host');
      return;
    }
    // guest：发给 host 仲裁（不乐观标记，等 itemGone 回显）
    sendHost({ t: 'claim', iid: iid });
    if (def && def.kind !== 'heavy') S.cooldownUntil = Date.now() + 900;
  }

  function renderScav() {
    showScreen('scr-scav');
    buildScavDom(G.scav.items.map(function (it) {
      return { iid: it.iid, id: it.id, room: it.room, x: it.x, y: it.y };
    }));
    renderBagChips();
    updateTimerUI(G.scav.timeLeft);
  }

  function onItemGoneLocal(iid, by, id) {
    markItemTaken(iid, by);
    if (by === 'both') toast('两人合力搬回了 ' + D.ITEMS[id].icon + D.ITEMS[id].name + '！');
    else if (by === S.role) { toast('抢到了 ' + D.ITEMS[id].icon + '！'); vib(40); }
    else toast('被搭档抢先了…');
    renderBagChips();
  }
  function onHeavyPendingLocal(iid, roles, id) {
    var el = $('item-' + iid);
    if (!el) return;
    if (roles.indexOf('host') >= 0) {
      el.classList.add('heavy-wait');
      el.querySelector('.ii-name').textContent = '等待搭档协力…';
    } else {
      el.classList.add('heavy-glow');
      el.querySelector('.ii-name').textContent = '搭档已就位！快点！';
    }
  }

  function markItemTaken(iid, by) {
    var el = $('item-' + iid);
    if (!el) return;
    el.classList.remove('heavy-glow', 'heavy-wait');
    el.classList.add('taken');
    el.disabled = true;
    var tag = by === 'both' ? '两人合力 ✓' : (by === (S.role === 'host' ? 'host' : 'guest') ? '我 ✓' : '对方 ✓');
    el.querySelector('.ii-name').textContent = tag;
  }

  function renderBagChips() {
    var mine = S.role === 'host' ? (G ? G.scav.bag.host : []) : (M && M.bag ? M.bag.guest : []);
    var peer = S.role === 'host' ? (G ? G.scav.bag.guest : []) : (M && M.bag ? M.bag.host : []);
    $('bag-mine').textContent = '我的背包 ' + mine.length + '/' + D.BAG_CAP;
    $('bag-peer').textContent = '搭档背包 ' + peer.length + '/' + D.BAG_CAP;
    var html = mine.map(function (id) { return '<span class="chip">' + D.ITEMS[id].icon + '</span>'; }).join('');
    $('bag-chips').innerHTML = html;
  }

  function updateTimerUI(sec) {
    var el = $('scav-timer');
    if (!el) return;
    el.textContent = Math.max(0, sec) + 's';
    el.classList.toggle('urgent', sec <= 10);
  }

  // ---------- 事件渲染 ----------
  function renderHUD() {
    var st = S.role === 'host' ? G : M;
    if (!st || !st.players) return;
    $('hud-day').textContent = '第 ' + (st.day || 1) + ' 天';
    $('hud-food').textContent = '🥫 ' + st.res.food;
    $('hud-water').textContent = '🧴 ' + st.res.water;
    var names = { host: st.players.host.name, guest: st.players.guest.name };
    var itemsRow = [];
    Object.keys(D.ITEMS).forEach(function (k) {
      var n = (st.items && st.items[k]) || 0;
      if (n > 0) itemsRow.push('<span class="chip">' + D.ITEMS[k].icon + '×' + n + '</span>');
    });
    $('hud-items').innerHTML = itemsRow.join('');
    var html = '';
    ['host', 'guest'].forEach(function (role) {
      var p = st.players[role];
      var label = (role === S.role ? '我·' : '搭档·') + names[role];
      html += '<div class="pp' + (p.alive ? '' : ' dead') + '"><b>' + esc(label) + '</b>' +
        '<div class="bar"><i style="width:' + p.health + '%"></i></div><span>❤️' + p.health + '</span>' +
        '<div class="bar san"><i style="width:' + p.sanity + '%"></i></div><span>🙂' + p.sanity + '</span></div>';
    });
    $('hud-players').innerHTML = html;
  }

  function clearEventCard() {
    $('ev-title').textContent = '';
    $('ev-text').textContent = '';
    $('ev-options').innerHTML = '';
    $('ev-status').textContent = '';
    $('ev-reveal').classList.add('hidden');
    $('ev-skill').classList.add('hidden');
  }

  // host 端事件卡
  function renderEventCard(ev, day, decider) {
    clearEventCard();
    renderHUD();
    $('ev-title').textContent = ev.title;
    $('ev-text').textContent = ev.text.replace('{n}', String(day));
    var opts = $('ev-options');
    if (ev.type === 'auto') {
      opts.innerHTML = '';
      $('ev-status').textContent = '突发事件…';
      return;
    }
    if (ev.type === 'skill') {
      opts.innerHTML = '';
      $('ev-skill').classList.remove('hidden');
      $('ev-status').textContent = '两人一起狂点！';
      return;
    }
    var myTurn = ev.type === 'joint' || decider === S.role;
    htmlOptions(opts, ev.options, myTurn, function (idx) {
      if (!G.curEvent || G.curEvent.stage !== 'choice' || G.curEvent.ev.id !== ev.id) return;
      if (ev.type === 'joint') {
        G.curEvent.choices.host = idx;
        lockOptions(opts, idx);
        $('ev-status').textContent = '已选择,等待搭档一起揭晓…';
        hostTryResolve();
      } else {
        G.curEvent.choices[decider] = idx;
        lockOptions(opts, idx);
        $('ev-status').textContent = '已决定,等待揭晓…';
        hostTryResolve();
      }
    });
    if (!myTurn) {
      var who = decider === 'host' ? G.players.host.name : G.players.guest.name;
      $('ev-status').textContent = '由 ' + who + ' 决定…';
    }
  }

  // guest 端事件卡
  function renderEventCardGuest(ev) {
    clearEventCard();
    renderHUD();
    $('ev-title').textContent = ev.title;
    $('ev-text').textContent = ev.text;
    var opts = $('ev-options');
    if (ev.type === 'auto') { $('ev-status').textContent = '突发事件…'; return; }
    if (ev.type === 'skill') {
      $('ev-skill').classList.remove('hidden');
      $('ev-status').textContent = '两人一起狂点！';
      resetSkillCounters();
      return;
    }
    var myTurn = ev.type === 'joint' || ev.decider === S.role;
    htmlOptions(opts, ev.options, myTurn, function (idx) {
      if (ev.type === 'joint' || ev.decider === S.role) {
        sendHost({ t: 'choice', idx: idx, id: ev.id });
        ev.myChoice = idx;
        lockOptions(opts, idx);
        $('ev-status').textContent = ev.type === 'joint' ? '已选择,等待搭档一起揭晓…' : '已决定,等待揭晓…';
      }
    });
    if (!myTurn) {
      $('ev-status').textContent = '由房主决定…';
    }
  }

  function htmlOptions(container, options, enabled, onTap) {
    container.innerHTML = (options || []).map(function (o, i) {
      return '<button class="opt" data-idx="' + i + '"' + (enabled ? '' : ' disabled') + '>' + esc(o) + '</button>';
    }).join('');
    if (!enabled) return;
    container.querySelectorAll('.opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        vib(30);
        onTap(parseInt(btn.getAttribute('data-idx'), 10));
      });
    });
  }
  function lockOptions(container, idx) {
    container.querySelectorAll('.opt').forEach(function (btn, i) {
      btn.disabled = true;
      if (i === idx) btn.classList.add('mine');
    });
  }

  function renderReveal(text, lines) {
    $('ev-reveal').classList.remove('hidden');
    $('ev-reveal-text').textContent = text;
    $('ev-reveal-lines').innerHTML = (lines || []).map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('');
    $('ev-options').innerHTML = '';
    $('ev-status').textContent = '';
    renderHUD();
  }
  function renderRevealGuest(text, lines) {
    renderReveal(text, lines);
    if (M && M.curEvent) lockOptions($('ev-options'), -1);
  }

  // ---------- 小挑战 ----------
  var skillTapCount = 0;
  function bindSkillButton() {
    var btn = $('skill-btn');
    btn.addEventListener('click', function () {
      var st = S.role === 'host' ? G : M;
      if (!st || !st.curEvent || st.curEvent.stage !== 'choice') return;
      var evObj = S.role === 'host' ? st.curEvent.ev : st.curEvent;
      if (!evObj || evObj.type !== 'skill') return;
      skillTapCount++;
      vib(15);
      if (S.role === 'host') {
        G.curEvent.taps.host = skillTapCount;
      } else {
        // 每次点击直接上报，避免批量缓冲丢失结尾几下
        sendHost({ t: 'skillTap', n: skillTapCount });
      }
    });
  }
  function resetSkillCounters() { skillTapCount = 0; }

  function updateSkillProgress(total, threshold) {
    var el = $('skill-bar-i');
    if (!el) return;
    var pct = Math.max(0, Math.min(100, (total / (threshold || 20)) * 100));
    el.style.width = pct + '%';
    el.classList.toggle('ok', total >= (threshold || 20));
    $('skill-count').textContent = total + ' / ' + (threshold || 20) + ' 次合力';
  }

  // ---------- 夜晚/结局 ----------
  function renderNight(logs) {
    S.phase = 'night';
    showScreen('scr-night');
    $('night-logs').innerHTML = logs.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('');
    renderHUDInto($('night-hud'));
  }
  function renderNightGuest(logs) {
    renderNight(logs);
    renderHUD();
  }

  function renderHUDInto(el) {
    // 复用 hud 结构的简化版（夜间页顶部小条）
    var st = S.role === 'host' ? G : M;
    if (!st || !st.players) { el.innerHTML = ''; return; }
    el.innerHTML = '第 ' + (st.day || 1) + ' 天 · 🥫' + st.res.food + ' · 🧴' + st.res.water +
      ' · ❤️' + st.players.host.health + '/' + st.players.guest.health;
  }

  function renderEnd(e, st) {
    showScreen('scr-end');
    $('end-title').textContent = e.title;
    $('end-text').textContent = e.text;
    $('end-stats').innerHTML =
      '<div>存活天数：<b>' + st.day + '</b> / ' + D.TOTAL_DAYS + '</div>' +
      '<div>剩余：🥫' + st.res.food + '　🧴' + st.res.water + '</div>' +
      '<div>' + esc(st.players.host.name) + ' ❤️' + st.players.host.health + ' 🙂' + st.players.host.sanity + (st.players.host.alive ? '' : '（已故）') + '</div>' +
      '<div>' + esc(st.players.guest.name) + ' ❤️' + st.players.guest.health + ' 🙂' + st.players.guest.sanity + (st.players.guest.alive ? '' : '（已故）') + '</div>';
    $('btn-again').classList.toggle('hidden', S.role !== 'host');
    $('end-wait').classList.toggle('hidden', S.role === 'host');
  }
  function renderEndGuest(msg) {
    S.phase = 'end';
    renderEnd({ title: msg.title, text: msg.text }, { day: msg.day, res: msg.res, players: msg.players });
  }

  // ============================================================
  //  HOST 本地渲染入口（host 自己的屏幕直接从 G 渲染）
  // ============================================================
  function renderDayStart() {
    showScreen('scr-day');
    renderHUD();
    resetSkillCounters();
  }

  // ============================================================
  //  主界面交互
  // ============================================================
  function breakHome() {
    clearInterval(hostTickTimer);
    clearInterval(watchdogTimer);
    clearInterval(beatTimer);
    clearTimeout(hostStallTimer);
    if (S.chan) { S.chan.close(); S.chan = null; }
    S.role = null; S.room = ''; S.peerName = '';
    S.phase = 'home';
    G = null; M = null;
    showScreen('scr-home');
  }

  function bindUI() {
    var nameInput = $('inp-name');
    nameInput.value = pick(D.NICKNAMES) + Math.floor(Math.random() * 90 + 10);

    $('btn-host').addEventListener('click', function () {
      S.myName = (nameInput.value || '房主').slice(0, 8);
      var code = DuoNet.makeRoomCode();
      try { openChannel(code, 'host'); } catch (e) { toast(e.message); return; }
      G = newGameState();
      S.phase = 'lobby';
      renderLobby();
      toast('房间已创建，把房间码发给朋友！');
    });

    $('btn-goto-join').addEventListener('click', function () {
      S.myName = (nameInput.value || '队友').slice(0, 8);
      $('inp-room').value = new URLSearchParams(location.search).get('room') || '';
      showScreen('scr-join');
      setTimeout(function () { $('inp-room').focus(); }, 200);
    });

    $('btn-join-go').addEventListener('click', function () {
      var code = DuoNet.normalizeCode($('inp-room').value);
      if (code.length !== 5) { toast('房间码是 5 位字母数字'); return; }
      S.myName = ($('inp-name').value || '队友').slice(0, 8);
      try { openChannel(code, 'guest'); } catch (e) { toast(e.message); return; }
      S.phase = 'lobby';
      showScreen('scr-lobby');
      renderLobbyGuestWaiting();
      // 连接建立后再发 hello（等 connected 状态或直接发，MQTT 会排队）
      setTimeout(function () {
        sendHost({ t: 'hello', name: S.myName });
      }, 600);
      setTimeout(function () {
        if (!S.peerName) sendHost({ t: 'hello', name: S.myName });
      }, 2500);
    });

    $('btn-join-back').addEventListener('click', function () {
      showScreen('scr-home');
    });

    $('btn-copy').addEventListener('click', function () {
      var v = $('lob-share').value;
      if (!v) return;
      try {
        navigator.clipboard.writeText('我们在玩《地堡搭档》！打开链接加入房间：' + v).then(function () {
          toast('邀请文案已复制，发给朋友吧');
        });
      } catch (e) { toast('复制失败，请手动选择复制'); }
    });

    $('btn-start').addEventListener('click', function () {
      if (S.role !== 'host' || !S.peerName || S.phase !== 'lobby') return;
      startScav();
    });

    $('btn-again').addEventListener('click', function () {
      if (S.role !== 'host' || S.phase !== 'end') return;
      G = newGameState();
      S.phase = 'lobby';
      sendHost({ t: 'restart' });
      renderLobby();
    });

    $('btn-bag').addEventListener('click', function () {
      var mine = S.role === 'host' ? (G ? G.scav.bag.host : []) : (M && M.bag ? M.bag.guest : []);
      var rows = mine.length ? mine.map(function (id) {
        return '<div class="bag-row">' + D.ITEMS[id].icon + ' ' + esc(D.ITEMS[id].name) + '</div>';
      }).join('') : '<div class="bag-row empty">空空如也，快去抢！</div>';
      $('bag-list').innerHTML = rows;
      $('bag-overlay').classList.remove('hidden');
    });
    $('btn-bag-close').addEventListener('click', function () {
      $('bag-overlay').classList.add('hidden');
    });

    bindSkillButton();

    // URL 带 room 参数：直接进加入页
    var roomParam = new URLSearchParams(location.search).get('room');
    if (roomParam) {
      showScreen('scr-join');
      $('inp-room').value = DuoNet.normalizeCode(roomParam);
      setTimeout(function () { $('btn-join-go').click(); }, 300);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    showScreen('scr-home');
    bindUI();
    // 点击追踪（诊断用，配合 __clickLog）
    document.addEventListener('click', function (e) {
      try {
        if (!window.__clickLog) window.__clickLog = [];
        window.__clickLog.push({
          t: Date.now(),
          id: e.target.id || '',
          cls: e.target.className || '',
          text: (e.target.textContent || '').slice(0, 12)
        });
        if (window.__clickLog.length > 40) window.__clickLog.shift();
      } catch (err) {}
    }, true);
    // 回到前台瞬间立即追平搜刮时钟（配合 net.js 的立刻重连）
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && S.role === 'host' && S.phase === 'scav') {
        try { hostScavTick(); } catch (e) {}
      }
    });
    // 维护用调试出口：浏览器控制台可查连接与阶段状态
    window.__duoDebug = function () {
      var base = {
        role: S.role, room: S.room, phase: S.phase,
        myName: S.myName, peerName: S.peerName,
        brokerConnected: !!(S.chan && S.chan.client && S.chan.client.connected),
        hasGameState: !!(S.role === 'host' ? G : M),
        day: S.role === 'host' && G ? G.day : (M && M.day) || 0
      };
      if (S.role === 'host' && G) {
        base.bag = G.scav.bag;
        base.heavyPending = Object.keys(G.scav.heavyPending);
        base.takenCount = G.scav.items.filter(function (i) { return i.taken; }).length;
      } else if (M) {
        base.bag = M.bag || null;
        base.mirrorPhase = M.phase;
      }
      return base;
    };
    // 测试辅助（仅房主）：搜刮阶段立即结束；日程阶段直接跳到第 n 天
    window.__duoForceDay = function (n) {
      if (S.role !== 'host' || !G) return 'host only';
      if (S.phase === 'scav') { G.scav.startTs = 0; hostScavTick(); return 'scav ended'; }
      n = Math.max(1, Math.min(D.TOTAL_DAYS, n | 0));
      clearTimeout(hostStallTimer);
      beginDay(n);
      return 'day ' + n;
    };
    // 测试辅助：手动跑一次看门狗（环境定时器冻结时的确定性推进）
    window.__duoKick = function () {
      try { hostWatchdog(); return 'kicked'; } catch (e) { return 'err: ' + e.message; }
    };
  });
})();
