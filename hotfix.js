(function () {
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

  const style = document.createElement("style");
  style.textContent = `
    :root {
      --char-accent: #3ad6ff;
      --char-accent-soft: rgba(58, 214, 255, 0.78);
      --char-accent-strong: rgba(58, 214, 255, 0.95);
      --char-button-text: #061119;
    }

    #game-container {
      --char-accent-soft: rgba(58, 214, 255, 0.78);
      --char-accent-strong: rgba(58, 214, 255, 0.95);
      --char-button-text: #061119;
    }

    body:not(.game-active) #touch-controls {
      display: none !important;
    }

    #btn-palm,
    #btn-qi {
      text-shadow: 0 1px 0 rgba(255, 255, 255, 0.42) !important;
    }

    #btn-palm {
      border: 1px solid rgba(126, 232, 255, 0.95) !important;
      background: radial-gradient(circle at 35% 28%, #f4feff 0%, #58e0ff 38%, #14749c 100%) !important;
      color: #041824 !important;
      box-shadow: 0 0 16px rgba(58, 214, 255, 0.72), inset 0 0 12px rgba(255, 255, 255, 0.38) !important;
    }

    #btn-qi {
      border: 1px solid rgba(255, 216, 77, 0.96) !important;
      background: radial-gradient(circle at 35% 28%, #fff6b0 0%, #ffb347 42%, #9b3f12 100%) !important;
      color: #2b1200 !important;
      box-shadow: 0 0 16px rgba(255, 190, 68, 0.78), inset 0 0 12px rgba(255, 248, 190, 0.38) !important;
    }

    #btn-palm.pressed {
      box-shadow: 0 0 24px rgba(58, 214, 255, 0.95), inset 0 0 16px rgba(255, 255, 255, 0.55) !important;
    }

    #btn-qi.pressed {
      box-shadow: 0 0 24px rgba(255, 190, 68, 0.95), inset 0 0 16px rgba(255, 248, 190, 0.55) !important;
    }
  `;
  document.head.appendChild(style);
  document.body.classList.remove("game-active");

  const bingyun = CHARACTERS.find((character) => character.id === "bingyun");
  if (bingyun) bingyun.spriteFacesLeft = true;

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target.closest(".character-card")) document.body.classList.add("game-active");
    },
    true
  );

  const originalStartGameWithCharacter = window.startGameWithCharacter;
  window.startGameWithCharacter = function (id) {
    document.body.classList.add("game-active");
    return originalStartGameWithCharacter(id);
  };

  const originalResetAndStart = window.resetAndStart;
  window.resetAndStart = function () {
    document.body.classList.add("game-active");
    return originalResetAndStart();
  };

  const originalSpawnFxOverlay = window.spawnFxOverlay;
  window.spawnFxOverlay = function (x, y, imgKey, fromScale, toScale, durationMs, rotateDeg) {
    if (imgKey === "bingyun_fx_basic") {
      return originalSpawnFxOverlay(x, y, imgKey, 0.18, 0.75, 320, 0);
    }
    if (imgKey === "bingyun_fx_ult") {
      return originalSpawnFxOverlay(x, y, imgKey, 0.35, 1.25, 1050, 0);
    }
    return originalSpawnFxOverlay(x, y, imgKey, fromScale, toScale, durationMs, rotateDeg);
  };

  const originalEmitQiTrail = window.emitQiTrail;
  window.emitQiTrail = function (proj) {
    if (proj && proj.imgKey === "bingyun_fx_basic") {
      spawnParticle({
        x: proj.x,
        y: proj.y,
        vx: 0,
        vy: 0,
        life: 0.34,
        maxLife: 0.34,
        size: 4,
        color: "rgba(189,244,255,0.82)",
        type: "trail",
        glow: false,
      });
      return;
    }
    return originalEmitQiTrail(proj);
  };

  window.updateProjectiles = function (dt) {
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
        if (proj.visualType && typeof spawnQiVisualHitFx === "function") {
          spawnQiVisualHitFx(proj, enemy);
        } else {
          const hitFxColor = proj.kind === "qi" && proj.imgKey === "bingyun_fx_basic"
            ? "rgba(189,244,255,0.82)"
            : "rgba(255,216,77,0.9)";
          spawnExplosion(proj.x, proj.y, hitFxColor, 10);
        }
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
  };

  window.updateActionButtonLabels = function () {
    const label = document.querySelector("#btn-palm .palm-label");
    if (label) label.textContent = state.player.character.palmName || "掌";
    const gameContainer = document.getElementById("game-container");
    const accent = state.player.character.rimColor;
    const targets = [document.documentElement, gameContainer];
    for (const target of targets) {
      target.style.setProperty("--char-accent", accent);
      target.style.setProperty("--char-accent-soft", hexToRgbaValue(accent, 0.78));
      target.style.setProperty("--char-accent-strong", hexToRgbaValue(accent, 0.95));
      target.style.setProperty("--char-button-text", readableButtonText(accent));
    }
  };

  window.drawBackground = function () {
    const scene = getCurrentScene();
    const bgImg = scene.bgKey && assetImages[scene.bgKey];

    if (bgImg) {
      ctx.drawImage(bgImg, 0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      return;
    }

    const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
    skyGrad.addColorStop(0, scene.skyTop);
    skyGrad.addColorStop(0.55, scene.skyMid);
    skyGrad.addColorStop(1, scene.skyBottom);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_W, HORIZON_Y);

    drawSkyDecor(scene);
    drawMountainLayer(scene);

    const groundGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, CANVAS_H);
    groundGrad.addColorStop(0, scene.groundTop);
    groundGrad.addColorStop(1, scene.groundBottom);
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, HORIZON_Y, CANVAS_W, CANVAS_H - HORIZON_Y);

    ctx.fillStyle = "rgba(255,200,140,0.3)";
    ctx.fillRect(0, HORIZON_Y, CANVAS_W, 2);
    drawGroundDecor(scene);
  };
})();
