// ===== 常數設定 =====
const CANVAS_W = 800;
const CANVAS_H = 500;

const PLAYER_SPEED = 200; // px/秒
const PLAYER_MAX_HP = 100;
const PLAYER_RADIUS = 18;

const PALM_RANGE = 50;
const PALM_DAMAGE = 15;
const PALM_COOLDOWN = 250; // ms

const QI_COOLDOWN = 800; // ms
const QI_SPEED = 350;
const QI_DAMAGE = 20;
const QI_RADIUS = 8;

const HURT_EFFECT_DURATION = 150; // ms

const ENEMY_SPAWN_INTERVAL = 1500; // ms
const ENEMY_RADIUS = 16;
const ENEMY_MAX_HP = 30;
const ENEMY_SPEED = 80;
const ENEMY_TOUCH_DAMAGE = 12;
const KILL_SCORE = 10;

const MAX_PARTICLES = 400;

// ===== 全域狀態 =====
const state = {
  player: null,
  enemies: [],
  projectiles: [],
  particles: [],
  damageTexts: [],
  score: 0,
  gameOver: false,
  keys: new Set(),
  lastEnemySpawnTime: 0,
  joystick: { active: false, pointerId: null, knobX: 0, knobY: 0, dx: 0, dy: 0 },
  shake: { time: 0, duration: 0.1, magnitude: 0 },
};

function resetState() {
  state.player = {
    x: 120,
    y: CANVAS_H / 2,
    radius: PLAYER_RADIUS,
    w: 30,
    h: 50,
    facing: 1,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    speed: PLAYER_SPEED,
    hurtUntil: 0,
    palmCooldownUntil: 0,
    qiCooldownUntil: 0,
    animTime: 0,
    trailTimer: 0,
    history: [],
    historyTimer: 0,
    moving: false,
  };
  state.enemies = [];
  state.projectiles = [];
  state.particles = [];
  state.damageTexts = [];
  state.score = 0;
  state.gameOver = false;
  state.lastEnemySpawnTime = performance.now();
  state.joystick.active = false;
  state.joystick.pointerId = null;
  state.joystick.knobX = 0;
  state.joystick.knobY = 0;
  state.joystick.dx = 0;
  state.joystick.dy = 0;
  state.shake.time = 0;

  document.getElementById("game-over-screen").classList.add("hidden");
  updateUI();
}

// ===== 共用工具 =====
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  spawnParticle({
    x: proj.x,
    y: proj.y,
    vx: 0,
    vy: 0,
    life: 0.25,
    maxLife: 0.25,
    size: 3,
    color: "rgba(255,216,77,0.8)",
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

function playGameOverSound() {
  const notes = [440, 330, 220];
  notes.forEach((freq, i) => {
    setTimeout(() => playTone({ freq, duration: 0.3, type: "triangle", peak: 0.2 }), i * 180);
  });
}

// ===== 輸入處理 =====
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  state.keys.add(k);

  if (state.gameOver) {
    if (k === "r") resetAndStart();
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

function tryPalmAttack() {
  const p = state.player;
  const now = performance.now();
  if (now < p.palmCooldownUntil) return;
  p.palmCooldownUntil = now + PALM_COOLDOWN;

  const hitbox = {
    x: p.x + p.facing * (PALM_RANGE / 2),
    y: p.y,
    radius: PALM_RANGE / 2,
  };

  spawnPalmSlash(hitbox, p.facing);
  playPalmSound();

  for (const enemy of state.enemies) {
    if (circleHit(hitbox, enemy)) {
      applyDamage(enemy, PALM_DAMAGE);
      spawnDamageText(enemy.x, enemy.y - enemy.radius, PALM_DAMAGE);
      triggerShake(0.1, 6);
      playHitSound();
    }
  }
}

function tryQiAttack() {
  const p = state.player;
  const now = performance.now();
  if (now < p.qiCooldownUntil) return;
  p.qiCooldownUntil = now + QI_COOLDOWN;
  playQiFireSound();

  state.projectiles.push({
    x: p.x + p.facing * (p.w / 2),
    y: p.y,
    vx: p.facing * QI_SPEED,
    vy: 0,
    radius: QI_RADIUS,
    damage: QI_DAMAGE,
  });
}

// ===== 敵人邏輯 =====
function spawnEnemy() {
  const y = Math.random() * (CANVAS_H - ENEMY_RADIUS * 2) + ENEMY_RADIUS;
  state.enemies.push({
    x: CANVAS_W + 20,
    y,
    radius: ENEMY_RADIUS,
    hp: ENEMY_MAX_HP,
    maxHp: ENEMY_MAX_HP,
    speed: ENEMY_SPEED,
    hurtUntil: 0,
    particleTimer: 0,
  });
}

function updateEnemySpawning(timestamp) {
  if (timestamp - state.lastEnemySpawnTime > ENEMY_SPAWN_INTERVAL) {
    spawnEnemy();
    state.lastEnemySpawnTime = timestamp;
  }
}

function updateEnemies(dt) {
  const p = state.player;

  for (const e of state.enemies) {
    emitEnemyFlame(e, dt);

    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    e.x += (dx / dist) * e.speed * dt;
    e.y += (dy / dist) * e.speed * dt;
  }

  // 先清除被打死的敵人並加分，避免已被擊殺的敵人在同一幀又被誤判成「碰到玩家」
  state.enemies = state.enemies.filter((e) => {
    if (e.hp <= 0) {
      state.score += KILL_SCORE;
      spawnExplosion(e.x, e.y, "rgba(200,60,220,0.9)", 20);
      playKillSound();
      return false;
    }
    return true;
  });

  // 敵人碰到玩家：扣血、觸發受傷特效、敵人消失
  state.enemies = state.enemies.filter((e) => {
    if (circleHit(p, e)) {
      applyDamage(p, ENEMY_TOUCH_DAMAGE);
      playHurtSound();
      return false;
    }
    return true;
  });
}

// ===== 氣功彈邏輯 =====
function updateProjectiles(dt) {
  for (const proj of state.projectiles) {
    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;
    emitQiTrail(proj);
  }

  for (const proj of state.projectiles) {
    for (const enemy of state.enemies) {
      if (!proj.hit && circleHit(proj, enemy)) {
        applyDamage(enemy, proj.damage);
        spawnDamageText(enemy.x, enemy.y - enemy.radius, proj.damage);
        spawnExplosion(proj.x, proj.y, "rgba(255,216,77,0.9)", 10);
        triggerShake(0.1, 6);
        playHitSound();
        proj.hit = true;
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
}

function resetAndStart() {
  resetState();
  requestAnimationFrame(gameLoop);
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
}

// ===== 渲染 =====
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const joystickCanvas = document.getElementById("joystick-canvas");
const joystickCtx = joystickCanvas.getContext("2d");

function drawPlayerShape(x, y, facing, animTime, moving, hurt, alpha) {
  const p = state.player;
  const wobbleFreq = moving ? 10 : 3;
  const wobbleAmp = moving ? 2 : 1;
  const bob = Math.sin(animTime * wobbleFreq) * wobbleAmp;
  const swayL = Math.sin(animTime * wobbleFreq) * 3;
  const swayR = Math.sin(animTime * wobbleFreq + Math.PI) * 3;
  const rimColor = hurt ? "#ff4444" : "#3ad6ff";

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y + bob);
  if (facing < 0) ctx.scale(-1, 1);

  // 古風剪影身形（長袍 + 背劍），背光發光剪影感
  ctx.fillStyle = "#0c0c14";
  ctx.shadowColor = rimColor;
  ctx.shadowBlur = 14;

  ctx.beginPath();
  ctx.moveTo(-p.w / 2, -p.h / 2 + 14);
  ctx.lineTo(p.w / 2, -p.h / 2 + 14);
  ctx.lineTo(p.w / 2 + swayR, p.h / 2);
  ctx.lineTo(-p.w / 2 + swayL, p.h / 2);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, -p.h / 2 + 6, 11, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillRect(p.w / 2 - 2, -p.h / 2 + 16, 4, p.h - 14);

  // 剪影邊緣描邊發光（背光輪廓感）
  ctx.lineWidth = 2;
  ctx.strokeStyle = rimColor;
  ctx.globalAlpha = alpha * 0.85;
  ctx.beginPath();
  ctx.moveTo(-p.w / 2, -p.h / 2 + 14);
  ctx.lineTo(p.w / 2, -p.h / 2 + 14);
  ctx.lineTo(p.w / 2 + swayR, p.h / 2);
  ctx.lineTo(-p.w / 2 + swayL, p.h / 2);
  ctx.closePath();
  ctx.stroke();

  // 腰帶（金色點綴）
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffd84d";
  ctx.fillRect(-p.w / 2, -p.h / 2 + 24, p.w, 3);

  // 眼神發光點
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

  ctx.save();
  ctx.translate(e.x, e.y);

  const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, e.radius);
  if (hurt) {
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(1, "#ff2222");
  } else {
    grad.addColorStop(0, "#ff66cc");
    grad.addColorStop(0.6, "#9b30d9");
    grad.addColorStop(1, "#3a0a4d");
  }
  ctx.fillStyle = grad;
  ctx.shadowColor = "#c040ff";
  ctx.shadowBlur = 14;
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

  const len = proj.radius * 3;
  const grad = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
  grad.addColorStop(0, "rgba(255,216,77,0)");
  grad.addColorStop(0.6, "#ffd84d");
  grad.addColorStop(1, "#ffffff");

  ctx.fillStyle = grad;
  ctx.shadowColor = "#ffd84d";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.ellipse(0, 0, len / 2, proj.radius, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

const HORIZON_Y = CANVAS_H * 0.65;

const FAR_MOUNTAINS = [
  { baseX: 60, width: 220, height: 70 },
  { baseX: 280, width: 260, height: 95 },
  { baseX: 520, width: 240, height: 75 },
  { baseX: 720, width: 200, height: 60 },
];

const GRASS_TUFTS = Array.from({ length: 18 }, (_, i) => ({
  x: (i * 47 + 20) % CANVAS_W,
  y: HORIZON_Y + 12 + ((i * 31) % (CANVAS_H - HORIZON_Y - 20)),
  size: 6 + (i % 3) * 2,
}));

function drawBackground() {
  // 黃昏天空
  const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
  skyGrad.addColorStop(0, "#3a2a4a");
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
  for (const proj of state.projectiles) drawProjectile(proj);
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
const JOYSTICK_MAX_DIST = 45;

function drawJoystick() {
  const w = joystickCanvas.width;
  const h = joystickCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const j = state.joystick;

  joystickCtx.clearRect(0, 0, w, h);

  // 外圈（半透明發光圓環）
  joystickCtx.save();
  joystickCtx.shadowColor = "rgba(58,214,255,0.8)";
  joystickCtx.shadowBlur = 14;
  joystickCtx.fillStyle = "rgba(10,20,30,0.35)";
  joystickCtx.beginPath();
  joystickCtx.arc(cx, cy, 60, 0, Math.PI * 2);
  joystickCtx.fill();
  joystickCtx.lineWidth = 2;
  joystickCtx.strokeStyle = "rgba(58,214,255,0.7)";
  joystickCtx.stroke();
  joystickCtx.restore();

  // 內部操控小圓點
  const knobX = cx + j.knobX;
  const knobY = cy + j.knobY;
  joystickCtx.save();
  joystickCtx.shadowColor = "rgba(58,214,255,0.95)";
  joystickCtx.shadowBlur = j.active ? 18 : 8;
  const knobGrad = joystickCtx.createRadialGradient(knobX, knobY, 2, knobX, knobY, 24);
  knobGrad.addColorStop(0, "#ffffff");
  knobGrad.addColorStop(0.5, "#3ad6ff");
  knobGrad.addColorStop(1, "#0a3a55");
  joystickCtx.fillStyle = knobGrad;
  joystickCtx.beginPath();
  joystickCtx.arc(knobX, knobY, 24, 0, Math.PI * 2);
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
  updatePlayer(dt);
  updateEnemySpawning(timestamp);
  updateEnemies(dt);
  updateProjectiles(dt);
  updateParticles(dt);
  updateDamageTexts(dt);

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

  if (state.gameOver) {
    render();
    return;
  }

  update(dt, timestamp);
  render();
  requestAnimationFrame(gameLoop);
}

// ===== 啟動 =====
resetState();
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

window.addEventListener("keydown", unlockAudio, { once: true });
document.addEventListener("pointerdown", unlockAudio, { once: true });
