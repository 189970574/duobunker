// data.js —— 《地堡搭档》全部静态内容：物品、搜刮布点、事件卡、状态、结局
// 全部文案为原创，勿与任何商业游戏内容混用。
(function () {
  'use strict';

  // ---------- 物品 ----------
  // kind: light(占背包格) / heavy(需两人合力搬运，进公共仓库) / special(搜刮彩蛋)
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
    rope:       { name: '绳子',   icon: '🪢', kind: 'light', tag: 'gear' },
    tool:       { name: '工具箱', icon: '🧰', kind: 'light', tag: 'gear' },
    barrel:     { name: '桶装水', icon: '🛢️', kind: 'heavy', tag: 'water' },
    generator:  { name: '汽油发电机', icon: '⚡', kind: 'heavy', tag: 'gear' },
    mystery:    { name: '神秘箱子', icon: '🎁', kind: 'special', tag: 'special' }
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
    { id: 'rope', n: 1, rooms: ['garage'] },
    { id: 'tool', n: 1, rooms: ['garage'] },
    { id: 'barrel', n: 1, rooms: ['kitchen'] },
    { id: 'generator', n: 1, rooms: ['garage'] },
    { id: 'mystery', n: 1, rooms: ['storage'] }
  ];

  var ROOMS = {
    storage: { name: '储藏室', x: 0, y: 0, w: 50, h: 50 },
    kitchen: { name: '厨房',   x: 50, y: 0, w: 50, h: 50 },
    bedroom: { name: '卧室',   x: 0, y: 50, w: 50, h: 50 },
    garage:  { name: '车库',   x: 50, y: 50, w: 50, h: 50 }
  };

  var BAG_CAP = 8;        // 每人背包上限
  var SCAV_SECONDS = 60;  // 搜刮时长

  // ---------- 状态效果 ----------
  // sick 🤒 每晚健康-3 | injured 🤕 每晚健康-5 | inspired ✨ 每晚士气+4
  var STATUS = {
    sick:     { icon: '🤒', name: '生病', perNight: { health: -3 } },
    injured:  { icon: '🤕', name: '受伤', perNight: { health: -5 } },
    inspired: { icon: '✨', name: '鼓舞', perNight: { sanity: 4 } }
  };

  // ---------- 事件卡 ----------
  // type: joint(双方暗选同亮) / single(值班决定) / skill(双人协作挑战) / auto(播报)
  // require(state) 为可选过滤：不满足条件的事件不会刷出
  // deltas 支持 healthD/sanityD（作用在决策者身上）与 statusA/statusB（状态效果，按天）
  // joint outcomes 键：aa/ab/ba/bb（a=选项0，b=选项1；前一位=房主，后一位=队友）
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
        aa: { text: '{cardsText}', deltas: {},
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
    },
    {
      id: 'guest', type: 'joint',
      title: '逃难者投宿',
      text: '一对风尘仆仆的夫妻在门外冻得发抖，想借宿一晚。地堡就那么大。',
      options: ['收留一晚', '婉拒送走'],
      outcomes: {
        aa: { text: '挤是挤了点，但他们临走时留下一份药品，还教了你们一个净水的小窍门。',
              deltas: { items: { medicine: 1 }, water: -1, sanityA: 5, sanityB: 5 } },
        ab: { text: '一个想收留一个不想，最后各让一步：给了半瓶水送他们上路。为这事拌了两句嘴。',
              deltas: { water: -1, sanityA: -3, sanityB: -3 } },
        ba: { text: '一个想收留一个不想，最后各让一步：给了半瓶水送他们上路。为这事拌了两句嘴。',
              deltas: { water: -1, sanityA: -3, sanityB: -3 } },
        bb: { text: '你们把他们送走了。夜里听说东边出了事，后怕之余，又有点说不出的内疚。',
              deltas: { sanityA: -4, sanityB: -4 } }
      }
    },
    {
      id: 'lastfood', type: 'joint',
      title: '最后一份口粮',
      text: '翻遍储物格，只剩最后一份口粮。你们对视了一眼。',
      options: ['让给对方吃', '自己吃'],
      outcomes: {
        aa: { text: '推来推去谁都不肯吃，最后一人一半分掉了。虽然都没吃饱，心里却热乎乎的。',
              deltas: { food: -1, sanityA: 10, sanityB: 10 } },
        ab: { text: '房主把口粮塞给了队友，自己啃了半块压缩饼干。队友吃到一半才反应过来。',
              deltas: { food: -1, healthA: -6, sanityA: 6, healthB: 8, sanityB: 8 } },
        ba: { text: '队友把口粮塞给了你，自己啃了半块压缩饼干。你吃到一半才反应过来。',
              deltas: { food: -1, healthB: -6, sanityB: 6, healthA: 8, sanityA: 8 } },
        bb: { text: '你们默契地一人一半，谁也没说破。胃里空落落的，但至少是公平的。',
              deltas: { food: -2, sanityA: -4, sanityB: -4 } }
      }
    },
    {
      id: 'signal', type: 'joint',
      title: '神秘信号',
      text: '无线电里闪过一段规律的三短一长信号，像是有人在呼叫附近还有什么活人。',
      options: ['回复信号', '保持静默'],
      outcomes: {
        aa: { text: '对方回应了！一个声音报出了几组坐标，然后说："想活命，就记住它。"你们把坐标记在了墙上。',
              deltas: { sanityA: 6, sanityB: 6 }, flags: { l1: true } },
        ab: { text: '房主偷偷回复了信号，听到了几组坐标。这事不好跟不想惹麻烦的搭档开口。',
              deltas: { sanityA: 4, sanityB: -2 }, flags: { l1: true } },
        ba: { text: '队友偷偷回复了信号，听到了几组坐标。这事不好跟不想惹麻烦的房主开口。',
              deltas: { sanityB: 4, sanityA: -2 }, flags: { l1: true } },
        bb: { text: '你们面面相觑，谁都没动那个旋钮。信号消失后，地堡里安静得可怕。',
              deltas: { sanityA: -2, sanityB: -2 } }
      }
    },
    {
      id: 'blackdeal', type: 'joint',
      title: '黑市来客',
      text: '一个戴防毒面具的家伙在门外压低声音喊："收电池，出好货。只做一手交钱一手交货。"',
      options: ['用电池换药', '不跟这种人打交道'],
      require: function (s) { return s.items.radio > 0; },
      outcomes: {
        aa: { text: '一手电池一手药品，交易干脆利落。临走他嘟囔了一句："山岗上见。"什么意思？',
              deltas: { items: { battery: -1, medicine: 1 }, sanityA: 3, sanityB: 3 } },
        ab: { text: '你想换，搭档死活拦着。最后只换了半份：电池没了，药也只拿到一小板。',
              deltas: { items: { battery: -1 }, sanityA: -2, sanityB: -4 } },
        ba: { text: '你想换，搭档死活拦着。最后只换了半份：电池没了，药也只拿到一小板。',
              deltas: { items: { battery: -1 }, sanityB: -2, sanityA: -4 } },
        bb: { text: '你们没开门。脚步声在门外徘徊了很久才离开，那晚谁都没睡踏实。',
              deltas: { sanityA: -3, sanityB: -3 } }
      }
    },
    {
      id: 'guard', type: 'joint',
      title: '谁守夜',
      text: '最近外面不太平，总得有人守夜。你们都清楚这意味着一整夜不合眼。',
      options: ['我守夜', '你守夜'],
      outcomes: {
        aa: { text: '你们抢着守夜，干脆一起守到天亮。第二天两个人都是熊猫眼。',
              deltas: { healthA: -4, healthB: -4, sanityA: -3, sanityB: -3 } },
        ab: { text: '房主裹着毯子守了一夜。队友睡得很沉，天亮时给他留了口热水。',
              deltas: { healthA: -8, sanityA: -4, sanityB: 4 } },
        ba: { text: '队友裹着毯子守了一夜。房主睡得很沉，天亮时给她留了口热水。',
              deltas: { healthB: -8, sanityB: -4, sanityA: 4 } },
        bb: { text: '你们互相推诿，最后一整夜谁都没守。半夜的异响把两人同时惊醒——还好只是风。',
              deltas: { sanityA: -8, sanityB: -8 },
              roll: [[0.25, { text: '半夜真的进了耗子，粮袋被啃破了。', deltas: { sanityA: -8, sanityB: -8, food: -1 } }]] }
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
        '0': { text: '{result}', deltas: {},
               roll: [
                 [0.62, { result: '去的人一路猫着腰，从便利店货架底下翻出 2 罐头 2 瓶水！满载而归。', deltas: { food: 2, water: 2, sanityA: 4, sanityB: 4 } }],
                 [0.38, { result: '去的人被巡逻的东西发现了！一路狂奔回来，受了伤。', deltas: { water: 1, statusD: { injured: 2 }, sanityA: -8, sanityB: -6 } }]
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
        '1': { text: '你们给老鼠起了名字，每天喂一点。它们居然会站起来讨吃的……',
               deltas: { food: -1, sanityA: 7, sanityB: 7 }, flags: { mice: true } }
      }
    },
    {
      id: 'sick', type: 'single',
      title: '有人发烧了',
      text: '夜里一阵剧烈咳嗽——有人额头滚烫。地堡里没有暖气，药品很有限。',
      options: ['用急救包', '硬扛过去'],
      outcomes: {
        '0': { text: '{result}', deltas: {},
               roll: [
                 [0.8, { result: '退烧药起了作用，一夜安睡后烧退了。', deltas: { items: { medkit: -1 }, healthA: 12, healthB: 12 } }],
                 [0.2, { result: '药不够对症，烧时好时坏，但总算没有恶化。', deltas: { items: { medkit: -1 }, healthA: 4, healthB: 4 } }]
               ] },
        '1': { text: '{result}', deltas: {},
               roll: [
                 [0.5, { result: '多喝热水加捂汗，居然硬扛过去了。', deltas: { sanityA: 2, sanityB: 2 } }],
                 [0.5, { result: '烧了整整三天，咳到现在还没停。', deltas: { statusD: { sick: 3 }, sanityA: -6, sanityB: -6 } }]
               ] }
      }
    },
    {
      id: 'radiofix', type: 'single',
      title: '收音机沙沙响',
      text: '角落里的收音机还在响，但信号很弱。有电池的话，也许能听到点什么。',
      options: ['换上新电池', '省着点'],
      outcomes: {
        '0': { text: '{result}', deltas: {},
               roll: [
                 [0.55, { result: '杂音退去，一个循环播报的救援广播出现了："幸存者请前往山岗集合点……"两人对视一眼，眼眶有点热。', deltas: { items: { battery: -1 }, sanityA: 12, sanityB: 12 } }],
                 [0.45, { result: '换上电池也只有沙沙声。但不知道为什么，听着这个声音反而没那么孤单。', deltas: { items: { battery: -1 }, sanityA: 4, sanityB: 4 } }]
               ] },
        '1': { text: '电池太金贵了，先省着。收音机被挪回了角落，沙沙声也小了。',
               deltas: { sanityA: -2, sanityB: -2 } }
      }
    },
    {
      id: 'injury', type: 'single',
      title: '旧伤复发',
      text: '搬物资时拉伤了背，一抽一抽地疼。得处理一下。',
      options: ['用急救包好好处理', '忍忍就过去了'],
      outcomes: {
        '0': { text: '消毒、包扎、固定，一套下来利索多了。药箱又薄了一层，但值。',
               deltas: { items: { medkit: -1 }, healthD: 12, sanityA: 2, sanityB: 2 } },
        '1': { text: '忍了两天，落下了病根，一动就隐隐作痛。',
               deltas: { statusD: { injured: 3 }, sanityA: -3, sanityB: -3 } }
      }
    },
    {
      id: 'boredom', type: 'single',
      title: '无聊透顶',
      text: '物资清点完毕，水桶擦了三遍，连天花板上的裂纹都数清楚了。闲得发慌。',
      options: ['组织个地堡小游戏', '躺平睡觉养精神'],
      outcomes: {
        '0': { text: '{result}', deltas: {},
               cond: function (s) {
                 if (s.items.cards > 0) return { result: '扑克牌又开张了！这次玩的是"输的人洗一周碗"。', deltas: { sanityA: 8, sanityB: 8, healthA: 2, healthB: 2 } };
                 return { result: '没有道具就玩哑谜猜词，两人笑到肚子疼——原来快乐可以这么便宜。', deltas: { sanityA: 6, sanityB: 6, healthA: 2, healthB: 2 } };
               } },
        '1': { text: '躺了一天，精神是足了，就是醒来时更空虚了。',
               deltas: { healthA: 6, healthB: 6, sanityA: -3, sanityB: -3 } }
      }
    },
    {
      id: 'mice2', type: 'single',
      title: '鼠群来袭',
      text: '墙角的窸窣声越来越密——手电一照，一双双小眼睛反着光。',
      options: ['全员总动员灭鼠', '……多摆几个食盆吧'],
      outcomes: {
        '0': { text: '大扫除加陷阱阵，战果辉煌：找回了被偷走的粮食，地堡焕然一新。',
               deltas: { food: 1, sanityA: 2, sanityB: -2 }, flags: { mice: false } },
        '1': { text: '你们正式接纳了这群"室友"。说不上来为什么，看着它们跑来跑去，地堡居然有了点生气。',
               deltas: { food: -1, sanityA: 8, sanityB: 8 }, flags: { mice: true } }
      }
    },
    {
      id: 'grocery', type: 'single',
      title: '天降物资箱',
      text: '一架老式无人机摇摇晃晃地掠过天窗，丢下一个补给箱，砸在前院!',
      options: ['冲出去抢回来', '里面也许是陷阱'],
      outcomes: {
        '0': { text: '{result}', deltas: {},
               roll: [
                 [0.7, { result: '箱子完好！罐头、水，还有一节电池。今天运气爆棚！', deltas: { food: 2, water: 1, items: { battery: 1 }, sanityA: 5, sanityB: 5 } }],
                 [0.3, { result: '去的人被流弹擦伤了手臂，只拖回一个罐头。外面比想象中危险。', deltas: { food: 1, statusD: { injured: 2 }, sanityA: -6, sanityB: -6 } }]
               ] },
        '1': { text: '箱子在前院躺了一整天，谁都没敢去。夜里似乎听见有人把箱子搬走了……',
               deltas: { sanityA: -4, sanityB: -4 } }
      }
    },
    {
      id: 'radiol2', type: 'single',
      title: '紧急广播',
      text: '收音机突然自动响了——一个很轻的女声在念一组数字，语速很快，重复三遍。',
      options: ['全力记下来', '关掉,太诡异了'],
      require: function (s) { return s.items.radio > 0; },
      outcomes: {
        '0': { text: '记下来了！最后一遍时她加了一句："给回过信号的朋友——山岗，日出，带够水。"是那个声音！',
               deltas: { sanityA: 8, sanityB: 8 }, flags: { l2: true } },
        '1': { text: '杂音里的数字让人头皮发麻。关掉之后，两人沉默了很久。',
               deltas: { sanityA: -5, sanityB: -5 } }
      }
    },
    {
      id: 'cook', type: 'single',
      title: '灵感一现',
      text: '罐头、粉料、半包糖——忽然就有了做一顿"真正的饭"的冲动。',
      options: ['做顿好的！', '还是省着吧'],
      outcomes: {
        '0': { text: '黑暗料理卖相一言难尽,但那是十天内第一口"热饭"。两个人吃得干干净净。',
               deltas: { food: -2, sanityA: 10, sanityB: 10, healthA: 4, healthB: 4 } },
        '1': { text: '理智战胜了冲动。但那半包糖在架子上放着，总让人觉得少了点什么。',
               deltas: { food: -1, sanityA: -4, sanityB: -4 } }
      }
    },
    {
      id: 'checkup', type: 'single',
      title: '互查身体',
      text: '地堡里没有医生。你们决定互相检查一遍，看看各自都熬成了什么样。',
      options: ['有药就用上', '都还好,留着药'],
      outcomes: {
        '0': { text: '你一言我一语地诊断：擦伤、咳嗽、失眠……该用药的用药，居然都处理了。',
               deltas: { items: { medicine: -1 }, healthA: 8, healthB: 8, sanityA: 3, sanityB: 3 } },
        '1': { text: '检查结论：除了瘦和黑，四肢齐全。药留着吧——你们互相打气。',
               deltas: { sanityA: 1, sanityB: 1 } }
      }
    },
    {
      id: 'letter', type: 'single',
      title: '写下我们的故事',
      text: '你在废纸上写下今天的日期，忽然很想把这一切记下来——万一有人看到呢。',
      options: ['写下我们的故事', '不留痕迹更安全'],
      outcomes: {
        '0': { text: '写完读了一遍，两个人都笑了。纸条被压在了罐头下面——给未来的谁。',
               deltas: { sanityA: 6, sanityB: 6 }, flags: { letter: true } },
        '1': { text: '纸条揉成团扔了。谨慎是对的，只是心里空了一下。',
               deltas: { sanityA: 1, sanityB: 1 } }
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
    },
    {
      id: 'breath', type: 'skill',
      title: '屏住呼吸！',
      text: '巡逻的"东西"从天窗上方缓缓爬过——两人轮流按住胸口，一丝声音都不能发出！',
      threshold: 18,
      success: { text: '它走了。你们憋到脸通红，但活下来了——还听清了它的去向。',
                 deltas: { sanityA: 10, sanityB: 10 } },
      fail: { text: '一声咳嗽暴露了位置！狂奔回里屋关紧门，心还在狂跳。',
              deltas: { healthA: -10, healthB: -10, sanityA: -8, sanityB: -8 } }
    },
    {
      id: 'handgen', type: 'skill',
      title: '手摇发电机',
      text: '找到一台手摇发电机！两人轮流狂摇，摇满一圈电，今晚就有灯、有热水！',
      threshold: 24,
      success: { text: '灯泡亮了！虽然只亮了一会儿，但那是黑暗里的太阳。还充出了一点电。',
                 deltas: { items: { battery: 1 }, sanityA: 6, sanityB: 6 } },
      fail: { text: '摇到手臂发酸，齿轮卡死了。今晚继续摸黑。',
              deltas: { sanityA: -4, sanityB: -4 } }
    },
    {
      id: 'doorfix', type: 'skill',
      title: '加固大门',
      text: '工具箱里有钉子和木板！两人合力把大门钉成双层——按快一点，钉得更牢！',
      threshold: 16,
      success: { text: '门板厚了一倍，敲上去咚咚作响。今晚能睡个安稳觉了。',
                 deltas: { sanityA: 6, sanityB: 6 }, flags: { fortified: true } },
      fail: { text: '钉子砸歪了三根，木板哐当落地。改天再战吧。',
              deltas: { sanityA: -3, sanityB: -3 } }
    }
  ];

  var EVENTS_AUTO = [
    {
      id: 'raiders', type: 'auto',
      title: '强盗来敲门',
      text: '三个不怀好意的家伙堵在门外，用枪托砸着铁门："把物资交出来！"',
      build: function (s) {
        if (s.flags && s.flags.fortified) {
          return { text: '他们砸了半天门，双层门板纹丝不动，骂骂咧咧地撤了。加固大门的每一颗钉子都值了！',
                   deltas: { sanityA: 8, sanityB: 8 } };
        }
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
    },
    {
      id: 'acidrain', type: 'auto',
      title: '酸雨渗漏',
      text: '雨点打在铁皮顶上，发出腐蚀性的嘶嘶声——接雨水的桶里泛起白沫。',
      build: function (s) {
        if (s.items.mask > 0) {
          return { text: '你们戴着面具把桶都收进来，保住了大半存水。只有一小桶被污染倒掉了。',
                   deltas: { water: -1, sanityA: -2, sanityB: -2 } };
        }
        return { text: '刺鼻的雨气呛进地堡，接的雨水全废了，两人还呛得咳嗽了一夜。',
                 deltas: { water: -2, healthA: -6, healthB: -6, sanityA: -4, sanityB: -4 } };
      }
    },
    {
      id: 'lgift', type: 'auto',
      title: '门口的防水袋',
      text: '清晨，门把手上挂着一个防水袋，袋子上用马克笔写着两个字母："L"。',
      require: function (s) { return !!(s.flags && s.flags.l1); },
      build: function () {
        return { text: '袋子里：一个罐头、一瓶水，还有一行小字——"看到广播就出发。——L"。这个 L 到底是谁？',
                 deltas: { food: 1, water: 1, sanityA: 8, sanityB: 8 }, flags: { lgift: true } };
      }
    },
    {
      id: 'rumor', type: 'auto',
      title: '传闻四起',
      text: '风声穿过管道，呜呜地像在说话。远处隐约传来两声枪响，然后死寂。',
      build: function (s) {
        if (s.items.radio > 0) {
          return { text: '好在有收音机。广播确认了：交火在两条街外。知道发生了什么，就没那么可怕。',
                   deltas: { sanityA: -3, sanityB: -3 } };
        }
        return { text: '什么消息都没有。未知比危险更磨人——两人有一搭没一搭地聊到天亮。',
                 deltas: { sanityA: -6, sanityB: -6 } };
      }
    }
  ];

  // ---------- 每日日程模式（10 天）----------
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
    },
    story: {
      title: '隐藏结局 S+ · 日出的暗号',
      text: '山岗上，日出前最冷的那一刻，有人用三短一长的信号灯向你们打了招呼——是"L"。原来 TA 是来接应的志愿者，从第一天那张字条起就在暗中守护你们。你们不但活到了最后，还带上了一路收集的线索。李说："你们是走得最明白的一对。"'
    },
    miceking: {
      title: '隐藏结局 · 🐭 鼠王万岁',
      text: '救援队冲进地堡时愣住了：一人一鼠和谐共处，那群老鼠列队站在储粮袋上，像一支卫队。据说后来鼠群跟着你们搬了新家，还学会了按铃讨食。谁说末日没有朋友？'
    }
  };

  window.GAME_DATA = {
    ITEMS: ITEMS,
    SCATTER: SCATTER,
    ROOMS: ROOMS,
    BAG_CAP: BAG_CAP,
    SCAV_SECONDS: SCAV_SECONDS,
    STATUS: STATUS,
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
