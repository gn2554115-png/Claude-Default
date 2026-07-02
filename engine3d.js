// ===== engine3d.js =====
// Three.js 2.5D 渲染引擎：接管全部世界渲染（場景/角色/敵人/彈道/粒子/後製），
// 遊戲邏輯仍在 game.js 的 2D 世界座標系運作，這裡把 (x, y) 映射到 3D 地平面 (x, 0, y)。
// game.js 透過 initEngine(refs) 注入 state 與設定表，之後每幀呼叫 engineRender(dt)。

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

let R = null; // 由 game.js 注入的參照集（state、各設定表、常數）

let renderer, scene, camera, composer, bloomPass, gradePass;
let W = 450, H = 800;

// 相機參數：俯角視距（大致對應原本 450x800 的可視戰場範圍）
const CAM_PITCH = (58 * Math.PI) / 180;
const CAM_DIST = 980;
const CAM_FOV = 46;

// ===== 場景 3D 配置（與 game.js SCENES 平行，以 index 對應）=====
const SCENE3D = [
  {
    // 沙漠黃昏
    skyTop: 0x35201a, skyMid: 0xc9784a, skyBottom: 0xffb066,
    fogColor: 0x8a4f2e, fogNear: 700, fogFar: 2400,
    groundA: 0x6b4a28, groundB: 0x4a3018, groundAccent: 0x8a6a3a,
    ambient: 0x7a5a48, ambientIntensity: 1.15,
    dir: 0xffb066, dirIntensity: 1.35,
    dust: 0xe6b478,
    celestial: { color: 0xffd9a0, size: 150, height: 620, dist: -1400 },
    stars: false,
    props: "rocks",
  },
  {
    // 竹林夜月
    skyTop: 0x0a1430, skyMid: 0x1c2a55, skyBottom: 0x34406a,
    fogColor: 0x14243a, fogNear: 620, fogFar: 2200,
    groundA: 0x16240f, groundB: 0x0a120a, groundAccent: 0x2c4a20,
    ambient: 0x3a5570, ambientIntensity: 1.0,
    dir: 0xbdd8ff, dirIntensity: 1.0,
    dust: 0xdcffd2,
    celestial: { color: 0xeef4ff, size: 110, height: 680, dist: -1500 },
    stars: true,
    props: "bamboo",
  },
  {
    // 古城遺跡夜景
    skyTop: 0x10101c, skyMid: 0x241f30, skyBottom: 0x463a4a,
    fogColor: 0x241d2c, fogNear: 600, fogFar: 2100,
    groundA: 0x2a2422, groundB: 0x14110f, groundAccent: 0x4a3c34,
    ambient: 0x554455, ambientIntensity: 1.05,
    dir: 0xd8b0a0, dirIntensity: 0.95,
    dust: 0xb45a5a,
    celestial: null,
    stars: true,
    props: "ruins",
  },
];

let activeSceneIdx = -1;

// ===== 工具 =====
const _colorCache = new Map();
function cssToColor(css) {
  if (_colorCache.has(css)) return _colorCache.get(css);
  let c;
  const m = /rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/.exec(css);
  if (m) c = new THREE.Color(Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255);
  else c = new THREE.Color(css);
  _colorCache.set(css, c);
  return c;
}

function makeCanvas(size) {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  return cv;
}

// 柔和光暈圓盤（白色，材質 color 上色）
function makeGlowTexture(size = 128, inner = 0.0, hard = 0.25) {
  const cv = makeCanvas(size);
  const c = cv.getContext("2d");
  const g = c.createRadialGradient(size / 2, size / 2, size * inner, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(hard, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 空心光環
function makeRingTexture(size = 256, innerR = 0.68, outerR = 0.95) {
  const cv = makeCanvas(size);
  const c = cv.getContext("2d");
  const cx = size / 2;
  const mid = ((innerR + outerR) / 2) * cx;
  const half = ((outerR - innerR) / 2) * cx;
  const g = c.createRadialGradient(cx, cx, Math.max(0, mid - half), cx, cx, mid + half);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cx, size / 2, 0, Math.PI * 2);
  c.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 敵人能量球材質貼圖（沿用 2D 版的三層放射漸層視覺語言）
function makeOrbTexture(visual, size = 128) {
  const cv = makeCanvas(size);
  const c = cv.getContext("2d");
  const cx = size / 2;
  const g = c.createRadialGradient(cx, cx, size * 0.05, cx, cx, size * 0.48);
  g.addColorStop(0, visual.core);
  g.addColorStop(0.45, visual.mid);
  g.addColorStop(0.9, visual.edge);
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cx, size * 0.48, 0, Math.PI * 2);
  c.fill();
  // 外圈光暈：限制在圓內、且最外緣淡出到透明，避免 radial gradient 越界延伸把貼圖角落填色成方塊
  c.globalCompositeOperation = "lighter";
  const glowColor = visual.glow.startsWith("#") ? visual.glow + "55" : visual.glow;
  const g2 = c.createRadialGradient(cx, cx, size * 0.28, cx, cx, size * 0.5);
  g2.addColorStop(0, "rgba(0,0,0,0)");
  g2.addColorStop(0.7, glowColor);
  g2.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g2;
  c.beginPath();
  c.arc(cx, cx, size * 0.5, 0, Math.PI * 2);
  c.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 刀氣/劍氣拖影貼圖（長條漸層，沿飛行方向拉伸）
function makeStreakTexture(coreColor, edgeColor, size = 128) {
  const cv = makeCanvas(size);
  const c = cv.getContext("2d");
  const g = c.createLinearGradient(0, size / 2, size, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.35, edgeColor);
  g.addColorStop(0.72, coreColor);
  g.addColorStop(1, "rgba(255,255,255,0.95)");
  c.fillStyle = g;
  // 梭形
  c.beginPath();
  c.moveTo(0, size / 2);
  c.quadraticCurveTo(size * 0.5, size * 0.16, size, size / 2);
  c.quadraticCurveTo(size * 0.5, size * 0.84, 0, size / 2);
  c.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 玩家 fallback 剪影（PNG 載入失敗時用；身形+腰帶+頭，沿用角色配色）
function makePlayerFallbackTexture(character, size = 128) {
  const cv = makeCanvas(size);
  const c = cv.getContext("2d");
  const cx = size / 2;
  c.fillStyle = character.bodyColor;
  c.strokeStyle = character.rimColor;
  c.lineWidth = 4;
  // 身體
  c.beginPath();
  c.ellipse(cx, size * 0.62, size * 0.2, size * 0.3, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  // 頭
  c.beginPath();
  c.arc(cx, size * 0.24, size * 0.14, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  // 腰帶
  c.fillStyle = character.beltColor;
  c.fillRect(cx - size * 0.2, size * 0.58, size * 0.4, size * 0.07);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ===== 共享幾何/材質資源 =====
const TEX = {};
const FLAT_PLANE = new THREE.PlaneGeometry(1, 1);

function flatMesh(texture, color, blending = THREE.AdditiveBlending) {
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending,
    color: color || 0xffffff,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(FLAT_PLANE, mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

function makeSprite(texture, color, additive = false) {
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    color: color || 0xffffff,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  return new THREE.Sprite(mat);
}

// ===== 世界物件 =====
let groundMesh, skyMesh, celestialSprite, starPoints;
let ambientLight, dirLight;
let propGroups = {}; // 每種 prop 一個 InstancedMesh
let propSeedCenter = { x: Infinity, z: Infinity };
const PROP_CELL = 260;
const PROP_RADIUS_CELLS = 5;

// 實體 → 3D 物件對照（mark & sweep 同步）
const enemyMap = new Map();
const projMap = new Map();
const eProjMap = new Map();
const dropMap = new Map();
const overlayMap = new Map();
const shockMap = new Map();
let playerSprite = null, playerGlow = null, playerShadow = null;
let barrierRing, frenzyRing, vampireRing, warnRingPool = [];
let orbiterSprites = [];
let particlePoints, particleGeo;
let dustPoints, dustData;

// 點光源池
const LIGHT_POOL_SIZE = 6;
const lightPool = [];

// 轉場/色調狀態
let fadeLevel = 0; // 0 = 正常, 1 = 全黑
let fadeTarget = 0;
let fadeSpeed = 1;
let tintColor = new THREE.Color(0, 0, 0);
let tintStrength = 0;
let tintTargetStrength = 0;

let camTarget = new THREE.Vector3();
let camCurrent = new THREE.Vector3();
let bootstrapped = false;

// ===== 初始化 =====
export function initEngine(refs) {
  R = refs;
  const canvas = refs.canvas;
  W = refs.CANVAS_W;
  H = refs.CANVAS_H;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(CAM_FOV, W / H, 10, 6000);

  // 燈光
  ambientLight = new THREE.AmbientLight(0xffffff, 1);
  dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(0.4, 1, 0.35);
  scene.add(ambientLight, dirLight);
  for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 420, 1.6);
    l.visible = false;
    scene.add(l);
    lightPool.push({ light: l, until: 0, duration: 1, baseIntensity: 0 });
  }

  // 貼圖
  TEX.glow = makeGlowTexture(128, 0, 0.25);
  TEX.glowHard = makeGlowTexture(128, 0.1, 0.55);
  TEX.ring = makeRingTexture(256, 0.66, 0.94);
  TEX.orbs = {};
  for (const key in R.ENEMY_VISUALS) TEX.orbs[key] = makeOrbTexture(R.ENEMY_VISUALS[key]);

  buildGround();
  buildSky();
  buildParticles();
  buildDust();
  buildPlayerRig();

  applyScene(0, true);

  // 後製（?nobloom 可停用輝光，供低階裝置/除錯用）
  const noBloom = typeof location !== "undefined" && location.search.includes("nobloom");
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (!noBloom) {
    // 1/4 解析度渲染輝光：bloom 本質是模糊，低解析度視覺差異極小、GPU 負擔大減（手機效能守則）
    bloomPass = new UnrealBloomPass(new THREE.Vector2(W / 4, H / 4), 0.75, 0.5, 0.62);
    composer.addPass(bloomPass);
  }
  gradePass = new ShaderPass(GradeShader);
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());

  bootstrapped = true;
}

// ===== 地面（程序化 shader，世界座標取樣 → 無限延伸） =====
function buildGround() {
  const geo = new THREE.PlaneGeometry(5200, 5200);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColorA: { value: new THREE.Color(0x6b4a28) },
      uColorB: { value: new THREE.Color(0x4a3018) },
      uAccent: { value: new THREE.Color(0x8a6a3a) },
      uFogColor: { value: new THREE.Color(0x8a4f2e) },
      uFogNear: { value: 700 },
      uFogFar: { value: 2400 },
      uCamPos: { value: new THREE.Vector3() },
      uStyle: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      uniform vec3 uColorA, uColorB, uAccent, uFogColor;
      uniform float uFogNear, uFogFar, uStyle;
      uniform vec3 uCamPos;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec2 p = vWorld.xz;
        float n1 = vnoise(p * 0.012);
        float n2 = vnoise(p * 0.05 + 31.7);
        float n3 = vnoise(p * 0.14 + 77.3);
        vec3 col = mix(uColorB, uColorA, n1 * 0.75 + n2 * 0.25);
        // 各場景紋理風格差異
        if (uStyle < 0.5) {
          // 沙漠：長條沙紋
          float ridges = smoothstep(0.42, 0.58, vnoise(vec2(p.x * 0.006, p.y * 0.03)));
          col = mix(col, uAccent, ridges * 0.22 * n2);
        } else if (uStyle < 1.5) {
          // 竹林：苔蘚斑塊
          float moss = smoothstep(0.55, 0.8, n2) * smoothstep(0.3, 0.7, n3);
          col = mix(col, uAccent, moss * 0.4);
        } else {
          // 遺跡：碎石板裂縫
          vec2 tile = fract(p * 0.011);
          float line = smoothstep(0.0, 0.045, tile.x) * smoothstep(0.0, 0.045, tile.y)
                     * smoothstep(0.0, 0.045, 1.0 - tile.x) * smoothstep(0.0, 0.045, 1.0 - tile.y);
          col = mix(uAccent * 0.5, col, 0.55 + 0.45 * line);
          col = mix(col, uAccent, smoothstep(0.72, 0.95, n3) * 0.18);
        }
        col *= 0.9 + 0.2 * n3;
        float d = distance(vWorld.xz, uCamPos.xz);
        float fogF = smoothstep(uFogNear, uFogFar, d);
        col = mix(col, uFogColor, fogF);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  groundMesh = new THREE.Mesh(geo, mat);
  groundMesh.rotation.x = -Math.PI / 2;
  scene.add(groundMesh);
}

// ===== 天穹（背面大球 + 漸層 shader） =====
function buildSky() {
  const geo = new THREE.SphereGeometry(4200, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x35201a) },
      uMid: { value: new THREE.Color(0xc9784a) },
      uBottom: { value: new THREE.Color(0xffb066) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      uniform vec3 uTop, uMid, uBottom;
      void main() {
        float h = clamp(vPos.y / 2600.0, -0.2, 1.0);
        vec3 col = h > 0.28 ? mix(uMid, uTop, smoothstep(0.28, 1.0, h)) : mix(uBottom, uMid, smoothstep(-0.2, 0.28, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  skyMesh = new THREE.Mesh(geo, mat);
  scene.add(skyMesh);

  celestialSprite = makeSprite(makeGlowTexture(256, 0.28, 0.5), 0xffd9a0, true);
  celestialSprite.scale.set(300, 300, 1);
  scene.add(celestialSprite);

  // 星星
  const starCount = 260;
  const pos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 2600 + Math.random() * 900;
    const y = 500 + Math.random() * 2000;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(a) * r;
  }
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  starPoints = new THREE.Points(
    sgeo,
    new THREE.PointsMaterial({ color: 0xcfd8ff, size: 7, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false })
  );
  scene.add(starPoints);
}

// ===== 場景道具（InstancedMesh，環繞玩家、雜湊定位） =====
function buildProps(styleKey) {
  for (const key in propGroups) {
    scene.remove(propGroups[key]);
    propGroups[key].geometry.dispose();
    propGroups[key].material.dispose();
  }
  propGroups = {};
  const defs = [];
  if (styleKey === "rocks") {
    defs.push({ key: "rock", geo: new THREE.DodecahedronGeometry(16, 0), color: 0x6a5138, rough: true, max: 140, chance: 0.5, yScale: [0.5, 1.1], baseY: 0 });
  } else if (styleKey === "bamboo") {
    defs.push({ key: "stalk", geo: new THREE.CylinderGeometry(4.5, 5.5, 170, 6), color: 0x3f6a3a, max: 200, chance: 0.85, yScale: [0.75, 1.25], baseY: 85 });
    defs.push({ key: "rock", geo: new THREE.DodecahedronGeometry(12, 0), color: 0x2e3f2a, max: 80, chance: 0.25, yScale: [0.5, 1], baseY: 0 });
  } else {
    defs.push({ key: "pillar", geo: new THREE.CylinderGeometry(13, 15, 130, 8), color: 0x5a4a44, max: 110, chance: 0.42, yScale: [0.45, 1.15], baseY: 55 });
    defs.push({ key: "block", geo: new THREE.BoxGeometry(26, 18, 26), color: 0x4a3c38, max: 90, chance: 0.35, yScale: [0.6, 1.3], baseY: 8 });
  }
  for (const d of defs) {
    const mat = new THREE.MeshLambertMaterial({ color: d.color });
    const inst = new THREE.InstancedMesh(d.geo, mat, d.max);
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inst.userData.def = d;
    scene.add(inst);
    propGroups[d.key] = inst;
  }
  propSeedCenter = { x: Infinity, z: Infinity };
}

function hash2(x, z, salt) {
  let h = Math.sin(x * 127.1 + z * 311.7 + salt * 74.3) * 43758.5453;
  return h - Math.floor(h);
}

function reseedProps(px, pz) {
  if (Math.abs(px - propSeedCenter.x) < PROP_CELL && Math.abs(pz - propSeedCenter.z) < PROP_CELL) return;
  propSeedCenter = { x: px, z: pz };
  const cellX = Math.floor(px / PROP_CELL);
  const cellZ = Math.floor(pz / PROP_CELL);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const key in propGroups) {
    const inst = propGroups[key];
    const d = inst.userData.def;
    let count = 0;
    for (let gx = cellX - PROP_RADIUS_CELLS; gx <= cellX + PROP_RADIUS_CELLS && count < d.max; gx++) {
      for (let gz = cellZ - PROP_RADIUS_CELLS; gz <= cellZ + PROP_RADIUS_CELLS && count < d.max; gz++) {
        const h1 = hash2(gx, gz, key === "stalk" ? 1 : key === "rock" ? 2 : key === "pillar" ? 3 : 4);
        if (h1 > d.chance) continue;
        const h2v = hash2(gx, gz, 11);
        const h3 = hash2(gx, gz, 23);
        const h4 = hash2(gx, gz, 37);
        const x = (gx + 0.15 + h2v * 0.7) * PROP_CELL;
        const z = (gz + 0.15 + h3 * 0.7) * PROP_CELL;
        // 避開玩家出生點正中央
        const s = d.yScale[0] + h4 * (d.yScale[1] - d.yScale[0]);
        q.setFromAxisAngle(up, h2v * Math.PI * 2);
        m.compose(new THREE.Vector3(x, d.baseY * s, z), q, new THREE.Vector3(1 + h3 * 0.5, s, 1 + h2v * 0.5));
        inst.setMatrixAt(count++, m);
      }
    }
    inst.count = count;
    inst.instanceMatrix.needsUpdate = true;
  }
}

// ===== 粒子（同步 game.js 的 state.particles，加色混合 GPU 點雲） =====
const PARTICLE_MAX = 512;
function buildParticles() {
  particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PARTICLE_MAX * 3), 3));
  particleGeo.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(PARTICLE_MAX * 3), 3));
  particleGeo.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(PARTICLE_MAX), 1));
  particleGeo.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(PARTICLE_MAX), 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: H } },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize, aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uScale;
      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (uScale * 1.35) / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.06, length(d)) * vAlpha;
        gl_FragColor = vec4(vColor, a);
      }
    `,
  });
  particlePoints = new THREE.Points(particleGeo, mat);
  particlePoints.frustumCulled = false;
  scene.add(particlePoints);
}

function syncParticles() {
  const parts = R.state.particles;
  const pos = particleGeo.attributes.position.array;
  const col = particleGeo.attributes.aColor.array;
  const sizeA = particleGeo.attributes.aSize.array;
  const alphaA = particleGeo.attributes.aAlpha.array;
  const n = Math.min(parts.length, PARTICLE_MAX);
  for (let i = 0; i < n; i++) {
    const pt = parts[i];
    pos[i * 3] = pt.x;
    pos[i * 3 + 1] = 10 + (pt.glow ? 6 : 0);
    pos[i * 3 + 2] = pt.y;
    const c = cssToColor(pt.color);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    sizeA[i] = (pt.size || 2) * (pt.glow ? 2.6 : 1.9);
    alphaA[i] = Math.max(0, pt.life / pt.maxLife);
  }
  particleGeo.setDrawRange(0, n);
  particleGeo.attributes.position.needsUpdate = true;
  particleGeo.attributes.aColor.needsUpdate = true;
  particleGeo.attributes.aSize.needsUpdate = true;
  particleGeo.attributes.aAlpha.needsUpdate = true;
}

// ===== 環境飄塵 =====
const DUST_MAX = 130;
function buildDust() {
  dustData = [];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(DUST_MAX * 3), 3));
  for (let i = 0; i < DUST_MAX; i++) {
    dustData.push({
      ox: (Math.random() - 0.5) * 1400,
      oz: (Math.random() - 0.5) * 1600,
      y: 8 + Math.random() * 150,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.8,
    });
  }
  dustPoints = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xe6b478, size: 5, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  dustPoints.frustumCulled = false;
  scene.add(dustPoints);
}

function syncDust(dt, px, pz) {
  const pos = dustPoints.geometry.attributes.position.array;
  const t = performance.now() / 1000;
  for (let i = 0; i < DUST_MAX; i++) {
    const d = dustData[i];
    pos[i * 3] = px + d.ox + Math.sin(t * d.speed + d.phase) * 40;
    pos[i * 3 + 1] = d.y + Math.sin(t * d.speed * 0.7 + d.phase * 2) * 18;
    pos[i * 3 + 2] = pz + d.oz + Math.cos(t * d.speed * 0.6 + d.phase) * 40;
  }
  dustPoints.geometry.attributes.position.needsUpdate = true;
}

// ===== 玩家 rig =====
function buildPlayerRig() {
  playerShadow = flatMesh(TEX.glow, 0x000000, THREE.NormalBlending);
  playerShadow.material.opacity = 0.42;
  playerShadow.scale.set(56, 34, 1);
  playerShadow.position.y = 0.5;
  scene.add(playerShadow);

  playerGlow = flatMesh(TEX.glow, 0x3ad6ff);
  playerGlow.material.opacity = 0.22;
  playerGlow.scale.set(70, 52, 1);
  playerGlow.position.y = 1;
  scene.add(playerGlow);

  playerSprite = makeSprite(TEX.glow, 0xffffff);
  playerSprite.center.set(0.5, 0.08);
  scene.add(playerSprite);

  barrierRing = flatMesh(TEX.ring, 0xffd84d);
  barrierRing.position.y = 2;
  barrierRing.visible = false;
  scene.add(barrierRing);

  frenzyRing = flatMesh(TEX.ring, 0xc060ff);
  frenzyRing.position.y = 2.4;
  frenzyRing.visible = false;
  scene.add(frenzyRing);

  vampireRing = flatMesh(TEX.ring, 0x3fe080);
  vampireRing.position.y = 2.8;
  vampireRing.visible = false;
  scene.add(vampireRing);
}

let playerTexKey = null;
function updatePlayerVisual(dt) {
  const p = R.state.player;
  if (!p) return;
  const ch = p.character || R.CHARACTERS[0];

  // 貼圖：等 PNG 非同步載入完成後套用，失敗則程序化 fallback
  const wantKey = ch.spriteKey;
  const img = R.assetImages[wantKey];
  if (playerTexKey !== wantKey + (img ? "_img" : "_fb")) {
    let tex;
    if (img) {
      tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      tex.colorSpace = THREE.SRGBColorSpace;
    } else {
      tex = makePlayerFallbackTexture(ch);
    }
    playerSprite.material.map = tex;
    playerSprite.material.needsUpdate = true;
    playerTexKey = wantKey + (img ? "_img" : "_fb");
    const aspect = img ? img.width / img.height : 1;
    const hgt = 86;
    playerSprite.scale.set(hgt * aspect, hgt, 1);
  }

  p.animTime = (p.animTime || 0) + dt;
  const bobAmp = p.moving ? 4 : 1.8;
  const bob = Math.abs(Math.sin(p.animTime * (p.moving ? 9 : 3))) * bobAmp;

  const faceLeft = ch.spriteFacesLeft ? p.facing > 0 : p.facing < 0;
  playerSprite.scale.x = Math.abs(playerSprite.scale.x) * (faceLeft ? -1 : 1);

  playerSprite.position.set(p.x, bob, p.y);
  playerShadow.position.set(p.x, 0.5, p.y);
  playerGlow.position.set(p.x, 1, p.y);
  playerGlow.material.color = cssToColor(ch.rimColor);
  const hurtNow = performance.now() < p.hurtUntil;
  playerSprite.material.color.setRGB(1, hurtNow ? 0.45 : 1, hurtNow ? 0.45 : 1);

  // 狀態環
  const now = performance.now();
  if (p.barrierCharge) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 220);
    barrierRing.visible = true;
    const r = (p.radius + 12 + pulse * 4) * 2.4;
    barrierRing.scale.set(r, r, 1);
    barrierRing.material.opacity = 0.5 + 0.3 * pulse;
    barrierRing.position.set(p.x, 2, p.y);
  } else barrierRing.visible = false;

  if (R.getEnrageMult(p) > 1) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 110);
    frenzyRing.visible = true;
    const r = (p.radius + 8 + pulse * 6) * 2.4;
    frenzyRing.scale.set(r, r, 1);
    frenzyRing.material.opacity = 0.45 + 0.3 * pulse;
    frenzyRing.position.set(p.x, 2.4, p.y);
  } else frenzyRing.visible = false;

  if (now < p.vampireFxUntil) {
    const t = Math.max(0, (p.vampireFxUntil - now) / R.VAMPIRE_FX_DURATION);
    vampireRing.visible = true;
    const r = (p.radius + 18 * (1 - t)) * 2.6;
    vampireRing.scale.set(r, r, 1);
    vampireRing.material.opacity = t * 0.7;
    vampireRing.position.set(p.x, 2.8, p.y);
  } else vampireRing.visible = false;
}

// ===== 敵人同步 =====
function acquireWarnRing() {
  for (const r of warnRingPool) if (!r.visible) return r;
  const r = flatMesh(TEX.ring, 0xff4040);
  r.position.y = 1.6;
  scene.add(r);
  warnRingPool.push(r);
  return r;
}

function syncEnemies() {
  const now = performance.now();
  for (const r of warnRingPool) r.visible = false;
  for (const e of R.state.enemies) {
    let rig = enemyMap.get(e);
    if (!rig) {
      const tex = TEX.orbs[e.baseType] || TEX.orbs.drifter;
      const sp = makeSprite(e.type === "boss" ? TEX.orbs.boss || tex : tex, 0xffffff);
      const shadow = flatMesh(TEX.glow, 0x000000, THREE.NormalBlending);
      shadow.material.opacity = 0.35;
      shadow.position.y = 0.4;
      scene.add(sp, shadow);
      rig = { sp, shadow };
      enemyMap.set(e, rig);
    }
    const d = e.radius * 2.9;
    rig.sp.scale.set(d, d, 1);
    const hover = 4 + Math.sin(now / 300 + (e.zigzagPhase || 0)) * 3;
    rig.sp.position.set(e.x, e.radius * 0.9 + hover, e.y);
    rig.shadow.scale.set(e.radius * 2.2, e.radius * 1.4, 1);
    rig.shadow.position.set(e.x, 0.4, e.y);
    const hurt = now < e.hurtUntil;
    if (hurt) rig.sp.material.color.setRGB(2.2, 2.2, 2.2);
    else if (e.eliteType) rig.sp.material.color.copy(cssToColor(ELITE_COLORS[e.eliteType] || "#ffffff")).multiplyScalar(1.35);
    else if (e.isBrute) rig.sp.material.color.setRGB(1.35, 1.05, 1.05);
    else rig.sp.material.color.setRGB(1, 1, 1);

    if (e.ambushWarning) {
      const r = acquireWarnRing();
      r.visible = true;
      const pulse = 0.5 + 0.5 * Math.sin(now / 90);
      const s = e.radius * 3.4 * (0.85 + pulse * 0.3);
      r.scale.set(s, s, 1);
      r.material.opacity = 0.5 + pulse * 0.4;
      r.position.set(e.x, 1.6, e.y);
    }
  }
  for (const [e, rig] of enemyMap) {
    if (!R.state.enemies.includes(e)) {
      scene.remove(rig.sp, rig.shadow);
      rig.sp.material.dispose();
      rig.shadow.material.dispose();
      enemyMap.delete(e);
    }
  }
}

const ELITE_COLORS = { swift: "#5ab0ff", split: "#5aff8a", blast: "#ffa040" };

// ===== 彈道同步（平貼地面的發光梭形，朝速度方向） =====
const streakTexCache = new Map();
function getStreakTex(core, edge) {
  const key = core + "|" + edge;
  if (!streakTexCache.has(key)) streakTexCache.set(key, makeStreakTexture(core, edge));
  return streakTexCache.get(key);
}

function syncProjectiles() {
  for (const proj of R.state.projectiles) {
    let mesh = projMap.get(proj);
    if (!mesh) {
      let tex;
      if (proj.visualType) {
        tex = getStreakTex(proj.coreColor || "#ffffff", proj.color || "#ffd84d");
      } else {
        tex = TEX.glowHard;
      }
      mesh = flatMesh(tex, proj.color ? cssToColor(proj.color) : 0xffd84d);
      mesh.position.y = 12;
      scene.add(mesh);
      projMap.set(proj, mesh);
    }
    const len = proj.length || proj.radius * 5;
    const wid = proj.width || proj.radius * 3.2;
    mesh.scale.set(len, wid, 1);
    mesh.position.set(proj.x, 12, proj.y);
    mesh.rotation.z = -Math.atan2(proj.vy, proj.vx);
  }
  for (const [proj, mesh] of projMap) {
    if (!R.state.projectiles.includes(proj)) {
      scene.remove(mesh);
      mesh.material.dispose();
      projMap.delete(proj);
    }
  }
}

function syncEnemyProjectiles() {
  for (const proj of R.state.enemyProjectiles) {
    let sp = eProjMap.get(proj);
    if (!sp) {
      sp = makeSprite(TEX.glowHard, 0xff5a4a, true);
      sp.scale.set(22, 22, 1);
      scene.add(sp);
      eProjMap.set(proj, sp);
    }
    sp.position.set(proj.x, 14, proj.y);
  }
  for (const [proj, sp] of eProjMap) {
    if (!R.state.enemyProjectiles.includes(proj)) {
      scene.remove(sp);
      sp.material.dispose();
      eProjMap.delete(proj);
    }
  }
}

// ===== 掉落物 =====
function syncDrops() {
  for (const drop of R.state.drops) {
    let sp = dropMap.get(drop);
    if (!sp) {
      sp = makeSprite(TEX.glowHard, 0xffd84d, true);
      sp.scale.set(16, 16, 1);
      scene.add(sp);
      dropMap.set(drop, sp);
    }
    sp.position.set(drop.x, 10 + Math.sin(drop.bobPhase) * 4, drop.y);
  }
  for (const [drop, sp] of dropMap) {
    if (!R.state.drops.includes(drop)) {
      scene.remove(sp);
      sp.material.dispose();
      dropMap.delete(drop);
    }
  }
}

// ===== Boss 寶箱（金色光柱＋脈動光環） =====
const chestMap = new Map();
function syncChests() {
  const now = performance.now();
  for (const chest of R.state.chests || []) {
    let rig = chestMap.get(chest);
    if (!rig) {
      const glow = makeSprite(TEX.glowHard, 0xffd84d, true);
      glow.scale.set(46, 46, 1);
      const ring = flatMesh(TEX.ring, 0xffd84d);
      ring.position.y = 2;
      const beam = makeSprite(TEX.glow, 0xfff2b0, true);
      beam.scale.set(20, 150, 1);
      beam.center.set(0.5, 0.1);
      scene.add(glow, ring, beam);
      rig = { glow, ring, beam };
      chestMap.set(chest, rig);
    }
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    rig.glow.position.set(chest.x, 16 + Math.sin(chest.bobPhase) * 5, chest.y);
    rig.beam.position.set(chest.x, 4, chest.y);
    rig.beam.material.opacity = 0.4 + pulse * 0.3;
    const rs = 70 + pulse * 22;
    rig.ring.scale.set(rs, rs, 1);
    rig.ring.material.opacity = 0.5 + pulse * 0.4;
    rig.ring.position.set(chest.x, 2, chest.y);
  }
  for (const [chest, rig] of chestMap) {
    if (!(R.state.chests || []).includes(chest)) {
      scene.remove(rig.glow, rig.ring, rig.beam);
      chestMap.delete(chest);
    }
  }
}

// ===== 魅影分身漩渦刃（夜玄掌技） =====
const spiralMap = new Map();
function syncSpirals() {
  for (const s of R.state.spirals || []) {
    let sp = spiralMap.get(s);
    if (!sp) {
      sp = makeSprite(TEX.glowHard, 0xc060ff, true);
      sp.scale.set(34, 34, 1);
      scene.add(sp);
      spiralMap.set(s, sp);
    }
    sp.position.set(s.x, 16, s.y);
    sp.material.opacity = Math.max(0.2, s.life / s.maxLife);
  }
  for (const [s, sp] of spiralMap) {
    if (!(R.state.spirals || []).includes(s)) {
      scene.remove(sp);
      sp.material.dispose();
      spiralMap.delete(s);
    }
  }
}

// ===== 環身罡氣刀刃 =====
function syncOrbiters() {
  const blades = R.state.orbiters;
  while (orbiterSprites.length < blades.length) {
    const sp = makeSprite(TEX.glowHard, 0xffd84d, true);
    sp.scale.set(30, 30, 1);
    scene.add(sp);
    orbiterSprites.push(sp);
  }
  for (let i = 0; i < orbiterSprites.length; i++) {
    const sp = orbiterSprites[i];
    if (i < blades.length) {
      sp.visible = true;
      sp.position.set(blades[i].x, 16, blades[i].y);
    } else sp.visible = false;
  }
}

// ===== 震波環 =====
function syncShockwaves() {
  for (const s of R.state.shockwaves) {
    let mesh = shockMap.get(s);
    if (!mesh) {
      mesh = flatMesh(TEX.ring, cssToColor(s.color || "#3ad6ff"));
      mesh.position.y = 3;
      scene.add(mesh);
      shockMap.set(s, mesh);
    }
    const d = s.radius * 2.15;
    mesh.scale.set(d, d, 1);
    mesh.material.opacity = Math.max(0, s.life / s.maxLife) * 0.9;
    mesh.position.set(s.x, 3, s.y);
  }
  for (const [s, mesh] of shockMap) {
    if (!R.state.shockwaves.includes(s)) {
      scene.remove(mesh);
      mesh.material.dispose();
      shockMap.delete(s);
    }
  }
}

// ===== 美術特效疊層（fx PNG，平貼地面加色） =====
const overlayTexCache = new Map();
function syncFxOverlays() {
  for (const o of R.state.fxOverlays) {
    let mesh = overlayMap.get(o);
    const img = R.assetImages[o.imgKey];
    if (!mesh) {
      let tex = null;
      if (img) {
        if (!overlayTexCache.has(o.imgKey)) {
          const t = new THREE.Texture(img);
          t.needsUpdate = true;
          t.colorSpace = THREE.SRGBColorSpace;
          overlayTexCache.set(o.imgKey, t);
        }
        tex = overlayTexCache.get(o.imgKey);
      } else {
        tex = TEX.glow;
      }
      mesh = flatMesh(tex, 0xffffff);
      mesh.position.y = 6;
      scene.add(mesh);
      overlayMap.set(o, mesh);
    }
    const t = Math.min(1, o.elapsed / o.duration);
    const scale = (o.fromScale + (o.toScale - o.fromScale) * t) * (img ? img.width : 220);
    mesh.scale.set(scale, scale, 1);
    mesh.material.opacity = Math.sin(t * Math.PI);
    mesh.rotation.z = o.rotateDeg ? ((t - 0.5) * 2 * o.rotateDeg * Math.PI) / 180 : 0;
    mesh.position.set(o.x, 6, o.y);
  }
  for (const [o, mesh] of overlayMap) {
    if (!R.state.fxOverlays.includes(o)) {
      scene.remove(mesh);
      mesh.material.dispose();
      overlayMap.delete(o);
    }
  }
}

// ===== 點光源池 =====
export function fxLight(x, y, cssColor, intensity = 2.4, durationMs = 320, range = 420) {
  let slot = null;
  const now = performance.now();
  for (const s of lightPool) {
    if (now >= s.until) { slot = s; break; }
  }
  if (!slot) slot = lightPool[0];
  slot.light.color.copy(cssToColor(cssColor));
  slot.light.position.set(x, 60, y);
  slot.light.distance = range;
  slot.baseIntensity = intensity;
  slot.duration = durationMs;
  slot.until = now + durationMs;
  slot.light.visible = true;
}

function updateLights() {
  const now = performance.now();
  for (const s of lightPool) {
    if (now >= s.until) {
      s.light.visible = false;
      s.light.intensity = 0;
      continue;
    }
    const t = (s.until - now) / s.duration;
    s.light.intensity = s.baseIntensity * t * 3200;
  }
}

// ===== 場景切換與色調 =====
export function applyScene(idx, instant = false) {
  if (!renderer) return; // initEngine 之前的呼叫直接忽略
  const cfgIdx = Math.max(0, Math.min(SCENE3D.length - 1, idx));
  if (cfgIdx === activeSceneIdx && !instant) return;
  activeSceneIdx = cfgIdx;
  const cfg = SCENE3D[cfgIdx];

  skyMesh.material.uniforms.uTop.value.setHex(cfg.skyTop);
  skyMesh.material.uniforms.uMid.value.setHex(cfg.skyMid);
  skyMesh.material.uniforms.uBottom.value.setHex(cfg.skyBottom);

  const gu = groundMesh.material.uniforms;
  gu.uColorA.value.setHex(cfg.groundA);
  gu.uColorB.value.setHex(cfg.groundB);
  gu.uAccent.value.setHex(cfg.groundAccent);
  gu.uFogColor.value.setHex(cfg.fogColor);
  gu.uFogNear.value = cfg.fogNear;
  gu.uFogFar.value = cfg.fogFar;
  gu.uStyle.value = cfgIdx;

  scene.fog = new THREE.Fog(cfg.fogColor, cfg.fogNear, cfg.fogFar);

  ambientLight.color.setHex(cfg.ambient);
  ambientLight.intensity = cfg.ambientIntensity;
  dirLight.color.setHex(cfg.dir);
  dirLight.intensity = cfg.dirIntensity;

  dustPoints.material.color.setHex(cfg.dust);

  if (cfg.celestial) {
    celestialSprite.visible = true;
    celestialSprite.material.color.setHex(cfg.celestial.color);
    celestialSprite.scale.set(cfg.celestial.size * 2.6, cfg.celestial.size * 2.6, 1);
    celestialSprite.userData.cfg = cfg.celestial;
  } else {
    celestialSprite.visible = false;
  }
  starPoints.visible = cfg.stars;

  buildProps(cfg.props);
}

// 轉場：2 秒漸黑→切場景→漸亮，由 game.js 呼叫，onSwitch 在全黑點執行
let pendingSwitch = null;
export function sceneTransition(newIdx, onSwitch) {
  fadeTarget = 1;
  fadeSpeed = 1 / 0.8; // 0.8 秒漸黑
  pendingSwitch = { idx: newIdx, cb: onSwitch };
}

export function setBossTint(active) {
  tintColor.setRGB(0.5, 0.02, 0.05);
  tintTargetStrength = active ? 0.22 : 0;
}

export function flashTint(r, g, b, strength) {
  tintColor.setRGB(r, g, b);
  tintStrength = strength;
  tintTargetStrength = 0;
}

// ===== 後製 Shader（vignette + 色調 + 轉場黑幕） =====
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.55 },
    uTint: { value: new THREE.Color(0, 0, 0) },
    uTintStrength: { value: 0 },
    uFade: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uVignette, uTintStrength, uFade;
    uniform vec3 uTint;
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      col.rgb *= 1.0 - uVignette * smoothstep(0.42, 0.86, d);
      col.rgb = mix(col.rgb, col.rgb * 0.55 + uTint, uTintStrength);
      col.rgb *= 1.0 - uFade;
      gl_FragColor = col;
    }
  `,
};

// ===== 座標投影（給 2D 文字疊層用） =====
const _projV = new THREE.Vector3();
export function worldToScreen(x, y, height = 30) {
  _projV.set(x, height, y).project(camera);
  return {
    x: (_projV.x * 0.5 + 0.5) * W,
    y: (-_projV.y * 0.5 + 0.5) * H,
    visible: _projV.z < 1,
  };
}

// ===== 主渲染 =====
export function engineRender(dt) {
  if (!bootstrapped) return;
  const st = R.state;
  const p = st.player;
  if (!p) return;

  // 相機跟隨 + 震動
  camTarget.set(p.x, 0, p.y);
  if (camCurrent.lengthSq() === 0) camCurrent.copy(camTarget);
  camCurrent.lerp(camTarget, Math.min(1, dt * 7));
  let shakeX = 0, shakeZ = 0;
  if (st.shake.time > 0) {
    const s = (st.shake.time / st.shake.duration) * st.shake.magnitude;
    shakeX = (Math.random() - 0.5) * 2 * s;
    shakeZ = (Math.random() - 0.5) * 2 * s;
  }
  camera.position.set(
    camCurrent.x + shakeX,
    Math.sin(CAM_PITCH) * CAM_DIST,
    camCurrent.z + Math.cos(CAM_PITCH) * CAM_DIST + shakeZ
  );
  camera.lookAt(camCurrent.x + shakeX, 0, camCurrent.z + shakeZ);

  // 世界跟隨
  groundMesh.position.set(camCurrent.x, 0, camCurrent.z);
  groundMesh.material.uniforms.uCamPos.value.copy(camera.position);
  skyMesh.position.set(camCurrent.x, 0, camCurrent.z);
  starPoints.position.set(camCurrent.x, 0, camCurrent.z);
  if (celestialSprite.visible && celestialSprite.userData.cfg) {
    const c = celestialSprite.userData.cfg;
    celestialSprite.position.set(camCurrent.x + 500, c.height, camCurrent.z + c.dist);
  }
  reseedProps(camCurrent.x, camCurrent.z);

  // 實體同步
  updatePlayerVisual(dt);
  syncEnemies();
  syncProjectiles();
  syncEnemyProjectiles();
  syncDrops();
  syncChests();
  syncSpirals();
  syncOrbiters();
  syncShockwaves();
  syncFxOverlays();
  syncParticles();
  syncDust(dt, camCurrent.x, camCurrent.z);
  updateLights();

  // 轉場
  if (fadeTarget > fadeLevel) {
    fadeLevel = Math.min(fadeTarget, fadeLevel + fadeSpeed * dt);
    if (fadeLevel >= 1 && pendingSwitch) {
      applyScene(pendingSwitch.idx, true);
      if (pendingSwitch.cb) pendingSwitch.cb();
      pendingSwitch = null;
      fadeTarget = 0;
      fadeSpeed = 1 / 1.1; // 1.1 秒漸亮
    }
  } else if (fadeTarget < fadeLevel) {
    fadeLevel = Math.max(fadeTarget, fadeLevel - fadeSpeed * dt);
  }

  // 色調
  if (tintStrength > tintTargetStrength) tintStrength = Math.max(tintTargetStrength, tintStrength - dt * 0.8);
  else if (tintStrength < tintTargetStrength) tintStrength = Math.min(tintTargetStrength, tintStrength + dt * 1.6);

  gradePass.uniforms.uFade.value = fadeLevel;
  gradePass.uniforms.uTint.value.copy(tintColor);
  gradePass.uniforms.uTintStrength.value = tintStrength;

  composer.render();
}

// 遊戲重開時清空所有實體對照（避免殘留上一局的 3D 物件）
export function engineReset() {
  if (!renderer) return; // initEngine 之前的呼叫直接忽略
  for (const [, rig] of enemyMap) scene.remove(rig.sp, rig.shadow);
  enemyMap.clear();
  for (const [, m] of projMap) scene.remove(m);
  projMap.clear();
  for (const [, m] of eProjMap) scene.remove(m);
  eProjMap.clear();
  for (const [, m] of dropMap) scene.remove(m);
  dropMap.clear();
  for (const [, m] of overlayMap) scene.remove(m);
  overlayMap.clear();
  for (const [, m] of shockMap) scene.remove(m);
  shockMap.clear();
  for (const [, rig] of chestMap) scene.remove(rig.glow, rig.ring, rig.beam);
  chestMap.clear();
  for (const [, sp] of spiralMap) scene.remove(sp);
  spiralMap.clear();
  for (const sp of orbiterSprites) sp.visible = false;
  camCurrent.set(0, 0, 0);
  playerTexKey = null;
  fadeLevel = 0;
  fadeTarget = 0;
  tintStrength = 0;
  tintTargetStrength = 0;
  pendingSwitch = null;
}
