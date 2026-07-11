// ===== game.js（遊戲邏輯層）=====
// 渲染已全面移交 engine3d.js（Three.js 2.5D）；本檔保留全部玩法邏輯、輸入、UI DOM 與音訊合成。
import {
  initEngine,
  engineRender,
  engineReset,
  applyScene,
  sceneTransition,
  setBossTint,
  fxLight,
  worldToScreen,
  __debugState,
  __projectPoint,
} from "./engine3d.js";

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
  loadImage("qingfeng", "assets/characters/char_blue_200.png");
  loadImage("yexuan", "assets/characters/char_purple_200.png");
  loadImage("qingfeng_card", "assets/characters/char_blue_400.png");
  loadImage("yexuan_card", "assets/characters/char_purple_400.png");
  loadImage("qingfeng_fx_basic", "assets/characters/fx_red_basic_256.png");
  loadImage("qingfeng_fx_ult", "assets/characters/fx_red_ult_512.png");
  loadImage("yexuan_fx_basic", "assets/characters/fx_purple_basic_256.png");
  loadImage("yexuan_fx_ult", "assets/characters/fx_purple_ult_512.png");
  loadImage("bingyun", "assets/characters/char_white_200.png");
  loadImage("bingyun_card", "assets/characters/char_white_400.png");
  loadImage("bingyun_fx_basic", "assets/characters/fx_blue_basic_256.png");
  loadImage("bingyun_fx_ult", "assets/characters/fx_blue_ult_512.png");

  // P19：五場景全螢幕背景相片（使用者提供）。走既有的安全載入模式——檔案不存在時 loadImage 只會
  // console.warn，assetImages[key] 保持 undefined，engine3d.js 會自動退回程序化場景（天空/地面/道具），零風險。
  loadImage("bg_autumn", "assets/backgrounds/autumn.jpg");
  loadImage("bg_snow", "assets/backgrounds/snow.jpg");
  loadImage("bg_floating", "assets/backgrounds/floating.jpg");
  loadImage("bg_storm", "assets/backgrounds/storm.jpg");
  loadImage("bg_inferno", "assets/backgrounds/inferno.jpg");
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
const MIN_SPAWN_INTERVAL_MS = 200; // P19：220→200
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
  // P19：末四關 bruteChance 上調（0.55/0.58/0.60/0.62 → 0.60/0.65/0.68/0.72），後期壓力明顯化
  { spawnInterval: 245, hpMult: 2.4, bruteChance: 0.6 },
  { spawnInterval: 235, hpMult: 2.6, bruteChance: 0.65 },
  { spawnInterval: 225, hpMult: 2.8, bruteChance: 0.68 },
  { spawnInterval: 220, hpMult: 3.0, bruteChance: 0.72 },
];

// 同時存在敵人數上限：超過此數時暫停出怪（既有敵人不會被強制移除），避免後期關卡無限疊加造成嚴重lag
const MAX_ALIVE_ENEMIES = 70;

// P17：菁英怪詞綴——第4關（index 3）起，通過 brute 判定之外另擲 10% 機率成為菁英
// swift=疾速（藍光）、split=分裂（綠光，死亡分裂2小怪）、blast=爆炸（橘光，死亡自爆傷玩家）
const ELITE_START_STAGE = 2; // P19：3→2，菁英更早出現
const ELITE_CHANCE = 0.16; // P19：0.10→0.16
const ELITE_TYPES = ["swift", "split", "blast"];
const ELITE_HP_MULT = 1.6;
const ELITE_SCORE_MULT = 2.5;

// 新怪種剛登場時的緩衝（只套用在 volley 身上，避免遠程攻擊一登場就太密集）
// P18：新增 3 種輪廓明顯不同的敵人（尖刺魔/環爪魔/裂魂蟲），沿用既有行為邏輯（chase/kiter/ambush），
// 只在視覺（engine3d.js 的新 make*Texture）與數值定位上做出區隔，不需要新的戰鬥邏輯
const TYPE_FIRST_STAGE = { drifter: 0, skitter: 1, lurker: 2, volley: 3, juggernaut: 4, spiker: 5, ringer: 7, serpent: 9 };
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
  // P18：尖刺魔——高速衝撞型玻璃大砲，血少但速度極快，第6關登場
  spiker: { hpMult: 0.45, speedMult: 1.9, touchMult: 1.1, radiusMult: 0.85, behavior: "chase" },
  // P18：環爪魔——遠程牽制型，比 volley 更肉但射速較慢，第8關登場
  ringer: { hpMult: 1.1, speedMult: 0.6, touchMult: 0.6, radiusMult: 1.1, behavior: "kiter", keepDistance: 180, fireIntervalMs: 2200 },
  // P18：裂魂蟲——潛伏突襲型，比 lurker 更厚重的一擊，第10關登場
  serpent: {
    hpMult: 1.5,
    speedMult: 0.95,
    touchMult: 1.3,
    radiusMult: 1.15,
    behavior: "ambush",
    triggerRadius: 150,
    dashSpeedMult: 2.0,
    warningSec: 0.5,
  },
};

// 每關出場的一般小怪 pool（最多 2 種，新種類加入時淘汰最舊的一種）
// P18：把原本第6-12關單純重複舊組合的部分，換成分批登場尖刺魔(第6關)/環爪魔(第8關)/裂魂蟲(第10關)，
// 讓後段關卡也有新鮮感，呼應「敵人新造型」的回饋
const STAGE_NORMAL_TYPE_POOL = [
  ["drifter"],
  ["drifter", "skitter"],
  ["skitter", "lurker"],
  ["lurker", "volley"],
  ["volley", "juggernaut"],
  ["drifter", "spiker"],
  ["skitter", "juggernaut"],
  ["lurker", "ringer"],
  ["volley", "juggernaut"],
  ["spiker", "serpent"],
  ["ringer", "juggernaut"],
  ["drifter", "serpent"],
];

const ENEMY_VISUALS = {
  drifter: { core: "#ff66cc", mid: "#9b30d9", edge: "#3a0a4d", glow: "#c040ff" },
  skitter: { core: "#9dffb0", mid: "#2fae54", edge: "#0d3a1a", glow: "#3ad66a" },
  lurker: { core: "#ffe48a", mid: "#b8860b", edge: "#3a2a05", glow: "#d9a30a" },
  volley: { core: "#9adcff", mid: "#1f7fae", edge: "#0a2a3a", glow: "#3ad6ff" },
  juggernaut: { core: "#ffaa55", mid: "#d9530a", edge: "#4d1a05", glow: "#ff6a00" },
  boss: { core: "#ffffff", mid: "#ff3344", edge: "#330008", glow: "#ff2244" },
  spiker: { core: "#ffe0e0", mid: "#ff3355", edge: "#4a0a15", glow: "#ff2255" },
  ringer: { core: "#e0f7ff", mid: "#3aa0d6", edge: "#0a2a3a", glow: "#4dc8ff" },
  serpent: { core: "#e0ffd0", mid: "#5ad64a", edge: "#0f3a0a", glow: "#7aff4d" },
};

// 敵方彈道（遠程小怪 volley/ringer 與最終Boss彈幕共用）
// P19：彈速上調、傷害改為發射時隨玩家成長係數計算（原本寫死 7 點打到後期完全無感）
const ENEMY_PROJECTILE_SPEED = 170;
const ENEMY_PROJECTILE_DAMAGE = 7; // 基準值，實際傷害 = 基準 × (1 + (powerScale-1) × 0.5)
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
// P18：新增 3 個技能延伸科技樹，把「全部點滿」的時間點往後推，同時錢有更多實際玩法差異的地方可花
// （原本只需 793 內力珠、約 4.5-6 分鐘/第 6-7 關即可點滿全部 6 個技能，之後的錢完全沒有去處）
const SKILL_BASE_COST = {
  orbit: 15, throw: 18, magnet: 12, barrier: 20, vampire: 16, frenzy: 18,
  windstep: 22, chainblast: 28, bladestorm: 25,
};
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

// 疾風步（機動類被動）：純移動速度加成，不動攻速/防禦數值，避免再壓低「幾乎不掉血」的問題
const WINDSTEP_MOVESPEED_PER_LEVEL = 0.06; // 滿級（5）+30% 移速

// 追魂爆（攻擊類主動）：定時觸發一次連鎖爆破，在鄰近敵人間跳躍傷害，等級越高跳躍次數越多
const CHAIN_BLAST_BASE_DAMAGE = 14;
const CHAIN_BLAST_BASE_INTERVAL_MS = 2600;
const CHAIN_BLAST_JUMP_RADIUS = 140; // 每次跳躍搜尋下一個目標的半徑

// 破空連斬（攻擊類主動）：定時向四面八方射出一輪貫穿刀氣，等級越高刀刃數越多、間隔越短
const BLADESTORM_BASE_DAMAGE = 9;
const BLADESTORM_BASE_INTERVAL_MS = 3400;
const BLADESTORM_BASE_COUNT = 6;
const BLADESTORM_SPEED = 260;
const BLADESTORM_RADIUS = 9;

const BARRIER_INTERVAL_BASE_SEC = 18;
const BARRIER_INTERVAL_PER_LEVEL_SEC = 4; // 等級越高，護盾重新充能越快
const BARRIER_RING_RADIUS = 46;
// P15：原 0.03/flat 1血 幾乎無感（對比maxHp 120-190），改為機率與回復量都隨等級顯著提升並给視覺回饋
const VAMPIRE_CHANCE_PER_LEVEL = 0.12;
const VAMPIRE_HEAL_BASE = 5;
const VAMPIRE_HEAL_PER_LEVEL = 3;
const VAMPIRE_FX_DURATION = 400; // 吸血觸發時角色身上綠色光暈的持續時間（毫秒）
// P19：狂狼之力改造「擊殺疊狂」——原本血量<30%才觸發，但玩家幾乎不掉血導致技能形同虛設；
// 改為擊殺疊層加傷、限時維持：持續殺戮=持續狂化，停手就消退，任何血量都有意義
const FRENZY_STACK_WINDOW_MS = 4000; // 每次擊殺刷新的維持時間
const FRENZY_BASE_MAX_STACKS = 4; // 疊層上限 = 4 + 等級×2（滿級3 → 10層）
const FRENZY_STACKS_PER_LEVEL = 2;
const FRENZY_DMG_PER_STACK_PER_LEVEL = 0.025; // 每層傷害加成 = 0.025×等級（滿級滿層 ≈ +75%）

// 每個技能對應一個代表色，用於商店列左側色條／點陣，讓玩家能用顏色快速分辨技能性質
const SKILL_COLORS = {
  homing: "#3ad6ff",
  orbit: "#3ad6ff",
  throw: "#ff8a3a",
  magnet: "#7fe8ff",
  barrier: "#ffd84d",
  vampire: "#ff4d6a",
  frenzy: "#c060ff",
  windstep: "#4dff9e",
  chainblast: "#e6ff4d",
  bladestorm: "#ff5ecb",
};

// 技能上限與可購買性：homing 永遠釘選顯示、不可購買（透過一般升級卡強化）
const SKILL_DEFS = [
  { id: "homing", name: "鏢氣連射", baseDesc: "自動鎖定最近敵人發射氣彈（既有自動攻擊，透過一般升級卡強化）", purchasable: false, maxLevel: 0 },
  { id: "orbit", name: "環身罡氣", baseDesc: "環繞身周持續傷害周圍敵人，等級越高轉速越快", purchasable: true, maxLevel: 5 },
  { id: "throw", name: "破空擲", baseDesc: "定時擲出貫穿武器擊中最近敵人", purchasable: true, maxLevel: 4 },
  { id: "magnet", name: "引氣術", baseDesc: "擴大內力珠的吸引範圍", purchasable: true, maxLevel: 4 },
  { id: "barrier", name: "護體罡氣", baseDesc: "定時獲得一層護盾，吸收一次傷害", purchasable: true, maxLevel: 3 },
  { id: "vampire", name: "吸血掌", baseDesc: "擊殺敵人時有機率回復氣血", purchasable: true, maxLevel: 3 },
  { id: "frenzy", name: "狂狼之力", baseDesc: "擊殺疊層提升傷害（限時維持，持續殺戮保持狂化）", purchasable: true, maxLevel: 3 },
  { id: "windstep", name: "疾風步", baseDesc: "永久提升移動速度", purchasable: true, maxLevel: 5 },
  { id: "chainblast", name: "追魂爆", baseDesc: "定時引爆鄰近敵人並連鎖跳躍，等級越高跳躍數越多", purchasable: true, maxLevel: 5 },
  { id: "bladestorm", name: "破空連斬", baseDesc: "定時向四面八方射出貫穿刀氣，等級越高刀刃越多", purchasable: true, maxLevel: 4 },
];

// 每技能 base/perLevel 線性係數，取代統一的 skillScale；未列出者用預設值
const SKILL_TUNING = {
  orbit: { perLevel: 0.36 }, // 滿級（5）≈2.8x 傷害
  throw: { perLevel: 0.4125 }, // 滿級（4）≈2.65x 傷害
  chainblast: { perLevel: 0.35 }, // 滿級（5）≈2.75x 傷害
  bladestorm: { perLevel: 0.3 }, // 滿級（4）≈2.9x 傷害
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
    spriteFacesLeft: true,
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
    spriteFacesLeft: true,
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
      applyPlayerSpeed(p);
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
  chests: [],
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
  // P17 新增
  victoryPause: false,
  victoryShown: false,
  finalBossSpawned: false,
  killStreak: 0,
  killStreakUntil: 0,
  stageBannerUntil: 0,
  trialMods: { tier: 0, hpMult: 1, dmgMult: 1, scoreMult: 1, dropMult: 1 },
  curses: [],
  altars: [],
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
    chainBlastTimer: CHAIN_BLAST_BASE_INTERVAL_MS,
    bladestormTimer: BLADESTORM_BASE_INTERVAL_MS,
    vacuumPulseUntil: 0,
    dodgeChance: character.baseDodge,
    defense: character.defense,
    barrierCharge: false,
    barrierTimer: BARRIER_INTERVAL_BASE_SEC,
    blockFlashUntil: 0,
    vampireFxUntil: 0,
    frenzyParticleTimer: 0,
    frenzyStacks: 0,
    frenzyStackUntil: 0,
    // P17：技能進化系統
    cardCounts: {},
    orbitEvolved: false,
    throwEvolved: false,
    vampireEvolved: false,
    skills: {
      homing: { unlocked: true, level: 1 },
      orbit: { unlocked: false, level: 0 },
      throw: { unlocked: false, level: 0 },
      magnet: { unlocked: false, level: 0 },
      barrier: { unlocked: false, level: 0 },
      vampire: { unlocked: false, level: 0 },
      frenzy: { unlocked: false, level: 0 },
      windstep: { unlocked: false, level: 0 },
      chainblast: { unlocked: false, level: 0 },
      bladestorm: { unlocked: false, level: 0 },
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
  state.chests = [];
  state.curses = [];
  state.altars = [];
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
  state.victoryPause = false;
  state.victoryShown = false;
  state.finalBossSpawned = false;
  state.killStreak = 0;
  state.killStreakUntil = 0;
  state.stageBannerUntil = 0;

  snapshotTrialMods();
  engineReset();
  applyScene(STAGE_SCENE_INDEX[0], true);
  setBossTint(false);

  setBgmVolume(BGM_NORMAL_VOLUME);
  document.getElementById("victory-screen").classList.add("hidden");
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
  if (entity === state.player) {
    // P19：試煉階敵傷倍率——統一在唯一的傷害入口套用，涵蓋碰撞/彈道/Boss衝擊波所有來源
    dmg = Math.round(dmg * state.trialMods.dmgMult);
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
  // 霜凜氣勁專屬冰藍拖尾（原 hotfix 覆寫邏輯併回本體）
  if (proj && proj.imgKey === "bingyun_fx_basic") {
    spawnParticle({
      x: proj.x, y: proj.y, vx: 0, vy: 0,
      life: 0.34, maxLife: 0.34, size: 4,
      color: "rgba(189,244,255,0.82)", type: "trail", glow: false,
    });
    return;
  }
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
  p.trailTimer = 70;

  // P18：加大尺寸＋開啟 glow，讓移動時的氣勁殘影在 3D 加色混合渲染下更明顯可辨，
  // 強化「角色正在移動」的視覺回饋（呼應使用者反映動作不夠明顯的回報）
  spawnParticle({
    x: p.x - p.facing * 6,
    y: p.y + p.h / 2 - 4,
    vx: 0,
    vy: 0,
    life: 0.3,
    maxLife: 0.3,
    size: 5,
    color: "rgba(58,214,255,0.6)",
    type: "playerTrail",
    glow: true,
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
// ===== 怪物掉落物（內力珠，須走過去拾取，magnet 技能可擴大吸引半徑） =====
function rollCurrencyDrop(e) {
  const isBoss = e.type === "boss";
  if (!isBoss && Math.random() >= CURRENCY_DROP_CHANCE) return;
  let amount = CURRENCY_DROP_MIN + Math.floor(Math.random() * (CURRENCY_DROP_MAX - CURRENCY_DROP_MIN + 1));
  if (e.isBrute) amount *= CURRENCY_BRUTE_DROP_MULT;
  if (isBoss) amount *= BOSS_DROP_MULT;
  // P19：試煉掉落倍率＋詛咒層數加成（每層 +10%）——高風險高報酬的核心迴圈
  amount = Math.max(1, Math.round(amount * state.trialMods.dropMult * (1 + state.curses.length * 0.1)));
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
// ===== 技能特效圖層（普攻／必殺美術特效，疊加於玩家位置） =====
function spawnFxOverlay(x, y, imgKey, fromScale, toScale, durationMs, rotateDeg) {
  if (!imgKey) return;
  // 霜凜特效圖尺寸不同，統一在此收斂縮放/時長參數（原 hotfix 覆寫邏輯併回本體）
  if (imgKey === "bingyun_fx_basic") {
    fromScale = 0.18; toScale = 0.75; durationMs = 320; rotateDeg = 0;
  } else if (imgKey === "bingyun_fx_ult") {
    fromScale = 0.35; toScale = 1.25; durationMs = 1050; rotateDeg = 0;
  }
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

// ===== 背景音樂（Web Audio 多聲部合成：旋律／低音／鼓組／和弦 pad，關卡強度分層） =====
const BGM_NORMAL_VOLUME = 0.5;
const BGM_GAMEOVER_VOLUME = 0.2;
const BGM_TEMPO = 96; // BPM
const BGM_TEMPO_BOSS = 118; // BPM，boss 戰更緊湊
const BGM_PATTERN = [0, 2, 1, 3, 2, 4, 3, 1];
const BGM_PATTERN_BOSS = [4, 3, 4, 1, 3, 0, 3, 2, 4, 2, 1, 3]; // boss 戰更密集緊張的音型

// P19 五場景各自的五聲調式與鼓組密度：
// 楓落古鎮 G 徵（暖）、雪月神居 D 羽（清冷）、浮空遺境 A 商（空靈）、
// 紫雷絕壁 E 角（緊張）、血焰魔域低音快板（終章壓迫感）
const BGM_MODES = [
  { scale: [196.0, 220.0, 246.94, 293.66, 329.63], drumDensity: 0.9 },
  { scale: [146.83, 174.61, 196.0, 220.0, 261.63], drumDensity: 0.6 },
  { scale: [220.0, 246.94, 293.66, 329.63, 392.0], drumDensity: 0.8 },
  { scale: [164.81, 196.0, 220.0, 261.63, 293.66], drumDensity: 1.2 },
  { scale: [130.81, 155.56, 174.61, 196.0, 233.08], drumDensity: 1.4 },
];

function getBgmMode() {
  return BGM_MODES[STAGE_SCENE_INDEX[state.stage] || 0];
}

// 關卡強度分層：1-3 關只有旋律+pad，4-7 關進低音+輕鼓，8 關以上全聲部
function getBgmIntensity() {
  if (state.stage >= 7) return 3;
  if (state.stage >= 3) return 2;
  return 1;
}

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

// 排程用聲部 helper：指定時間點的單音（給 BGM，走 bgmGain）
function bgmTone(time, { freq, dur, type = "sine", peak = 0.2, attack = 0.006, freqEnd }) {
  const ctx = getAudioCtx();
  const gain = ensureBgmGain();
  if (!ctx || !gain) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), time + dur);
  g.gain.setValueAtTime(0.001, time);
  g.gain.linearRampToValueAtTime(peak, time + attack);
  g.gain.exponentialRampToValueAtTime(0.001, time + dur);
  osc.connect(g);
  g.connect(gain);
  osc.start(time);
  osc.stop(time + dur + 0.05);
}

// 排程用噪音（鼓組：hat／snare），可調濾波特性以模擬不同鼓件
function bgmNoise(time, { dur, peak = 0.15, filterType, filterFreq }) {
  const ctx = getAudioCtx();
  const gain = ensureBgmGain();
  if (!ctx || !gain) return;
  const frameCount = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + dur);
  let node = noise;
  if (filterType) {
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq || 4000;
    noise.connect(filter);
    node = filter;
  }
  node.connect(g);
  g.connect(gain);
  noise.start(time);
  noise.stop(time + dur + 0.02);
}

function scheduleBgmStep(time) {
  const ctx = getAudioCtx();
  const gain = ensureBgmGain();
  if (!ctx || !gain) return;

  const stepSec = getBgmStepSec();
  const pattern = getBgmPattern();
  const mode = getBgmMode();
  const intensity = getBgmIntensity();
  const boss = state.bossActive;
  // Boss 期間整體半音下移，營造壓迫感
  const pitchShift = boss ? 0.9439 : 1;
  const scale = mode.scale;
  const step = bgmStepIndex;

  // --- 聲部 1：主旋律（撥弦，古琴/琵琶式包絡：快起音、兩段衰減）---
  const note = pattern[step % pattern.length];
  const freq = scale[note] * pitchShift;
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  oscGain.gain.setValueAtTime(0.001, time);
  oscGain.gain.linearRampToValueAtTime(0.4, time + 0.006);
  oscGain.gain.exponentialRampToValueAtTime(0.085, time + stepSec * 0.35);
  oscGain.gain.exponentialRampToValueAtTime(0.001, time + stepSec * 0.95);
  osc.connect(oscGain);
  oscGain.connect(gain);
  osc.start(time);
  osc.stop(time + stepSec);
  // 撥弦指尖瞬態
  bgmTone(time, { freq: freq * 2.5, dur: 0.03, type: "triangle", peak: 0.11, attack: 0.001 });

  // --- 聲部 2：和弦 pad（每 8 步一次，根音＋五度，慢起音鋸齒+暗色音量）---
  if (step % 8 === 0) {
    bgmTone(time, { freq: scale[0] * pitchShift, dur: stepSec * 8, type: "sawtooth", peak: 0.05, attack: stepSec * 2 });
    bgmTone(time, { freq: scale[3] * pitchShift, dur: stepSec * 8, type: "sawtooth", peak: 0.035, attack: stepSec * 2.5 });
  }

  // --- 聲部 3：低音（強度 2 以上，每 2 步根音/五度交替的沉底正弦）---
  if (intensity >= 2 && step % 2 === 0) {
    const bassNote = step % 8 < 4 ? scale[0] / 2 : scale[3] / 4;
    bgmTone(time, { freq: bassNote * pitchShift, dur: stepSec * 1.8, type: "sine", peak: 0.3, attack: 0.01 });
  } else if (step % 4 === 0) {
    // 低強度時保留原本的 drone 底
    bgmTone(time, { freq: (scale[0] / 2) * pitchShift, dur: stepSec * 4, type: "sine", peak: 0.28, attack: 0.3 });
  }

  // --- 聲部 4：鼓組（強度 2 起輕鼓，強度 3 全開；Boss 期間密度加倍）---
  const density = mode.drumDensity * (boss ? 2 : 1);
  if (intensity >= 2) {
    if (step % 4 === 0) {
      // kick：低頻掃頻正弦
      bgmTone(time, { freq: 130, freqEnd: 38, dur: 0.13, type: "sine", peak: 0.4, attack: 0.002 });
    }
    if ((step % 2 === 1 && density >= 1) || (boss && density >= 1.4)) {
      // hi-hat：高通短噪
      bgmNoise(time, { dur: 0.035, peak: 0.09 * density, filterType: "highpass", filterFreq: 6000 });
    }
    if (intensity >= 3 && step % 8 === 4) {
      // snare：帶通中頻噪
      bgmNoise(time, { dur: 0.1, peak: 0.16, filterType: "bandpass", filterFreq: 1800 });
    }
  }

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

function playKillSound(streak = 0) {
  // 擊殺反饋：低頻下滑音＋短促噪音；連殺時音調沿五聲音階逐級上升，營造 combo 爽感
  const pitchMult = 1 + Math.min(streak, 8) * 0.09;
  playTone({ freq: 240 * pitchMult, freqEnd: 60 * pitchMult, duration: 0.2, type: "triangle", peak: 0.32 });
  playNoiseBurst({ duration: 0.06, peak: 0.24 });
}

function playBossDeathSound() {
  // Boss 死亡：長尾雙層爆音＋噪音殘響，明確標記戰鬥節點結束
  playTone({ freq: 60, freqEnd: 18, duration: 0.9, type: "sine", peak: 0.6 });
  playTone({ freq: 180, freqEnd: 40, duration: 0.5, type: "triangle", peak: 0.35 });
  playNoiseBurst({ duration: 0.4, peak: 0.4 });
}

function playEvolveSound() {
  // 技能進化：上行五聲琶音＋亮音收尾，與一般升級音明確區隔
  const notes = [294, 392, 494, 659, 784, 988];
  notes.forEach((freq, i) => {
    setTimeout(() => playTone({ freq, duration: 0.22, type: "triangle", peak: 0.24 }), i * 80);
  });
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
    // 技能進化：條件達成時，金色進化卡取代第一張普通卡
    const evolution = getAvailableEvolution();
    if (evolution) state.upgradeChoices[0] = evolution;
    renderUpgradeCards();
  }
}

function renderUpgradeCards() {
  const container = document.getElementById("level-up-cards");
  container.innerHTML = "";
  state.upgradeChoices.forEach((choice, i) => {
    const card = document.createElement("button");
    card.className = choice.isEvolution ? "upgrade-card evolution-card" : "upgrade-card";
    const evoTag = choice.isEvolution ? `<span class="evolution-tag">進化</span>` : "";
    card.innerHTML = `<span class="upgrade-key">${i + 1}</span><span class="upgrade-text"><span class="upgrade-name">${choice.name}${evoTag}</span><span class="upgrade-stat">${choice.stat}</span></span>`;
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
  // 記錄一般升級卡的選取次數，供技能進化條件判定
  if (choice.id && !choice.isEvolution && !String(choice.id).startsWith("chest_")) {
    state.player.cardCounts[choice.id] = (state.player.cardCounts[choice.id] || 0) + 1;
  }
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
  if (skillId === "windstep") {
    if (field === "moveSpeedMult") return 1 + level * WINDSTEP_MOVESPEED_PER_LEVEL;
  }
  if (skillId === "chainblast") {
    if (field === "damage") return Math.round(CHAIN_BLAST_BASE_DAMAGE * skillMult("chainblast", level));
    if (field === "interval") return CHAIN_BLAST_BASE_INTERVAL_MS;
    if (field === "jumps") return 1 + level;
  }
  if (skillId === "bladestorm") {
    if (field === "damage") return Math.round(BLADESTORM_BASE_DAMAGE * skillMult("bladestorm", level));
    if (field === "interval") return Math.max(1400, BLADESTORM_BASE_INTERVAL_MS - level * 300);
    if (field === "count") return BLADESTORM_BASE_COUNT + level;
  }
  return 0;
}

// 疾風步：把所有移動速度來源（升級卡疊乘的 moveSpeedMult ＋ 疾風步等級加成）彙整成最終速度，
// 供升級卡與技能升級兩處共用，避免各自獨立相乘造成重複套用或彼此覆蓋
function applyPlayerSpeed(p) {
  const windstepMult = p.skills.windstep && p.skills.windstep.unlocked ? getSkillEffect("windstep", "moveSpeedMult") : 1;
  p.speed = PLAYER_SPEED * p.moveSpeedMult * windstepMult;
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
  if (skillId === "windstep") {
    applyPlayerSpeed(p);
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

// 破空連斬專用：不追蹤目標，均勻朝四面八方發射一輪彈道（結構與 fireHomingVolley 相同，
// 差異只在 homing:false 且角度平均分布 360 度，不需要指定目標）
function fireRadialBurst(p, count, damage, speed, radius, kind, opts = {}) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    state.projectiles.push({
      x: p.x,
      y: p.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
      damage,
      homing: false,
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
  // 噬血真經進化：觸發率×1.5、溢出治療轉為一層護盾
  const chanceMult = p.vampireEvolved ? 1.5 : 1;
  if (Math.random() < skill.level * VAMPIRE_CHANCE_PER_LEVEL * chanceMult) {
    const healAmount = VAMPIRE_HEAL_BASE + skill.level * VAMPIRE_HEAL_PER_LEVEL;
    const healed = Math.min(p.maxHp - p.hp, healAmount);
    if (healed <= 0) {
      if (p.vampireEvolved && !p.barrierCharge) {
        p.barrierCharge = true;
        spawnPickupText(p.x, p.y - p.h / 2 - 10, "血盾!", true);
      }
      return;
    }
    p.hp += healed;
    spawnVampireEffect(p, healed);
  }
}

// 狂狼之力（擊殺疊狂）：擊殺疊層提升掌技／氣彈／自動攻擊傷害，限時維持
function getEnrageMult(p) {
  const skill = p.skills.frenzy;
  if (!skill.unlocked || skill.level <= 0) return 1;
  if (performance.now() >= p.frenzyStackUntil || p.frenzyStacks <= 0) return 1;
  return 1 + p.frenzyStacks * FRENZY_DMG_PER_STACK_PER_LEVEL * skill.level;
}

// 擊殺時疊狂：每殺一隻+1層（有上限）、刷新維持時間；在敵人死亡結算處呼叫
function addFrenzyStack(p) {
  const skill = p.skills.frenzy;
  if (!skill.unlocked || skill.level <= 0) return;
  const now = performance.now();
  if (now >= p.frenzyStackUntil) p.frenzyStacks = 0; // 已過期，重新起算
  const maxStacks = FRENZY_BASE_MAX_STACKS + skill.level * FRENZY_STACKS_PER_LEVEL;
  p.frenzyStacks = Math.min(maxStacks, p.frenzyStacks + 1);
  p.frenzyStackUntil = now + FRENZY_STACK_WINDOW_MS;
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
  fxLight(p.x, p.y, character.rimColor, 3.2, 620, 520);
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
  // 罡風輪進化：刀刃數×2、環繞半徑+40%
  const count = getSkillEffect("orbit", "count") * (p.orbitEvolved ? 2 : 1);
  const orbitRadius = ORBIT_RADIUS * (p.orbitEvolved ? 1.4 : 1);
  if (state.orbiters.length !== count) {
    state.orbiters = Array.from({ length: count }, (_, i) => ({
      angleOffset: (Math.PI * 2 * i) / count,
      x: p.x,
      y: p.y,
    }));
  }
  p.orbitAngle += getSkillEffect("orbit", "spin") * dt;
  for (const blade of state.orbiters) {
    blade.x = p.x + Math.cos(p.orbitAngle + blade.angleOffset) * orbitRadius;
    blade.y = p.y + Math.sin(p.orbitAngle + blade.angleOffset) * orbitRadius;
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
  // 追魂梭進化：一擲三梭、無限貫穿
  const throwCount = p.throwEvolved ? 3 : 1;
  fireHomingVolley(p, target, throwCount, damage, THROW_SPEED, THROW_TURN_RATE, THROW_RADIUS, "throw");
  for (let i = 1; i <= throwCount; i++) {
    const proj = state.projectiles[state.projectiles.length - i];
    if (proj) proj.pierceRemaining += p.throwEvolved ? 999 : THROW_BASE_PIERCE;
  }
}

// 追魂爆：定時在最近敵人身上引爆，並在附近敵人間連鎖跳躍傷害（跳躍次數隨等級增加）
function updateChainBlast(dt) {
  const p = state.player;
  if (!p.skills.chainblast.unlocked) return;
  p.chainBlastTimer -= dt * 1000;
  if (p.chainBlastTimer > 0) return;

  const target = findNearestEnemy(p.x, p.y);
  if (!target) {
    p.chainBlastTimer = 100;
    return;
  }
  p.chainBlastTimer = getSkillEffect("chainblast", "interval");
  const damage = getSkillEffect("chainblast", "damage");
  const maxJumps = getSkillEffect("chainblast", "jumps");

  const visited = new Set();
  let current = target;
  let hops = 0;
  while (current && hops < maxJumps) {
    applyDamage(current, damage);
    spawnDamageText(current.x, current.y - current.radius, damage);
    spawnExplosion(current.x, current.y, "#e6ff4d", 12);
    spawnShockwave(current.x, current.y, 40, "#e6ff4d");
    fxLight(current.x, current.y, "#e6ff4d", 2, 260, 300);
    playHitSound();
    visited.add(current);
    hops += 1;

    let next = null;
    let bestDist = CHAIN_BLAST_JUMP_RADIUS;
    for (const e of state.enemies) {
      if (visited.has(e)) continue;
      const d = distance(current, e);
      if (d < bestDist) {
        bestDist = d;
        next = e;
      }
    }
    current = next;
  }
}

// 破空連斬：定時向四面八方射出一輪貫穿刀氣（刀刃數與間隔隨等級增加/縮短）
function updateBladestorm(dt) {
  const p = state.player;
  if (!p.skills.bladestorm.unlocked) return;
  p.bladestormTimer -= dt * 1000;
  if (p.bladestormTimer > 0) return;
  p.bladestormTimer = getSkillEffect("bladestorm", "interval");
  const damage = getSkillEffect("bladestorm", "damage");
  const count = getSkillEffect("bladestorm", "count");
  playQiFireSound();
  fireRadialBurst(p, count, damage, BLADESTORM_SPEED, BLADESTORM_RADIUS, "bladestorm", { color: "#ff5ecb" });
}

// ===== P17 新系統：分裂菁英／Boss 寶箱／勝利結算／技能進化／永久成長／本地紀錄 =====

// 分裂菁英死亡時產生 2 隻縮小版小怪
function spawnSplitChildren(from, count) {
  const typeDef = ENEMY_TYPE_DEFS[from.baseType] || ENEMY_TYPE_DEFS.drifter;
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    state.enemies.push({
      x: from.x + Math.cos(ang) * 24,
      y: from.y + Math.sin(ang) * 24,
      type: "normal",
      baseType: from.baseType,
      behavior: typeDef.behavior === "kiter" ? "chase" : typeDef.behavior,
      isBrute: false,
      eliteType: null,
      radius: Math.max(9, Math.round(from.radius * 0.55)),
      hp: Math.max(8, Math.round(from.maxHp * 0.25)),
      maxHp: Math.max(8, Math.round(from.maxHp * 0.25)),
      speed: from.speed * 1.25,
      touchDamage: Math.max(3, Math.round(from.touchDamage * 0.5)),
      killScore: Math.round(from.killScore * 0.3),
      killXp: Math.max(1, Math.round(from.killXp * 0.3)),
      hurtUntil: 0,
      particleTimer: 0,
      knockVx: 0,
      knockVy: 0,
      knockUntil: 0,
      zigzagPhase: Math.random() * Math.PI * 2,
      ambushTriggered: true,
      ambushWarning: false,
      ambushWarningTimer: 0,
      fireTimer: 0,
      fireIntervalMs: 0,
    });
  }
}

// Boss 寶箱：擊敗 Boss 掉落，走過去拾取後暫停並三選一
function spawnBossChest(x, y) {
  state.chests.push({ x, y, bobPhase: Math.random() * Math.PI * 2 });
}

function buildChestChoices() {
  const p = state.player;
  const choices = [
    {
      id: "chest_currency",
      name: "內力灌頂",
      stat: "內力珠 +80",
      apply(pl) {
        pl.currency += 80;
        spawnPickupText(pl.x, pl.y - 30, 80);
      },
    },
    {
      id: "chest_heal",
      name: "療傷聖藥",
      stat: "氣血全滿＋獲得一層護盾",
      apply(pl) {
        pl.hp = pl.maxHp;
        pl.barrierCharge = true;
        spawnHealText(pl.x, pl.y - 30, "全滿");
      },
    },
  ];
  // 武學精進：隨機一個可升級技能 +1（未解鎖則解鎖）
  const upgradable = SKILL_DEFS.filter((d) => d.purchasable && p.skills[d.id].level < d.maxLevel);
  if (upgradable.length > 0) {
    const pick = upgradable[Math.floor(Math.random() * upgradable.length)];
    choices.push({
      id: "chest_skill",
      name: "武學精進",
      stat: `${pick.name} 等級 +1`,
      apply(pl) {
        pl.skills[pick.id].level += 1;
        pl.skills[pick.id].unlocked = true;
        if (pick.id === "barrier") pl.barrierTimer = getSkillEffect("barrier", "interval");
      },
    });
  }
  return choices;
}

function updateChests() {
  const p = state.player;
  state.chests = state.chests.filter((chest) => {
    chest.bobPhase += 0.06;
    if (distance(p, chest) < 30 + p.radius) {
      playPickupSound();
      state.upgradeChoices = buildChestChoices();
      state.upgradeChoices.isChest = true;
      renderUpgradeCards();
      return false;
    }
    return true;
  });
}

// ===== P19 詛咒祭壇（risk-reward：玩家自選加難換獎勵）=====
// 針對「遊戲太簡單、後期沒事做」的核心回饋——把難度的方向盤交給玩家：
// 接受詛咒讓本局敵人永久更強，換取立即的內力珠/分數獎勵，且每層詛咒使之後的掉落 +10%
const CURSE_DEFS = [
  { id: "curse_hp", name: "血煞之咒", desc: "敵人氣血 +30%", hpMult: 1.3 },
  { id: "curse_speed", name: "疾影之咒", desc: "敵人移速 +15%", speedMult: 1.15 },
  { id: "curse_spawn", name: "湧潮之咒", desc: "出怪速度 +20%", spawnIntervalMult: 0.8 },
  { id: "curse_elite", name: "梟首之咒", desc: "菁英出現率 +10%", eliteBonus: 0.1 },
];
const ALTAR_START_STAGE = 2; // 第 3 關（index 2）起出現
const ALTAR_REWARD_MIN = 60;
const ALTAR_REWARD_MAX = 120;

// 彙總所有已接受詛咒的修飾子（乘法疊乘、加法疊加）
function getCurseMods() {
  const mods = { hpMult: 1, speedMult: 1, spawnIntervalMult: 1, eliteBonus: 0 };
  for (const curse of state.curses) {
    if (curse.hpMult) mods.hpMult *= curse.hpMult;
    if (curse.speedMult) mods.speedMult *= curse.speedMult;
    if (curse.spawnIntervalMult) mods.spawnIntervalMult *= curse.spawnIntervalMult;
    if (curse.eliteBonus) mods.eliteBonus += curse.eliteBonus;
  }
  return mods;
}

function spawnCurseAltar() {
  const p = state.player;
  const angle = Math.random() * Math.PI * 2;
  const dist = 300 + Math.random() * 150;
  state.altars.push({
    x: p.x + Math.cos(angle) * dist,
    y: p.y + Math.sin(angle) * dist,
    bobPhase: Math.random() * Math.PI * 2,
  });
}

function buildAltarChoices() {
  const curse = CURSE_DEFS[Math.floor(Math.random() * CURSE_DEFS.length)];
  const reward = ALTAR_REWARD_MIN + Math.floor(Math.random() * (ALTAR_REWARD_MAX - ALTAR_REWARD_MIN + 1));
  return [
    {
      id: "altar_accept",
      name: `接受詛咒：${curse.name}`,
      stat: `${curse.desc}（本局永久）｜立得內力珠 +${reward}、之後掉落 +10%`,
      apply(pl) {
        state.curses.push(curse);
        pl.currency += reward;
        state.score += reward * 2;
        spawnPickupText(pl.x, pl.y - 30, reward);
        showStageBanner("詛咒纏身", `${curse.name}——${curse.desc}`);
        playBossDeathSound();
      },
    },
    {
      id: "altar_refuse",
      name: "敬而遠之",
      stat: "不接受任何詛咒，祭壇歸於沉寂",
      apply() {},
    },
  ];
}

function updateAltars() {
  const p = state.player;
  state.altars = state.altars.filter((altar) => {
    altar.bobPhase += 0.04;
    if (distance(p, altar) < 30 + p.radius) {
      playPickupSound();
      state.upgradeChoices = buildAltarChoices();
      renderUpgradeCards();
      return false;
    }
    return true;
  });
}

// ===== 技能進化（滿級技能＋指定升級卡數量 → 升級卡池出現金色進化卡） =====
const EVOLUTION_DEFS = [
  {
    id: "evo_orbit",
    name: "罡風輪",
    stat: "進化：刀刃×2、範圍+40%",
    skill: "orbit",
    cardId: "dmg",
    cardNeed: 2,
    flag: "orbitEvolved",
  },
  {
    id: "evo_throw",
    name: "追魂梭",
    stat: "進化：一擲三梭、無限貫穿",
    skill: "throw",
    cardId: "pierce",
    cardNeed: 1,
    flag: "throwEvolved",
  },
  {
    id: "evo_vampire",
    name: "噬血真經",
    stat: "進化：吸血率×1.5、溢出治療轉護盾",
    skill: "vampire",
    cardId: "hp",
    cardNeed: 1,
    flag: "vampireEvolved",
  },
];

function getAvailableEvolution() {
  const p = state.player;
  for (const evo of EVOLUTION_DEFS) {
    if (p[evo.flag]) continue;
    const def = getSkillDef(evo.skill);
    if (p.skills[evo.skill].level < def.maxLevel) continue;
    if ((p.cardCounts[evo.cardId] || 0) < evo.cardNeed) continue;
    return {
      id: evo.id,
      name: evo.name,
      stat: evo.stat,
      isEvolution: true,
      apply(pl) {
        pl[evo.flag] = true;
        playEvolveSound();
        spawnShockwave(pl.x, pl.y, 130, "#ffd84d");
        spawnExplosion(pl.x, pl.y, "#ffd84d", 30);
        fxLight(pl.x, pl.y, "#ffd84d", 3, 900, 520);
      },
    };
  }
  return null;
}

// ===== 勝利結算（擊敗最終 Boss） =====
function triggerVictory() {
  state.victoryShown = true;
  state.victoryPause = true;
  const mins = Math.floor(state.elapsed / 60);
  const secs = Math.floor(state.elapsed % 60);
  const gained = Math.floor(state.player.currency * 0.5);
  addXiuwei(gained);
  updateRecords();
  document.getElementById("victory-stats").textContent =
    `分數 ${state.score}｜擊殺 ${state.kills}｜存活 ${mins}:${String(secs).padStart(2, "0")}`;
  document.getElementById("victory-meta-line").textContent = `獲得修為 +${gained}（可在選角畫面修煉）`;
  document.getElementById("victory-screen").classList.remove("hidden");
  spawnExplosion(state.player.x, state.player.y, "#ffd84d", 40);
  playLevelUpSound();
}

// ===== 修為與試煉階（P19 改造）=====
// 原本修為是花錢買永久攻擊/血量/移速加成——玩家正確指出這會讓已經很簡單的遊戲更簡單。
// 改為「難度試煉解鎖」：修為只用來解鎖更高難度的試煉階（敵人更血更痛、分數與掉落更高），
// 追求挑戰與高分，而不是變強的捷徑。舊檔的 meta_levels 永久加成直接作廢不再讀取。
const TRIAL_DEFS = [
  { tier: 1, name: "試煉一・風波", cost: 150, hpMult: 1.25, dmgMult: 1.25, scoreMult: 1.5, dropMult: 1.2, desc: "敵血/敵傷 +25%｜分數 ×1.5｜掉落 ×1.2" },
  { tier: 2, name: "試煉二・浪湧", cost: 400, hpMult: 1.5, dmgMult: 1.5, scoreMult: 2, dropMult: 1.35, desc: "敵血/敵傷 +50%｜分數 ×2｜掉落 ×1.35" },
  { tier: 3, name: "試煉三・滅世", cost: 900, hpMult: 1.8, dmgMult: 1.8, scoreMult: 3, dropMult: 1.5, desc: "敵血/敵傷 +80%｜分數 ×3｜掉落 ×1.5" },
];
const TRIAL_NEUTRAL = { tier: 0, hpMult: 1, dmgMult: 1, scoreMult: 1, dropMult: 1 };

function getXiuwei() {
  return parseInt(localStorage.getItem("meta_xiuwei") || "0", 10);
}

function addXiuwei(amount) {
  localStorage.setItem("meta_xiuwei", String(getXiuwei() + amount));
}

function getTrialsUnlocked() {
  return parseInt(localStorage.getItem("trials_unlocked") || "0", 10);
}

function getTrialSelected() {
  const sel = parseInt(localStorage.getItem("trial_selected") || "0", 10);
  return Math.min(sel, getTrialsUnlocked()); // 防呆：不可選未解鎖的階
}

function tryUnlockTrial(tier) {
  const def = TRIAL_DEFS.find((d) => d.tier === tier);
  if (!def || getTrialsUnlocked() >= tier) return;
  if (getTrialsUnlocked() < tier - 1) return; // 需依序解鎖
  if (getXiuwei() < def.cost) return;
  addXiuwei(-def.cost);
  localStorage.setItem("trials_unlocked", String(tier));
  playLevelUpSound();
  renderMetaPanel();
}

function selectTrial(tier) {
  if (tier > getTrialsUnlocked()) return;
  localStorage.setItem("trial_selected", String(tier));
  renderMetaPanel();
}

// 開局時快照選定的試煉修飾子到 state（局中改選單不影響進行中的一局）
function snapshotTrialMods() {
  const sel = getTrialSelected();
  state.trialMods = TRIAL_DEFS.find((d) => d.tier === sel) || TRIAL_NEUTRAL;
}

function renderMetaPanel() {
  const list = document.getElementById("meta-list");
  if (!list) return;
  document.getElementById("meta-currency").textContent = `修為: ${getXiuwei()}`;
  list.innerHTML = "";
  const unlocked = getTrialsUnlocked();
  const selected = getTrialSelected();

  const rows = [{ tier: 0, name: "標準武林", desc: "原始難度，無任何加成", cost: 0 }, ...TRIAL_DEFS];
  for (const def of rows) {
    const row = document.createElement("div");
    row.className = "meta-row";
    row.innerHTML = `<span class="meta-name">${def.name}</span><span class="meta-desc">${def.desc}</span>`;
    const btn = document.createElement("button");
    btn.className = "meta-buy-btn";
    const isUnlocked = def.tier <= unlocked;
    if (def.tier === selected) {
      btn.textContent = "已選擇";
      btn.disabled = true;
      row.classList.add("trial-selected");
    } else if (isUnlocked) {
      btn.textContent = "選擇";
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectTrial(def.tier);
      });
    } else {
      btn.textContent = `解鎖 ${def.cost}修為`;
      btn.disabled = getXiuwei() < def.cost || def.tier > unlocked + 1;
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        tryUnlockTrial(def.tier);
      });
    }
    row.appendChild(btn);
    list.appendChild(row);
  }
}

// ===== 本地最佳紀錄 =====
function updateRecords() {
  const bestScore = parseInt(localStorage.getItem("best_score") || "0", 10);
  const bestStage = parseInt(localStorage.getItem("best_stage") || "0", 10);
  const bestTime = parseInt(localStorage.getItem("best_time") || "0", 10);
  if (state.score > bestScore) localStorage.setItem("best_score", String(state.score));
  if (state.stage + 1 > bestStage) localStorage.setItem("best_stage", String(state.stage + 1));
  if (Math.floor(state.elapsed) > bestTime) localStorage.setItem("best_time", String(Math.floor(state.elapsed)));
}

function formatRecordsLine() {
  const bestScore = parseInt(localStorage.getItem("best_score") || "0", 10);
  const bestStage = parseInt(localStorage.getItem("best_stage") || "0", 10);
  const bestTime = parseInt(localStorage.getItem("best_time") || "0", 10);
  if (bestScore === 0 && bestStage === 0) return "";
  const mins = Math.floor(bestTime / 60);
  const secs = bestTime % 60;
  return `最佳紀錄：分數 ${bestScore}｜關卡 ${bestStage}｜存活 ${mins}:${String(secs).padStart(2, "0")}`;
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
  const eliteType =
    !isBrute && state.stage >= ELITE_START_STAGE && Math.random() < ELITE_CHANCE + getCurseMods().eliteBonus
      ? ELITE_TYPES[Math.floor(Math.random() * ELITE_TYPES.length)]
      : null;
  const baseHp = ENEMY_MAX_HP * stageConfig.hpMult * typeDef.hpMult * hpScale * state.trialMods.hpMult * getCurseMods().hpMult;
  const hp = Math.round(baseHp * (isBrute ? ENEMY_BRUTE_HP_MULT : 1) * (eliteType ? ELITE_HP_MULT : 1));
  const radius = Math.round(ENEMY_RADIUS * typeDef.radiusMult * (isBrute ? ENEMY_BRUTE_RADIUS_MULT : 1) * (eliteType ? 1.15 : 1));
  const speed = ENEMY_SPEED * typeDef.speedMult * (isBrute ? ENEMY_BRUTE_SPEED_MULT : 1) * (eliteType === "swift" ? 1.6 : 1) * getCurseMods().speedMult;
  // P19：碰撞傷害成長係數 0.4→0.65（明顯上調），讓中後期沒護盾時真的會痛
  const touchDamage = Math.round(
    ENEMY_TOUCH_DAMAGE * typeDef.touchMult * (isBrute ? ENEMY_BRUTE_TOUCH_MULT : 1) * (1 + (powerScale - 1) * 0.65)
  );
  const killScore = Math.round(KILL_SCORE * (isBrute ? ENEMY_BRUTE_SCORE_MULT : 1) * (eliteType ? ELITE_SCORE_MULT : 1) * state.trialMods.scoreMult);
  const killXp = Math.round(KILL_XP * (isBrute ? ENEMY_BRUTE_SCORE_MULT : 1) * (eliteType ? 2 : 1));

  state.enemies.push({
    x,
    y,
    type: "normal",
    baseType,
    behavior: typeDef.behavior,
    isBrute,
    eliteType,
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

function spawnBoss(stageIndex, isFinal = false) {
  const { x, y } = pickSpawnEdgePoint(60);
  const stageConfig = STAGE_CONFIGS[stageIndex];
  const hpScale = getEnemyHpScaleFactor();
  // 最終 Boss：血量 2 倍、體型放大、攻擊間隔縮短並具備雙攻擊模式（衝擊波＋彈幕）
  const hpMultFinal = isFinal ? 2 : 1;
  const hp = Math.round(ENEMY_MAX_HP * stageConfig.hpMult * BOSS_HP_MULT * hpScale * hpMultFinal * state.trialMods.hpMult * getCurseMods().hpMult);

  state.enemies.push({
    x,
    y,
    type: "boss",
    baseType: "boss",
    behavior: "chase",
    isBrute: false,
    isFinalBoss: isFinal,
    radius: isFinal ? Math.round(BOSS_RADIUS * 1.5) : BOSS_RADIUS,
    hp,
    maxHp: hp,
    speed: ENEMY_SPEED * (isFinal ? 0.5 : 0.6),
    touchDamage: Math.round(ENEMY_TOUCH_DAMAGE * BOSS_TOUCH_MULT * (isFinal ? 1.3 : 1)),
    killScore: Math.round(KILL_SCORE * BOSS_SCORE_MULT * (isFinal ? 4 : 1) * state.trialMods.scoreMult),
    killXp: KILL_XP * BOSS_XP_MULT,
    hurtUntil: 0,
    particleTimer: 0,
    knockVx: 0,
    knockVy: 0,
    knockUntil: 0,
    attackTimer: isFinal ? Math.round(BOSS_ATTACK_INTERVAL_MS * 0.7) : BOSS_ATTACK_INTERVAL_MS,
    volleyTimer: isFinal ? 2200 : 0,
  });
  if (isFinal) {
    state.finalBossSpawned = true;
    showStageBanner("魔王現世", "擊敗它，終結這場浩劫");
  }
  state.bossActive = true;
  setBossTint(true);
  triggerShake(0.3, 12);
}

function getEnemySpawnInterval() {
  const base = STAGE_CONFIGS[state.stage].spawnInterval;
  return Math.max(MIN_SPAWN_INTERVAL_MS, Math.round((base * getCurseMods().spawnIntervalMult) / getPowerScaleFactor()));
}

// 關卡進場橫幅：大字標題＋副標（新要素提示），2.2 秒後淡出（CSS 動畫）
function showStageBanner(title, sub) {
  const banner = document.getElementById("stage-banner");
  document.getElementById("stage-banner-title").textContent = title;
  document.getElementById("stage-banner-sub").textContent = sub || "";
  banner.classList.remove("hidden");
  banner.classList.remove("show");
  void banner.offsetWidth; // 重觸發 CSS 動畫
  banner.classList.add("show");
  state.stageBannerUntil = performance.now() + 2400;
  setTimeout(() => {
    if (performance.now() >= state.stageBannerUntil - 50) banner.classList.add("hidden");
  }, 2500);
}

function getStageSubtitle(stageIdx) {
  const introduced = STAGE_NORMAL_TYPE_POOL[stageIdx].find((t) => TYPE_FIRST_STAGE[t] === stageIdx);
  const names = {
    skitter: "疾行魔影現身",
    lurker: "伏擊妖物潛藏",
    volley: "遠射邪祟來襲",
    juggernaut: "重甲巨魔壓境",
    spiker: "尖刺魔急襲來犯",
    ringer: "環爪魔遠遁伺機",
    serpent: "裂魂蟲潛伏出沒",
  };
  if (introduced && names[introduced]) return names[introduced];
  if (stageIdx === ELITE_START_STAGE) return "菁英強敵開始出沒";
  if (stageIdx === STAGE_CONFIGS.length - 1) return "最終決戰";
  return "";
}

function updateStage(dt) {
  const nextStage = Math.min(
    Math.floor(state.elapsed / STAGE_DURATION_SEC),
    STAGE_CONFIGS.length - 1
  );
  if (nextStage !== state.stage) {
    const prevSceneIdx = STAGE_SCENE_INDEX[state.stage] || 0;
    const nextSceneIdx = STAGE_SCENE_INDEX[nextStage] || 0;
    state.stage = nextStage;
    triggerShake(0.15, 6);

    if (nextSceneIdx !== prevSceneIdx) {
      // 跨場景：轉場演出（漸黑→切景→漸亮），並在切換點顯示場景名＋關卡標題
      sceneTransition(nextSceneIdx, () => {
        showStageBanner(`${SCENES[nextSceneIdx].name}・第 ${nextStage + 1} 關`, getStageSubtitle(nextStage));
      });
    } else {
      showStageBanner(`第 ${nextStage + 1} 關`, getStageSubtitle(nextStage));
    }

    // P19：詛咒祭壇——第 3 關起每次關卡轉換生成一座（未觸碰的舊祭壇保留在原地）
    if (nextStage >= ALTAR_START_STAGE) {
      spawnCurseAltar();
    }

    if (nextStage >= 1 && !state.bossActive) {
      const introducesNewType = STAGE_NORMAL_TYPE_POOL[nextStage].some(
        (t) => TYPE_FIRST_STAGE[t] === nextStage
      );
      if (nextStage === STAGE_CONFIGS.length - 1) {
        // 最終關：延後數秒生成最終 Boss，讓轉場先演完
        state.bossSpawnAt = state.elapsed + BOSS_INTRO_DELAY_SEC;
      } else if (introducesNewType) {
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
    const isFinalStage = state.stage === STAGE_CONFIGS.length - 1 && !state.finalBossSpawned && !state.victoryShown;
    spawnBoss(state.stage, isFinalStage);
    state.bossCyclesSpawned += 1;
    state.bossRepeatTimer = 0;
    state.bossSpawnAt = 0;
  }

  // 最終關卡之後，每隔一段時間再次觸發 boss，讓無限模式持續有節點
  if (state.stage === STAGE_CONFIGS.length - 1 && !state.bossActive) {
    state.bossRepeatTimer += dt;
    if (state.bossRepeatTimer >= BOSS_REPEAT_INTERVAL_SEC) {
      const isFinal = !state.finalBossSpawned && !state.victoryShown;
      spawnBoss(state.stage, isFinal);
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
        e.attackTimer = e.isFinalBoss ? Math.round(BOSS_ATTACK_INTERVAL_MS * 0.7) : BOSS_ATTACK_INTERVAL_MS;
        spawnShockwave(e.x, e.y, BOSS_SHOCK_RADIUS, e.isFinalBoss ? "#ff2244" : "#3ad6ff");
        fxLight(e.x, e.y, "#ff2244", 2.2, 420, 520);
        triggerShake(0.25, 12);
        if (dist < BOSS_SHOCK_RADIUS + p.radius && now > p.invulnUntil) {
          // P19：Boss 衝擊波傷害隨玩家成長係數上調，後期 Boss 戰不再無關痛癢
          const shockDmg = Math.round(BOSS_SHOCK_DAMAGE * (1 + (getPowerScaleFactor() - 1) * 0.5));
          if (applyDamage(p, shockDmg)) {
            p.invulnUntil = now + PLAYER_IFRAME_MS;
            playHurtSound();
          }
        }
      }
      // 最終 Boss 第二攻擊模式：環形彈幕
      if (e.isFinalBoss) {
        e.volleyTimer -= dt * 1000;
        if (e.volleyTimer <= 0) {
          e.volleyTimer = 3600;
          const count = 10;
          for (let i = 0; i < count; i++) {
            const a = (Math.PI * 2 * i) / count + Math.random() * 0.2;
            spawnEnemyProjectile(e, Math.cos(a), Math.sin(a));
          }
        }
      }
    } else if (e.behavior === "zigzag") {
      e.zigzagPhase += dt * 8;
      const ang = Math.atan2(ny, nx) + Math.sin(e.zigzagPhase) * 0.6;
      e.x += Math.cos(ang) * e.speed * dt;
      e.y += Math.sin(ang) * e.speed * dt;
    } else if (e.behavior === "ambush") {
      // P18：改用該敵人自己 baseType 對應的 typeDef，不再寫死讀 lurker——
      // 現在 serpent（裂魂蟲）也是 ambush 行為，需要各自的觸發半徑/衝刺倍率/預警時間
      const ambushDef = ENEMY_TYPE_DEFS[e.baseType] || ENEMY_TYPE_DEFS.lurker;
      if (!e.ambushTriggered && dist < ambushDef.triggerRadius) {
        e.ambushTriggered = true;
        e.ambushWarning = true;
        e.ambushWarningTimer = ambushDef.warningSec;
      }
      if (e.ambushWarning) {
        e.ambushWarningTimer -= dt;
        if (e.ambushWarningTimer <= 0) e.ambushWarning = false;
      } else if (e.ambushTriggered) {
        const dashSpeed = e.speed * ambushDef.dashSpeedMult;
        e.x += nx * dashSpeed * dt;
        e.y += ny * dashSpeed * dt;
      }
    } else if (e.behavior === "kiter") {
      // P18：同理改用該敵人自己 baseType 對應的 keepDistance，不再寫死讀 volley——
      // 現在 ringer（環爪魔）也是 kiter 行為，牽制距離與 volley 不同
      const keepDistance = (ENEMY_TYPE_DEFS[e.baseType] || ENEMY_TYPE_DEFS.volley).keepDistance;
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

  // 先清除被打死的敵人：加分、加經驗、爆炸特效、掉落物、菁英死亡效果、Boss 寶箱
  const spawnQueue = []; // 分裂菁英產生的子怪，迴圈後再入場，避免邊過濾邊修改陣列
  state.enemies = state.enemies.filter((e) => {
    if (e.hp <= 0) {
      state.score += e.killScore;
      state.kills += 1;
      spawnExplosion(e.x, e.y, "rgba(200,60,220,0.9)", e.type === "boss" ? 40 : 20);
      fxLight(e.x, e.y, e.type === "boss" ? "#ff2244" : "#c040ff", e.type === "boss" ? 3 : 1.2, e.type === "boss" ? 700 : 240, e.type === "boss" ? 620 : 300);

      // 連殺音階：短時間內連續擊殺，音調逐級上升
      if (now < state.killStreakUntil) state.killStreak = Math.min(state.killStreak + 1, 8);
      else state.killStreak = 0;
      state.killStreakUntil = now + 900;
      playKillSound(state.killStreak);

      addXp(e.killXp);
      rollCurrencyDrop(e);
      tryVampireHeal();
      addFrenzyStack(p);

      // 菁英死亡效果
      if (e.eliteType === "split") {
        spawnQueue.push({ from: e, count: 2 });
      } else if (e.eliteType === "blast") {
        spawnExplosion(e.x, e.y, "rgba(255,160,64,0.95)", 26);
        spawnShockwave(e.x, e.y, 90, "#ffa040");
        fxLight(e.x, e.y, "#ffa040", 2.4, 380, 380);
        if (distance(p, e) < 90 + p.radius && now > p.invulnUntil) {
          if (applyDamage(p, Math.round(e.touchDamage * 0.8))) {
            p.invulnUntil = now + PLAYER_IFRAME_MS;
            playHurtSound();
          }
        }
      }

      if (e.type === "boss") {
        state.bossActive = false;
        state.bossRepeatTimer = 0;
        setBossTint(false);
        playBossDeathSound();
        if (e.isFinalBoss && !state.victoryShown) {
          triggerVictory();
        } else {
          spawnBossChest(e.x, e.y);
        }
      }
      return false;
    }
    return true;
  });
  for (const q of spawnQueue) spawnSplitChildren(q.from, q.count);

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
    damage: Math.round(ENEMY_PROJECTILE_DAMAGE * (1 + (getPowerScaleFactor() - 1) * 0.5)),
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
  // 修為結算：本局內力珠 30% 轉為永久修為
  const gained = Math.floor(state.player.currency * 0.3);
  if (gained > 0) addXiuwei(gained);
  updateRecords();
  document.getElementById("final-score").textContent = `最終分數: ${state.score}｜關卡 ${state.stage + 1}｜擊殺 ${state.kills}`;
  document.getElementById("death-meta-line").textContent =
    gained > 0 ? `內力珠 ${state.player.currency} → 修為 +${gained}（選角畫面可修煉）` : "";
  document.getElementById("death-records-line").textContent = formatRecordsLine();
  document.getElementById("game-over-screen").classList.remove("hidden");
  playGameOverSound();
  setBgmVolume(BGM_GAMEOVER_VOLUME);
}

function resetAndStart() {
  document.body.classList.add("game-active");
  document.getElementById("victory-screen").classList.add("hidden");
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

function hexToRgbaValue(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function readableButtonText(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.4 ? "#061119" : "#f7fbff";
}

function updateActionButtonLabels() {
  const label = document.querySelector("#btn-palm .palm-label");
  if (label) label.textContent = state.player.character.palmName || "掌";
  const gameContainer = document.getElementById("game-container");
  const accent = state.player.character.rimColor;
  for (const target of [document.documentElement, gameContainer]) {
    target.style.setProperty("--char-accent", accent);
    target.style.setProperty("--char-accent-soft", hexToRgbaValue(accent, 0.78));
    target.style.setProperty("--char-accent-strong", hexToRgbaValue(accent, 0.95));
    target.style.setProperty("--char-button-text", readableButtonText(accent));
  }
}

function startGameWithCharacter(id) {
  document.body.classList.add("game-active");
  document.getElementById("character-select").classList.add("hidden");
  localStorage.setItem("selectedCharacter", id);
  resetState(id);
  updateActionButtonLabels();
  state.started = true;
  unlockAudio();
}

// ===== UI 更新 =====
// 選單類 UI（技能表／升級卡／勝利結算）開啟時，讓整組觸控層讓位（CSS body.ui-modal 隱藏），
// 否則 fixed 的 #joystick-capture 與動作鈕會疊在選單上攔截點擊。進入選單同時歸零搖桿輸入——
// 觸控層被隱藏後收不到 pointerup，不清掉的話關閉選單會殘留移動向量。
let uiModalPrev = false;
function syncUiModal() {
  const modal = state.skillMenuOpen || state.upgradeChoices.length > 0 || state.victoryPause;
  if (modal === uiModalPrev) return;
  uiModalPrev = modal;
  document.body.classList.toggle("ui-modal", modal);
  if (modal) {
    const j = state.joystick;
    j.active = false;
    j.pointerId = null;
    j.dx = 0;
    j.dy = 0;
    j.knobX = 0;
    j.knobY = 0;
    const zone = document.getElementById("joystick-zone");
    zone.style.left = "";
    zone.style.top = "";
    zone.style.bottom = "";
  }
}

function updateUI() {
  syncUiModal();
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
  // P19：顯示試煉階與詛咒層數
  const trialTag = state.trialMods.tier > 0 ? `・試煉${["", "一", "二", "三"][state.trialMods.tier]}` : "";
  const curseTag = state.curses.length > 0 ? `・詛咒×${state.curses.length}` : "";
  document.getElementById("stage-text").textContent = `關卡 ${state.stage + 1}${trialTag}${curseTag}`;

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
// #gameCanvas 交給 Three.js（WebGL）；文字飄字疊在獨立的 #text-canvas（2D）上，
// 世界座標經 worldToScreen() 投影後繪製，確保文字銳利且不佔 WebGL 資源。
const canvas = document.getElementById("gameCanvas");
const textCanvas = document.getElementById("text-canvas");
const ctx = textCanvas.getContext("2d");
{
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  textCanvas.width = CANVAS_W * dpr;
  textCanvas.height = CANVAS_H * dpr;
  ctx.scale(dpr, dpr);
}
const joystickCanvas = document.getElementById("joystick-canvas");
const joystickCtx = joystickCanvas.getContext("2d");

// 視差層捲動速度集中設定：天空雲層最慢、遠山中等、地面（裝飾＋角色所在層）與攝影機同速，
// 飛沙粒子比攝影機更快、反向飄移，所有調速都改這裡，不要散落在各個繪製函式裡。
const PARALLAX_CONFIG = {
  sky: 0.1,
  mountain: 0.3,
  ground: 1.0,
  dust: 1.2,
  dustIdleDrift: 6, // 玩家靜止時，粒子仍緩慢飄移的像素/秒基準速度
};


// P19：五組輪替場景，依氛圍推進：楓落古鎮→雪月神居→浮空遺境→紫雷絕壁→血焰魔域（終章）
// 場景資料（僅保留名稱供關卡橫幅使用；視覺配置全在 engine3d.js 的 SCENE3D）
const SCENES = [
  { name: "楓落古鎮" },
  { name: "雪月神居" },
  { name: "浮空遺境" },
  { name: "紫雷絕壁" },
  { name: "血焰魔域" },
];


// P19：1-3 楓落古鎮、4-6 雪月神居、7-8 浮空遺境、9-10 紫雷絕壁、11-12 血焰魔域，跨場景時觸發轉場演出
const STAGE_SCENE_INDEX = [0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4];
const GROUND_DECOR_SPACING = 110;
function render(dt) {
  engineRender(dt || 0.016);
  drawTextOverlay();
  drawJoystick();
}

// 傷害/拾取飄字疊層：世界座標投影到螢幕座標後畫在 #text-canvas
function drawTextOverlay() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.save();
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  for (const dtxt of state.damageTexts) {
    const s = worldToScreen(dtxt.x, dtxt.y, 46);
    if (!s.visible) continue;
    ctx.globalAlpha = Math.max(0, dtxt.life / dtxt.maxLife);
    ctx.fillStyle = "#ffd84d";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    ctx.fillText(`-${dtxt.value}`, s.x, s.y);
  }
  ctx.font = "bold 14px sans-serif";
  for (const t of state.pickupTexts) {
    const s = worldToScreen(t.x, t.y, 40);
    if (!s.visible) continue;
    ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
    ctx.fillStyle = t.isHeal ? "#3fe080" : t.isLabel ? "#7adfff" : "#ffe48a";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    ctx.fillText(t.isLabel ? t.amount : `+${t.amount}`, s.x, s.y);
  }
  ctx.restore();
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
const JOYSTICK_MAX_DIST = 40; // P19：加大有效行程，配合浮動搖桿提升操控精度
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

// P19：浮動搖桿——不再要求先摸到固定位置的小圓盤。左側 45% 螢幕任一點按下即以觸點為錨點出現搖桿，
// 拖曳相對錨點計算方向；放開後圓盤退回預設角落並歸零。解決「方向要一直重新滑動」的手感問題。
function bindJoystick() {
  const captureEl = document.getElementById("joystick-capture");
  const zone = document.getElementById("joystick-zone");
  const half = joystickCanvas.width / 2;
  let anchorX = 0;
  let anchorY = 0;

  function updateFromEvent(e) {
    // #touch-controls 是 position:fixed 全視窗、不受 #game-container 縮放影響，clientX/Y 可直接使用
    const dx = e.clientX - anchorX;
    const dy = e.clientY - anchorY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, JOYSTICK_MAX_DIST);
    const angle = Math.atan2(dy, dx);
    state.joystick.knobX = Math.cos(angle) * clamped;
    state.joystick.knobY = Math.sin(angle) * clamped;
    const mag = dist < 2 ? 0 : Math.pow(clamped / JOYSTICK_MAX_DIST, JOYSTICK_SENSITIVITY_CURVE);
    state.joystick.dx = Math.cos(angle) * mag;
    state.joystick.dy = Math.sin(angle) * mag;
  }

  function onDown(e) {
    e.preventDefault();
    state.joystick.active = true;
    state.joystick.pointerId = e.pointerId;
    anchorX = e.clientX;
    anchorY = e.clientY;
    // 圓盤移到觸點處（clamp 在視窗內，避免貼邊時圓盤被切掉一半）
    const zx = Math.max(0, Math.min(window.innerWidth - joystickCanvas.width, e.clientX - half));
    const zy = Math.max(0, Math.min(window.innerHeight - joystickCanvas.height, e.clientY - half));
    zone.style.left = `${zx}px`;
    zone.style.top = `${zy}px`;
    zone.style.bottom = "auto";
    try {
      captureEl.setPointerCapture(e.pointerId);
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
    // 圓盤退回預設角落（清空 inline style，回歸 CSS 定位）
    zone.style.left = "";
    zone.style.top = "";
    zone.style.bottom = "";
  }

  captureEl.addEventListener("pointerdown", onDown);
  captureEl.addEventListener("pointermove", onMove);
  captureEl.addEventListener("pointerup", onUp);
  captureEl.addEventListener("pointercancel", onUp);
}

// P19：按住連發——pointerdown 立即觸發一次後，按住期間每 130ms 自動重複觸發，
// 不必再狂點；掌技充能與氣勁冷卻本身就會節流，重複呼叫是安全的
const ACTION_REPEAT_MS = 130;

function bindActionButton(btn, triggerFn) {
  let repeatTimer = null;

  function stopRepeat() {
    if (repeatTimer) {
      clearInterval(repeatTimer);
      repeatTimer = null;
    }
  }

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
      return;
    }
    if (!state.skillMenuOpen) {
      triggerFn();
      stopRepeat();
      repeatTimer = setInterval(() => {
        if (state.started && !state.gameOver && !state.skillMenuOpen && state.upgradeChoices.length === 0) {
          triggerFn();
        }
      }, ACTION_REPEAT_MS);
    }
  });
  const release = (e) => {
    e.preventDefault();
    btn.classList.remove("pressed");
    stopRepeat();
  };
  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointercancel", release);
  btn.addEventListener("pointerleave", release);
}

// ===== 主迴圈 =====
function update(dt, timestamp) {
  if (state.skillMenuOpen || state.upgradeChoices.length > 0 || state.victoryPause) {
    updateUI();
    return;
  }

  state.elapsed += dt;
  updateStage(dt);
  updatePlayer(dt);
  updateAutoAttack(dt);
  updateOrbiters(dt);
  updateThrowSkill(dt);
  updateChainBlast(dt);
  updateBladestorm(dt);
  updateBarrier(dt);
  updatePalmRecharge(dt);
  updateEnemySpawning(timestamp);
  updateEnemies(dt);
  updateEnemyProjectiles(dt);
  updateProjectiles(dt);
  updateSpirals(dt);
  updateDrops(dt);
  updateChests();
  updateAltars();
  updateParticles(dt);
  updateDamageTexts(dt);
  updatePickupTexts(dt);
  updateShockwaves(dt);
  updateFxOverlays(dt);
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
    render(dt);
    return;
  }

  // P18：update/render 包一層防護——任何一幀（尤其是 3D 渲染層）萬一拋出未預期例外，
  // 若不攔截會讓這次 requestAnimationFrame 回呼提前結束，導致下面重新排程 RAF 的那行永遠不會執行，
  // 主迴圈（連同輸入處理）就此整個停死。攔截後只記錄錯誤、跳過本幀，下一幀繼續正常運作。
  try {
    update(dt, timestamp);
    render(dt);
  } catch (err) {
    console.error("[gameLoop] 本幀更新/渲染發生例外，已跳過本幀繼續運作", err);
  }
  requestAnimationFrame(gameLoop);
}

// ===== 啟動 =====
loadAssets();
initEngine({
  canvas,
  CANVAS_W,
  CANVAS_H,
  state,
  CHARACTERS,
  ENEMY_VISUALS,
  assetImages,
  VAMPIRE_FX_DURATION,
  getEnrageMult,
});
resetState(CHARACTERS[0].id);
renderCharacterSelect();
renderMetaPanel();
{
  const recordsLine = document.getElementById("records-line");
  const text = formatRecordsLine();
  if (text) {
    recordsLine.textContent = text;
    recordsLine.classList.remove("hidden");
  }
}
document.getElementById("victory-endless-btn").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  state.victoryPause = false;
  document.getElementById("victory-screen").classList.add("hidden");
  showStageBanner("無盡試煉", "浩劫未止，武道無涯");
});
// Playwright／除錯用把手：module scope 不外洩全域，統一掛在 window.__game
window.__game = {
  state,
  CHARACTERS,
  SKILL_DEFS,
  STAGE_CONFIGS,
  spawnEnemy,
  spawnBoss,
  resetState,
  startGameWithCharacter,
  getAvailableEvolution,
  buildChestChoices,
  selectUpgrade,
  getXiuwei,
  addXiuwei,
  getTrialsUnlocked,
  getTrialSelected,
  tryUnlockTrial,
  selectTrial,
  TRIAL_DEFS,
  getCurseMods,
  CURSE_DEFS,
  spawnCurseAltar,
  addFrenzyStack,
  getEnrageMult,
  getPowerScaleFactor,
  getBgmIntensity,
  applyScene,
  applyPlayerSpeed,
  getSkillUpgradeCost,
  __debugState,
  __projectPoint,
};
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
