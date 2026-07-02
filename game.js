// ===== 常數設定 =====
const CANVAS_W = 450;
const CANVAS_H = 800;

// ===== 安全圖片載入系統 =====
// 圖片載入失敗或尚未提供時，遊戲必須維持可玩（fallback 到 Canvas 繪製），
// 因此這裡只 console.warn，絕不 throw。
const assetImages = {};

function loadImage(key, src) {
  const img = new Image();
  img.onload = () => {
    assetImages[key] = img;
  };
  img.onerror = () => {
    console.warn(`[assets] 圖片載入失敗，將使用 Canvas fallback：${key} (${src})`);
  };
  img.src = src;
}

function loadAssets() {
  loadImage("desert_dusk", "assets/backgrounds/desert_dusk.png");
  loadImage("bamboo_moon", "assets/backgrounds/bamboo_moon.png");
  loadImage("ruins_night", "assets/backgrounds/ruins_night.png");
  loadImage("qingfeng_concept", "assets/characters/qingfeng_concept.png");
  loadImage("yexuan_concept", "assets/characters/yexuan_concept.png");
  loadImage("qingfeng", "assets/characters/char_blue_200.png");
  loadImage("yexuan", "assets/characters/char_purple_200.png");
  loadImage("qingfeng_card", "assets/characters/char_blue_400.png");
  loadImage("yexuan_card", "assets/characters/char_purple_400.png");
  loadImage("qingfeng_fx_basic", "assets/characters/fx_red_basic_256.png");
  loadImage("qingfeng_fx_ult", "assets/characters/fx_red_ult_512.png");
  loadImage("yexuan_fx_basic", "assets/characters/fx_purple_basic_256.png");
  loadImage("yexuan_fx_ult", "assets/characters/fx_purple_ult_512.png");
  loadImage("bingyun_concept", "assets/characters/char_white_400.png");
  loadImage("bingyun", "assets/characters/char_white_200.png");
  loadImage("bingyun_card", "assets/characters/char_white_400.png");
  loadImage("bingyun_fx_basic", "assets/characters/fx_blue_basic_256.png");
  loadImage("bingyun_fx_ult", "assets/characters/fx_blue_ult_512.png");
}

const PLAYER_SPEED = 200; // px/秒
const PLAYER_MAX_HP = 150;
const PLAYER_RADIUS = 18;
const PLAYER_IFRAME_MS = 700; // 受擊後無敵幀時長

// 自動攻擊（核心 DPS，自動朝最近敵人發射追蹤彈）
const AUTO_ATK_BASE_INTERVAL = 900; // ms
const AUTO_ATK_BASE_DAMAGE = 8;
const AUTO_ATK_BASE_COUNT = 1;
const AUTO_ATK_SPEED = 320;
const AUTO_ATK_TURN_RATE = 6; // rad/秒
const AUTO_ATK_RADIUS = 7;

// 手動氣功（K，自己按、但會追蹤、較強）
const QI_COOLDOWN = 1400; // ms
const QI_SPEED = 380;
const QI_DAMAGE = 26;
const QI_RADIUS = 9;
const QI_TURN_RATE = 8;

// 掌技（J，限定充能的爆發技，依角色不同造型）
const PALM_NOVA_RADIUS = 220;
const PALM_NOVA_DAMAGE = 30;
const PALM_NOVA_KNOCKBACK = 260;
const PALM_MAX_CHARGES = 2;
const PALM_RECHARGE_MS = 8000;

// 分身術（第二角色掌技替換：漩渦旋轉分身擴散攻擊）
const SPIRAL_COUNT = 8;
const SPIRAL_DURATION = 0.6; // 秒
const SPIRAL_BLADE_RADIUS = 12;
const SPIRAL_SPIN = 9; // rad/秒

const HURT_EFFECT_DURATION = 150; // ms

const ENEMY_RADIUS = 16;
const ENEMY_MAX_HP = 30;
const ENEMY_SPEED = 70;
const ENEMY_TOUCH_DAMAGE = 8;
const ENEMY_KNOCKBACK_RESIST = 0.85;
const KILL_SCORE = 10;

// 敵人變種：較大較慢、血厚的「悍敵」（疊加在任何小怪種類上的獨立強化）
const ENEMY_BRUTE_HP_MULT = 2.4;
const ENEMY_BRUTE_RADIUS_MULT = 1.5;
const ENEMY_BRUTE_SPEED_MULT = 0.55;
const ENEMY_BRUTE_TOUCH_MULT = 1.6;
const ENEMY_BRUTE_SCORE_MULT = 2;

// 關卡制難度：每 STAGE_DURATION_SEC 秒跳一級，離散調整而非連續內插
// 數值曲線改為平滑指數遞增（相鄰關卡跳幅 ~15-22%），避免單一關卡轉換疊加過多難度因子
const STAGE_DURATION_SEC = 45;
const MIN_SPAWN_INTERVAL_MS = 220;
// P15：原曲線血量到第8關達 2.83x 疊加 powerScale 後遠超玩家傷害成長速度，是「打不死」根因之一，
// 故下修血量成長曲線（1.0→2.2，原為1.0→2.83）；出怪間隔曲線不變，靠下方 MAX_ALIVE_ENEMIES 數量上限解決lag。
// P16：第8關為原硬上限，玩家回饋「練滿技能仍卡關」；根因是 getPowerScaleFactor() 同時驅動敵人血量與出怪頻率，
// 玩家練等/練技能反而讓敵人更肉，互相抵銷成長。現已將血量改用獨立的 getEnemyHpScaleFactor()（不受等級/技能影響，
// 只隨時間/關卡緩慢成長），故此處可放心將關卡延伸到 12 關，讓「關卡可推進」且後段敵人仍可被擊殺。
const STAGE_CONFIGS = [
  { spawnInterval: 1400, hpMult: 1.0, bruteChance: 0.0 },
  { spawnInterval: 1100, hpMult: 1.12, bruteChance: 0.1 },
  { spawnInterval: 865, hpMult: 1.26, bruteChance: 0.18 },
  { spawnInterval: 680, hpMult: 1.42, bruteChance: 0.25 },
  { spawnInterval: 534, hpMult: 1.6, bruteChance: 0.32 },
  { spawnInterval: 420, hpMult: 1.8, bruteChance: 0.38 },
  { spawnInterval: 330, hpMult: 2.0, bruteChance: 0.44 },
  { spawnInterval: 260, hpMult: 2.2, bruteChance: 0.5 },
  { spawnInterval: 245, hpMult: 2.4, bruteChance: 0.55 },
  { spawnInterval: 235, hpMult: 2.6, bruteChance: 0.58 },
  { spawnInterval: 225, hpMult: 2.8, bruteChance: 0.6 },
  { spawnInterval: 220, hpMult: 3.0, bruteChance: 0.62 },
];

// 同時存在敵人數上限：超過此數時暫停出怪（既有敵人不會被強制移除），避免後期關卡無限疊加造成嚴重lag
const MAX_ALIVE_ENEMIES = 70;

// 新怪種剛登場時的緩衝（只套用在 volley 身上，避免遠程攻擊一登場就太密集）
const TYPE_FIRST_STAGE = { drifter: 0, skitter: 1, lurker: 2, volley: 3, juggernaut: 4 };
const VOLLEY_INTRO_BUFFER = [1.6, 1.3]; // 登場後頭 2 關的射擊間隔倍率，之後恢復 1x

// 新怪種登場與 boss 生成解耦：該次 stage 轉換若引入新怪種池，延後 boss 生成，讓玩家先適應新怪
const BOSS_INTRO_DELAY_SEC = 12;

// 小怪種類定義：每關場上同時最多 2 種一般小怪（boss／悍敵不計入此上限）
const ENEMY_TYPE_DEFS = {
  drifter: { hpMult: 1, speedMult: 1, touchMult: 1, radiusMult: 1, behavior: "chase" },
  skitter: { hpMult: 0.55, speedMult: 1.6, touchMult: 0.8, radiusMult: 0.8, behavior: "zigzag" },
  lurker: {
    hpMult: 1.3,
    speedMult: 1,
    touchMult: 1.2,
    radiusMult: 1.05,
    behavior: "ambush",
    triggerRadius: 140,
    dashSpeedMult: 2.4,
    warningSec: 0.45,
  },
  volley: {
    hpMult: 0.8,
    speedMult: 0.65,
    touchMult: 0.7,
    radiusMult: 0.95,
    behavior: "kiter",
    keepDistance: 160,
    fireIntervalMs: 1800,
  },
  juggernaut: { hpMult: 2.6, speedMult: 0.45, touchMult: 1.8, radiusMult: 1.4, behavior: "chase" },
};

// 每關出場的一般小怪 pool（最多 2 種，新種類加入時淘汰最舊的一種）
const STAGE_NORMAL_TYPE_POOL = [
  ["drifter"],
  ["drifter", "skitter"],
  ["skitter", "lurker"],
  ["lurker", "volley"],
  ["volley", "juggernaut"],
  ["drifter", "juggernaut"],
  ["skitter", "juggernaut"],
  ["volley", "juggernaut"],
  ["drifter", "lurker"],
  ["skitter", "volley"],
  ["lurker", "juggernaut"],
  ["drifter", "volley"],
];

const ENEMY_VISUALS = {
  drifter: { core: "#ff66cc", mid: "#9b30d9", edge: "#3a0a4d", glow: "#c040ff" },
  skitter: { core: "#9dffb0", mid: "#2fae54", edge: "#0d3a1a", glow: "#3ad66a" },
  lurker: { core: "#ffe48a", mid: "#b8860b", edge: "#3a2a05", glow: "#d9a30a" },
  volley: { core: "#9adcff", mid: "#1f7fae", edge: "#0a2a3a", glow: "#3ad6ff" },
  juggernaut: { core: "#ffaa55", mid: "#d9530a", edge: "#4d1a05", glow: "#ff6a00" },
  boss: { core: "#ffffff", mid: "#ff3344", edge: "#330008", glow: "#ff2244" },
};

// 敵方彈道（遠程小怪 volley 專用）
const ENEMY_PROJECTILE_SPEED = 150;
const ENEMY_PROJECTILE_DAMAGE = 7;
const ENEMY_PROJECTILE_RADIUS = 6;

// Boss 關卡
const BOSS_HP_MULT = 16;
const BOSS_RADIUS = 42;
const BOSS_TOUCH_MULT = 2.0;
const BOSS_SCORE_MULT = 25;
const BOSS_XP_MULT = 20;
const BOSS_DROP_MULT = 10;
const BOSS_ATTACK_INTERVAL_MS = 3200;
const BOSS_SHOCK_RADIUS = 150;
const BOSS_SHOCK_DAMAGE = 18;
const BOSS_REPEAT_INTERVAL_SEC = 90;

// 玩家成長帶動敵人強度：等級、技能總等級、封頂時間項三者相乘
// P15：三項係數下修（原0.06/0.05/0.5），原數值在中後期會把怪物血量再疊乘近5倍，遠超玩家傷害成長，是第6關後打不死的主因
// P16：此係數現只用於「出怪頻率」與「碰撞傷害」（玩家越強，怪越多越快很合理），不再用於敵人血量本身——
// 否則玩家認真練等/練技能，敵人血量會跟著等比變肉，正好抵銷掉玩家自己的傷害成長，這才是「練滿技能仍打不死」的真正結構性原因。
const POWER_LEVEL_RATE = 0.035;
const POWER_SKILL_RATE = 0.03;
const POWER_TIME_CAP_SEC = 600;
const POWER_TIME_MAX_BONUS = 0.3;

// P16：敵人血量改用獨立、較溫和的時間制因子，不受玩家等級/技能投資影響，避免上述回饋迴圈
const ENEMY_HP_TIME_CAP_SEC = 600;
const ENEMY_HP_TIME_MAX_BONUS = 0.5;

// 怪物掉落物（單一通用貨幣，須走過去拾取）
const CURRENCY_DROP_CHANCE = 0.5;
const CURRENCY_DROP_MIN = 1;
const CURRENCY_DROP_MAX = 3;
const CURRENCY_BRUTE_DROP_MULT = 3;
const CURRENCY_ATTRACT_RADIUS = 36;
const CURRENCY_ATTRACT_SPEED = 260;
const CURRENCY_PICKUP_RADIUS = 16;
const VACUUM_PULSE_MS = 1200; // 升級時的一次性大範圍吸附，方便撿拾遠處的永久掉落物
const VACUUM_PULSE_RADIUS = 4000;

// 掌技／氣彈隨玩家等級成長（J/K 維持手動操作，但傷害不再寫死）
const PALM_GROWTH_RATE = 0.08;
const QI_GROWTH_RATE = 0.08;
// P16：自動攻擊（鏢氣連射）原本傷害只靠隨機升級卡「掌心雷」成長，運氣差時完全不成長；
// 補上一個保底的等級成長率（低於掌技/氣彈，因為升級卡仍會額外疊加，避免雙重膨脹）
const AUTO_ATK_GROWTH_RATE = 0.05;

// 技能表（被動）：環身罡氣／破空擲／引氣術／既有自動攻擊
const SKILL_BASE_COST = { orbit: 15, throw: 18, magnet: 12, barrier: 20, vampire: 16, frenzy: 18 };
const SKILL_COST_GROWTH = 1.6;
const ORBIT_BASE_COUNT = 2;
const ORBIT_BASE_DAMAGE = 10;
const ORBIT_RADIUS = 70;
const ORBIT_BLADE_RADIUS = 11;
const ORBIT_SPIN = 2.2; // rad/秒
const ORBIT_SPIN_GROWTH = 0.35; // 滿級（5）≈2.75倍轉速
const ORBIT_HIT_COOLDOWN_MS = 500;
const THROW_BASE_DAMAGE = 16;
const THROW_BASE_INTERVAL_MS = 2200;
const THROW_SPEED = 360;
const THROW_TURN_RATE = 5;
const THROW_RADIUS = 8;
const THROW_BASE_PIERCE = 1;

const BARRIER_INTERVAL_BASE_SEC = 18;
const BARRIER_INTERVAL_PER_LEVEL_SEC = 4; // 等級越高，護盾重新充能越快
const BARRIER_RING_RADIUS = 46;
// P15：原 0.03/flat 1血 幾乎無感（對比maxHp 120-190），改為機率與回復量都隨等級顯著提升並给視覺回饋
const VAMPIRE_CHANCE_PER_LEVEL = 0.12;
const VAMPIRE_HEAL_BASE = 5;
const VAMPIRE_HEAL_PER_LEVEL = 3;
const VAMPIRE_FX_DURATION = 400; // 吸血觸發時角色身上綠色光暈的持續時間（毫秒）
const FRENZY_HP_THRESHOLD = 0.3;
const FRENZY_DMG_PER_LEVEL = 0.15;

// 每個技能對應一個代表色，用於商店列左側色條／點陣，讓玩家能用顏色快速分辨技能性質
const SKILL_COLORS = {
  homing: "#3ad6ff",
  orbit: "#3ad6ff",
  throw: "#ff8a3a",
  magnet: "#7fe8ff",
  barrier: "#ffd84d",
  vampire: "#ff4d6a",
  frenzy: "#c060ff",
};

// 技能上限與可購買性：homing 永遠釘選顯示、不可購買（透過一般升級卡強化）
const SKILL_DEFS = [
  { id: "homing", name: "鏢氣連射", baseDesc: "自動鎖定最近敵人發射氣彈（既有自動攻擊，透過一般升級卡強化）", purchasable: false, maxLevel: 0 },
  { id: "orbit", name: "環身罡氣", baseDesc: "環繞身周持續傷害周圍敵人，等級越高轉速越快", purchasable: true, maxLevel: 5 },
  { id: "throw", name: "破空擲", baseDesc: "定時擲出貫穿武器擊中最近敵人", purchasable: true, maxLevel: 4 },
  { id: "magnet", name: "引氣術", baseDesc: "擴大內力珠的吸引範圍", purchasable: true, maxLevel: 4 },
  { id: "barrier", name: "護體罡氣", baseDesc: "定時獲得一層護盾，吸收一次傷害", purchasable: true, maxLevel: 3 },
  { id: "vampire", name: "吸血掌", baseDesc: "擊殺敵人時有機率回復氣血", purchasable: true, maxLevel: 3 },
  { id: "frenzy", name: "狂狼之力", baseDesc: "氣血低於30%時大幅提升傷害", purchasable: true, maxLevel: 3 },
];

// 每技能 base/perLevel 線性係數，取代統一的 skillScale；未列出者用預設值
const SKILL_TUNING = {
  orbit: { perLevel: 0.36 }, // 滿級（5）≈2.8x 傷害
  throw: { perLevel: 0.4125 }, // 滿級（4）≈2.65x 傷害
};

function skillMult(skillId, level) {
  const tuning = SKILL_TUNING[skillId];
  const perLevel = tuning ? tuning.perLevel : 0.22;
  return 1 + level * perLevel;
}

const XP_BASE_TO_NEXT = 20;
const XP_GROWTH = 1.35;
const KILL_XP = 8;
const LEVEL_UP_HP_BONUS = 5;

const MAX_PARTICLES = 400;

// ===== 角色設定 =====
// statTag：選角卡片上顯示的攻/防/血/閃文字標籤，純UI說明用，數值本身看 baseHp/atkMult/defense/baseDodge
const CHARACTERS = [
  {
    id: "qingfeng",
    name: "青鋒",
    rimColor: "#3ad6ff",
    bodyColor: "#11131c",
    beltColor: "#ffd84d",
    desc: "掌心劈砍擴散　斬擊四周敵人",
    statTag: "均衡型：攻中　防中　血中　閃低",
    baseHp: 150,
    atkMult: 1.0,
    defense: 0,
    baseDodge: 0.04,
    palmAbility: "nova",
    palmName: "霸王斬",
    spriteKey: "qingfeng",
    conceptKey: "qingfeng_concept",
    spriteHeight: 72,
    spriteFacesLeft: true,
    cardSrc: "assets/characters/char_blue_400.png",
    fxBasicKey: "qingfeng_fx_basic",
    fxUltKey: "qingfeng_fx_ult",
  },
  {
    id: "yexuan",
    name: "夜玄",
    rimColor: "#c060ff",
    bodyColor: "#160a1f",
    beltColor: "#ff5fd1",
    desc: "分身術　漩渦擴散攻擊",
    statTag: "敏捷型：攻高　防低　血低　閃高",
    baseHp: 120,
    atkMult: 1.22,
    defense: 0,
    baseDodge: 0.1,
    palmAbility: "spiral",
    palmName: "魅影分身",
    spriteKey: "yexuan",
    conceptKey: "yexuan_concept",
    spriteHeight: 72,
    cardSrc: "assets/characters/char_purple_400.png",
    fxBasicKey: "yexuan_fx_basic",
    fxUltKey: "yexuan_fx_ult",
  },
  {
    id: "bingyun",
    name: "霜凜",
    rimColor: "#7ec8e3",
    bodyColor: "#0d2230",
    beltColor: "#bdf4ff",
    desc: "摺扇開合凝霜　冰晶綻放破敵",
    statTag: "防禦型：攻低　防高　血高　閃低",
    baseHp: 190,
    atkMult: 0.85,
    defense: 4,
    baseDodge: 0.02,
    palmAbility: "frost",
    palmName: "霜華訣",
    spriteKey: "bingyun",
    conceptKey: "bingyun_concept",
    spriteHeight: 72,
    cardSrc: "assets/characters/char_white_400.png",
    fxBasicKey: "bingyun_fx_basic",
    fxUltKey: "bingyun_fx_ult",
  },
];

const QI_VISUAL_PROFILES = {
  qingfeng: {
    visualType: "blade",
    color: "#ffd84d",
    coreColor: "#fff6b0",
    hitColor: "rgba(255,190,68,0.95)",
    length: 112,
    width: 22,
    fx: { from: 0.24, to: 0.88, duration: 170, rotate: 0 },
  },
  yexuan: {
    visualType: "shadow",
    color: "#c060ff",
    coreColor: "#f0c4ff",
    hitColor: "rgba(192,96,255,0.9)",
    length: 104,
    width: 30,
    fx: { from: 0.24, to: 0.95, duration: 220, rotate: 0 },
  },
  bingyun: {
    visualType: "frost",
    color: "#bdf4ff",
    coreColor: "#ffffff",
    hitColor: "rgba(189,244,255,0.92)",
    length: 108,
    width: 34,
    fx: { from: 0.18, to: 0.75, duration: 320, rotate: 0 },
  },
};

// ===== 升級池 =====
const UPGRADE_POOL = [
  {
    id: "dmg",
    name: "掌心雷",
    stat: "攻擊 +30%",
    apply(p) {
      p.atkDamage = Math.round(p.atkDamage * 1.3);
    },
  },
  {
    id: "rate",
    name: "疾風步",
    stat: "攻速 +20%",
    apply(p) {
      p.atkInterval = Math.max(150, Math.round(p.atkInterval * 0.8));
    },
  },
  {
    id: "count",
    name: "璇璣彈",
    stat: "彈數 +1",
    apply(p) {
      p.projCount += 1;
    },
  },
  {
    id: "move",
    name: "輕功",
    stat: "移速 +15%",
    apply(p) {
      p.moveSpeedMult *= 1.15;
      p.speed = PLAYER_SPEED * p.moveSpeedMult;
    },
  },
  {
    id: "hp",
    name: "內力強化",
    stat: "體力 +30",
    apply(p) {
      p.maxHp += 30;
      p.hp = p.maxHp;
    },
  },
  {
    id: "palmCharge",
    name: "霸體",
    stat: "掌技充能 +1",
    apply(p) {
      p.palmMaxCharges += 1;
      p.palmCharges += 1;
    },
  },
  {
    id: "palmRadius",
    name: "罡氣擴散",
    stat: "掌技範圍 +20%",
    apply(p) {
      p.palmRadius = Math.round(p.palmRadius * 1.2);
    },
  },
  {
    id: "pierce",
    name: "貫穿勁",
    stat: "子彈可貫穿 +1 名敵人",
    apply(p) {
      p.pierceCount = (p.pierceCount || 0) + 1;
    },
  },
  {
    id: "dodge",
    name: "幻影步",
    stat: "閃避 +5%",
    apply(p) {
      p.dodgeChance = Math.min(0.35, p.dodgeChance + 0.05);
    },
  },
];

// ===== 全域狀態 =====
const state = {
  started: false,
  characterId: CHARACTERS[0].id,
  player: null,
  enemies: [],
  enemyProjectiles: [],
  projectiles: [],
  particles: [],
  damageTexts: [],
  pickupTexts: [],
  shockwaves: [],
  spirals: [],
  orbiters: [],
  drops: [],
  orbitHitMap: new Map(),
  score: 0,
  kills: 0,
  elapsed: 0,
  stage: 0,
  gameOver: false,
  keys: new Set(),
  lastEnemySpawnTime: 0,
  joystick: { active: false, pointerId: null, knobX: 0, knobY: 0, dx: 0, dy: 0 },
  shake: { time: 0, duration: 0.1, magnitude: 0 },
  upgradeChoices: [],
  pendingLevelUps: 0,
  skillMenuOpen: false,
  bossActive: false,
  bossCyclesSpawned: 0,
  bossRepeatTimer: 0,
  bossSpawnAt: 0,
  skillShopOffers: [],
  skillRerollCount: 0,
  camera: { x: 0, y: 0 },
  bgScrollX: 0,
  bgScrollY: 0,
  dust: [],
  fxOverlays: [],
};

function resetState(characterId) {
  state.characterId = characterId || state.characterId || CHARACTERS[0].id;
  const character = CHARACTERS.find((c) => c.id === state.characterId) || CHARACTERS[0];

  state.player = {
    x: CANVAS_W / 2,
    y: CANVAS_H / 2,
    radius: PLAYER_RADIUS,
    w: 30,
    h: 50,
    facing: 1,
    hp: character.baseHp,
    maxHp: character.baseHp,
    speed: PLAYER_SPEED,
    hurtUntil: 0,
    invulnUntil: 0,
    qiCooldownUntil: 0,
    animTime: 0,
    trailTimer: 0,
    history: [],
    historyTimer: 0,
    moving: false,
    moveDirX: 1,
    moveDirY: 0,
    character,

    level: 1,
    xp: 0,
    xpToNext: XP_BASE_TO_NEXT,
    autoAtkTimer: 0,
    atkMult: character.atkMult,
    atkDamage: Math.round(AUTO_ATK_BASE_DAMAGE * character.atkMult),
    atkInterval: AUTO_ATK_BASE_INTERVAL,
    projCount: AUTO_ATK_BASE_COUNT,
    projSpeed: AUTO_ATK_SPEED,
    moveSpeedMult: 1,
    pierceCount: 0,

    palmCharges: PALM_MAX_CHARGES,
    palmMaxCharges: PALM_MAX_CHARGES,
    palmRechargeTimer: 0,
    palmRadius: PALM_NOVA_RADIUS,

    currency: 0,
    orbitAngle: 0,
    throwTimer: THROW_BASE_INTERVAL_MS,
    vacuumPulseUntil: 0,
    dodgeChance: character.baseDodge,
    defense: character.defense,
    barrierCharge: false,
    barrierTimer: BARRIER_INTERVAL_BASE_SEC,
    blockFlashUntil: 0,
    vampireFxUntil: 0,
    frenzyParticleTimer: 0,
    skills: {
      homing: { unlocked: true, level: 1 },
      orbit: { unlocked: false, level: 0 },
      throw: { unlocked: false, level: 0 },
      magnet: { unlocked: false, level: 0 },
      barrier: { unlocked: false, level: 0 },
      vampire: { unlocked: false, level: 0 },
      frenzy: { unlocked: false, level: 0 },
    },
  };
  state.enemies = [];
  state.enemyProjectiles = [];
  state.projectiles = [];
  state.particles = [];
  state.damageTexts = [];
  state.pickupTexts = [];
  state.shockwaves = [];
  state.spirals = [];
  state.orbiters = [];
  state.drops = [];
  state.orbitHitMap = new Map();
  state.score = 0;
  state.kills = 0;
  state.elapsed = 0;
  state.stage = 0;
  state.gameOver = false;
  state.lastEnemySpawnTime = performance.now();
  state.joystick.active = false;
  state.joystick.pointerId = null;
  state.joystick.knobX = 0;
  state.joystick.knobY = 0;
  state.joystick.dx = 0;
  state.joystick.dy = 0;
  state.shake.time = 0;
  state.upgradeChoices = [];
  state.pendingLevelUps = 0;
  state.skillMenuOpen = false;
  state.bossActive = false;
  state.bossCyclesSpawned = 0;
  state.bossRepeatTimer = 0;
  state.bossSpawnAt = 0;
  state.skillShopOffers = [];
  state.skillRerollCount = 0;
  state.camera.x = state.player.x - CANVAS_W / 2;
  state.camera.y = state.player.y - CANVAS_H / 2;
  state.bgScrollX = state.camera.x;
  state.bgScrollY = state.camera.y;
  state.dust = createDustField(getCurrentScene());

  setBgmVolume(BGM_NORMAL_VOLUME);
  document.getElementById("game-over-screen").classList.add("hidden");
  const cardBox = document.getElementById("level-up-cards");
  cardBox.innerHTML = "";
  cardBox.classList.add("hidden");
  document.getElementById("level-up-backdrop").classList.add("hidden");
  const skillMenu = document.getElementById("skill-menu");
  if (skillMenu) skillMenu.classList.add("hidden");
  updateUI();
}

// ===== 共用工具 =====
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// percent > 0 加亮，percent < 0 加暗，hex 須為 #rrggbb 格式
function shadeColor(hex, percent) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const adjust = (c) => {
    const target = percent > 0 ? 255 : 0;
    return Math.round(c + (target - c) * (Math.abs(percent) / 100));
  };
  return `rgb(${adjust(r)}, ${adjust(g)}, ${adjust(b)})`;
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function circleHit(a, b) {
  return distance(a, b) < a.radius + b.radius;
}

// 唯一的傷害入口：回傳是否真的扣血（false 代表閃避或被護盾吸收），呼叫端依此決定是否觸發受傷反饋
function applyDamage(entity, dmg) {
  if (entity === state.player && Math.random() < entity.dodgeChance) {
    spawnPickupText(entity.x, entity.y - entity.radius - 6, "閃避!", true);
    return false;
  }
  if (entity === state.player && tryAbsorbWithBarrier(entity)) {
    spawnPickupText(entity.x, entity.y - entity.radius - 6, "格擋!", true);
    return false;
  }
  if (entity === state.player && entity.defense > 0) {
    dmg = Math.max(1, dmg - entity.defense);
  }
  entity.hp -= dmg;
  entity.hurtUntil = performance.now() + HURT_EFFECT_DURATION;
  return true;
}

// 護體罡氣：消耗一層護盾吸收本次傷害，並重置充能倒數
function tryAbsorbWithBarrier(entity) {
  if (!entity.barrierCharge) return false;
  entity.barrierCharge = false;
  entity.barrierTimer = getSkillEffect("barrier", "interval");
  entity.blockFlashUntil = performance.now() + 500;
  spawnShockwave(entity.x, entity.y, BARRIER_RING_RADIUS, "#ffd84d");
  spawnExplosion(entity.x, entity.y, "#ffd84d", 12);
  return true;
}

function updateBarrier(dt) {
  const p = state.player;
  const skill = p.skills.barrier;
  if (!skill.unlocked || skill.level <= 0 || p.barrierCharge) return;
  p.barrierTimer -= dt;
  if (p.barrierTimer <= 0) p.barrierCharge = true;
}

function isHurt(entity) {
  return performance.now() < entity.hurtUntil;
}

function findNearestEnemy(x, y, exclude) {
  let best = null;
  let bestDist = Infinity;
  for (const e of state.enemies) {
    if (exclude && exclude.has(e)) continue;
    const d = distance({ x, y }, e);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

// ===== 粒子系統 =====
function spawnParticle(opts) {
  if (state.particles.length >= MAX_PARTICLES) state.particles.shift();
  state.particles.push(opts);
}

function updateParticles(dt) {
  for (const pt of state.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
  }

  state.particles = state.particles.filter((pt) => pt.life > 0);
}

function drawParticles() {
  for (const pt of state.particles) {
    const alpha = Math.max(0, pt.life / pt.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (pt.glow) {
      ctx.shadowColor = pt.color;
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function emitEnemyFlame(e, dt) {
  e.particleTimer -= dt * 1000;
  if (e.particleTimer > 0) return;
  e.particleTimer = 50;

  const angle = Math.random() * Math.PI * 2;
  const color = Math.random() < 0.5 ? "rgba(220,60,200,0.8)" : "rgba(220,40,40,0.8)";
  spawnParticle({
    x: e.x + (Math.random() - 0.5) * e.radius,
    y: e.y + (Math.random() - 0.5) * e.radius,
    vx: Math.cos(angle) * 10,
    vy: Math.sin(angle) * 10 - 20,
    life: 0.4,
    maxLife: 0.4,
    size: 2 + Math.random() * 2,
    color,
    type: "flame",
    glow: false,
  });
}

function emitQiTrail(proj) {
  const isQi = proj.kind === "qi";
  const color = proj.color || (isQi ? "rgba(255,138,58,0.85)" : "rgba(58,214,255,0.7)");
  spawnParticle({
    x: proj.x,
    y: proj.y,
    vx: 0,
    vy: 0,
    life: isQi ? 0.3 : 0.18,
    maxLife: isQi ? 0.3 : 0.18,
    size: isQi ? 4 : 2.5,
    color,
    type: "trail",
    glow: false,
  });
}

function spawnExplosion(x, y, color, count = 14) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 120;
    spawnParticle({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.3 + Math.random() * 0.3,
      maxLife: 0.6,
      size: 2 + Math.random() * 3,
      color,
      type: "explosion",
      glow: true,
    });
  }
}

function spawnQiVisualHitFx(proj, enemy) {
  const color = proj.hitColor || proj.color || "rgba(255,216,77,0.9)";
  if (proj.visualType === "blade") {
    const speed = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy) || 1;
    const nx = proj.vx / speed;
    const ny = proj.vy / speed;
    for (let i = 0; i < 8; i++) {
      const spread = (Math.random() - 0.5) * 1.4;
      const sparkSpeed = 90 + Math.random() * 110;
      spawnParticle({
        x: enemy.x,
        y: enemy.y,
        vx: (nx * 0.6 - ny * spread) * sparkSpeed,
        vy: (ny * 0.6 + nx * spread) * sparkSpeed,
        life: 0.18 + Math.random() * 0.12,
        maxLife: 0.3,
        size: 2 + Math.random() * 2,
        color,
        type: "slashSpark",
        glow: true,
      });
    }
    return;
  }
  if (proj.visualType === "shadow") {
    spawnExplosion(enemy.x, enemy.y, color, 12);
    spawnShockwave(enemy.x, enemy.y, 42, "rgba(120,40,180,0.75)");
    return;
  }
  if (proj.visualType === "frost") {
    spawnExplosion(enemy.x, enemy.y, color, 12);
    spawnShockwave(enemy.x, enemy.y, 36, "#bdf4ff");
    return;
  }
  spawnExplosion(proj.x, proj.y, "rgba(255,216,77,0.9)", 10);
}

function emitPlayerTrail(p, dt) {
  p.trailTimer -= dt * 1000;
  if (p.trailTimer > 0) return;
  p.trailTimer = 80;

  spawnParticle({
    x: p.x - p.facing * 6,
    y: p.y + p.h / 2 - 4,
    vx: 0,
    vy: 0,
    life: 0.25,
    maxLife: 0.25,
    size: 4,
    color: "rgba(58,214,255,0.5)",
    type: "playerTrail",
    glow: false,
  });
}

// 狂狼之力發動中：角色身上持續竄出紫紅狼焰粒子，讓「正在狂暴」這個狀態本身可被看見，而不只是傷害數字變大
function emitFrenzyAura(p, dt) {
  p.frenzyParticleTimer -= dt * 1000;
  if (p.frenzyParticleTimer > 0) return;
  p.frenzyParticleTimer = 60;
  spawnParticle({
    x: p.x + (Math.random() - 0.5) * p.w,
    y: p.y + p.h / 2 - 6,
    vx: (Math.random() - 0.5) * 24,
    vy: -50 - Math.random() * 30,
    life: 0.35 + Math.random() * 0.2,
    maxLife: 0.55,
    size: 3 + Math.random() * 2,
    color: "rgba(192,96,255,0.85)",
    type: "frenzyFlame",
    glow: true,
  });
}

// ===== 傷害飄字 =====
function spawnDamageText(x, y, value) {
  state.damageTexts.push({
    x,
    y: y - 14,
    value,
    life: 0.6,
    maxLife: 0.6,
    vy: -42,
  });
}

function updateDamageTexts(dt) {
  for (const dtxt of state.damageTexts) {
    dtxt.y += dtxt.vy * dt;
    dtxt.life -= dt;
  }
  state.damageTexts = state.damageTexts.filter((dtxt) => dtxt.life > 0);
}

function drawDamageTexts() {
  ctx.save();
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  for (const dtxt of state.damageTexts) {
    const alpha = Math.max(0, dtxt.life / dtxt.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffd84d";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    ctx.fillText(`-${dtxt.value}`, dtxt.x, dtxt.y);
  }
  ctx.restore();
}

// ===== 怪物掉落物（內力珠，須走過去拾取，magnet 技能可擴大吸引半徑） =====
function rollCurrencyDrop(e) {
  const isBoss = e.type === "boss";
  if (!isBoss && Math.random() >= CURRENCY_DROP_CHANCE) return;
  let amount = CURRENCY_DROP_MIN + Math.floor(Math.random() * (CURRENCY_DROP_MAX - CURRENCY_DROP_MIN + 1));
  if (e.isBrute) amount *= CURRENCY_BRUTE_DROP_MULT;
  if (isBoss) amount *= BOSS_DROP_MULT;
  spawnCurrencyDrop(e.x, e.y, amount);
}

function spawnCurrencyDrop(x, y, amount) {
  state.drops.push({ x, y, amount, bobPhase: Math.random() * Math.PI * 2 });
}

function updateDrops(dt) {
  const p = state.player;
  const magnetMult = p.skills.magnet.unlocked ? getSkillEffect("magnet", "radiusMult") : 1;
  const pulsing = performance.now() < p.vacuumPulseUntil;
  const attractRadius = pulsing ? VACUUM_PULSE_RADIUS : CURRENCY_ATTRACT_RADIUS * magnetMult;

  for (const drop of state.drops) {
    drop.bobPhase += dt * 4;
    const dx = p.x - drop.x;
    const dy = p.y - drop.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dist < attractRadius) {
      drop.x += (dx / dist) * CURRENCY_ATTRACT_SPEED * dt;
      drop.y += (dy / dist) * CURRENCY_ATTRACT_SPEED * dt;
    }
  }

  // 掉落物永不過期，只有走過去拾取才會消失
  state.drops = state.drops.filter((drop) => {
    const dist = distance(p, drop);
    if (dist < CURRENCY_PICKUP_RADIUS + p.radius) {
      p.currency += drop.amount;
      spawnPickupText(drop.x, drop.y, drop.amount);
      playPickupSound();
      return false;
    }
    return true;
  });
}

function drawDrops() {
  for (const drop of state.drops) {
    const bob = Math.sin(drop.bobPhase) * 3;
    ctx.save();
    ctx.translate(drop.x, drop.y + bob);
    const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, 8);
    grad.addColorStop(0, "#fff7cc");
    grad.addColorStop(0.6, "#ffd84d");
    grad.addColorStop(1, "#b8860b");
    ctx.fillStyle = grad;
    ctx.shadowColor = "#ffd84d";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function spawnPickupText(x, y, amount, isLabel) {
  state.pickupTexts.push({ x, y: y - 14, amount, isLabel: !!isLabel, isHeal: false, life: 0.5, maxLife: 0.5, vy: -36 });
}

// 回血飄字：綠色 "+X"，與內力珠的金色拾取文字明確區隔，讓吸血效果真正可被看見
function spawnHealText(x, y, amount) {
  state.pickupTexts.push({ x, y: y - 14, amount, isLabel: false, isHeal: true, life: 0.5, maxLife: 0.5, vy: -36 });
}

function updatePickupTexts(dt) {
  for (const t of state.pickupTexts) {
    t.y += t.vy * dt;
    t.life -= dt;
  }
  state.pickupTexts = state.pickupTexts.filter((t) => t.life > 0);
}

function drawPickupTexts() {
  ctx.save();
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  for (const t of state.pickupTexts) {
    const alpha = Math.max(0, t.life / t.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = t.isHeal ? "#3fe080" : t.isLabel ? "#7adfff" : "#ffe48a";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    ctx.fillText(t.isLabel ? t.amount : `+${t.amount}`, t.x, t.y);
  }
  ctx.restore();
}

// 吸血掌觸發：角色身上綠色光暈＋回血飄字，與單純拾取內力珠的金色文字明確區隔
function spawnVampireEffect(p, healAmount) {
  p.vampireFxUntil = performance.now() + VAMPIRE_FX_DURATION;
  spawnExplosion(p.x, p.y - p.h / 2, "#3fe080", 8);
  spawnHealText(p.x, p.y - p.h / 2 - 10, healAmount);
}

// ===== 畫面震動 =====
function triggerShake(duration, magnitude) {
  state.shake.time = duration;
  state.shake.duration = duration;
  state.shake.magnitude = magnitude;
}

// ===== 擴散震波（護體罡氣護盾特效） =====
function spawnShockwave(x, y, maxRadius, color = "#3ad6ff") {
  state.shockwaves.push({ x, y, radius: 10, maxRadius, life: 0.4, maxLife: 0.4, color });
}

function updateShockwaves(dt) {
  for (const s of state.shockwaves) {
    s.life -= dt;
    const t = 1 - Math.max(0, s.life / s.maxLife);
    s.radius = 10 + t * (s.maxRadius - 10);
  }
  state.shockwaves = state.shockwaves.filter((s) => s.life > 0);
}

function drawShockwaves() {
  for (const s of state.shockwaves) {
    const alpha = Math.max(0, s.life / s.maxLife);
    const color = s.color || "#3ad6ff";
    ctx.save();
    ctx.globalAlpha = alpha * 0.8;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ===== 技能特效圖層（普攻／必殺美術特效，疊加於玩家位置） =====
function spawnFxOverlay(x, y, imgKey, fromScale, toScale, durationMs, rotateDeg) {
  if (!imgKey) return;
  state.fxOverlays.push({
    x,
    y,
    imgKey,
    elapsed: 0,
    duration: durationMs,
    fromScale,
    toScale,
    rotateDeg: rotateDeg || 0,
  });
}

function updateFxOverlays(dt) {
  for (const o of state.fxOverlays) {
    o.elapsed += dt * 1000;
  }
  state.fxOverlays = state.fxOverlays.filter((o) => o.elapsed < o.duration);
}

function drawFxOverlays() {
  for (const o of state.fxOverlays) {
    const img = assetImages[o.imgKey];
    if (!img) continue;
    const t = Math.min(1, o.elapsed / o.duration);
    const scale = o.fromScale + (o.toScale - o.fromScale) * t;
    const alpha = Math.sin(t * Math.PI); // 0 -> 1 -> 0
    const angle = o.rotateDeg ? ((t - 0.5) * 2 * o.rotateDeg * Math.PI) / 180 : 0;
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

// ===== 音效系統 =====
let audioCtx = null;

function getAudioCtx() {
  if (audioCtx) return audioCtx;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (err) {
    audioCtx = null;
  }
  return audioCtx;
}

function unlockAudio() {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === "suspended") ctx.resume();
  startBgm();
}

// ===== 背景音樂（Web Audio 排程迴圈，獨立音量、與 SFX 共用 AudioContext） =====
const BGM_NORMAL_VOLUME = 0.5;
const BGM_GAMEOVER_VOLUME = 0.2;
const BGM_TEMPO = 96; // BPM
const BGM_TEMPO_BOSS = 116; // BPM，boss 戰更緊湊
const BGM_SCALE = [196.0, 220.0, 246.94, 293.66, 329.63]; // G 五聲音階
const BGM_PATTERN = [0, 2, 1, 3, 2, 4, 3, 1];
const BGM_PATTERN_BOSS = [4, 3, 4, 1, 3, 0, 3, 2, 4, 2, 1, 3]; // boss 戰更密集緊張的音型

function getBgmStepSec() {
  const tempo = state.bossActive ? BGM_TEMPO_BOSS : BGM_TEMPO;
  return 60 / tempo / 2; // 八分音符
}

function getBgmPattern() {
  return state.bossActive ? BGM_PATTERN_BOSS : BGM_PATTERN;
}

let bgmGain = null;
let bgmNextStepTime = 0;
let bgmStepIndex = 0;
let bgmTimer = null;
let bgmStarted = false;

function ensureBgmGain() {
  const ctx = getAudioCtx();
  if (!ctx) return null;
  if (!bgmGain) {
    bgmGain = ctx.createGain();
    bgmGain.gain.value = BGM_NORMAL_VOLUME;
    bgmGain.connect(ctx.destination);
  }
  return bgmGain;
}

function setBgmVolume(vol) {
  const gain = ensureBgmGain();
  const ctx = getAudioCtx();
  if (!gain || !ctx) return;
  gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.6);
}

function scheduleBgmStep(time) {
  const ctx = getAudioCtx();
  const gain = ensureBgmGain();
  if (!ctx || !gain) return;

  const stepSec = getBgmStepSec();
  const pattern = getBgmPattern();

  if (bgmStepIndex % 4 === 0) {
    const drone = ctx.createOscillator();
    const droneGain = ctx.createGain();
    drone.type = "sine";
    drone.frequency.value = BGM_SCALE[0] / 2;
    droneGain.gain.setValueAtTime(0.001, time);
    droneGain.gain.linearRampToValueAtTime(0.5, time + 0.3);
    droneGain.gain.exponentialRampToValueAtTime(0.001, time + stepSec * 4);
    drone.connect(droneGain);
    droneGain.connect(gain);
    drone.start(time);
    drone.stop(time + stepSec * 4 + 0.05);
  }

  const note = pattern[bgmStepIndex % pattern.length];
  const freq = BGM_SCALE[note];
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  // 撥弦類樂器（古琴/琵琶）的典型包絡：極快起音、快速初段衰減、再接一段較慢的尾音，
  // 取代原本單一線性起音＋單段衰減，讓音色更貼近「彈撥」而非合成器持續音。
  oscGain.gain.setValueAtTime(0.001, time);
  oscGain.gain.linearRampToValueAtTime(0.42, time + 0.006);
  oscGain.gain.exponentialRampToValueAtTime(0.09, time + stepSec * 0.35);
  oscGain.gain.exponentialRampToValueAtTime(0.001, time + stepSec * 0.95);
  osc.connect(oscGain);
  oscGain.connect(gain);
  osc.start(time);
  // 撥弦起音的高頻「指尖」噪音瞬態：極短促，疊加在主音頭部增加顆粒感
  const pluckClick = ctx.createOscillator();
  const pluckGain = ctx.createGain();
  pluckClick.type = "triangle";
  pluckClick.frequency.value = freq * 2.5;
  pluckGain.gain.setValueAtTime(0.12, time);
  pluckGain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
  pluckClick.connect(pluckGain);
  pluckGain.connect(gain);
  pluckClick.start(time);
  pluckClick.stop(time + 0.04);
  osc.stop(time + stepSec);

  bgmStepIndex += 1;
  return stepSec;
}

function bgmSchedulerTick() {
  const ctx = getAudioCtx();
  if (!ctx || !bgmStarted) return;
  while (bgmNextStepTime < ctx.currentTime + 0.15) {
    const stepSec = scheduleBgmStep(bgmNextStepTime);
    bgmNextStepTime += stepSec;
  }
}

function startBgm() {
  const ctx = getAudioCtx();
  if (!ctx || bgmStarted) return;
  bgmStarted = true;
  ensureBgmGain();
  bgmNextStepTime = ctx.currentTime + 0.1;
  bgmStepIndex = 0;
  bgmTimer = setInterval(bgmSchedulerTick, 100);
}

function stopBgm() {
  bgmStarted = false;
  if (bgmTimer) {
    clearInterval(bgmTimer);
    bgmTimer = null;
  }
}

// 所有音效（非 BGM）共用的混音 bus，獨立於 BGM 的 bgmGain，
// 讓兩者音量可分別調整，避免音效灌爆音樂或互搶音量。
const SFX_VOLUME = 0.75;
let sfxGain = null;

function ensureSfxGain() {
  const ctx = getAudioCtx();
  if (!ctx) return null;
  if (!sfxGain) {
    sfxGain = ctx.createGain();
    sfxGain.gain.value = SFX_VOLUME;
    sfxGain.connect(ctx.destination);
  }
  return sfxGain;
}

function playTone({ freq, duration, type = "sine", peak = 0.2, freqEnd }) {
  const ctx = getAudioCtx();
  const out = ensureSfxGain();
  if (!ctx || !out) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (freqEnd) {
    osc.frequency.linearRampToValueAtTime(freqEnd, ctx.currentTime + duration);
  }

  gain.gain.setValueAtTime(peak, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(out);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function playNoiseBurst({ duration, peak = 0.3 }) {
  const ctx = getAudioCtx();
  const out = ensureSfxGain();
  if (!ctx || !out) return;

  const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  noise.connect(gain);
  gain.connect(out);
  noise.start();
  noise.stop(ctx.currentTime + duration);
}

function playPalmSound() {
  // 厚實重低音撞擊：低頻下滑音（衝擊核心）疊加短促噪音（拍擊瞬間）
  playTone({ freq: 150, freqEnd: 45, duration: 0.14, type: "sine", peak: 0.45 });
  playNoiseBurst({ duration: 0.05, peak: 0.3 });
}

function playPalmNovaSound() {
  // 必殺發動：雙層更厚重的次低音衝擊，作為「蓄力／施放」瞬間的提示音
  playTone({ freq: 90, freqEnd: 30, duration: 0.35, type: "sine", peak: 0.55 });
  playTone({ freq: 55, freqEnd: 20, duration: 0.45, type: "sine", peak: 0.4 });
  playNoiseBurst({ duration: 0.12, peak: 0.35 });
}

function playUltHitSound() {
  // 必殺命中：比一般打擊音更沉、更炸裂的衝擊感（boom/shockwave），跟普通 playHitSound 明確區隔
  playTone({ freq: 70, freqEnd: 24, duration: 0.4, type: "sine", peak: 0.6 });
  playTone({ freq: 150, freqEnd: 50, duration: 0.22, type: "triangle", peak: 0.32 });
  playNoiseBurst({ duration: 0.16, peak: 0.42 });
}

function playFrostShatterSound() {
  // 霜凜冰系必殺命中的額外冰晶碎裂高頻層，疊加在 playUltHitSound 之上
  playTone({ freq: 1900, freqEnd: 2800, duration: 0.1, type: "sine", peak: 0.16 });
  playTone({ freq: 2600, freqEnd: 3400, duration: 0.07, type: "triangle", peak: 0.1 });
}

function playQiFireSound() {
  // 氣勁衝散：低頻送出感（沉厚下滑音）疊加短促噪音，避免卡通感的高頻滑音
  playNoiseBurst({ duration: 0.09, peak: 0.22 });
  playTone({ freq: 190, freqEnd: 80, duration: 0.16, type: "sine", peak: 0.32 });
}

function playHitSound() {
  playTone({ freq: 220, freqEnd: 120, duration: 0.09, type: "triangle", peak: 0.3 });
  playNoiseBurst({ duration: 0.05, peak: 0.22 });
}

function playKillSound() {
  // 擊殺反饋：改用低頻下滑音（沉悶終結感）＋短促噪音，與其餘音效同屬一個聲音家族，
  // 取代原本格格不入的單一鋸齒波高頻電子音。
  playTone({ freq: 240, freqEnd: 60, duration: 0.2, type: "triangle", peak: 0.32 });
  playNoiseBurst({ duration: 0.06, peak: 0.24 });
}

function playHurtSound() {
  playNoiseBurst({ duration: 0.12, peak: 0.3 });
  playTone({ freq: 130, freqEnd: 55, duration: 0.12, type: "sine", peak: 0.28 });
}

function playLevelUpSound() {
  const notes = [392, 494, 587, 784];
  notes.forEach((freq, i) => {
    setTimeout(() => playTone({ freq, duration: 0.18, type: "triangle", peak: 0.22 }), i * 70);
  });
}

function playGameOverSound() {
  const notes = [440, 330, 220];
  notes.forEach((freq, i) => {
    setTimeout(() => playTone({ freq, duration: 0.3, type: "triangle", peak: 0.2 }), i * 180);
  });
}

function playPickupSound() {
  playTone({ freq: 660, freqEnd: 880, duration: 0.08, type: "sine", peak: 0.18 });
}

// ===== 升級卡（不暫停、邊玩邊選） =====
function addXp(amount) {
  const p = state.player;
  p.xp += amount;
  while (p.xp >= p.xpToNext) {
    p.xp -= p.xpToNext;
    p.level += 1;
    p.xpToNext = Math.round(XP_BASE_TO_NEXT * Math.pow(XP_GROWTH, p.level - 1));
    p.maxHp += LEVEL_UP_HP_BONUS;
    p.hp = Math.min(p.maxHp, p.hp + LEVEL_UP_HP_BONUS);
    p.vacuumPulseUntil = performance.now() + VACUUM_PULSE_MS;
    state.pendingLevelUps += 1;
    playLevelUpSound();
  }
}

function sampleUpgrades(n) {
  const pool = [...UPGRADE_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

function updateUpgradeQueue() {
  if (state.upgradeChoices.length === 0 && state.pendingLevelUps > 0) {
    state.pendingLevelUps -= 1;
    state.upgradeChoices = sampleUpgrades(3);
    renderUpgradeCards();
  }
}

function renderUpgradeCards() {
  const container = document.getElementById("level-up-cards");
  container.innerHTML = "";
  state.upgradeChoices.forEach((choice, i) => {
    const card = document.createElement("button");
    card.className = "upgrade-card";
    card.innerHTML = `<span class="upgrade-key">${i + 1}</span><span class="upgrade-text"><span class="upgrade-name">${choice.name}</span><span class="upgrade-stat">${choice.stat}</span></span>`;
    card.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      selectUpgrade(i);
    });
    container.appendChild(card);
  });
  container.classList.remove("hidden");
  document.getElementById("level-up-backdrop").classList.remove("hidden");
}

function selectUpgrade(i) {
  const choice = state.upgradeChoices[i];
  if (!choice) return;
  choice.apply(state.player);
  state.upgradeChoices = [];
  const container = document.getElementById("level-up-cards");
  container.innerHTML = "";
  container.classList.add("hidden");
  document.getElementById("level-up-backdrop").classList.add("hidden");
}

// ===== 技能表（可暫停，花費怪物掉落物升級被動技能） =====
function getSkillEffect(skillId, field) {
  const skill = state.player.skills[skillId];
  const level = skill ? skill.level : 0;
  if (skillId === "orbit") {
    if (field === "count") return ORBIT_BASE_COUNT + Math.floor(level / 2);
    if (field === "damage") return Math.round(ORBIT_BASE_DAMAGE * skillMult("orbit", level));
    if (field === "spin") return ORBIT_SPIN * (1 + level * ORBIT_SPIN_GROWTH);
  }
  if (skillId === "throw") {
    if (field === "damage") return Math.round(THROW_BASE_DAMAGE * skillMult("throw", level));
    if (field === "interval") return Math.max(400, Math.round(THROW_BASE_INTERVAL_MS / skillMult("throw", level)));
  }
  if (skillId === "magnet") {
    if (field === "radiusMult") return 1 + level * 0.8;
  }
  if (skillId === "barrier") {
    if (field === "interval") return Math.max(6, BARRIER_INTERVAL_BASE_SEC - level * BARRIER_INTERVAL_PER_LEVEL_SEC);
  }
  return 0;
}

function getSkillUpgradeCost(skillId, level) {
  const base = SKILL_BASE_COST[skillId] || 10;
  return Math.round(base * Math.pow(SKILL_COST_GROWTH, level));
}

function getSkillDef(skillId) {
  return SKILL_DEFS.find((d) => d.id === skillId);
}

function trySkillUpgrade(skillId) {
  const skill = state.player.skills[skillId];
  const def = getSkillDef(skillId);
  if (!skill || !def || !def.purchasable) return;
  if (skill.level >= def.maxLevel) return;
  const cost = getSkillUpgradeCost(skillId, skill.level);
  if (state.player.currency < cost) return;
  const p = state.player;
  p.currency -= cost;
  skill.level += 1;
  skill.unlocked = true;
  if (skillId === "barrier") {
    p.barrierTimer = getSkillEffect("barrier", "interval");
  }
  playLevelUpSound();
  renderSkillMenu();
  updateUI();
}

// 隨機顯示一批（4個）可購買技能；已滿級者排除，不足4個則退回全池
const SKILL_SHOP_OFFER_COUNT = 3; // P15：4 -> 3，玩家反饋每次選項太多反而稀釋對單一技能的印象

function rollSkillShopOffers() {
  let pool = SKILL_DEFS.filter((d) => d.purchasable && state.player.skills[d.id].level < d.maxLevel);
  if (pool.length < SKILL_SHOP_OFFER_COUNT) pool = SKILL_DEFS.filter((d) => d.purchasable);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  state.skillShopOffers = shuffled.slice(0, SKILL_SHOP_OFFER_COUNT).map((d) => d.id);
}

function getSkillRerollCost() {
  return Math.round(20 * Math.pow(1.5, state.skillRerollCount));
}

function trySkillReroll() {
  const cost = getSkillRerollCost();
  if (state.player.currency < cost) return;
  state.player.currency -= cost;
  state.skillRerollCount += 1;
  rollSkillShopOffers();
  renderSkillMenu();
}

function toggleSkillMenu() {
  if (!state.started || state.gameOver) return;
  state.skillMenuOpen = !state.skillMenuOpen;
  const menu = document.getElementById("skill-menu");
  if (state.skillMenuOpen) {
    if (state.skillShopOffers.length === 0) rollSkillShopOffers();
    renderSkillMenu();
    menu.classList.remove("hidden");
  } else {
    menu.classList.add("hidden");
  }
}

function buildSkillPipRow(level, maxLevel) {
  const pipRow = document.createElement("span");
  pipRow.className = "skill-pip-row";
  for (let i = 0; i < maxLevel; i++) {
    const pip = document.createElement("span");
    pip.className = "skill-pip";
    if (i < level) pip.classList.add("filled");
    pipRow.appendChild(pip);
  }
  return pipRow;
}

function buildSkillRow(def) {
  const skill = state.player.skills[def.id];
  const accent = SKILL_COLORS[def.id] || "#3ad6ff";
  const row = document.createElement("div");
  row.className = "skill-row";
  row.style.setProperty("--accent", accent);
  if (!def.purchasable) {
    row.innerHTML = `<span class="skill-name">${def.name}</span><span class="skill-desc">${def.baseDesc}</span>`;
    return row;
  }
  const maxed = skill.level >= def.maxLevel;
  const header = document.createElement("span");
  header.className = "skill-name";
  header.textContent = def.name;
  if (skill.unlocked) {
    header.appendChild(buildSkillPipRow(skill.level, def.maxLevel));
  } else {
    const lockedText = document.createElement("span");
    lockedText.className = "skill-level";
    lockedText.textContent = `未習得 (上限 Lv.${def.maxLevel})`;
    header.appendChild(lockedText);
  }
  row.appendChild(header);
  const desc = document.createElement("span");
  desc.className = "skill-desc";
  desc.textContent = def.baseDesc;
  row.appendChild(desc);
  if (maxed) {
    const badge = document.createElement("span");
    badge.className = "skill-maxed-badge";
    badge.textContent = "已滿級";
    row.appendChild(badge);
  } else {
    const cost = getSkillUpgradeCost(def.id, skill.level);
    const btn = document.createElement("button");
    btn.className = "skill-buy-btn";
    btn.textContent = `花費 ${cost}`;
    btn.disabled = state.player.currency < cost;
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      trySkillUpgrade(def.id);
    });
    row.appendChild(btn);
  }
  return row;
}

function renderSkillMenu() {
  document.getElementById("skill-menu-currency").textContent = `內力珠: ${state.player.currency}`;
  const list = document.getElementById("skill-menu-list");
  list.innerHTML = "";
  list.appendChild(buildSkillRow(getSkillDef("homing")));
  state.skillShopOffers.forEach((id) => list.appendChild(buildSkillRow(getSkillDef(id))));

  const rerollBtn = document.getElementById("skill-reroll-btn");
  if (rerollBtn) {
    const rerollCost = getSkillRerollCost();
    rerollBtn.textContent = `刷新技能 (花費 ${rerollCost})`;
    rerollBtn.disabled = state.player.currency < rerollCost;
    rerollBtn.onpointerdown = (e) => {
      e.preventDefault();
      trySkillReroll();
    };
  }
}

// ===== 輸入處理 =====
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  state.keys.add(k);

  if (!state.started) return;

  if (state.gameOver) {
    if (k === "r") resetAndStart();
    return;
  }

  if (k === "p") {
    toggleSkillMenu();
    return;
  }
  if (k === "escape") {
    if (state.skillMenuOpen) toggleSkillMenu();
    return;
  }
  if (state.skillMenuOpen) return;

  if (state.upgradeChoices.length > 0 && (k === "1" || k === "2" || k === "3")) {
    selectUpgrade(Number(k) - 1);
    return;
  }

  if (k === "j") tryPalmAttack();
  if (k === "k") tryQiAttack();
});

window.addEventListener("keyup", (e) => {
  state.keys.delete(e.key.toLowerCase());
});

// ===== 玩家邏輯 =====
function updatePlayer(dt) {
  const p = state.player;
  let dx = 0;
  let dy = 0;

  if (state.joystick.active) {
    // 搖桿類比輸入：方向與速度（拉桿距離）皆由搖桿向量決定
    dx = state.joystick.dx;
    dy = state.joystick.dy;
  } else {
    if (state.keys.has("w")) dy -= 1;
    if (state.keys.has("s")) dy += 1;
    if (state.keys.has("a")) dx -= 1;
    if (state.keys.has("d")) dx += 1;
  }

  const len = Math.sqrt(dx * dx + dy * dy);
  const moving = len > 0.001;

  if (moving) {
    let nx = dx;
    let ny = dy;
    let mag = len;
    if (!state.joystick.active) {
      // 數位按鍵輸入：方向正規化，全速移動
      nx = dx / len;
      ny = dy / len;
      mag = 1;
    }
    p.x += nx * p.speed * mag * dt;
    p.y += ny * p.speed * mag * dt;
    if (nx > 0.05) p.facing = 1;
    else if (nx < -0.05) p.facing = -1;
    p.moveDirX = nx;
    p.moveDirY = ny;
  }

  p.animTime += dt;
  p.moving = moving;

  if (moving) {
    emitPlayerTrail(p, dt);
    p.historyTimer -= dt * 1000;
    if (p.historyTimer <= 0) {
      p.historyTimer = 40;
      p.history.push({ x: p.x, y: p.y, facing: p.facing, animTime: p.animTime });
      if (p.history.length > 4) p.history.shift();
    }
  } else {
    p.history.length = 0;
  }

  if (getEnrageMult(p) > 1) {
    emitFrenzyAura(p, dt);
  }

  updateCamera();
}

// 攝影機鎖定置中於玩家：固定視角的雙搖桿式遊戲，不需要 lerp 平滑
function updateCamera() {
  const p = state.player;
  state.camera.x = p.x - CANVAS_W / 2;
  state.camera.y = p.y - CANVAS_H / 2;
  // 背景捲動座標只在玩家實際移動（按 WASD／搖桿）時才跟著攝影機前進，
  // 停下時凍結在原位，讓「畫面在動」的回饋只跟真實移動掛勾。
  if (p.moving) {
    state.bgScrollX = state.camera.x;
    state.bgScrollY = state.camera.y;
  }
}

// 判斷世界座標是否落在目前可視範圍（含 margin）內，取代固定的螢幕座標範圍判斷
function isInExpandedViewport(x, y, margin) {
  return (
    x > state.camera.x - margin &&
    x < state.camera.x + CANVAS_W + margin &&
    y > state.camera.y - margin &&
    y < state.camera.y + CANVAS_H + margin
  );
}

// 發射一批追蹤彈（自動攻擊與手動氣功皆共用）
function fireHomingVolley(p, target, count, damage, speed, turnRate, radius, kind, opts = {}) {
  const baseAngle = Math.atan2(target.y - p.y, target.x - p.x);
  const spread = 0.25;
  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
    const angle = baseAngle + offset;
    state.projectiles.push({
      x: p.x,
      y: p.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
      damage,
      homing: true,
      turnRate,
      target,
      kind,
      color: opts.color,
      imgKey: opts.imgKey,
      visualType: opts.visualType,
      length: opts.length,
      width: opts.width,
      coreColor: opts.coreColor,
      hitColor: opts.hitColor,
      pierceRemaining: p.pierceCount || 0,
      hitSet: new Set(),
    });
  }
}

function spawnAutoFireBurst(p, angle, color) {
  for (let i = 0; i < 4; i++) {
    const spread = (Math.random() - 0.5) * 0.5;
    const a = angle + spread;
    const speed = 60 + Math.random() * 60;
    spawnParticle({
      x: p.x,
      y: p.y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 0.12,
      maxLife: 0.12,
      size: 1.5 + Math.random() * 1.5,
      color: color || "rgba(255,138,58,0.9)",
      type: "muzzle",
      glow: true,
    });
  }
}

function updateAutoAttack(dt) {
  const p = state.player;
  if (!p.skills.homing.unlocked) return;
  p.autoAtkTimer -= dt * 1000;
  if (p.autoAtkTimer > 0) return;

  const target = findNearestEnemy(p.x, p.y);
  if (!target) {
    p.autoAtkTimer = 60; // 場上無敵人時稍後再檢查，不浪費攻速
    return;
  }

  p.autoAtkTimer = p.atkInterval;
  const character = p.character || CHARACTERS[0];
  spawnAutoFireBurst(p, Math.atan2(target.y - p.y, target.x - p.x), character.rimColor);
  // P16：保底等級成長，疊在原本看運氣的升級卡（掌心雷）之上，避免運氣差時主攻擊完全不成長
  const damage = Math.round(p.atkDamage * (1 + (p.level - 1) * AUTO_ATK_GROWTH_RATE) * getEnrageMult(p));
  fireHomingVolley(p, target, p.projCount, damage, p.projSpeed, AUTO_ATK_TURN_RATE, AUTO_ATK_RADIUS, "homing", { color: character.rimColor });
}

// 吸血掌：擊殺敵人時有機率回復氣血，觸發時在角色身上噴出吸血特效＋綠色回復飄字，讓效果真正可被感知
function tryVampireHeal() {
  const p = state.player;
  const skill = p.skills.vampire;
  if (!skill.unlocked || skill.level <= 0) return;
  if (Math.random() < skill.level * VAMPIRE_CHANCE_PER_LEVEL) {
    const healAmount = VAMPIRE_HEAL_BASE + skill.level * VAMPIRE_HEAL_PER_LEVEL;
    const healed = Math.min(p.maxHp - p.hp, healAmount);
    if (healed <= 0) return;
    p.hp += healed;
    spawnVampireEffect(p, healed);
  }
}

// 狂狼之力：氣血低於門檔時提升掌技／氣彈／自動攻擊傷害
function getEnrageMult(p) {
  const skill = p.skills.frenzy;
  if (!skill.unlocked || skill.level <= 0) return 1;
  if (p.hp / p.maxHp >= FRENZY_HP_THRESHOLD) return 1;
  return 1 + skill.level * FRENZY_DMG_PER_LEVEL;
}

function getQiDamage() {
  const p = state.player;
  return Math.round(QI_DAMAGE * (1 + (p.level - 1) * QI_GROWTH_RATE) * getEnrageMult(p) * p.atkMult);
}

function getQiVisualProfile(character) {
  return QI_VISUAL_PROFILES[character.id] || QI_VISUAL_PROFILES.qingfeng;
}

function buildQiVisualOptions(character) {
  const profile = getQiVisualProfile(character);
  return {
    imgKey: character.fxBasicKey,
    visualType: profile.visualType,
    length: profile.length,
    width: profile.width,
    color: profile.color,
    coreColor: profile.coreColor,
    hitColor: profile.hitColor,
  };
}

function tryQiAttack() {
  const p = state.player;
  const now = performance.now();
  if (now < p.qiCooldownUntil) return;
  p.qiCooldownUntil = now + QI_COOLDOWN;
  playQiFireSound();

  const character = p.character || CHARACTERS[0];
  const visual = getQiVisualProfile(character);
  const visualOptions = buildQiVisualOptions(character);
  // 出手瞬間的光影擴散僅作為發射閃光，飛行中的視覺改由 drawProjectile 接手
  spawnFxOverlay(p.x, p.y, character.fxBasicKey, visual.fx.from, visual.fx.to, visual.fx.duration, visual.fx.rotate);

  const damage = getQiDamage();
  const target = findNearestEnemy(p.x, p.y);
  if (target) {
    fireHomingVolley(p, target, 1, damage, QI_SPEED, QI_TURN_RATE, QI_RADIUS, "qi", visualOptions);
  } else {
    state.projectiles.push({
      x: p.x + p.facing * (p.w / 2),
      y: p.y,
      vx: p.facing * QI_SPEED,
      vy: 0,
      radius: QI_RADIUS,
      damage,
      homing: false,
      kind: "qi",
      ...visualOptions,
      pierceRemaining: p.pierceCount || 0,
      hitSet: new Set(),
    });
  }
}

function tryPalmAttack() {
  const p = state.player;
  if (p.palmCharges <= 0) return;
  p.palmCharges -= 1;

  const character = p.character || CHARACTERS[0];
  spawnFxOverlay(p.x, p.y, character.fxUltKey, 0.5, 1.5, 800, 15);
  clearNearbyEnemyProjectiles(p, p.palmRadius);

  const ability = p.character && p.character.palmAbility;
  if (ability === "spiral") {
    palmSpiral(p);
  } else if (ability === "frost") {
    palmFrost(p);
  } else {
    palmNova(p);
  }
}

function getPalmDamage() {
  const p = state.player;
  return Math.round(PALM_NOVA_DAMAGE * (1 + (p.level - 1) * PALM_GROWTH_RATE) * getEnrageMult(p) * p.atkMult);
}

function getSpiralBladeDamage() {
  return Math.round(getPalmDamage() * 0.6);
}

function palmNova(p) {
  triggerShake(0.25, 14);
  playPalmNovaSound();

  const damage = getPalmDamage();
  let hitAny = false;
  for (const enemy of state.enemies) {
    const d = distance(p, enemy);
    if (d < p.palmRadius + enemy.radius) {
      applyDamage(enemy, damage);
      spawnDamageText(enemy.x, enemy.y - enemy.radius, damage);
      const ang = Math.atan2(enemy.y - p.y, enemy.x - p.x) || 0;
      enemy.knockVx = Math.cos(ang) * PALM_NOVA_KNOCKBACK;
      enemy.knockVy = Math.sin(ang) * PALM_NOVA_KNOCKBACK;
      enemy.knockUntil = performance.now() + 300;
      hitAny = true;
    }
  }
  if (hitAny) playUltHitSound();
}

function palmFrost(p) {
  triggerShake(0.25, 14);
  playPalmNovaSound();
  spawnExplosion(p.x, p.y, "#eafcff", 10);
  spawnExplosion(p.x, p.y, "#7fe8ff", 22);
  spawnShockwave(p.x, p.y, p.palmRadius, "#bdf4ff");

  const damage = getPalmDamage();
  let hitAny = false;
  for (const enemy of state.enemies) {
    const d = distance(p, enemy);
    if (d < p.palmRadius + enemy.radius) {
      applyDamage(enemy, damage);
      spawnDamageText(enemy.x, enemy.y - enemy.radius, damage);
      const ang = Math.atan2(enemy.y - p.y, enemy.x - p.x) || 0;
      enemy.knockVx = Math.cos(ang) * PALM_NOVA_KNOCKBACK;
      enemy.knockVy = Math.sin(ang) * PALM_NOVA_KNOCKBACK;
      enemy.knockUntil = performance.now() + 300;
      hitAny = true;
    }
  }
  if (hitAny) {
    playUltHitSound();
    playFrostShatterSound();
  }
}

function palmSpiral(p) {
  triggerShake(0.2, 10);
  playPalmNovaSound();

  for (let i = 0; i < SPIRAL_COUNT; i++) {
    state.spirals.push({
      x: p.x,
      y: p.y,
      angle: (Math.PI * 2 * i) / SPIRAL_COUNT,
      radius: 10,
      life: SPIRAL_DURATION,
      maxLife: SPIRAL_DURATION,
      hitSet: new Set(),
    });
  }
}

function updateSpirals(dt) {
  const p = state.player;
  const damage = getSpiralBladeDamage();
  for (const s of state.spirals) {
    s.life -= dt;
    const t = 1 - Math.max(0, s.life / s.maxLife);
    s.angle += SPIRAL_SPIN * dt;
    s.radius = 10 + t * (p.palmRadius - 10);
    s.x = p.x + Math.cos(s.angle) * s.radius;
    s.y = p.y + Math.sin(s.angle) * s.radius;

    for (const enemy of state.enemies) {
      if (s.hitSet.has(enemy) || enemy.hp <= 0) continue;
      if (distance(s, enemy) < SPIRAL_BLADE_RADIUS + enemy.radius) {
        applyDamage(enemy, damage);
        spawnDamageText(enemy.x, enemy.y - enemy.radius, damage);
        const ang = Math.atan2(enemy.y - p.y, enemy.x - p.x) || 0;
        enemy.knockVx = Math.cos(ang) * (PALM_NOVA_KNOCKBACK * 0.6);
        enemy.knockVy = Math.sin(ang) * (PALM_NOVA_KNOCKBACK * 0.6);
        enemy.knockUntil = performance.now() + 250;
        s.hitSet.add(enemy);
        playHitSound();
      }
    }
  }
  state.spirals = state.spirals.filter((s) => s.life > 0);
}

function updatePalmRecharge(dt) {
  const p = state.player;
  if (p.palmCharges >= p.palmMaxCharges) {
    p.palmRechargeTimer = 0;
    return;
  }
  p.palmRechargeTimer += dt * 1000;
  if (p.palmRechargeTimer >= PALM_RECHARGE_MS) {
    p.palmRechargeTimer = 0;
    p.palmCharges += 1;
  }
}

// ===== 被動技能：環身罡氣（環繞）／破空擲（投擲） =====
function updateOrbiters(dt) {
  const p = state.player;
  if (!p.skills.orbit.unlocked) {
    state.orbiters = [];
    return;
  }
  const count = getSkillEffect("orbit", "count");
  if (state.orbiters.length !== count) {
    state.orbiters = Array.from({ length: count }, (_, i) => ({
      angleOffset: (Math.PI * 2 * i) / count,
      x: p.x,
      y: p.y,
    }));
  }
  p.orbitAngle += getSkillEffect("orbit", "spin") * dt;
  for (const blade of state.orbiters) {
    blade.x = p.x + Math.cos(p.orbitAngle + blade.angleOffset) * ORBIT_RADIUS;
    blade.y = p.y + Math.sin(p.orbitAngle + blade.angleOffset) * ORBIT_RADIUS;
  }

  const damage = getSkillEffect("orbit", "damage");
  const now = performance.now();
  for (const enemy of state.enemies) {
    const lastHit = state.orbitHitMap.get(enemy) || 0;
    if (now - lastHit < ORBIT_HIT_COOLDOWN_MS) continue;
    for (const blade of state.orbiters) {
      if (distance(blade, enemy) < ORBIT_BLADE_RADIUS + enemy.radius) {
        applyDamage(enemy, damage);
        spawnDamageText(enemy.x, enemy.y - enemy.radius, damage);
        state.orbitHitMap.set(enemy, now);
        playHitSound();
        break;
      }
    }
  }
}

function drawOrbiters() {
  for (const blade of state.orbiters) {
    ctx.save();
    ctx.translate(blade.x, blade.y);
    ctx.fillStyle = "#ffd84d";
    ctx.shadowColor = "#ff8a3a";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, ORBIT_BLADE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function updateThrowSkill(dt) {
  const p = state.player;
  if (!p.skills.throw.unlocked) return;
  p.throwTimer -= dt * 1000;
  if (p.throwTimer > 0) return;

  const target = findNearestEnemy(p.x, p.y);
  if (!target) {
    p.throwTimer = 100; // 場上無敵人時稍後再檢查
    return;
  }
  p.throwTimer = getSkillEffect("throw", "interval");
  const damage = getSkillEffect("throw", "damage");
  fireHomingVolley(p, target, 1, damage, THROW_SPEED, THROW_TURN_RATE, THROW_RADIUS, "throw");
  state.projectiles[state.projectiles.length - 1].pierceRemaining += THROW_BASE_PIERCE;
}

// ===== 敵人邏輯 =====
// 玩家成長帶動敵人強度：等級、技能總等級、封頂時間項三者相乘
function getPowerScaleFactor() {
  const p = state.player;
  let skillLevelSum = 0;
  for (const id in p.skills) skillLevelSum += p.skills[id].level;
  const levelFactor = 1 + (p.level - 1) * POWER_LEVEL_RATE;
  const skillFactor = 1 + skillLevelSum * POWER_SKILL_RATE;
  const timeFactor =
    1 + (Math.min(state.elapsed, POWER_TIME_CAP_SEC) / POWER_TIME_CAP_SEC) * POWER_TIME_MAX_BONUS;
  return levelFactor * skillFactor * timeFactor;
}

// P16：敵人血量專用，只隨時間緩慢成長，刻意不受玩家等級/技能影響，避免「越練越打不死」的回饋迴圈
function getEnemyHpScaleFactor() {
  return (
    1 + (Math.min(state.elapsed, ENEMY_HP_TIME_CAP_SEC) / ENEMY_HP_TIME_CAP_SEC) * ENEMY_HP_TIME_MAX_BONUS
  );
}

// 相對攝影機可視範圍邊緣取點（世界座標），取代原本固定的 [0,CANVAS_W]x[0,CANVAS_H]
function pickSpawnEdgePoint(margin) {
  const cx = state.camera.x;
  const cy = state.camera.y;
  const side = Math.floor(Math.random() * 4); // 0 上 1 右 2 下 3 左
  if (side === 0) return { x: cx + Math.random() * CANVAS_W, y: cy - margin };
  if (side === 1) return { x: cx + CANVAS_W + margin, y: cy + Math.random() * CANVAS_H };
  if (side === 2) return { x: cx + Math.random() * CANVAS_W, y: cy + CANVAS_H + margin };
  return { x: cx - margin, y: cy + Math.random() * CANVAS_H };
}

function spawnEnemy() {
  const { x, y } = pickSpawnEdgePoint(40);

  const stageConfig = STAGE_CONFIGS[state.stage];
  const pool = STAGE_NORMAL_TYPE_POOL[state.stage];
  const baseType = pool[Math.floor(Math.random() * pool.length)];
  const typeDef = ENEMY_TYPE_DEFS[baseType];
  // P16：血量改用獨立的時間制因子（不受玩家等級/技能影響）；出怪頻率與碰撞傷害仍用原本的玩家成長因子
  const powerScale = getPowerScaleFactor();
  const hpScale = getEnemyHpScaleFactor();

  const isBrute = Math.random() < stageConfig.bruteChance;
  const baseHp = ENEMY_MAX_HP * stageConfig.hpMult * typeDef.hpMult * hpScale;
  const hp = Math.round(isBrute ? baseHp * ENEMY_BRUTE_HP_MULT : baseHp);
  const radius = Math.round(ENEMY_RADIUS * typeDef.radiusMult * (isBrute ? ENEMY_BRUTE_RADIUS_MULT : 1));
  const speed = ENEMY_SPEED * typeDef.speedMult * (isBrute ? ENEMY_BRUTE_SPEED_MULT : 1);
  const touchDamage = Math.round(
    ENEMY_TOUCH_DAMAGE * typeDef.touchMult * (isBrute ? ENEMY_BRUTE_TOUCH_MULT : 1) * (1 + (powerScale - 1) * 0.4)
  );
  const killScore = Math.round(KILL_SCORE * (isBrute ? ENEMY_BRUTE_SCORE_MULT : 1));
  const killXp = Math.round(KILL_XP * (isBrute ? ENEMY_BRUTE_SCORE_MULT : 1));

  state.enemies.push({
    x,
    y,
    type: "normal",
    baseType,
    behavior: typeDef.behavior,
    isBrute,
    radius,
    hp,
    maxHp: hp,
    speed,
    touchDamage,
    killScore,
    killXp,
    hurtUntil: 0,
    particleTimer: 0,
    knockVx: 0,
    knockVy: 0,
    knockUntil: 0,
    zigzagPhase: Math.random() * Math.PI * 2,
    ambushTriggered: typeDef.behavior !== "ambush",
    ambushWarning: false,
    ambushWarningTimer: 0,
    fireTimer: typeDef.fireIntervalMs ? Math.random() * typeDef.fireIntervalMs : 0,
    fireIntervalMs: getEnemyFireInterval(baseType, typeDef),
  });
}

// volley 剛登場的頭 2 關射擊間隔放寬，避免新怪種一登場就太密集
function getEnemyFireInterval(baseType, typeDef) {
  if (!typeDef.fireIntervalMs) return 0;
  if (baseType === "volley") {
    const stagesSinceIntro = state.stage - TYPE_FIRST_STAGE.volley;
    const buffer = VOLLEY_INTRO_BUFFER[stagesSinceIntro];
    if (buffer) return Math.round(typeDef.fireIntervalMs * buffer);
  }
  return typeDef.fireIntervalMs;
}

function spawnBoss(stageIndex) {
  const { x, y } = pickSpawnEdgePoint(60);
  const stageConfig = STAGE_CONFIGS[stageIndex];
  const hpScale = getEnemyHpScaleFactor();
  const hp = Math.round(ENEMY_MAX_HP * stageConfig.hpMult * BOSS_HP_MULT * hpScale);

  state.enemies.push({
    x,
    y,
    type: "boss",
    baseType: "boss",
    behavior: "chase",
    isBrute: false,
    radius: BOSS_RADIUS,
    hp,
    maxHp: hp,
    speed: ENEMY_SPEED * 0.6,
    touchDamage: Math.round(ENEMY_TOUCH_DAMAGE * BOSS_TOUCH_MULT),
    killScore: KILL_SCORE * BOSS_SCORE_MULT,
    killXp: KILL_XP * BOSS_XP_MULT,
    hurtUntil: 0,
    particleTimer: 0,
    knockVx: 0,
    knockVy: 0,
    knockUntil: 0,
    attackTimer: BOSS_ATTACK_INTERVAL_MS,
  });
  state.bossActive = true;
  triggerShake(0.3, 12);
}

function getEnemySpawnInterval() {
  const base = STAGE_CONFIGS[state.stage].spawnInterval;
  return Math.max(MIN_SPAWN_INTERVAL_MS, Math.round(base / getPowerScaleFactor()));
}

function updateStage(dt) {
  const nextStage = Math.min(
    Math.floor(state.elapsed / STAGE_DURATION_SEC),
    STAGE_CONFIGS.length - 1
  );
  if (nextStage !== state.stage) {
    state.stage = nextStage;
    console.log(`[stage] entering stage ${nextStage + 1}`);
    triggerShake(0.15, 6);
    if (nextStage >= 1 && !state.bossActive) {
      const introducesNewType = STAGE_NORMAL_TYPE_POOL[nextStage].some(
        (t) => TYPE_FIRST_STAGE[t] === nextStage
      );
      if (introducesNewType) {
        // 新怪種剛登場，延後 boss 生成，讓玩家先適應新怪
        state.bossSpawnAt = state.elapsed + BOSS_INTRO_DELAY_SEC;
      } else {
        spawnBoss(nextStage);
        state.bossCyclesSpawned += 1;
        state.bossRepeatTimer = 0;
      }
    }
  }

  if (state.bossSpawnAt > 0 && !state.bossActive && state.elapsed >= state.bossSpawnAt) {
    spawnBoss(state.stage);
    state.bossCyclesSpawned += 1;
    state.bossRepeatTimer = 0;
    state.bossSpawnAt = 0;
  }

  // 最終關卡之後，每隔一段時間再次觸發 boss，讓無限模式持續有節點
  if (state.stage === STAGE_CONFIGS.length - 1 && !state.bossActive) {
    state.bossRepeatTimer += dt;
    if (state.bossRepeatTimer >= BOSS_REPEAT_INTERVAL_SEC) {
      spawnBoss(state.stage);
      state.bossCyclesSpawned += 1;
      state.bossRepeatTimer = 0;
    }
  }
}

function updateEnemySpawning(timestamp) {
  if (timestamp - state.lastEnemySpawnTime > getEnemySpawnInterval()) {
    // 數量上限：場上敵人數已達上限時跳過本次出怪，但仍重置計時器，避免解除上限瞬間爆發性補刷
    if (state.enemies.length < MAX_ALIVE_ENEMIES) spawnEnemy();
    state.lastEnemySpawnTime = timestamp;
  }
}

function updateEnemies(dt) {
  const p = state.player;
  const now = performance.now();

  for (const e of state.enemies) {
    emitEnemyFlame(e, dt);

    if (now < e.knockUntil) {
      e.x += e.knockVx * dt;
      e.y += e.knockVy * dt;
      e.knockVx *= ENEMY_KNOCKBACK_RESIST;
      e.knockVy *= ENEMY_KNOCKBACK_RESIST;
      continue;
    }

    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    if (e.type === "boss") {
      e.x += nx * e.speed * dt;
      e.y += ny * e.speed * dt;
      e.attackTimer -= dt * 1000;
      if (e.attackTimer <= 0) {
        e.attackTimer = BOSS_ATTACK_INTERVAL_MS;
        spawnShockwave(e.x, e.y, BOSS_SHOCK_RADIUS);
        triggerShake(0.25, 12);
        if (dist < BOSS_SHOCK_RADIUS + p.radius && now > p.invulnUntil) {
          if (applyDamage(p, BOSS_SHOCK_DAMAGE)) {
            p.invulnUntil = now + PLAYER_IFRAME_MS;
            playHurtSound();
          }
        }
      }
    } else if (e.behavior === "zigzag") {
      e.zigzagPhase += dt * 8;
      const ang = Math.atan2(ny, nx) + Math.sin(e.zigzagPhase) * 0.6;
      e.x += Math.cos(ang) * e.speed * dt;
      e.y += Math.sin(ang) * e.speed * dt;
    } else if (e.behavior === "ambush") {
      if (!e.ambushTriggered && dist < ENEMY_TYPE_DEFS.lurker.triggerRadius) {
        e.ambushTriggered = true;
        e.ambushWarning = true;
        e.ambushWarningTimer = ENEMY_TYPE_DEFS.lurker.warningSec;
      }
      if (e.ambushWarning) {
        e.ambushWarningTimer -= dt;
        if (e.ambushWarningTimer <= 0) e.ambushWarning = false;
      } else if (e.ambushTriggered) {
        const dashSpeed = e.speed * ENEMY_TYPE_DEFS.lurker.dashSpeedMult;
        e.x += nx * dashSpeed * dt;
        e.y += ny * dashSpeed * dt;
      }
    } else if (e.behavior === "kiter") {
      const keepDistance = ENEMY_TYPE_DEFS.volley.keepDistance;
      if (dist > keepDistance + 20) {
        e.x += nx * e.speed * dt;
        e.y += ny * e.speed * dt;
      } else if (dist < keepDistance - 20) {
        e.x -= nx * e.speed * dt;
        e.y -= ny * e.speed * dt;
      }
      e.fireTimer -= dt * 1000;
      if (e.fireTimer <= 0) {
        e.fireTimer = e.fireIntervalMs;
        spawnEnemyProjectile(e, nx, ny);
      }
    } else {
      e.x += nx * e.speed * dt;
      e.y += ny * e.speed * dt;
    }
  }

  // 先清除被打死的敵人：加分、加經驗、爆炸特效、掉落物
  state.enemies = state.enemies.filter((e) => {
    if (e.hp <= 0) {
      state.score += e.killScore;
      state.kills += 1;
      spawnExplosion(e.x, e.y, "rgba(200,60,220,0.9)", e.type === "boss" ? 40 : 20);
      playKillSound();
      addXp(e.killXp);
      rollCurrencyDrop(e);
      tryVampireHeal();
      if (e.type === "boss") {
        state.bossActive = false;
        state.bossRepeatTimer = 0;
      }
      return false;
    }
    return true;
  });

  // 接觸傷害：無敵幀節流（不會同幀被多隻瞬殺），敵人本身不會因碰撞消失，
  // 但仍給觸碰中的敵人一點擊退，避免疊在玩家身上
  let damaged = false;
  for (const e of state.enemies) {
    if (!circleHit(p, e) || now < e.knockUntil) continue;

    const ang = Math.atan2(e.y - p.y, e.x - p.x) || 0;
    e.knockVx = Math.cos(ang) * 90;
    e.knockVy = Math.sin(ang) * 90;
    e.knockUntil = now + 150;

    if (!damaged && now > p.invulnUntil) {
      if (applyDamage(p, e.touchDamage)) {
        p.invulnUntil = now + PLAYER_IFRAME_MS;
        triggerShake(0.15, 8);
        playHurtSound();
      }
      damaged = true;
    }
  }
}

// 必殺技範圍內的敵方彈道全部清除（附加防禦效果），並產生小爆裂粒子回饋
function clearNearbyEnemyProjectiles(p, radius) {
  state.enemyProjectiles = state.enemyProjectiles.filter((proj) => {
    if (distance(p, proj) < radius) {
      spawnExplosion(proj.x, proj.y, "rgba(160,220,255,0.7)", 6);
      return false;
    }
    return true;
  });
}

// ===== 敵方彈道（遠程小怪 volley 專用） =====
function spawnEnemyProjectile(e, nx, ny) {
  state.enemyProjectiles.push({
    x: e.x,
    y: e.y,
    vx: nx * ENEMY_PROJECTILE_SPEED,
    vy: ny * ENEMY_PROJECTILE_SPEED,
    radius: ENEMY_PROJECTILE_RADIUS,
    damage: ENEMY_PROJECTILE_DAMAGE,
  });
}

function updateEnemyProjectiles(dt) {
  const p = state.player;
  const now = performance.now();
  for (const proj of state.enemyProjectiles) {
    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;
  }
  state.enemyProjectiles = state.enemyProjectiles.filter((proj) => {
    if (circleHit(proj, p)) {
      if (now > p.invulnUntil) {
        if (applyDamage(p, proj.damage)) {
          p.invulnUntil = now + PLAYER_IFRAME_MS;
          triggerShake(0.1, 6);
          playHurtSound();
        }
      }
      return false;
    }
    return isInExpandedViewport(proj.x, proj.y, 50);
  });
}

function drawEnemyProjectiles() {
  for (const proj of state.enemyProjectiles) {
    ctx.save();
    ctx.translate(proj.x, proj.y);
    const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, proj.radius);
    grad.addColorStop(0, "#bfe9ff");
    grad.addColorStop(1, "#1f7fae");
    ctx.fillStyle = grad;
    ctx.shadowColor = "#3ad6ff";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ===== 彈道邏輯（自動攻擊 / 手動氣功 共用） =====
function updateProjectiles(dt) {
  for (const proj of state.projectiles) {
    if (proj.homing) {
      if (
        !proj.target ||
        proj.target.hp <= 0 ||
        !state.enemies.includes(proj.target) ||
        proj.hitSet.has(proj.target)
      ) {
        proj.target = findNearestEnemy(proj.x, proj.y, proj.hitSet);
      }
      if (proj.target) {
        const desiredAngle = Math.atan2(proj.target.y - proj.y, proj.target.x - proj.x);
        const curAngle = Math.atan2(proj.vy, proj.vx);
        let diff = desiredAngle - curAngle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        const maxTurn = proj.turnRate * dt;
        const turn = clamp(diff, -maxTurn, maxTurn);
        const speed = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy);
        const newAngle = curAngle + turn;
        proj.vx = Math.cos(newAngle) * speed;
        proj.vy = Math.sin(newAngle) * speed;
      }
    }

    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;
    emitQiTrail(proj);
  }

  for (const proj of state.projectiles) {
    if (proj.hit) continue;
    for (const enemy of state.enemies) {
      if (proj.hitSet.has(enemy) || !circleHit(proj, enemy)) continue;
      applyDamage(enemy, proj.damage);
      spawnDamageText(enemy.x, enemy.y - enemy.radius, proj.damage);
      spawnQiVisualHitFx(proj, enemy);
      triggerShake(0.1, 6);
      playHitSound();
      proj.hitSet.add(enemy);
      if (proj.pierceRemaining > 0) {
        proj.pierceRemaining -= 1;
      } else {
        proj.hit = true;
        break;
      }
    }
  }

  state.projectiles = state.projectiles.filter((proj) => !proj.hit && isInExpandedViewport(proj.x, proj.y, 50));
}

// ===== Game Over =====
function triggerGameOver() {
  state.gameOver = true;
  document.getElementById("final-score").textContent = `最終分數: ${state.score}`;
  document.getElementById("game-over-screen").classList.remove("hidden");
  playGameOverSound();
  setBgmVolume(BGM_GAMEOVER_VOLUME);
}

function resetAndStart() {
  resetState();
  updateActionButtonLabels();
  requestAnimationFrame(gameLoop);
}

// ===== 角色選擇畫面 =====
function renderCharacterSelect() {
  const container = document.getElementById("character-options");
  container.innerHTML = "";
  const lastSelected = localStorage.getItem("selectedCharacter");
  CHARACTERS.forEach((c) => {
    const card = document.createElement("button");
    card.className = "character-card";
    const badge = c.id === lastSelected ? `<span class="character-badge">上次選擇</span>` : "";
    card.innerHTML = `<img class="character-portrait" src="${c.cardSrc}" alt="${c.name}" style="filter: drop-shadow(0 0 10px ${c.rimColor});" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"><div class="character-swatch" style="display:none;background:${c.bodyColor};border:2px solid ${c.rimColor};box-shadow:0 0 10px ${c.rimColor};"></div><span class="character-name">${c.name}</span><span class="character-desc">${c.desc}</span><span class="character-stat-tag" style="color:${c.rimColor};">${c.statTag}</span>${badge}`;
    if (c.id === lastSelected) {
      card.style.borderColor = c.rimColor;
      card.style.boxShadow = `0 0 20px ${c.rimColor}`;
    }
    card.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      startGameWithCharacter(c.id);
    });
    container.appendChild(card);
  });
}

function updateActionButtonLabels() {
  const label = document.querySelector("#btn-palm .palm-label");
  if (label) label.textContent = state.player.character.palmName || "掌";
  document.getElementById("game-container").style.setProperty("--char-accent", state.player.character.rimColor);
}

function startGameWithCharacter(id) {
  document.getElementById("character-select").classList.add("hidden");
  localStorage.setItem("selectedCharacter", id);
  resetState(id);
  updateActionButtonLabels();
  state.started = true;
  unlockAudio();
}

// ===== UI 更新 =====
function updateUI() {
  const p = state.player;
  const hp = Math.max(0, p.hp);
  document.getElementById("score").textContent = `分數: ${state.score}`;
  document.getElementById("hp-text").textContent = `HP: ${hp}/${p.maxHp}`;

  const pct = (hp / p.maxHp) * 100;
  const fill = document.getElementById("hp-bar-fill");
  fill.style.width = `${pct}%`;
  fill.style.background = pct > 50 ? "#2ecc71" : pct > 20 ? "#f39c12" : "#e74c3c";

  document.getElementById("level-text").textContent = `等級 ${p.level}`;
  const xpPct = (p.xp / p.xpToNext) * 100;
  document.getElementById("xp-bar-fill").style.width = `${xpPct}%`;

  const mins = Math.floor(state.elapsed / 60);
  const secs = Math.floor(state.elapsed % 60);
  document.getElementById("timer-text").textContent = `${mins}:${String(secs).padStart(2, "0")}`;
  document.getElementById("stage-text").textContent = `關卡 ${state.stage + 1}`;

  document.getElementById("palm-charges").textContent =
    "●".repeat(p.palmCharges) + "○".repeat(Math.max(0, p.palmMaxCharges - p.palmCharges));

  const palmBtn = document.getElementById("btn-palm");
  const progress = p.palmCharges >= p.palmMaxCharges ? 1 : p.palmRechargeTimer / PALM_RECHARGE_MS;
  palmBtn.style.setProperty("--cd", String(1 - progress));

  const pipRow = document.getElementById("palm-pip-row");
  if (pipRow.children.length !== p.palmMaxCharges) {
    pipRow.innerHTML = "";
    for (let i = 0; i < p.palmMaxCharges; i++) {
      const pip = document.createElement("span");
      pip.className = "charge-pip";
      pipRow.appendChild(pip);
    }
  }
  for (let i = 0; i < pipRow.children.length; i++) {
    pipRow.children[i].classList.toggle("filled", i < p.palmCharges);
  }

  const barrierEl = document.getElementById("barrier-indicator");
  const barrierSkill = p.skills.barrier;
  if (!barrierSkill.unlocked || barrierSkill.level <= 0) {
    barrierEl.classList.add("hidden");
  } else {
    barrierEl.classList.remove("hidden");
    if (p.barrierCharge) {
      barrierEl.style.setProperty("--charge", "1");
      barrierEl.classList.add("ready");
    } else {
      const interval = getSkillEffect("barrier", "interval");
      const chargePct = interval > 0 ? 1 - Math.max(0, p.barrierTimer / interval) : 0;
      barrierEl.style.setProperty("--charge", String(Math.min(1, Math.max(0, chargePct))));
      barrierEl.classList.remove("ready");
    }
  }

  const boss = state.enemies.find((e) => e.type === "boss");
  const bossBarBg = document.getElementById("boss-hp-bar-bg");
  if (boss) {
    bossBarBg.classList.remove("hidden");
    const pct = Math.max(0, boss.hp / boss.maxHp) * 100;
    document.getElementById("boss-hp-bar-fill").style.width = `${pct}%`;
  } else {
    bossBarBg.classList.add("hidden");
  }
}

// ===== 渲染 =====
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const joystickCanvas = document.getElementById("joystick-canvas");
const joystickCtx = joystickCanvas.getContext("2d");

function drawPlayerShape(x, y, facing, animTime, moving, hurt, alpha, blocked) {
  const p = state.player;
  const character = p.character || CHARACTERS[0];
  const wobbleFreq = moving ? 10 : 3;
  const wobbleAmp = moving ? 2 : 1;
  const bob = Math.sin(animTime * wobbleFreq) * wobbleAmp;
  const swayL = Math.sin(animTime * wobbleFreq) * 3;
  const swayR = Math.sin(animTime * wobbleFreq + Math.PI) * 3;
  const capeSwayL = Math.sin(animTime * wobbleFreq) * 6;
  const capeSwayR = Math.sin(animTime * wobbleFreq + Math.PI) * 6;
  const rimColor = blocked ? "#ffd84d" : hurt ? "#ff4444" : character.rimColor;
  const top = -p.h / 2 + 14;
  const bottom = p.h / 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y + bob);
  if (facing < 0) ctx.scale(-1, 1);

  // 披風層（背後較寬、晃動幅度更大，營造層次與立體感）
  const capeGrad = ctx.createLinearGradient(0, top, 0, bottom + 6);
  capeGrad.addColorStop(0, shadeColor(character.bodyColor, -25));
  capeGrad.addColorStop(1, shadeColor(character.bodyColor, -55));
  ctx.fillStyle = capeGrad;
  ctx.globalAlpha = alpha * 0.9;
  ctx.beginPath();
  ctx.moveTo(-p.w / 2 - 3, top + 2);
  ctx.lineTo(p.w / 2 + 3, top + 2);
  ctx.lineTo(p.w / 2 + 7 + capeSwayR, bottom + 6);
  ctx.lineTo(-p.w / 2 - 7 + capeSwayL, bottom + 6);
  ctx.closePath();
  ctx.fill();

  // 古風剪影身形（長袍主體），漸層補光＋背光發光剪影感
  const bodyGrad = ctx.createLinearGradient(-p.w / 2, top, p.w / 2, bottom);
  bodyGrad.addColorStop(0, shadeColor(character.bodyColor, 12));
  bodyGrad.addColorStop(1, character.bodyColor);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = bodyGrad;
  ctx.shadowColor = rimColor;
  ctx.shadowBlur = 14;

  ctx.beginPath();
  ctx.moveTo(-p.w / 2, top);
  ctx.lineTo(p.w / 2, top);
  ctx.lineTo(p.w / 2 + swayR, bottom);
  ctx.lineTo(-p.w / 2 + swayL, bottom);
  ctx.closePath();
  ctx.fill();

  // 肩甲飾角
  ctx.fillStyle = shadeColor(character.bodyColor, 20);
  ctx.beginPath();
  ctx.moveTo(-p.w / 2, top);
  ctx.lineTo(-p.w / 2 - 5, top + 6);
  ctx.lineTo(-p.w / 2 + 4, top + 6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(p.w / 2, top);
  ctx.lineTo(p.w / 2 + 5, top + 6);
  ctx.lineTo(p.w / 2 - 4, top + 6);
  ctx.closePath();
  ctx.fill();

  // 頭部
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(0, -p.h / 2 + 6, 11, 0, Math.PI * 2);
  ctx.fill();

  // 髮髻／頭飾尖角
  ctx.fillStyle = character.beltColor;
  ctx.beginPath();
  ctx.moveTo(-4, -p.h / 2 - 4);
  ctx.lineTo(2, -p.h / 2 - 11);
  ctx.lineTo(6, -p.h / 2 - 3);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;

  // 背劍：劍柄、護手、劍身分層繪製
  const swordX = p.w / 2 - 2;
  ctx.fillStyle = shadeColor(character.bodyColor, -30);
  ctx.fillRect(swordX, top + 2, 4, 10); // 劍柄
  ctx.fillStyle = character.beltColor;
  ctx.fillRect(swordX - 3, top + 11, 10, 3); // 護手
  const bladeGrad = ctx.createLinearGradient(swordX, top + 14, swordX, bottom - 2);
  bladeGrad.addColorStop(0, "#e8eef2");
  bladeGrad.addColorStop(1, shadeColor(character.rimColor, -10));
  ctx.fillStyle = bladeGrad;
  ctx.fillRect(swordX, top + 14, 4, bottom - top - 16); // 劍身

  // 剪影邊緣描邊發光（背光輪廓感，含披風外緣）
  ctx.lineWidth = 2;
  ctx.strokeStyle = rimColor;
  ctx.globalAlpha = alpha * 0.85;
  ctx.beginPath();
  ctx.moveTo(-p.w / 2, top);
  ctx.lineTo(p.w / 2, top);
  ctx.lineTo(p.w / 2 + swayR, bottom);
  ctx.lineTo(-p.w / 2 + swayL, bottom);
  ctx.closePath();
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.globalAlpha = alpha * 0.4;
  ctx.beginPath();
  ctx.moveTo(-p.w / 2 - 3, top + 2);
  ctx.lineTo(-p.w / 2 - 7 + capeSwayL, bottom + 6);
  ctx.moveTo(p.w / 2 + 3, top + 2);
  ctx.lineTo(p.w / 2 + 7 + capeSwayR, bottom + 6);
  ctx.stroke();

  // 腰帶
  ctx.globalAlpha = alpha;
  ctx.fillStyle = character.beltColor;
  ctx.fillRect(-p.w / 2, -p.h / 2 + 24, p.w, 3);

  // 眉峰描邊
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 1;
  ctx.globalAlpha = alpha * 0.7;
  ctx.beginPath();
  ctx.moveTo(0, -p.h / 2 + 2);
  ctx.lineTo(7, -p.h / 2 + 1);
  ctx.stroke();

  // 眼神發光點
  ctx.globalAlpha = alpha;
  ctx.fillStyle = rimColor;
  ctx.shadowColor = rimColor;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(4, -p.h / 2 + 5, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// 若角色已提供正式透明 sprite（assetImages[character.spriteKey]）才用 drawImage 畫角色，
// 圖片載入失敗或尚未到位時自動 fallback 回 drawPlayerShape() 的 Canvas 繪製（保留原版火柴人邏輯）。
function drawPlayerSprite(x, y, facing, animTime, moving, hurt, alpha, character, blocked) {
  const sprite = character && character.spriteKey && assetImages[character.spriteKey];
  if (!sprite) {
    drawPlayerShape(x, y, facing, animTime, moving, hurt, alpha, blocked);
    return;
  }
  const h = character.spriteHeight || 72;
  const w = (sprite.width / sprite.height) * h;
  const rimColor = blocked ? "#ffd84d" : hurt ? "#ff4444" : character.rimColor;

  // 微動態：移動中較快較大幅度的上下浮動，靜止時保留小幅度呼吸感（純垂直位移，不帶旋轉，避免讀成左右搖晃）
  const wobbleFreq = moving ? 10 : 3;
  const wobbleAmp = moving ? 5 : 2;
  const bob = Math.sin(animTime * wobbleFreq) * wobbleAmp;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y + bob);
  // 部分角色原圖預設朝左（spriteFacesLeft），鏡像條件需反轉才能讓移動方向與臉部朝向一致
  const mirror = character.spriteFacesLeft ? facing > 0 : facing < 0;
  if (mirror) ctx.scale(-1, 1);

  // 保留原本繪製版的角色光環效果，疊在 sprite 之下
  ctx.save();
  ctx.globalAlpha = alpha * 0.35;
  const haloGrad = ctx.createRadialGradient(0, -h / 2, 1, 0, -h / 2, h * 0.6);
  haloGrad.addColorStop(0, rimColor);
  haloGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = haloGrad;
  ctx.beginPath();
  ctx.arc(0, -h / 2, h * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.drawImage(sprite, -w / 2, -h, w, h);
  ctx.restore();
}

function drawPlayer() {
  const p = state.player;
  const hurt = isHurt(p);
  const blocked = performance.now() < p.blockFlashUntil;
  // 受傷閃爍：短時間內交替透明度，讓玩家明確感知到「中招了」
  // 格擋閃爍：金色快閃，與受傷的紅色閃爍明確區隔，讓「護盾擋下了」這個瞬間可辨
  const flicker = hurt
    ? (Math.floor(performance.now() / 70) % 2 === 0 ? 0.3 : 1)
    : blocked
    ? (Math.floor(performance.now() / 50) % 2 === 0 ? 0.5 : 1)
    : 1;

  // 殘影特效：移動中由舊到新、由淡到濃的剪影分身
  for (let i = 0; i < p.history.length; i++) {
    const h = p.history[i];
    const alpha = ((i + 1) / (p.history.length + 1)) * 0.35;
    drawPlayerSprite(h.x, h.y, h.facing, h.animTime, true, false, alpha, p.character, false);
  }

  drawPlayerSprite(p.x, p.y, p.facing, p.animTime, p.moving, hurt, flicker, p.character, blocked);
  drawPlayerStatusFx(p);
}

// 角色身上的技能狀態特效：護體罡氣待命中／狂狼之力發動中／吸血掌剛觸發，三者用顏色與形態明確區隔
// 護盾＝金色靜置光環（待命感）、狂狼＝紫紅高頻脈動環（緊迫感）、吸血＝綠色觸發瞬間擴散環（回復感）
function drawPlayerStatusFx(p) {
  const now = performance.now();
  ctx.save();
  ctx.translate(p.x, p.y - p.h / 2);

  if (p.barrierCharge) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 220);
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.25 * pulse;
    ctx.strokeStyle = "#ffd84d";
    ctx.shadowColor = "#ffd84d";
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius + 10 + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (getEnrageMult(p) > 1) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 110);
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.3 * pulse;
    ctx.strokeStyle = "#c060ff";
    ctx.shadowColor = "#ff2bd6";
    ctx.shadowBlur = 18 + pulse * 8;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius + 6 + pulse * 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (now < p.vampireFxUntil) {
    const t = Math.max(0, (p.vampireFxUntil - now) / VAMPIRE_FX_DURATION);
    ctx.save();
    ctx.globalAlpha = t * 0.6;
    ctx.strokeStyle = "#3fe080";
    ctx.shadowColor = "#3fe080";
    ctx.shadowBlur = 16;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius + 14 * (1 - t), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function drawEnemy(e) {
  const hurt = isHurt(e);
  const visual = ENEMY_VISUALS[e.baseType] || ENEMY_VISUALS.drifter;
  const isBoss = e.type === "boss";

  ctx.save();
  ctx.translate(e.x, e.y);

  if (e.ambushWarning) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 70);
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.35 * pulse;
    ctx.strokeStyle = "#ff3b3b";
    ctx.shadowColor = "#ff3b3b";
    ctx.shadowBlur = 16;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius + 6 + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, e.radius);
  if (hurt) {
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(1, e.isBrute || isBoss ? "#ff5500" : "#ff2222");
  } else {
    grad.addColorStop(0, visual.core);
    grad.addColorStop(0.6, visual.mid);
    grad.addColorStop(1, visual.edge);
  }
  ctx.fillStyle = grad;
  ctx.shadowColor = visual.glow;
  ctx.shadowBlur = isBoss ? 28 : e.isBrute ? 20 : 14;
  ctx.beginPath();
  ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (e.isBrute) {
    ctx.strokeStyle = "#ff6a00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius + 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 小血條
  const barW = e.radius * 2;
  ctx.fillStyle = "#400";
  ctx.fillRect(-barW / 2, -e.radius - 10, barW, 4);
  ctx.fillStyle = "#2ecc71";
  ctx.fillRect(-barW / 2, -e.radius - 10, barW * Math.max(0, e.hp / e.maxHp), 4);

  ctx.restore();
}

function drawBladeProjectile(proj) {
  const len = proj.length;
  const halfW = proj.width / 2;
  const grad = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
  grad.addColorStop(0, "rgba(255,120,38,0)");
  grad.addColorStop(0.35, "rgba(255,160,54,0.55)");
  grad.addColorStop(0.72, proj.coreColor || "#fff6b0");
  grad.addColorStop(1, proj.color || "#ffd84d");

  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = proj.color || "#ffd84d";
  ctx.shadowBlur = 22;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-len / 2, -halfW * 0.15);
  ctx.quadraticCurveTo(-len * 0.12, -halfW * 1.28, len / 2, -halfW * 0.15);
  ctx.quadraticCurveTo(len * 0.2, halfW * 0.55, -len / 2, halfW * 0.55);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,246,176,0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-len * 0.3, halfW * 0.42);
  ctx.quadraticCurveTo(len * 0.18, -halfW * 0.42, len * 0.48, -halfW * 0.04);
  ctx.stroke();
}

function drawShadowProjectile(proj) {
  const len = proj.length;
  const halfW = proj.width / 2;
  const time = performance.now() / 120;
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.shadowColor = proj.color || "#c060ff";
  ctx.shadowBlur = 26;

  for (let i = 0; i < 4; i++) {
    const shift = i * 8;
    const fade = 0.18 + i * 0.12;
    const wave = Math.sin(time + i * 0.9) * halfW * 0.12;
    ctx.fillStyle = `rgba(116, 42, 190, ${fade})`;
    ctx.beginPath();
    ctx.moveTo(-len / 2 - shift, -halfW * 0.35 + wave);
    ctx.quadraticCurveTo(-len * 0.12 - shift, -halfW * (1.1 - i * 0.12), len * 0.5 - shift * 0.25, 0);
    ctx.quadraticCurveTo(-len * 0.1 - shift, halfW * (0.85 - i * 0.1), -len / 2 - shift, halfW * 0.28 + wave);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(238,210,255,0.9)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-len * 0.46, halfW * 0.18);
  ctx.quadraticCurveTo(-len * 0.04, -halfW * 0.72, len * 0.45, -halfW * 0.03);
  ctx.stroke();
}

function drawFrostProjectile(proj) {
  const len = proj.length;
  const halfW = proj.width / 2;
  const grad = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
  grad.addColorStop(0, "rgba(100,220,255,0)");
  grad.addColorStop(0.45, "rgba(189,244,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0.95)");

  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = "#bdf4ff";
  ctx.shadowBlur = 20;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.lineTo(len * 0.34, -halfW);
  ctx.lineTo(len / 2, 0);
  ctx.lineTo(len * 0.34, halfW);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = 1.5;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(-len * 0.28, 0);
    ctx.lineTo(len * 0.38, i * halfW * 0.62);
    ctx.stroke();
  }
}

function drawQiVisualProjectile(proj) {
  if (proj.visualType === "blade") {
    drawBladeProjectile(proj);
  } else if (proj.visualType === "shadow") {
    drawShadowProjectile(proj);
  } else if (proj.visualType === "frost") {
    drawFrostProjectile(proj);
  }
}

function drawProjectile(proj) {
  ctx.save();
  ctx.translate(proj.x, proj.y);
  ctx.rotate(Math.atan2(proj.vy, proj.vx));

  if (proj.visualType) {
    drawQiVisualProjectile(proj);
    ctx.restore();
    return;
  }

  // 氣攻擊：飛行中沿用光影擴散特效圖，不再疊加舊版橢圓
  if (proj.imgKey && assetImages[proj.imgKey]) {
    const img = assetImages[proj.imgKey];
    const h = proj.radius * 4.5;
    const w = (img.width / img.height) * h;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return;
  }

  // 自動攻擊／無目標氣彈：依角色顏色染色的發光橢圓
  const len = proj.radius * 3.6;
  const edgeColor = proj.color || "#ff8a3a";
  const tipColor = proj.color ? shadeColor(proj.color, 55) : "#ffd84d";
  const grad = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.6, tipColor);
  grad.addColorStop(1, edgeColor);
  ctx.fillStyle = grad;
  ctx.shadowColor = edgeColor;
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.ellipse(0, 0, len / 2, proj.radius, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

const HORIZON_Y = CANVAS_H * 0.65;

// 視差層捲動速度集中設定：天空雲層最慢、遠山中等、地面（裝飾＋角色所在層）與攝影機同速，
// 飛沙粒子比攝影機更快、反向飄移，所有調速都改這裡，不要散落在各個繪製函式裡。
const PARALLAX_CONFIG = {
  sky: 0.1,
  mountain: 0.3,
  ground: 1.0,
  dust: 1.2,
  dustIdleDrift: 6, // 玩家靜止時，粒子仍緩慢飄移的像素/秒基準速度
};

const DUST_COUNT = 30;

function createDustField(scene) {
  const particles = [];
  for (let i = 0; i < DUST_COUNT; i++) {
    particles.push({
      x: Math.random() * CANVAS_W,
      y: Math.random() * CANVAS_H,
      size: 1 + Math.random() * 2.2,
      jitterPhase: Math.random() * Math.PI * 2,
      jitterSpeed: 0.5 + Math.random() * 1.2,
      color: scene && scene.dustColor ? scene.dustColor : "rgba(255,255,255,0.5)",
    });
  }
  return particles;
}

function updateDustParticles(dt) {
  const p = state.player;
  const scene = getCurrentScene();
  const dirX = p.moving ? -p.moveDirX : 0;
  const dirY = p.moving ? -p.moveDirY : 0;
  const speed = p.moving ? p.speed * PARALLAX_CONFIG.dust : PARALLAX_CONFIG.dustIdleDrift;
  for (const d of state.dust) {
    d.jitterPhase += dt * d.jitterSpeed;
    const jitterX = Math.sin(d.jitterPhase) * 6;
    const jitterY = Math.cos(d.jitterPhase * 1.3) * 4;
    d.x += dirX * speed * dt + jitterX * dt;
    d.y += dirY * speed * dt + jitterY * dt;
    d.color = scene.dustColor || d.color;
    if (d.x < -10) d.x = CANVAS_W + 10;
    if (d.x > CANVAS_W + 10) d.x = -10;
    if (d.y < -10) d.y = CANVAS_H + 10;
    if (d.y > CANVAS_H + 10) d.y = -10;
  }
}

function drawDustParticles() {
  ctx.save();
  for (const d of state.dust) {
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const FAR_MOUNTAINS = [
  { baseX: 30, width: 130, height: 55 },
  { baseX: 150, width: 160, height: 80 },
  { baseX: 300, width: 150, height: 60 },
  { baseX: 420, width: 120, height: 45 },
];

const STAR_FIELD = Array.from({ length: 40 }, (_, i) => ({
  x: (i * 53 + 17) % CANVAS_W,
  y: (i * 29 + 5) % HORIZON_Y,
  size: 1 + (i % 3),
}));

// 三組輪替場景：沙漠黃昏／竹林夜月／古城門遺跡夜景，每 1-2 關切換一次
const SCENES = [
  {
    name: "沙漠黃昏",
    bgKey: "desert_dusk",
    skyTop: "#4a2a22",
    skyMid: "#c9784a",
    skyBottom: "#ffb066",
    groundTop: "#6b4a28",
    groundBottom: "#2c1d10",
    mountainColor: "rgba(90,55,30,0.55)",
    dustColor: "rgba(230,180,120,0.45)",
    skyDecor: "sun",
    drawDecor(c, x, y, hash) {
      // 極淡、低對比的沙地紋理色塊，刻意避開正圓/正橢圓的「點狀」輪廓
      const grad = c.createRadialGradient(x, y, 0, x, y, 14 + hash * 12);
      grad.addColorStop(0, "rgba(110,80,50,0.10)");
      grad.addColorStop(1, "rgba(110,80,50,0)");
      c.fillStyle = grad;
      c.beginPath();
      c.ellipse(x, y, 14 + hash * 12, 6 + hash * 5, hash * Math.PI, 0, Math.PI * 2);
      c.fill();
    },
  },
  {
    name: "竹林夜月",
    bgKey: "bamboo_moon",
    skyTop: "#0a1430",
    skyMid: "#1c2a55",
    skyBottom: "#34406a",
    groundTop: "#16240f",
    groundBottom: "#0a120a",
    mountainColor: "rgba(20,40,30,0.6)",
    dustColor: "rgba(220,255,210,0.4)",
    skyDecor: "moon",
    drawDecor(c, x, y, hash) {
      if (hash < 0.1) {
        c.save();
        c.fillStyle = "rgba(202,255,176,0.35)";
        c.shadowColor = "rgba(202,255,176,0.35)";
        c.shadowBlur = 5;
        c.beginPath();
        c.arc(x, y, 1.3, 0, Math.PI * 2);
        c.fill();
        c.restore();
        return;
      }
      c.strokeStyle = "rgba(63,106,58,0.45)";
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(x, y + 14);
      c.lineTo(x, y - 14);
      c.stroke();
      c.strokeStyle = "rgba(90,138,82,0.4)";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x, y - 6);
      c.lineTo(x + 8, y - 10);
      c.stroke();
    },
  },
  {
    name: "古城門遺跡夜景",
    bgKey: "ruins_night",
    skyTop: "#10101c",
    skyMid: "#241f30",
    skyBottom: "#463a4a",
    groundTop: "#2a2422",
    groundBottom: "#14110f",
    mountainColor: "rgba(40,35,45,0.6)",
    dustColor: "rgba(180,90,90,0.4)",
    skyDecor: "stars",
    drawDecor(c, x, y, hash) {
      if (hash < 0.12) {
        c.save();
        c.fillStyle = "rgba(255,174,66,0.4)";
        c.shadowColor = "rgba(255,174,66,0.4)";
        c.shadowBlur = 8;
        c.beginPath();
        c.arc(x, y, 2.6, 0, Math.PI * 2);
        c.fill();
        c.restore();
        return;
      }
      c.fillStyle = "rgba(90,74,72,0.4)";
      c.fillRect(x - 5, y - 18, 10, 18);
    },
  },
];

const STAGE_SCENE_INDEX = [0, 0, 1, 1, 2, 2, 0, 1];

function getCurrentScene() {
  return SCENES[STAGE_SCENE_INDEX[state.stage] || 0];
}

function drawSkyDecor(scene) {
  if (scene.skyDecor === "sun") {
    ctx.save();
    ctx.fillStyle = "#ffd27a";
    ctx.shadowColor = "#ffb066";
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(CANVAS_W * 0.72, HORIZON_Y * 0.35, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (scene.skyDecor === "moon") {
    ctx.save();
    ctx.fillStyle = "#eaf0ff";
    ctx.shadowColor = "#bcd0ff";
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(CANVAS_W * 0.28, HORIZON_Y * 0.3, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (scene.skyDecor === "stars") {
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    for (const star of STAR_FIELD) {
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
  }
}

const GROUND_DECOR_SPACING = 110;

// 地面裝飾在世界座標上以較寬間距取樣，並用第二組雜湊值在格內隨機偏移，
// 避免呈現「一顆一顆規律排列」的網格點狀外觀；整體再疊一層低透明度淡化。
function drawGroundDecor(scene) {
  const camX = state.camera.x;
  const camY = state.camera.y;
  const startCol = Math.floor(camX / GROUND_DECOR_SPACING) - 1;
  const endCol = Math.floor((camX + CANVAS_W) / GROUND_DECOR_SPACING) + 1;
  const startRow = Math.floor(camY / GROUND_DECOR_SPACING) - 1;
  const endRow = Math.floor((camY + CANVAS_H) / GROUND_DECOR_SPACING) + 1;
  ctx.save();
  ctx.globalAlpha = 0.65;
  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const hash = Math.abs(Math.sin(col * 12.9898 + row * 78.233) * 43758.5453) % 1;
      if (hash > 0.3) continue;
      const jitterHash = Math.abs(Math.sin(col * 39.346 + row * 11.135) * 27543.123) % 1;
      const jitterX = (jitterHash - 0.5) * GROUND_DECOR_SPACING * 0.6;
      const jitterY = (((jitterHash * 7) % 1) - 0.5) * GROUND_DECOR_SPACING * 0.6;
      const worldX = col * GROUND_DECOR_SPACING + GROUND_DECOR_SPACING / 2 + jitterX;
      const worldY = row * GROUND_DECOR_SPACING + GROUND_DECOR_SPACING / 2 + jitterY;
      const screenX = worldX - camX;
      const screenY = worldY - camY;
      if (screenY < HORIZON_Y - 20 || screenY > CANVAS_H + 20) continue;
      scene.drawDecor(ctx, screenX, screenY, hash);
    }
  }
  ctx.restore();
}

// 以「鏡像 ping-pong」方式無縫鋪排單張圖：相鄰格依索引奇偶交替水平/垂直翻轉，
// 讓每個格子的邊緣永遠對接到自己的鏡像，徹底消除直接重複貼圖造成的接縫線。
function drawWrappedTile(img, scrollX, scrollY, tileW, tileH) {
  const offX = ((scrollX % tileW) + tileW) % tileW;
  const offY = ((scrollY % tileH) + tileH) % tileH;
  const baseTileX = Math.floor(scrollX / tileW);
  const baseTileY = Math.floor(scrollY / tileH);
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const screenX = i * tileW - offX;
      const screenY = j * tileH - offY;
      const flipH = (((baseTileX + i) % 2) + 2) % 2 === 1;
      const flipV = (((baseTileY + j) % 2) + 2) % 2 === 1;
      ctx.save();
      ctx.translate(screenX + tileW / 2, screenY + tileH / 2);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(img, -tileW / 2, -tileH / 2, tileW, tileH);
      ctx.restore();
    }
  }
}

// 遠山輪廓視差層：水平以 CANVAS_W 為週期隨 bgScrollX×mountain 速度捲動，
// 垂直疊加小幅度視差；不論是否已有美術背景圖都會疊加在上方，作為中速層。
function drawMountainLayer(scene) {
  const mountainOffset = ((state.bgScrollX * PARALLAX_CONFIG.mountain % CANVAS_W) + CANVAS_W) % CANVAS_W;
  const mountainYParallax = state.bgScrollY * PARALLAX_CONFIG.mountain * 0.2;
  ctx.fillStyle = scene.mountainColor;
  for (const xOff of [-mountainOffset - CANVAS_W, -mountainOffset, -mountainOffset + CANVAS_W]) {
    for (const m of FAR_MOUNTAINS) {
      ctx.beginPath();
      ctx.moveTo(xOff + m.baseX - m.width / 2, HORIZON_Y + mountainYParallax);
      ctx.lineTo(xOff + m.baseX, HORIZON_Y - m.height + mountainYParallax);
      ctx.lineTo(xOff + m.baseX + m.width / 2, HORIZON_Y + mountainYParallax);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawBackground() {
  const scene = getCurrentScene();
  const bgImg = scene.bgKey && assetImages[scene.bgKey];

  if (bgImg) {
    // 天空／遠景圖層（最慢，0.1x）：鏡像鋪排去除接縫，玩家移動時才會推進（bgScrollX/Y 已在 updateCamera 凍結）。
    drawWrappedTile(
      bgImg,
      state.bgScrollX * PARALLAX_CONFIG.sky,
      state.bgScrollY * PARALLAX_CONFIG.sky,
      CANVAS_W,
      CANVAS_H
    );
    ctx.fillStyle = "rgba(0,0,0,0.26)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    drawMountainLayer(scene);
    drawGroundDecor(scene);
    return;
  }

  // Fallback：原本的 Canvas 漸層背景（已淡化地面裝飾，不再出現明顯點狀物）
  // 天空：螢幕固定，不隨攝影機捲動
  const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
  skyGrad.addColorStop(0, scene.skyTop);
  skyGrad.addColorStop(0.55, scene.skyMid);
  skyGrad.addColorStop(1, scene.skyBottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, CANVAS_W, HORIZON_Y);

  drawSkyDecor(scene);

  // 遠山輪廓（中速層，0.3x）
  drawMountainLayer(scene);

  // 地面底色：螢幕固定
  const groundGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, CANVAS_H);
  groundGrad.addColorStop(0, scene.groundTop);
  groundGrad.addColorStop(1, scene.groundBottom);
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, HORIZON_Y, CANVAS_W, CANVAS_H - HORIZON_Y);

  ctx.fillStyle = "rgba(255,200,140,0.3)";
  ctx.fillRect(0, HORIZON_Y, CANVAS_W, 2);

  drawGroundDecor(scene);
}

function render() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.save();
  if (state.shake.time > 0) {
    const power = state.shake.time / state.shake.duration;
    const offsetX = (Math.random() - 0.5) * state.shake.magnitude * power;
    const offsetY = (Math.random() - 0.5) * state.shake.magnitude * power;
    ctx.translate(offsetX, offsetY);
  }

  drawBackground();

  ctx.save();
  ctx.translate(-state.camera.x, -state.camera.y);
  drawDrops();
  for (const e of state.enemies) drawEnemy(e);
  drawEnemyProjectiles();
  drawParticles();
  drawShockwaves();
  for (const proj of state.projectiles) drawProjectile(proj);
  drawOrbiters();
  drawPlayer();
  drawFxOverlays();
  drawDamageTexts();
  drawPickupTexts();
  ctx.restore();

  // 飛沙浮塵：最前景的螢幕座標層，疊在所有遊戲世界元素之上，營造速度感並掩蓋背景接縫殘留。
  drawDustParticles();

  ctx.restore();

  drawJoystick();
}

// ===== RWD 縮放 =====
function updateGameScale() {
  const scale = Math.min(
    window.innerWidth / CANVAS_W,
    window.innerHeight / CANVAS_H,
    1
  );
  document.getElementById("game-container").style.transform = `scale(${scale})`;
}

// ===== 觸控控制：圓形虛擬搖桿 =====
const JOYSTICK_MAX_DIST = 33;
const JOYSTICK_SENSITIVITY_CURVE = 0.6;

function drawJoystick() {
  const w = joystickCanvas.width;
  const h = joystickCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const j = state.joystick;

  joystickCtx.clearRect(0, 0, w, h);

  // 外圈（半透明發光圓環）
  joystickCtx.save();
  joystickCtx.shadowColor = "rgba(58,214,255,0.5)";
  joystickCtx.shadowBlur = 10;
  joystickCtx.fillStyle = "rgba(10,20,30,0.18)";
  joystickCtx.beginPath();
  joystickCtx.arc(cx, cy, 44, 0, Math.PI * 2);
  joystickCtx.fill();
  joystickCtx.lineWidth = 2;
  joystickCtx.strokeStyle = "rgba(58,214,255,0.45)";
  joystickCtx.stroke();
  joystickCtx.restore();

  // 內部操控小圓點
  const knobX = cx + j.knobX;
  const knobY = cy + j.knobY;
  joystickCtx.save();
  joystickCtx.globalAlpha = 0.75;
  joystickCtx.shadowColor = "rgba(58,214,255,0.95)";
  joystickCtx.shadowBlur = j.active ? 13 : 6;
  const knobGrad = joystickCtx.createRadialGradient(knobX, knobY, 1, knobX, knobY, 17);
  knobGrad.addColorStop(0, "#ffffff");
  knobGrad.addColorStop(0.5, "#3ad6ff");
  knobGrad.addColorStop(1, "#0a3a55");
  joystickCtx.fillStyle = knobGrad;
  joystickCtx.beginPath();
  joystickCtx.arc(knobX, knobY, 17, 0, Math.PI * 2);
  joystickCtx.fill();
  joystickCtx.restore();
}

function bindJoystick() {
  const cx = joystickCanvas.width / 2;
  const cy = joystickCanvas.height / 2;

  function updateFromEvent(e) {
    const rect = joystickCanvas.getBoundingClientRect();
    const scaleX = joystickCanvas.width / rect.width;
    const scaleY = joystickCanvas.height / rect.height;
    const localX = (e.clientX - rect.left) * scaleX;
    const localY = (e.clientY - rect.top) * scaleY;
    const dx = localX - cx;
    const dy = localY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, JOYSTICK_MAX_DIST);
    const angle = Math.atan2(dy, dx);
    state.joystick.knobX = Math.cos(angle) * clamped;
    state.joystick.knobY = Math.sin(angle) * clamped;
    const mag = Math.pow(clamped / JOYSTICK_MAX_DIST, JOYSTICK_SENSITIVITY_CURVE);
    state.joystick.dx = Math.cos(angle) * mag;
    state.joystick.dy = Math.sin(angle) * mag;
  }

  function onDown(e) {
    e.preventDefault();
    state.joystick.active = true;
    state.joystick.pointerId = e.pointerId;
    try {
      joystickCanvas.setPointerCapture(e.pointerId);
    } catch (err) {
      // ignore unsupported environments
    }
    updateFromEvent(e);
  }

  function onMove(e) {
    if (!state.joystick.active || e.pointerId !== state.joystick.pointerId) return;
    e.preventDefault();
    updateFromEvent(e);
  }

  function onUp(e) {
    if (e.pointerId !== state.joystick.pointerId) return;
    e.preventDefault();
    state.joystick.active = false;
    state.joystick.pointerId = null;
    state.joystick.knobX = 0;
    state.joystick.knobY = 0;
    state.joystick.dx = 0;
    state.joystick.dy = 0;
  }

  joystickCanvas.addEventListener("pointerdown", onDown);
  joystickCanvas.addEventListener("pointermove", onMove);
  joystickCanvas.addEventListener("pointerup", onUp);
  joystickCanvas.addEventListener("pointercancel", onUp);
}

function bindActionButton(btn, triggerFn) {
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btn.classList.add("pressed");
    try {
      btn.setPointerCapture(e.pointerId);
    } catch (err) {
      // ignore unsupported environments
    }
    if (!state.started) return;
    if (state.gameOver) {
      resetAndStart();
    } else if (!state.skillMenuOpen) {
      triggerFn();
    }
  });
  const release = (e) => {
    e.preventDefault();
    btn.classList.remove("pressed");
  };
  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointercancel", release);
  btn.addEventListener("pointerleave", release);
}

// ===== 主迴圈 =====
function update(dt, timestamp) {
  if (state.skillMenuOpen || state.upgradeChoices.length > 0) {
    updateUI();
    return;
  }

  state.elapsed += dt;
  updateStage(dt);
  updatePlayer(dt);
  updateAutoAttack(dt);
  updateOrbiters(dt);
  updateThrowSkill(dt);
  updateBarrier(dt);
  updatePalmRecharge(dt);
  updateEnemySpawning(timestamp);
  updateEnemies(dt);
  updateEnemyProjectiles(dt);
  updateProjectiles(dt);
  updateSpirals(dt);
  updateDrops(dt);
  updateParticles(dt);
  updateDamageTexts(dt);
  updatePickupTexts(dt);
  updateShockwaves(dt);
  updateFxOverlays(dt);
  updateDustParticles(dt);
  updateUpgradeQueue();

  if (state.shake.time > 0) {
    state.shake.time = Math.max(0, state.shake.time - dt);
  }

  if (!state.gameOver && state.player.hp <= 0) {
    triggerGameOver();
  }

  updateUI();
}

let lastTime = 0;
function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  if (!state.started) {
    requestAnimationFrame(gameLoop);
    return;
  }

  if (state.gameOver) {
    render();
    return;
  }

  update(dt, timestamp);
  render();
  requestAnimationFrame(gameLoop);
}

// ===== 啟動 =====
loadAssets();
resetState(CHARACTERS[0].id);
renderCharacterSelect();
lastTime = performance.now();
requestAnimationFrame(gameLoop);

updateGameScale();
window.addEventListener("resize", updateGameScale);
window.addEventListener("orientationchange", () => {
  setTimeout(updateGameScale, 100);
});

bindJoystick();
bindActionButton(document.getElementById("btn-palm"), tryPalmAttack);
bindActionButton(document.getElementById("btn-qi"), tryQiAttack);

document.getElementById("btn-skills").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  toggleSkillMenu();
});

document.getElementById("skill-menu-close").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  toggleSkillMenu();
});

// 防止手機多指/雙擊造成瀏覽器原生縮放（CSS touch-action 之外的第二層防護）
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false }
);
document.addEventListener("dblclick", (e) => e.preventDefault());

window.addEventListener("keydown", unlockAudio, { once: true });
document.addEventListener("pointerdown", unlockAudio, { once: true });
