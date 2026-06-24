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
const STAGE_CONFIGS = [
  { spawnInterval: 1400, hpMult: 1.0, bruteChance: 0.0 },
  { spawnInterval: 1100, hpMult: 1.16, bruteChance: 0.1 },
  { spawnInterval: 865, hpMult: 1.35, bruteChance: 0.18 },
  { spawnInterval: 680, hpMult: 1.56, bruteChance: 0.25 },
  { spawnInterval: 534, hpMult: 1.81, bruteChance: 0.32 },
  { spawnInterval: 420, hpMult: 2.1, bruteChance: 0.38 },
  { spawnInterval: 330, hpMult: 2.44, bruteChance: 0.44 },
  { spawnInterval: 260, hpMult: 2.83, bruteChance: 0.5 },
];

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
const POWER_LEVEL_RATE = 0.06;
const POWER_SKILL_RATE = 0.05;
const POWER_TIME_CAP_SEC = 600;
const POWER_TIME_MAX_BONUS = 0.5;

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

// 技能表（被動）：環身罡氣／破空擲／引氣術／既有自動攻擊
const SKILL_BASE_COST = { orbit: 15, throw: 18, magnet: 12, dash: 14, barrier: 20, vampire: 16, frenzy: 18 };
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

const DASH_DODGE_PER_LEVEL = 0.04; // 與「幻影步」卡片共用 p.dodgeChance，頂部 clamp 35%
const BARRIER_INTERVAL_BASE_SEC = 18;
const BARRIER_INTERVAL_PER_LEVEL_SEC = 4; // 等級越高，護盾重新充能越快
const BARRIER_RING_RADIUS = 46;
const VAMPIRE_CHANCE_PER_LEVEL = 0.03;
const VAMPIRE_HEAL_AMOUNT = 1;
const FRENZY_HP_THRESHOLD = 0.3;
const FRENZY_DMG_PER_LEVEL = 0.15;

// 技能上限與可購買性：homing 永遠釘選顯示、不可購買（透過一般升級卡強化）
const SKILL_DEFS = [
  { id: "homing", name: "鏢氣連射", baseDesc: "自動鎖定最近敵人發射氣彈（既有自動攻擊，透過一般升級卡強化）", purchasable: false, maxLevel: 0 },
  { id: "orbit", name: "環身罡氣", baseDesc: "環繞身周持續傷害周圍敵人，等級越高轉速越快", purchasable: true, maxLevel: 5 },
  { id: "throw", name: "破空擲", baseDesc: "定時擲出貫穿武器擊中最近敵人", purchasable: true, maxLevel: 4 },
  { id: "magnet", name: "引氣術", baseDesc: "擴大內力珠的吸引範圍", purchasable: true, maxLevel: 4 },
  { id: "dash", name: "奇門步", baseDesc: "被動提升閃避機率", purchasable: true, maxLevel: 3 },
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
const CHARACTERS = [
  {
    id: "qingfeng",
    name: "青鋒",
    rimColor: "#3ad6ff",
    bodyColor: "#11131c",
    beltColor: "#ffd84d",
    desc: "掌心劈砍擴散　斬擊四周敵人",
    palmAbility: "nova",
    palmName: "霸王斬",
    spriteKey: "qingfeng",
    conceptKey: "qingfeng_concept",
    spriteHeight: 72,
  },
  {
    id: "yexuan",
    name: "夜玄",
    rimColor: "#c060ff",
    bodyColor: "#160a1f",
    beltColor: "#ff5fd1",
    desc: "分身術　漩渦擴散攻擊",
    palmAbility: "spiral",
    palmName: "魅影分身",
    spriteKey: "yexuan",
    conceptKey: "yexuan_concept",
    spriteHeight: 72,
  },
];

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
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    speed: PLAYER_SPEED,
    hurtUntil: 0,
    invulnUntil: 0,
    qiCooldownUntil: 0,
    animTime: 0,
    trailTimer: 0,
    history: [],
    historyTimer: 0,
    moving: false,
    character,

    level: 1,
    xp: 0,
    xpToNext: XP_BASE_TO_NEXT,
    autoAtkTimer: 0,
    atkDamage: AUTO_ATK_BASE_DAMAGE,
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
    dodgeChance: 0,
    barrierCharge: false,
    barrierTimer: BARRIER_INTERVAL_BASE_SEC,
    skills: {
      homing: { unlocked: true, level: 1 },
      orbit: { unlocked: false, level: 0 },
      throw: { unlocked: false, level: 0 },
      magnet: { unlocked: false, level: 0 },
      dash: { unlocked: false, level: 0 },
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
  entity.hp -= dmg;
  entity.hurtUntil = performance.now() + HURT_EFFECT_DURATION;
  return true;
}

// 護體罡氣：消耗一層護盾吸收本次傷害，並重置充能倒數
function tryAbsorbWithBarrier(entity) {
  if (!entity.barrierCharge) return false;
  entity.barrierCharge = false;
  entity.barrierTimer = getSkillEffect("barrier", "interval");
  spawnShockwave(entity.x, entity.y, BARRIER_RING_RADIUS);
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
  spawnParticle({
    x: proj.x,
    y: proj.y,
    vx: 0,
    vy: 0,
    life: isQi ? 0.3 : 0.18,
    maxLife: isQi ? 0.3 : 0.18,
    size: isQi ? 4 : 2.5,
    color: isQi ? "rgba(255,138,58,0.85)" : "rgba(58,214,255,0.7)",
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
  state.pickupTexts.push({ x, y: y - 14, amount, isLabel: !!isLabel, life: 0.5, maxLife: 0.5, vy: -36 });
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
    ctx.fillStyle = t.isLabel ? "#7adfff" : "#ffe48a";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    ctx.fillText(t.isLabel ? t.amount : `+${t.amount}`, t.x, t.y);
  }
  ctx.restore();
}

// ===== 畫面震動 =====
function triggerShake(duration, magnitude) {
  state.shake.time = duration;
  state.shake.duration = duration;
  state.shake.magnitude = magnitude;
}

function spawnPalmSlash(hitbox, facing) {
  const baseAngle = facing > 0 ? 0 : Math.PI;
  for (let i = 0; i < 7; i++) {
    const angle = baseAngle + (Math.random() - 0.5) * 1.6;
    const speed = 80 + Math.random() * 80;
    spawnParticle({
      x: hitbox.x,
      y: hitbox.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.12,
      maxLife: 0.12,
      size: 3 + Math.random() * 2,
      color: "rgba(120,230,255,0.95)",
      type: "slash",
      glow: true,
    });
  }
}

// ===== 擴散震波（掌震波 AoE 特效） =====
function spawnShockwave(x, y, maxRadius) {
  state.shockwaves.push({ x, y, radius: 10, maxRadius, life: 0.4, maxLife: 0.4 });
}

const SLASH_ARC_COUNT = 6;
const SLASH_ARC_SPAN = 0.9; // 弧長（弧度）

function spawnSlashArcs(x, y, maxRadius) {
  for (let i = 0; i < SLASH_ARC_COUNT; i++) {
    const baseAngle = (Math.PI * 2 * i) / SLASH_ARC_COUNT;
    state.shockwaves.push({
      x,
      y,
      radius: 10,
      maxRadius,
      life: 0.4,
      maxLife: 0.4,
      isSlash: true,
      baseAngle,
    });
  }
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
    ctx.save();
    ctx.globalAlpha = alpha * 0.8;
    ctx.strokeStyle = "#3ad6ff";
    ctx.shadowColor = "#3ad6ff";
    ctx.shadowBlur = 20;
    ctx.lineWidth = 6;
    ctx.beginPath();
    if (s.isSlash) {
      ctx.arc(s.x, s.y, s.radius, s.baseAngle - SLASH_ARC_SPAN / 2, s.baseAngle + SLASH_ARC_SPAN / 2);
    } else {
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    }
    ctx.stroke();
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
const BGM_NORMAL_VOLUME = 0.07;
const BGM_GAMEOVER_VOLUME = 0.025;
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
  oscGain.gain.setValueAtTime(0.001, time);
  oscGain.gain.linearRampToValueAtTime(0.4, time + 0.02);
  oscGain.gain.exponentialRampToValueAtTime(0.001, time + stepSec * 0.9);
  osc.connect(oscGain);
  oscGain.connect(gain);
  osc.start(time);
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

function playTone({ freq, duration, type = "sine", peak = 0.2, freqEnd }) {
  const ctx = getAudioCtx();
  if (!ctx) return;

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
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function playNoiseBurst({ duration, peak = 0.3 }) {
  const ctx = getAudioCtx();
  if (!ctx) return;

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
  gain.connect(ctx.destination);
  noise.start();
  noise.stop(ctx.currentTime + duration);
}

function playPalmSound() {
  // 厚實重低音撞擊：低頻下滑音（衝擊核心）疊加短促噪音（拍擊瞬間）
  playTone({ freq: 150, freqEnd: 45, duration: 0.14, type: "sine", peak: 0.45 });
  playNoiseBurst({ duration: 0.05, peak: 0.3 });
}

function playPalmNovaSound() {
  // 掌震波 AoE：雙層更厚重的次低音衝擊
  playTone({ freq: 90, freqEnd: 30, duration: 0.35, type: "sine", peak: 0.55 });
  playTone({ freq: 55, freqEnd: 20, duration: 0.45, type: "sine", peak: 0.4 });
  playNoiseBurst({ duration: 0.12, peak: 0.35 });
}

function playQiFireSound() {
  // 聚氣（頻率緩升）接續發射衝高的單一滑音特效
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t0 = ctx.currentTime;
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(280, t0);
  osc.frequency.linearRampToValueAtTime(680, t0 + 0.12);
  osc.frequency.linearRampToValueAtTime(1400, t0 + 0.22);
  gain.gain.setValueAtTime(0.001, t0);
  gain.gain.linearRampToValueAtTime(0.22, t0 + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.29);
}

function playHitSound() {
  playTone({ freq: 220, freqEnd: 130, duration: 0.08, type: "triangle", peak: 0.25 });
  playNoiseBurst({ duration: 0.04, peak: 0.18 });
}

function playKillSound() {
  playTone({ freq: 500, freqEnd: 120, duration: 0.22, type: "sawtooth", peak: 0.18 });
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
  if (skillId === "dash") {
    p.dodgeChance = Math.min(0.35, p.dodgeChance + DASH_DODGE_PER_LEVEL);
  }
  if (skillId === "barrier") {
    p.barrierTimer = getSkillEffect("barrier", "interval");
  }
  playLevelUpSound();
  renderSkillMenu();
  updateUI();
}

// 隨機顯示一批（4個）可購買技能；已滿級者排除，不足4個則退回全池
function rollSkillShopOffers() {
  let pool = SKILL_DEFS.filter((d) => d.purchasable && state.player.skills[d.id].level < d.maxLevel);
  if (pool.length < 4) pool = SKILL_DEFS.filter((d) => d.purchasable);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  state.skillShopOffers = shuffled.slice(0, 4).map((d) => d.id);
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

function buildSkillRow(def) {
  const skill = state.player.skills[def.id];
  const row = document.createElement("div");
  row.className = "skill-row";
  if (!def.purchasable) {
    row.innerHTML = `<span class="skill-name">${def.name}</span><span class="skill-desc">${def.baseDesc}</span>`;
    return row;
  }
  const maxed = skill.level >= def.maxLevel;
  const lvlText = skill.unlocked ? `Lv.${skill.level}/${def.maxLevel}` : `未習得 (上限 Lv.${def.maxLevel})`;
  if (maxed) {
    row.innerHTML = `<span class="skill-name">${def.name} <span class="skill-level">${lvlText}</span></span><span class="skill-desc">${def.baseDesc}</span><span class="skill-maxed-badge">已滿級</span>`;
  } else {
    const cost = getSkillUpgradeCost(def.id, skill.level);
    row.innerHTML = `<span class="skill-name">${def.name} <span class="skill-level">${lvlText}</span></span><span class="skill-desc">${def.baseDesc}</span><button class="skill-buy-btn">花費 ${cost}</button>`;
    const btn = row.querySelector(".skill-buy-btn");
    btn.disabled = state.player.currency < cost;
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      trySkillUpgrade(def.id);
    });
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

  updateCamera();
}

// 攝影機鎖定置中於玩家：固定視角的雙搖桿式遊戲，不需要 lerp 平滑
function updateCamera() {
  const p = state.player;
  state.camera.x = p.x - CANVAS_W / 2;
  state.camera.y = p.y - CANVAS_H / 2;
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
function fireHomingVolley(p, target, count, damage, speed, turnRate, radius, kind) {
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
      pierceRemaining: p.pierceCount || 0,
      hitSet: new Set(),
    });
  }
}

function spawnAutoFireBurst(p, angle) {
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
      color: "rgba(255,138,58,0.9)",
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
  spawnAutoFireBurst(p, Math.atan2(target.y - p.y, target.x - p.x));
  const damage = Math.round(p.atkDamage * getEnrageMult(p));
  fireHomingVolley(p, target, p.projCount, damage, p.projSpeed, AUTO_ATK_TURN_RATE, AUTO_ATK_RADIUS, "homing");
}

// 吸血掌：擊殺敵人時有機率回復氣血
function tryVampireHeal() {
  const p = state.player;
  const skill = p.skills.vampire;
  if (!skill.unlocked || skill.level <= 0) return;
  if (Math.random() < skill.level * VAMPIRE_CHANCE_PER_LEVEL) {
    p.hp = Math.min(p.maxHp, p.hp + VAMPIRE_HEAL_AMOUNT);
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
  return Math.round(QI_DAMAGE * (1 + (p.level - 1) * QI_GROWTH_RATE) * getEnrageMult(p));
}

function tryQiAttack() {
  const p = state.player;
  const now = performance.now();
  if (now < p.qiCooldownUntil) return;
  p.qiCooldownUntil = now + QI_COOLDOWN;
  playQiFireSound();

  const damage = getQiDamage();
  const target = findNearestEnemy(p.x, p.y);
  if (target) {
    fireHomingVolley(p, target, 1, damage, QI_SPEED, QI_TURN_RATE, QI_RADIUS, "qi");
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
      pierceRemaining: p.pierceCount || 0,
      hitSet: new Set(),
    });
  }
}

function tryPalmAttack() {
  const p = state.player;
  if (p.palmCharges <= 0) return;
  p.palmCharges -= 1;

  if (p.character && p.character.palmAbility === "spiral") {
    palmSpiral(p);
  } else {
    palmNova(p);
  }
}

function getPalmDamage() {
  const p = state.player;
  return Math.round(PALM_NOVA_DAMAGE * (1 + (p.level - 1) * PALM_GROWTH_RATE) * getEnrageMult(p));
}

function getSpiralBladeDamage() {
  return Math.round(getPalmDamage() * 0.6);
}

function palmNova(p) {
  triggerShake(0.25, 14);
  playPalmNovaSound();
  spawnSlashArcs(p.x, p.y, p.palmRadius);
  spawnPalmSlash(p, 1);
  spawnPalmSlash(p, -1);
  spawnExplosion(p.x, p.y, "rgba(58,214,255,0.9)", 20);

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
  if (hitAny) playHitSound();
}

function palmSpiral(p) {
  triggerShake(0.2, 10);
  playPalmNovaSound();
  spawnExplosion(p.x, p.y, "rgba(192,96,255,0.9)", 16);
  spawnExplosion(p.x, p.y, "rgba(40,10,60,0.85)", 10);

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

const SPIRAL_TRAIL_LAYERS = [
  { angleOffset: 0, radiusOffset: 0, alphaMult: 1, color: "#d68dff" },
  { angleOffset: -0.16, radiusOffset: -5, alphaMult: 0.5, color: "#8a3ad6" },
  { angleOffset: -0.32, radiusOffset: -10, alphaMult: 0.25, color: "#3d1654" },
];

function drawSpirals() {
  const p = state.player;
  for (const s of state.spirals) {
    const baseAlpha = Math.max(0, s.life / s.maxLife);
    for (const layer of SPIRAL_TRAIL_LAYERS) {
      const a = baseAlpha * layer.alphaMult;
      if (a <= 0.01) continue;
      const ang = s.angle + layer.angleOffset;
      const rad = Math.max(4, s.radius + layer.radiusOffset);
      const x = p.x + Math.cos(ang) * rad;
      const y = p.y + Math.sin(ang) * rad;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x, y);
      ctx.rotate(ang + Math.PI / 2);
      ctx.shadowColor = layer.color;
      ctx.shadowBlur = 12;
      const len = SPIRAL_BLADE_RADIUS * 1.5;
      const grad = ctx.createLinearGradient(-len, 0, len, 0);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, layer.color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, len, SPIRAL_BLADE_RADIUS * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
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
  const powerScale = getPowerScaleFactor();

  const isBrute = Math.random() < stageConfig.bruteChance;
  const baseHp = ENEMY_MAX_HP * stageConfig.hpMult * typeDef.hpMult * powerScale;
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
  const powerScale = getPowerScaleFactor();
  const hp = Math.round(ENEMY_MAX_HP * stageConfig.hpMult * BOSS_HP_MULT * powerScale);

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
    spawnEnemy();
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
      spawnExplosion(proj.x, proj.y, "rgba(255,216,77,0.9)", 10);
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
  CHARACTERS.forEach((c) => {
    const card = document.createElement("button");
    card.className = "character-card";
    card.innerHTML = `<div class="character-swatch" style="background:${c.bodyColor};border:2px solid ${c.rimColor};box-shadow:0 0 10px ${c.rimColor};"></div><span class="character-name">${c.name}</span><span class="character-desc">${c.desc}</span>`;
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
}

function startGameWithCharacter(id) {
  document.getElementById("character-select").classList.add("hidden");
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

function drawPlayerShape(x, y, facing, animTime, moving, hurt, alpha) {
  const p = state.player;
  const character = p.character || CHARACTERS[0];
  const wobbleFreq = moving ? 10 : 3;
  const wobbleAmp = moving ? 2 : 1;
  const bob = Math.sin(animTime * wobbleFreq) * wobbleAmp;
  const swayL = Math.sin(animTime * wobbleFreq) * 3;
  const swayR = Math.sin(animTime * wobbleFreq + Math.PI) * 3;
  const capeSwayL = Math.sin(animTime * wobbleFreq) * 6;
  const capeSwayR = Math.sin(animTime * wobbleFreq + Math.PI) * 6;
  const rimColor = hurt ? "#ff4444" : character.rimColor;
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
// 目前兩名角色都還沒有正式 sprite，因此一律走 drawPlayerShape() 的 Canvas 繪製。
function drawPlayerSprite(x, y, facing, animTime, moving, hurt, alpha, character) {
  const sprite = character && character.spriteKey && assetImages[character.spriteKey];
  if (!sprite) {
    drawPlayerShape(x, y, facing, animTime, moving, hurt, alpha);
    return;
  }
  const h = character.spriteHeight || 72;
  const w = (sprite.width / sprite.height) * h;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (facing < 0) ctx.scale(-1, 1);
  ctx.drawImage(sprite, -w / 2, -h, w, h);
  ctx.restore();
}

function drawPlayer() {
  const p = state.player;
  const hurt = isHurt(p);

  // 殘影特效：移動中由舊到新、由淡到濃的剪影分身
  for (let i = 0; i < p.history.length; i++) {
    const h = p.history[i];
    const alpha = ((i + 1) / (p.history.length + 1)) * 0.35;
    drawPlayerSprite(h.x, h.y, h.facing, h.animTime, true, false, alpha, p.character);
  }

  drawPlayerSprite(p.x, p.y, p.facing, p.animTime, p.moving, hurt, 1, p.character);
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

function drawProjectile(proj) {
  ctx.save();
  ctx.translate(proj.x, proj.y);
  ctx.rotate(Math.atan2(proj.vy, proj.vx));

  // homing／qi／throw 皆共用同一套黃橙發光橢圓視覺
  const len = proj.radius * 3.6;
  const grad = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
  grad.addColorStop(0, "rgba(255,138,58,0)");
  grad.addColorStop(0.6, "#ffd84d");
  grad.addColorStop(1, "#ff8a3a");
  ctx.fillStyle = grad;
  ctx.shadowColor = "#ff8a3a";
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.ellipse(0, 0, len / 2, proj.radius, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

const HORIZON_Y = CANVAS_H * 0.65;

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

const GROUND_DECOR_SPACING = 140;

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
  ctx.globalAlpha = 0.5;
  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const hash = Math.abs(Math.sin(col * 12.9898 + row * 78.233) * 43758.5453) % 1;
      if (hash > 0.22) continue;
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

function drawBackground() {
  const scene = getCurrentScene();
  const bgImg = scene.bgKey && assetImages[scene.bgKey];

  if (bgImg) {
    // 已載入美術背景圖：直接鋪滿畫面，疊一層暗色遮罩避免過亮，
    // 不再疊加 procedural 地面點。
    ctx.drawImage(bgImg, 0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = "rgba(0,0,0,0.26)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
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

  // 遠山輪廓：水平方向以 CANVAS_W 為週期，隨攝影機 x 捲動
  const mountainOffset = ((state.camera.x % CANVAS_W) + CANVAS_W) % CANVAS_W;
  ctx.fillStyle = scene.mountainColor;
  for (const xOff of [-mountainOffset - CANVAS_W, -mountainOffset, -mountainOffset + CANVAS_W]) {
    for (const m of FAR_MOUNTAINS) {
      ctx.beginPath();
      ctx.moveTo(xOff + m.baseX - m.width / 2, HORIZON_Y);
      ctx.lineTo(xOff + m.baseX, HORIZON_Y - m.height);
      ctx.lineTo(xOff + m.baseX + m.width / 2, HORIZON_Y);
      ctx.closePath();
      ctx.fill();
    }
  }

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
  drawSpirals();
  drawOrbiters();
  drawPlayer();
  drawDamageTexts();
  drawPickupTexts();
  ctx.restore();

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
