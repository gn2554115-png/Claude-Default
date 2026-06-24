// ===== 常數設定 =====
const CANVAS_W = 450;
const CANVAS_H = 800;

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
const SPIRAL_BLADE_DAMAGE = Math.round(PALM_NOVA_DAMAGE * 0.6);
const SPIRAL_SPIN = 9; // rad/秒

const HURT_EFFECT_DURATION = 150; // ms

const ENEMY_RADIUS = 16;
const ENEMY_MAX_HP = 30;
const ENEMY_SPEED = 70;
const ENEMY_TOUCH_DAMAGE = 8;
const ENEMY_KNOCKBACK_RESIST = 0.85;
const KILL_SCORE = 10;

// 敵人變種：較大較慢、血厚的「悍敵」
const ENEMY_BRUTE_HP_MULT = 2.4;
const ENEMY_BRUTE_RADIUS = 24;
const ENEMY_BRUTE_SPEED_MULT = 0.55;
const ENEMY_BRUTE_TOUCH_MULT = 1.6;
const ENEMY_BRUTE_SCORE_MULT = 2;

// 關卡制難度：每 STAGE_DURATION_SEC 秒跳一級，離散調整而非連續內插
const STAGE_DURATION_SEC = 45;
const STAGE_CONFIGS = [
  { spawnInterval: 1400, hpMult: 1.0, bruteChance: 0.0, skyTint: "#3a2a4a" },
  { spawnInterval: 1100, hpMult: 1.15, bruteChance: 0.15, skyTint: "#4a2a3a" },
  { spawnInterval: 850, hpMult: 1.35, bruteChance: 0.22, skyTint: "#2a2a4a" },
  { spawnInterval: 650, hpMult: 1.55, bruteChance: 0.3, skyTint: "#1a1a3a" },
  { spawnInterval: 450, hpMult: 1.8, bruteChance: 0.35, skyTint: "#0a0a2a" },
];

const XP_BASE_TO_NEXT = 20;
const XP_GROWTH = 1.35;
const KILL_XP = 8;

const MAX_PARTICLES = 400;

// ===== 角色設定 =====
const CHARACTERS = [
  {
    id: "qingfeng",
    name: "青鋒",
    rimColor: "#3ad6ff",
    bodyColor: "#11131c",
    beltColor: "#ffd84d",
    desc: "掌震波 AoE　震退四周敵人",
    palmAbility: "nova",
    palmName: "霸王肘",
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
];

// ===== 全域狀態 =====
const state = {
  started: false,
  characterId: CHARACTERS[0].id,
  player: null,
  enemies: [],
  projectiles: [],
  particles: [],
  damageTexts: [],
  shockwaves: [],
  spirals: [],
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
  };
  state.enemies = [];
  state.projectiles = [];
  state.particles = [];
  state.damageTexts = [];
  state.shockwaves = [];
  state.spirals = [];
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

  setBgmVolume(BGM_NORMAL_VOLUME);
  document.getElementById("game-over-screen").classList.add("hidden");
  const cardBox = document.getElementById("level-up-cards");
  cardBox.innerHTML = "";
  cardBox.classList.add("hidden");
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

function applyDamage(entity, dmg) {
  entity.hp -= dmg;
  entity.hurtUntil = performance.now() + HURT_EFFECT_DURATION;
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
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
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
const BGM_STEP_SEC = 60 / BGM_TEMPO / 2; // 八分音符
const BGM_SCALE = [196.0, 220.0, 246.94, 293.66, 329.63]; // G 五聲音階
const BGM_PATTERN = [0, 2, 1, 3, 2, 4, 3, 1];

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

  if (bgmStepIndex % 4 === 0) {
    const drone = ctx.createOscillator();
    const droneGain = ctx.createGain();
    drone.type = "sine";
    drone.frequency.value = BGM_SCALE[0] / 2;
    droneGain.gain.setValueAtTime(0.001, time);
    droneGain.gain.linearRampToValueAtTime(0.5, time + 0.3);
    droneGain.gain.exponentialRampToValueAtTime(0.001, time + BGM_STEP_SEC * 4);
    drone.connect(droneGain);
    droneGain.connect(gain);
    drone.start(time);
    drone.stop(time + BGM_STEP_SEC * 4 + 0.05);
  }

  const note = BGM_PATTERN[bgmStepIndex % BGM_PATTERN.length];
  const freq = BGM_SCALE[note];
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  oscGain.gain.setValueAtTime(0.001, time);
  oscGain.gain.linearRampToValueAtTime(0.4, time + 0.02);
  oscGain.gain.exponentialRampToValueAtTime(0.001, time + BGM_STEP_SEC * 0.9);
  osc.connect(oscGain);
  oscGain.connect(gain);
  osc.start(time);
  osc.stop(time + BGM_STEP_SEC);

  bgmStepIndex += 1;
}

function bgmSchedulerTick() {
  const ctx = getAudioCtx();
  if (!ctx || !bgmStarted) return;
  while (bgmNextStepTime < ctx.currentTime + 0.15) {
    scheduleBgmStep(bgmNextStepTime);
    bgmNextStepTime += BGM_STEP_SEC;
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

// ===== 升級卡（不暫停、邊玩邊選） =====
function addXp(amount) {
  const p = state.player;
  p.xp += amount;
  while (p.xp >= p.xpToNext) {
    p.xp -= p.xpToNext;
    p.level += 1;
    p.xpToNext = Math.round(XP_BASE_TO_NEXT * Math.pow(XP_GROWTH, p.level - 1));
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
}

function selectUpgrade(i) {
  const choice = state.upgradeChoices[i];
  if (!choice) return;
  choice.apply(state.player);
  state.upgradeChoices = [];
  const container = document.getElementById("level-up-cards");
  container.innerHTML = "";
  container.classList.add("hidden");
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

  p.x = clamp(p.x, p.radius, CANVAS_W - p.radius);
  p.y = clamp(p.y, p.radius, CANVAS_H - p.radius);

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
      color: "rgba(58,214,255,0.9)",
      type: "muzzle",
      glow: true,
    });
  }
}

function updateAutoAttack(dt) {
  const p = state.player;
  p.autoAtkTimer -= dt * 1000;
  if (p.autoAtkTimer > 0) return;

  const target = findNearestEnemy(p.x, p.y);
  if (!target) {
    p.autoAtkTimer = 60; // 場上無敵人時稍後再檢查，不浪費攻速
    return;
  }

  p.autoAtkTimer = p.atkInterval;
  spawnAutoFireBurst(p, Math.atan2(target.y - p.y, target.x - p.x));
  fireHomingVolley(p, target, p.projCount, p.atkDamage, p.projSpeed, AUTO_ATK_TURN_RATE, AUTO_ATK_RADIUS, "auto");
}

function tryQiAttack() {
  const p = state.player;
  const now = performance.now();
  if (now < p.qiCooldownUntil) return;
  p.qiCooldownUntil = now + QI_COOLDOWN;
  playQiFireSound();

  const target = findNearestEnemy(p.x, p.y);
  if (target) {
    fireHomingVolley(p, target, 1, QI_DAMAGE, QI_SPEED, QI_TURN_RATE, QI_RADIUS, "qi");
  } else {
    state.projectiles.push({
      x: p.x + p.facing * (p.w / 2),
      y: p.y,
      vx: p.facing * QI_SPEED,
      vy: 0,
      radius: QI_RADIUS,
      damage: QI_DAMAGE,
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

function palmNova(p) {
  triggerShake(0.25, 14);
  playPalmNovaSound();
  spawnShockwave(p.x, p.y, p.palmRadius);
  spawnExplosion(p.x, p.y, "rgba(58,214,255,0.9)", 20);

  let hitAny = false;
  for (const enemy of state.enemies) {
    const d = distance(p, enemy);
    if (d < p.palmRadius + enemy.radius) {
      applyDamage(enemy, PALM_NOVA_DAMAGE);
      spawnDamageText(enemy.x, enemy.y - enemy.radius, PALM_NOVA_DAMAGE);
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
        applyDamage(enemy, SPIRAL_BLADE_DAMAGE);
        spawnDamageText(enemy.x, enemy.y - enemy.radius, SPIRAL_BLADE_DAMAGE);
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

function drawSpirals() {
  for (const s of state.spirals) {
    const alpha = Math.max(0, s.life / s.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.fillStyle = "#c060ff";
    ctx.shadowColor = "#c060ff";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(-SPIRAL_BLADE_RADIUS, 0);
    ctx.lineTo(SPIRAL_BLADE_RADIUS, -4);
    ctx.lineTo(SPIRAL_BLADE_RADIUS, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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

// ===== 敵人邏輯 =====
function spawnEnemy() {
  const margin = 40;
  const side = Math.floor(Math.random() * 4); // 0 上 1 右 2 下 3 左
  let x;
  let y;
  if (side === 0) {
    x = Math.random() * CANVAS_W;
    y = -margin;
  } else if (side === 1) {
    x = CANVAS_W + margin;
    y = Math.random() * CANVAS_H;
  } else if (side === 2) {
    x = Math.random() * CANVAS_W;
    y = CANVAS_H + margin;
  } else {
    x = -margin;
    y = Math.random() * CANVAS_H;
  }

  const stageConfig = STAGE_CONFIGS[state.stage];
  const baseHp = Math.round(ENEMY_MAX_HP * stageConfig.hpMult);

  const isBrute = Math.random() < stageConfig.bruteChance;
  const type = isBrute ? "brute" : "normal";
  const radius = isBrute ? ENEMY_BRUTE_RADIUS : ENEMY_RADIUS;
  const hp = isBrute ? Math.round(baseHp * ENEMY_BRUTE_HP_MULT) : baseHp;
  const speed = isBrute ? ENEMY_SPEED * ENEMY_BRUTE_SPEED_MULT : ENEMY_SPEED;
  const touchDamage = isBrute ? Math.round(ENEMY_TOUCH_DAMAGE * ENEMY_BRUTE_TOUCH_MULT) : ENEMY_TOUCH_DAMAGE;
  const killScore = isBrute ? KILL_SCORE * ENEMY_BRUTE_SCORE_MULT : KILL_SCORE;
  const killXp = isBrute ? KILL_XP * ENEMY_BRUTE_SCORE_MULT : KILL_XP;

  state.enemies.push({
    x,
    y,
    type,
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
  });
}

function getEnemySpawnInterval() {
  return STAGE_CONFIGS[state.stage].spawnInterval;
}

function updateStage() {
  const nextStage = Math.min(
    Math.floor(state.elapsed / STAGE_DURATION_SEC),
    STAGE_CONFIGS.length - 1
  );
  if (nextStage !== state.stage) {
    state.stage = nextStage;
    console.log(`[stage] entering stage ${nextStage + 1}`);
    triggerShake(0.15, 6);
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
    } else {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      e.x += (dx / dist) * e.speed * dt;
      e.y += (dy / dist) * e.speed * dt;
    }
  }

  // 先清除被打死的敵人：加分、加經驗、爆炸特效
  state.enemies = state.enemies.filter((e) => {
    if (e.hp <= 0) {
      state.score += e.killScore;
      state.kills += 1;
      spawnExplosion(e.x, e.y, "rgba(200,60,220,0.9)", 20);
      playKillSound();
      addXp(e.killXp);
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
      applyDamage(p, e.touchDamage);
      p.invulnUntil = now + PLAYER_IFRAME_MS;
      triggerShake(0.15, 8);
      playHurtSound();
      damaged = true;
    }
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

  state.projectiles = state.projectiles.filter(
    (proj) =>
      !proj.hit &&
      proj.x > -50 &&
      proj.x < CANVAS_W + 50 &&
      proj.y > -50 &&
      proj.y < CANVAS_H + 50
  );
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
  attemptAutoFullscreen();
}

// ===== 全螢幕 =====
function isFullscreenSupported() {
  const el = document.documentElement;
  return Boolean(el.requestFullscreen || el.webkitRequestFullscreen);
}

let fullscreenHintTimer = null;
function showFullscreenFallbackMessage(text) {
  const hint = document.getElementById("fullscreen-hint");
  if (!hint) return;
  hint.textContent = text;
  hint.classList.remove("hidden");
  if (fullscreenHintTimer) clearTimeout(fullscreenHintTimer);
  fullscreenHintTimer = setTimeout(() => {
    hint.classList.add("hidden");
  }, 2200);
}

function toggleFullscreen() {
  const isFs = document.fullscreenElement || document.webkitFullscreenElement;
  if (isFs) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) {
      Promise.resolve(exit.call(document))
        .then(() => console.log("[fullscreen] exited"))
        .catch((err) => console.warn("[fullscreen] exit failed", err));
    }
    return;
  }

  if (!isFullscreenSupported()) {
    console.warn("[fullscreen] not supported in this browser");
    showFullscreenFallbackMessage("此瀏覽器不支援全螢幕");
    return;
  }

  const el = document.documentElement;
  const request = el.requestFullscreen || el.webkitRequestFullscreen;
  try {
    Promise.resolve(request.call(el))
      .then(() => console.log("[fullscreen] entered"))
      .catch((err) => {
        console.warn("[fullscreen] request rejected", err);
        showFullscreenFallbackMessage("全螢幕請求被拒絕");
      });
  } catch (err) {
    console.warn("[fullscreen] request threw", err);
    showFullscreenFallbackMessage("無法進入全螢幕");
  }
}

function attemptAutoFullscreen() {
  const el = document.documentElement;
  const request = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!request) {
    console.log("[fullscreen] auto attempt skipped: unsupported");
    return;
  }
  try {
    const result = request.call(el);
    if (result && result.catch) {
      result
        .then(() => console.log("[fullscreen] auto entered"))
        .catch((err) => console.log("[fullscreen] auto attempt failed", err));
    }
  } catch (err) {
    // 部分瀏覽器（如 iOS Safari）不支援全螢幕 API，靜默忽略
    console.log("[fullscreen] auto attempt threw", err);
  }
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

function drawPlayer() {
  const p = state.player;
  const hurt = isHurt(p);

  // 殘影特效：移動中由舊到新、由淡到濃的剪影分身
  for (let i = 0; i < p.history.length; i++) {
    const h = p.history[i];
    const alpha = ((i + 1) / (p.history.length + 1)) * 0.35;
    drawPlayerShape(h.x, h.y, h.facing, h.animTime, true, false, alpha);
  }

  drawPlayerShape(p.x, p.y, p.facing, p.animTime, p.moving, hurt, 1);
}

function drawEnemy(e) {
  const hurt = isHurt(e);
  const isBrute = e.type === "brute";

  ctx.save();
  ctx.translate(e.x, e.y);

  const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, e.radius);
  if (hurt) {
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(1, isBrute ? "#ff5500" : "#ff2222");
  } else if (isBrute) {
    grad.addColorStop(0, "#ffaa55");
    grad.addColorStop(0.6, "#d9530a");
    grad.addColorStop(1, "#4d1a05");
  } else {
    grad.addColorStop(0, "#ff66cc");
    grad.addColorStop(0.6, "#9b30d9");
    grad.addColorStop(1, "#3a0a4d");
  }
  ctx.fillStyle = grad;
  ctx.shadowColor = isBrute ? "#ff6a00" : "#c040ff";
  ctx.shadowBlur = isBrute ? 20 : 14;
  ctx.beginPath();
  ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

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

  const isQi = proj.kind === "qi";

  if (isQi) {
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
  } else {
    // 鏢狀細長菱形剪影，與氣功的發光橢圓彈頭做形狀區分
    const len = proj.radius * 3.2;
    ctx.fillStyle = "#3ad6ff";
    ctx.shadowColor = "#3ad6ff";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(len / 2, 0);
    ctx.lineTo(-len / 4, -proj.radius * 0.55);
    ctx.lineTo(-len / 2, 0);
    ctx.lineTo(-len / 4, proj.radius * 0.55);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

const HORIZON_Y = CANVAS_H * 0.65;

const FAR_MOUNTAINS = [
  { baseX: 30, width: 130, height: 55 },
  { baseX: 150, width: 160, height: 80 },
  { baseX: 300, width: 150, height: 60 },
  { baseX: 420, width: 120, height: 45 },
];

const GRASS_TUFTS = Array.from({ length: 18 }, (_, i) => ({
  x: (i * 47 + 20) % CANVAS_W,
  y: HORIZON_Y + 12 + ((i * 31) % (CANVAS_H - HORIZON_Y - 20)),
  size: 6 + (i % 3) * 2,
}));

function drawBackground() {
  // 黃昏天空，隨關卡推進轉趨深暗
  const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
  skyGrad.addColorStop(0, STAGE_CONFIGS[state.stage].skyTint);
  skyGrad.addColorStop(0.55, "#7a4a5a");
  skyGrad.addColorStop(1, "#c98a5a");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, CANVAS_W, HORIZON_Y);

  // 遠山輪廓
  ctx.fillStyle = "rgba(50,30,60,0.6)";
  for (const m of FAR_MOUNTAINS) {
    ctx.beginPath();
    ctx.moveTo(m.baseX - m.width / 2, HORIZON_Y);
    ctx.lineTo(m.baseX, HORIZON_Y - m.height);
    ctx.lineTo(m.baseX + m.width / 2, HORIZON_Y);
    ctx.closePath();
    ctx.fill();
  }

  // 地面
  const groundGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, CANVAS_H);
  groundGrad.addColorStop(0, "#3a3320");
  groundGrad.addColorStop(1, "#1c1810");
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, HORIZON_Y, CANVAS_W, CANVAS_H - HORIZON_Y);

  // 地平線亮邊
  ctx.fillStyle = "rgba(255,200,140,0.4)";
  ctx.fillRect(0, HORIZON_Y, CANVAS_W, 2);

  // 草叢
  ctx.fillStyle = "#3f5a2a";
  for (const tuft of GRASS_TUFTS) {
    ctx.beginPath();
    ctx.moveTo(tuft.x - tuft.size, tuft.y);
    ctx.lineTo(tuft.x, tuft.y - tuft.size * 1.6);
    ctx.lineTo(tuft.x + tuft.size, tuft.y);
    ctx.closePath();
    ctx.fill();
  }
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
  for (const e of state.enemies) drawEnemy(e);
  drawParticles();
  drawShockwaves();
  for (const proj of state.projectiles) drawProjectile(proj);
  drawSpirals();
  drawPlayer();
  drawDamageTexts();

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
    const mag = clamped / JOYSTICK_MAX_DIST;
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
    } else {
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
  state.elapsed += dt;
  updateStage();
  updatePlayer(dt);
  updateAutoAttack(dt);
  updatePalmRecharge(dt);
  updateEnemySpawning(timestamp);
  updateEnemies(dt);
  updateProjectiles(dt);
  updateSpirals(dt);
  updateParticles(dt);
  updateDamageTexts(dt);
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

document.getElementById("btn-fullscreen").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  toggleFullscreen();
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
