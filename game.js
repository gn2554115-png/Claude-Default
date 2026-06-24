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
const STAR_COUNT = 80;

// ===== 全域狀態 =====
const state = {
  player: null,
  enemies: [],
  projectiles: [],
  particles: [],
  score: 0,
  gameOver: false,
  keys: new Set(),
  lastEnemySpawnTime: 0,
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
  };
  state.enemies = [];
  state.projectiles = [];
  state.particles = state.particles.filter((pt) => pt.type === "star");
  state.score = 0;
  state.gameOver = false;
  state.lastEnemySpawnTime = performance.now();

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

    if (pt.type === "star") {
      if (pt.x < 0) pt.x += CANVAS_W;
      if (pt.x > CANVAS_W) pt.x -= CANVAS_W;
      if (pt.y < 0) pt.y += CANVAS_H;
      if (pt.y > CANVAS_H) pt.y -= CANVAS_H;
      continue;
    }

    pt.life -= dt;
  }

  state.particles = state.particles.filter(
    (pt) => pt.type === "star" || pt.life > 0
  );
}

function drawParticles() {
  for (const pt of state.particles) {
    if (pt.type === "star") continue;

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

function initStars() {
  for (let i = 0; i < STAR_COUNT; i++) {
    state.particles.push({
      x: Math.random() * CANVAS_W,
      y: Math.random() * CANVAS_H,
      vx: -5 - Math.random() * 10,
      vy: 0,
      life: Infinity,
      maxLife: Infinity,
      size: 0.5 + Math.random() * 1.5,
      color: "#ffffff",
      type: "star",
      glow: false,
    });
  }
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

  if (state.keys.has("w")) dy -= 1;
  if (state.keys.has("s")) dy += 1;
  if (state.keys.has("a")) dx -= 1;
  if (state.keys.has("d")) dx += 1;

  if (dx !== 0 || dy !== 0) {
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;
    p.x += dx * p.speed * dt;
    p.y += dy * p.speed * dt;
  }

  if (dx > 0) p.facing = 1;
  else if (dx < 0) p.facing = -1;

  p.x = clamp(p.x, p.radius, CANVAS_W - p.radius);
  p.y = clamp(p.y, p.radius, CANVAS_H - p.radius);
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

  for (const enemy of state.enemies) {
    if (circleHit(hitbox, enemy)) {
      applyDamage(enemy, PALM_DAMAGE);
    }
  }
}

function tryQiAttack() {
  const p = state.player;
  const now = performance.now();
  if (now < p.qiCooldownUntil) return;
  p.qiCooldownUntil = now + QI_COOLDOWN;

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
      spawnExplosion(e.x, e.y, "rgba(200,60,220,0.9)");
      return false;
    }
    return true;
  });

  // 敵人碰到玩家：扣血、觸發受傷特效、敵人消失
  state.enemies = state.enemies.filter((e) => {
    if (circleHit(p, e)) {
      applyDamage(p, ENEMY_TOUCH_DAMAGE);
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
        spawnExplosion(proj.x, proj.y, "rgba(255,216,77,0.9)", 10);
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

function drawPlayer() {
  const p = state.player;
  const hurt = isHurt(p);

  ctx.save();
  ctx.translate(p.x, p.y);

  // 身體（長袍）— 霓虹漸層
  const robeTop = hurt ? "#ff5555" : "#3ad6ff";
  const robeBottom = hurt ? "#660000" : "#0a1a33";
  const robeGrad = ctx.createLinearGradient(0, -p.h / 2 + 12, 0, p.h / 2);
  robeGrad.addColorStop(0, robeTop);
  robeGrad.addColorStop(1, robeBottom);
  ctx.fillStyle = robeGrad;
  ctx.shadowColor = hurt ? "#ff3333" : "#3ad6ff";
  ctx.shadowBlur = 16;
  ctx.fillRect(-p.w / 2, -p.h / 2 + 12, p.w, p.h - 12);

  // 頭部 — 發光核心球體
  const coreGrad = ctx.createRadialGradient(0, -p.h / 2 + 9, 1, 0, -p.h / 2 + 9, 12);
  if (hurt) {
    coreGrad.addColorStop(0, "#ffffff");
    coreGrad.addColorStop(0.5, "#ff5555");
    coreGrad.addColorStop(1, "#880000");
  } else {
    coreGrad.addColorStop(0, "#ffffff");
    coreGrad.addColorStop(0.5, "#3ad6ff");
    coreGrad.addColorStop(1, "#0a3a55");
  }
  ctx.fillStyle = coreGrad;
  ctx.shadowColor = hurt ? "#ff3333" : "#3ad6ff";
  ctx.shadowBlur = 20;
  ctx.fillRect(-10, -p.h / 2, 20, 18);

  // 面向指示（眼睛朝向方向的小色塊）
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#000";
  ctx.fillRect(p.facing * 4 - 2, -p.h / 2 + 6, 4, 4);

  ctx.restore();
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

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0, "#0a0a1f");
  grad.addColorStop(1, "#1a0a2a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = "#ffffff";
  for (const pt of state.particles) {
    if (pt.type !== "star") continue;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  drawBackground();
  for (const e of state.enemies) drawEnemy(e);
  drawParticles();
  for (const proj of state.projectiles) drawProjectile(proj);
  drawPlayer();
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

// ===== 觸控控制 =====
function bindDpadButton(btn) {
  const key = btn.dataset.key;
  const press = (e) => {
    e.preventDefault();
    state.keys.add(key);
    btn.classList.add("pressed");
  };
  const release = (e) => {
    e.preventDefault();
    state.keys.delete(key);
    btn.classList.remove("pressed");
  };
  btn.addEventListener("pointerdown", press);
  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointercancel", release);
  btn.addEventListener("pointerleave", release);
}

function bindActionButton(btn, triggerFn) {
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btn.classList.add("pressed");
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
initStars();
resetState();
lastTime = performance.now();
requestAnimationFrame(gameLoop);

updateGameScale();
window.addEventListener("resize", updateGameScale);
window.addEventListener("orientationchange", () => {
  setTimeout(updateGameScale, 100);
});

document.querySelectorAll(".dpad-btn").forEach(bindDpadButton);
bindActionButton(document.getElementById("btn-palm"), tryPalmAttack);
bindActionButton(document.getElementById("btn-qi"), tryQiAttack);
