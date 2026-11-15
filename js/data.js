// data.js —— 《地堡搭档》全部静态内容：物品、搜刮布点、事件卡、结局
// 全部文案为原创，勿与任何商业游戏内容混用。
(function () {
  'use strict';

  // ---------- 物品 ----------
  // kind: light(占背包格) / heavy(需两人合力搬运，进公共仓库)
  var ITEMS = {
    canned:     { name: '罐头',   icon: '🥫', kind: 'light', tag: 'food' },
    water:      { name: '瓶装水', icon: '🧴', kind: 'light', tag: 'water' },
    medkit:     { name: '急救包', icon: '💊', kind: 'light', tag: 'med' },
    medicine:   { name: '药品',   icon: '🩹', kind: 'light', tag: 'med' },
    mask:       { name: '防毒面具', icon: '😷', kind: 'light', tag: 'gear' },
    radio:      { name: '收音机', icon: '📻', kind: 'light', tag: 'gear' },
    flashlight: { name: '手电筒', icon: '🔦', kind: 'light', tag: 'gear' },
    battery:    { name: '电池',   icon: '🔋', kind: 'light', tag: 'gear' },
    rifle:      { name: '老步枪', icon: '🔫', kind: 'light', tag: 'gear' },
    ammo:       { name: '弹药',   icon: '🧨', kind: 'light', tag: 'gear' },
    cards:      { name: '扑克牌', icon: '🃏', kind: 'light', tag: 'fun' },
    doll:       { name: '旧玩偶', icon: '🧸', kind: 'light', tag: 'fun' },
    barrel:     { name: '桶装水', icon: '🛢️', kind: 'heavy', tag: 'water' },
    generator:  { name: '汽油发电机', icon: '⚡', kind: 'heavy', tag: 'gear' }
  };

  // 搜刮阶段布点清单（数量 × 可分配的房间）
  var SCATTER = [
    { id: 'canned', n: 7, rooms: ['kitchen', 'storage', 'bedroom', 'garage'] },
    { id: 'water',  n: 7, rooms: ['kitchen', 'storage', 'bedroom', 'garage'] },
    { id: 'medkit', n: 1, rooms: ['storage'] },
    { id: 'medicine', n: 2, rooms: ['bedroom', 'storage'] },
    { id: 'mask', n: 1, rooms: ['storage'] },
    { id: 'radio', n: 1, rooms: ['bedroom'] },
    { id: 'flashlight', n: 1, rooms: ['storage'] },
    { id: 'battery', n: 2, rooms: ['storage', 'garage'] },
    { id: 'rifle', n: 1, rooms: ['garage'] },
    { id: 'ammo', n: 2, rooms: ['garage'] },
    { id: 'cards', n: 1, rooms: ['bedroom'] },
    { id: 'doll', n: 1, rooms: ['bedroom'] },
    { id: 'barrel', n: 1, rooms: ['kitchen'] },
    { id: 'generator', n: 1, rooms: ['garage'] }
  ];

  var ROOMS = {
    storage: { name: '储藏室', x: 0, y: 0, w: 50, h: 50 },
    kitchen: { name: '厨房',   x: 50, y: 0, w: 50, h: 50 },
    bedroom: { name: '卧室',   x: 0, y: 50, w: 50, h: 50 },
    garage:  { name: '车库',   x: 50, y: 50, w: 50, h: 50 }
  };

  var BAG_CAP = 8;        // 每人背包上限
  var SCAV_SECONDS = 60;  // 搜刮时长

  // ---------- 事件卡 ----------
  // type: joint(双方暗选同亮) / single(值班决定) / skill(双人协作挑战) / auto(播报)
  // deltas: { food, water, healthA, healthB, sanityA, sanityB, items:{id:+n} }
  // joint 事件 outcomes 的键：aa/ab/ba/bb（a=选项0，b=选项1；前一位=房主，后一位=队友）
  var EVENTS_JOINT = [
    {
      id: 'knock', type: 'joint',
      title: '深夜敲门声',
      text: '第{n}天凌晨，笃、笃、笃——地堡铁门被敲响了。门外传来一个沙哑的声音："有人吗……给口水喝吧……"',
      options: ['开门看看', '死守不开'],
      outcomes: {
        aa: { text: '门外是一对落难的母女。你们给了 1 瓶水，对方哭着留下了一盒火柴道谢。做点好事，心里踏实。',
              deltas: { water: -1, sanityA: 8, sanityB: 8 } },
        ab: { text: '门刚拉开一条缝，一只野猫窜了进来！虚惊一场，但晚上谁都没睡好。',
              deltas: { sanityA: -3, sanityB: -6 } },
        ba: { text: '没人开门。门外的人骂骂咧咧地走了，临走掉下一个罐头。捡起来，晚上加餐。',
              deltas: { food: 1, sanityA: 2, sanityB: -4 } },
        bb: { text: '两个人屏住呼吸谁都没动。敲门声停了，但这一夜你们都睁眼到天亮。',
              deltas: { sanityA: -7, sanityB: -7 } }
      }
    },
    {
      id: 'gas', type: 'joint',
      title: '毒气渗入',
      text: '刺鼻的气味从通风管渗了进来！过滤器在报警——气体正在往下沉。',
      options: ['冲上去堵管道', '撤到最里屋硬扛'],
      outcomes: {
        aa: { text: '你们顶着毒气把通风管堵上了。{maskText}',
              deltas: { healthA: -12, healthB: -12, sanityA: -4, sanityB: -4 },
              cond: function (s) {
                return { maskText: s.items.mask > 0 ? '好在有防毒面具，几乎没有呛着。' : '没有面具，两人咳了半天，胸口发烫。' };
              } },
        ab: { text: '一人上去堵管，一人撤到里屋。堵管道的人呛得不轻。',
              deltas: { healthA: -16, healthB: -2, sanityA: -2, sanityB: -2 } },
        ba: { text: '一人上去堵管，一人撤到里屋。堵管道的人呛得不轻。',
              deltas: { healthA: -2, healthB: -16, sanityA: -2, sanityB: -2 } },
        bb: { text: '你们躲进最里屋用湿布捂住口鼻，硬扛到气味散去。憋闷难忍，但没人受重伤。',
              deltas: { healthA: -6, healthB: -6, sanityA: -8, sanityB: -8 } }
      }
    },
    {
      id: 'trade', type: 'joint',
      title: '隔壁地堡的交易',
      text: '无线电里传来隔壁地堡的声音："我们是三口之家，拿 1 罐头换 3 瓶水，换不换？"',
      options: ['换！', '不换，都是命根子'],
      outcomes: {
        aa: { text: '一拍即合。交易完成：1 罐头换 3 瓶水，还多聊了半小时家常，心里暖了不少。',
              deltas: { food: -1, water: 3, sanityA: 6, sanityB: 6 } },
        ab: { text: '你想换，搭档却不想换——最后折中：只换了 1 瓶水。搭档有点不痛快。',
              deltas: { food: -1, water: 1, sanityA: 2, sanityB: -6 } },
        ba: { text: '你想换，搭档却不想换——最后折中：只换了 1 瓶水。搭档有点不痛快。',
              deltas: { food: -1, water: 1, sanityA: -6, sanityB: 2 } },
        bb: { text: '你们一致决定囤着。夜里听着无线电的杂音，各自盘算着存货。',
              deltas: { sanityA: -3, sanityB: -3 } }
      }
    },
    {
      id: 'funnight', type: 'joint',
      title: '士气之夜',
      text: '晚饭后的地堡格外安静。手边还有点时间——干点什么好？',
      options: ['打扑克吧！', '早点睡攒精神'],
      outcomes: {
        aa: { text: '{cardsText}',
              deltas: {},
              cond: function (s) {
                if (s.items.cards > 0 || s.items.doll > 0) {
                  return { cardsText: '你们借着昏黄的灯打了一晚上扑克，还给旧玩偶起了个名字。笑声在地堡里回荡——今天真不错。', deltas: { sanityA: 12, sanityB: 12 } };
                }
                return { cardsText: '想打扑克才发现一副牌都没抢到……只能用瓶盖玩"猜大小"，居然也笑了出来。', deltas: { sanityA: 6, sanityB: 6 } };
              } },
        ab: { text: '一人洗牌兴致高涨，另一人已经裹紧被子睡了。独乐乐不如众乐乐……吗？',
              deltas: { sanityA: 8, sanityB: 2, healthB: 4 } },
        ba: { text: '一人洗牌兴致高涨，另一人已经裹紧被子睡了。独乐乐不如众乐乐……吗？',
              deltas: { sanityA: 2, sanityB: 8, healthA: 4 } },
        bb: { text: '两人都早早躺下。这一觉睡得又沉又香，醒来感觉伤都好了一半。',
              deltas: { sanityA: 2, sanityB: 2, healthA: 8, healthB: 8 } }
      }
    },
    {
      id: 'noise', type: 'joint',
      title: '天花板上的异响',
      text: '咚……咚……天花板的通风管道里传来沉重的拖拽声，尘土簌簌落下。',
      options: ['架梯子上去查看', '装作没听见'],
      outcomes: {
        aa: { text: '你们在管道尽头发现一个旅行者留下的旧背囊：一罐头、一节电池！还有一张字条："给还活着的人。——L"',
              deltas: { food: 1, sanityA: 6, sanityB: 6 } },
        ab: { text: '一个人爬了上去，摔了一跤，什么也没找到。',
              deltas: { healthA: -10, sanityA: -4, sanityB: -2 } },
        ba: { text: '一个人爬了上去，摔了一跤，什么也没找到。',
              deltas: { healthA: -2, sanityB: -10, sanityA: -2 } },
        bb: { text: '拖拽声持续了一整夜，偶尔还夹着抓挠声。你们谁都没敢闭眼。',
              deltas: { sanityA: -9, sanityB: -9 } }
      }
    }
  ];

  var EVENTS_SINGLE = [
    {
      id: 'ration', type: 'single',
      title: '今日配给',
      text: '肚子开始咕咕叫了。今天的口粮怎么分？',
      options: ['标准份：都吃饱', '省吃俭用：留一半'],
      outcomes: {
        '0': { text: '两人吃了一顿热乎的。罐头见底的速度让人心疼，但精神头回来了。',
               deltas: { food: -2, sanityA: 5, sanityB: 5 } },
        '1': { text: '每人只吃了半份。省下的罐头还在，胃在抗议。',
               deltas: { food: -1, sanityA: -5, sanityB: -5 } }
      }
    },
    {
      id: 'thirst', type: 'single',
      title: '用水难题',
      text: '储水在减少。今天的饮用水按什么标准？',
      options: ['放开喝', '严格配给'],
      outcomes: {
        '0': { text: '喝了个痛快。水在变少，但至少今天嗓子不冒烟。',
               deltas: { water: -2, sanityA: 4, sanityB: 4 } },
        '1': { text: '每人只抿了几口。嘴唇干裂，水表数字变化很小。',
               deltas: { water: -1, sanityA: -5, sanityB: -5 } }
      }
    },
    {
      id: 'scavenge', type: 'single',
      title: '要不要出去一趟',
      text: '地图上标记着一个没被搜过的便利店，离这儿两条街。外面还有辐射尘……',
      options: ['派人快去快回', '太危险，不去'],
      outcomes: {
        '0': { text: '{result}',
               deltas: {},
               roll: [
                 [0.62, { result: '去的人一路猫着腰，从便利店货架底下翻出 2 罐头 2 瓶水！满载而归。', deltas: { food: 2, water: 2, sanityA: 4, sanityB: 4 } }],
                 [0.38, { result: '去的人被巡逻的东西发现了！一路狂奔回来，受了伤，只抢回 1 瓶水。', deltas: { food: 0, water: 1, healthA: -14, sanityA: -8, sanityB: -6 } }]
               ] },
        '1': { text: '谁都没出去。安全是安全，就是看着存货一点点变少，心里发慌。',
               deltas: { sanityA: -3, sanityB: -3 } }
      }
    },
    {
      id: 'rats', type: 'single',
      title: '粮仓里的老鼠',
      text: '半夜储藏室传来窸窸窣窣的声音——两只老鼠正在啃包装袋！',
      options: ['布陷阱灭鼠', '喂点吃的养着吧'],
      outcomes: {
        '0': { text: '陷阱起效，两只老鼠都清掉了。存货安全了，就是收拾现场有点糟心。',
               deltas: { sanityA: 2, sanityB: -2 } },
        '1': { text: '你们给老鼠起了名字，每天喂一点。它们居然会站起来讨吃的……士气涨了，粮食也在悄悄减少。',
               deltas: { food: -1, sanityA: 7, sanityB: 7 } }
      }
    },
    {
      id: 'sick', type: 'single',
      title: '有人发烧了',
      text: '夜里一阵剧烈咳嗽——有人额头滚烫。地堡里没有暖气，药品很有限。',
      options: ['用急救包', '硬扛过去'],
      outcomes: {
        '0': { text: '{result}',
               deltas: {},
               roll: [
                 [0.8, { result: '退烧药起了作用，一夜安睡后烧退了。', deltas: { items: { medkit: -1 }, healthA: 12, healthB: 12 } }],
                 [0.2, { result: '药不够对症，烧时好时坏，但总算没有恶化。', deltas: { items: { medkit: -1 }, healthA: 4, healthB: 4 } }]
               ] },
        '1': { text: '{result}',
               deltas: {},
               roll: [
                 [0.5, { result: '多喝热水加捂汗，居然硬扛过去了。', deltas: { sanityA: 2, sanityB: 2 } }],
                 [0.5, { result: '烧了整整三天，人瘦了一圈，咳到现在还没停。', deltas: { healthA: -14, healthB: -14, sanityA: -6, sanityB: -6 } }]
               ] }
      }
    },
    {
      id: 'radiofix', type: 'single',
      title: '收音机沙沙响',
      text: '角落里的收音机还在响，但信号很弱。有电池的话，也许能听到点什么。',
      options: ['换上新电池', '省着点'],
      outcomes: {
        '0': { text: '{result}',
               deltas: {},
               roll: [
                 [0.55, { result: '杂音退去，一个循环播报的救援广播出现了："幸存者请前往山岗集合点……"两人对视一眼，眼眶有点热。', deltas: { items: { battery: -1 }, sanityA: 12, sanityB: 12 } }],
                 [0.45, { result: '换上电池也只有沙沙声。但不知道为什么，听着这个声音反而没那么孤单。', deltas: { items: { battery: -1 }, sanityA: 4, sanityB: 4 } }]
               ] },
        '1': { text: '电池太金贵了，先省着。收音机被挪回了角落，沙沙声也小了。',
               deltas: { sanityA: -2, sanityB: -2 } }
      }
    }
  ];

  var EVENTS_SKILL = [
    {
      id: 'pipe', type: 'skill',
      title: '水管爆裂！',
      text: '上水管在地堡里炸开了，水哗哗地喷！两人一起狂按扳手抢修——按得越快修得越好！',
      threshold: 22,
      success: { text: '合上了！水止住了，还接了满满两桶。今天的用水不愁！',
                 deltas: { water: 2, sanityA: 4, sanityB: 4 } },
      fail: { text: '手忙脚乱没接住，宝贵的水流了一地……地板滑了三天。',
              deltas: { water: -3, sanityA: -5, sanityB: -5 } }
    },
    {
      id: 'tremor', type: 'skill',
      title: '余震！大门变形',
      text: '余震让铁门框变形卡住了！两个人一起用力撞门——按！按！按！',
      threshold: 20,
      success: { text: '轰——门开了！通风变好了，久违的新鲜空气让每个人都精神一振。',
                 deltas: { sanityA: 8, sanityB: 8, healthA: 2, healthB: 2 } },
      fail: { text: '门卡得更死了。你们在黑暗里又闷又慌，费了一夜才撬开一条缝。',
              deltas: { sanityA: -9, sanityB: -9 } }
    }
  ];

  var EVENTS_AUTO = [
    {
      id: 'raiders', type: 'auto',
      title: '强盗来敲门',
      text: '三个不怀好意的家伙堵在门外，用枪托砸着铁门："把物资交出来！"',
      build: function (s) {
        if (s.items.rifle > 0 && s.items.ammo > 0) {
          return { text: '你们朝天鸣枪示警！对方骂骂咧咧地退散了——临走还慌乱中掉下了一个罐头。枪和弹药是最好的谈判筹码。',
                   deltas: { items: { ammo: -1 }, food: 1, sanityA: 8, sanityB: 8 } };
        }
        if (s.items.rifle > 0) {
          return { text: '你们举起空枪威胁……对方识破了："没子弹了吧？"他们撬走了部分存货。',
                   deltas: { food: -1, water: -1, sanityA: -8, sanityB: -8 } };
        }
        return { text: '赤手空拳抵不过枪托。你们眼睁睁看着他们搬走了一部分存粮。',
                 deltas: { food: -2, sanityA: -10, sanityB: -10 } };
      }
    },
    {
      id: 'blackout', type: 'auto',
      title: '停电之夜',
      text: '电网的电流声消失了——整片区域彻底停电。地堡陷入黑暗。',
      build: function (s) {
        if (s.items.generator > 0) {
          return { text: '发电机轰隆隆地启动了！昏黄的灯泡亮起，你们甚至烧了点热水。有电的地堡就是不一样。',
                   deltas: { sanityA: 10, sanityB: 10, healthA: 2, healthB: 2 } };
        }
        if (s.items.flashlight > 0 || s.items.battery > 0) {
          return { text: '手电和电池撑起了微弱的光。你们挤在一起分一包压缩饼干，黑暗也没那么可怕。',
                   deltas: { items: { battery: -1 }, sanityA: 4, sanityB: 4 } };
        }
        return { text: '一点光源都没有。两个人在绝对的黑暗里听了一夜自己的心跳。',
                 deltas: { sanityA: -10, sanityB: -10 } };
      }
    }
  ];

  // ---------- 每日日程模式（10 天）----------
  // 每天从对应类型池不放回抽取；同天主事件 + 夜间结算
  var DAY_PLAN = [
    'joint', 'single', 'skill', 'joint', 'auto',
    'single', 'joint', 'skill', 'single', 'joint'
  ];

  var TOTAL_DAYS = 10;

  // ---------- 结局 ----------
  var ENDINGS = {
    perfect: {
      title: '结局 S · 山岗上的日出',
      text: '救援队到来那天，你们互相搀扶着走出地堡，阳光下眯了半天眼才睁开。存粮还有富余，两个人还笑得出声。广播里说的"山岗集合点"——你们是第一批到的。'
    },
    good: {
      title: '结局 A · 走出地堡',
      text: '你们活到了最后。走出铁门时身上还带着地堡的霉味，但脚下的土地是真实的。救援队的热汤很烫嘴——真好吃。'
    },
    rough: {
      title: '结局 B · 惨胜',
      text: '救援队挖开地堡时发现只剩一个人还有意识。活下来的那个背靠铁门坐了很久，手里攥着搭档留下的东西。你活下来了。替 TA 看看外面的世界吧。'
    },
    dead: {
      title: '结局 C · 沉默的地堡',
      text: '最后的水滴干在铁皮上。也许很多年后有人会打开这扇门，读到你们留下的字条。你们没能等到日出——但你们坚持到了最后一刻。'
    }
  };

  window.GAME_DATA = {
    ITEMS: ITEMS,
    SCATTER: SCATTER,
    ROOMS: ROOMS,
    BAG_CAP: BAG_CAP,
    SCAV_SECONDS: SCAV_SECONDS,
    EVENTS: {
      joint: EVENTS_JOINT,
      single: EVENTS_SINGLE,
      skill: EVENTS_SKILL,
      auto: EVENTS_AUTO
    },
    DAY_PLAN: DAY_PLAN,
    TOTAL_DAYS: TOTAL_DAYS,
    ENDINGS: ENDINGS,
    NICKNAMES: ['豆豆', '罐罐', '土豆', '萝卜', '辣椒', '泡面', '修勾', '馒头', '花生', '地瓜']
  };
})();
