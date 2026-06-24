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

// ===== 全域狀態 =====
const state = {
  player: null,
  enemies: [],
  projectiles: [],
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
  }

  for (const proj of state.projectiles) {
    for (const enemy of state.enemies) {
      if (!proj.hit && circleHit(proj, enemy)) {
        applyDamage(enemy, proj.damage);
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
  const bodyColor = isHurt(p) ? "#ff4d4d" : "#f5f5f0";
  const robeColor = isHurt(p) ? "#cc3333" : "#1f3a5f";

  ctx.save();
  ctx.translate(p.x, p.y);

  // 身體（長袍）
  ctx.fillStyle = robeColor;
  ctx.fillRect(-p.w / 2, -p.h / 2 + 12, p.w, p.h - 12);

  // 頭部
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-10, -p.h / 2, 20, 18);

  // 面向指示（眼睛朝向方向的小色塊）
  ctx.fillStyle = "#000";
  ctx.fillRect(p.facing * 4 - 2, -p.h / 2 + 6, 4, 4);

  ctx.restore();
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.fillStyle = isHurt(e) ? "#ff3333" : "#8b4513";
  ctx.beginPath();
  ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
  ctx.fill();

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
  ctx.fillStyle = "#3ad6ff";
  ctx.shadowColor = "#3ad6ff";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  for (const e of state.enemies) drawEnemy(e);
  for (const proj of state.projectiles) drawProjectile(proj);
  drawPlayer();
}

// ===== 主迴圈 =====
function update(dt, timestamp) {
  updatePlayer(dt);
  updateEnemySpawning(timestamp);
  updateEnemies(dt);
  updateProjectiles(dt);

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
