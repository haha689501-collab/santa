/*
 * 산타 마을 — 눈 내리는 밝은 크리스마스 광장 (미리보기)
 * ------------------------------------------------------------------
 *  쉼터(../healing-space)와 같은 방식: three.js 하나만 불러오고
 *  눈 · 트리 · 집 · 캐릭터 · 소리를 전부 코드로 만듭니다 (외부 파일 0개).
 *  아직 쉼터와 연결하지 않은 혼자 모드 미리보기입니다.
 */
(async () => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  let THREE;
  try {
    THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
  } catch (e) {
    $('#enter').textContent = '3D 엔진을 불러오지 못했어요 (인터넷 연결 확인)';
    return;
  }

  // ------------------------------------------------------------------
  // 유틸
  // ------------------------------------------------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = seeded(20261225);
  function hash2(x, y) {
    let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ 0x9e3779b9;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  const wrap = (v, p) => (p ? ((v % p) + p) % p : v);
  function noise2(x, y, px = 0, py = 0) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const h = (a, b) => hash2(wrap(a, px), wrap(b, py));
    return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
  }
  function fbm(x, y, oct = 4, px = 0, py = 0) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f, px * f, py * f); n += a; a *= 0.5; f *= 2; }
    return s / n;
  }
  function toast(msg, ms = 2800) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // 내 이름
  const ADJ = ['포근한', '반짝이는', '따끈한', '설레는', '폭신한', '달콤한', '방울방울', '소복소복'];
  const NOUN = ['눈사람', '루돌프', '진저쿠키', '눈송이', '양말', '종소리', '썰매', '펭귄'];
  let myName = localStorage.getItem('santa.name') || `${pick(ADJ)} ${pick(NOUN)}`;
  localStorage.setItem('santa.name', myName);
  $('#myname').textContent = myName;

  // 크리스마스까지 며칠
  (() => {
    const now = new Date();
    let xmas = new Date(now.getFullYear(), 11, 25);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (today > xmas) xmas = new Date(now.getFullYear() + 1, 11, 25);
    const d = Math.round((xmas - today) / 86400000);
    $('#dday').textContent = d === 0 ? '🎄 오늘은 크리스마스!' : `🎄 크리스마스까지 D-${d}`;
  })();

  // ------------------------------------------------------------------
  // 렌더러 · 장면
  // ------------------------------------------------------------------
  const LOW = (navigator.hardwareConcurrency || 8) <= 4 || /Android|iPhone|iPad/i.test(navigator.userAgent);
  const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' });
  const DPR = Math.min(devicePixelRatio || 1, LOW ? 1.5 : 2);
  renderer.setPixelRatio(DPR);
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('#app').append(renderer.domElement);

  const scene = new THREE.Scene();
  const SKY = { top: '#3f8fe0', mid: '#93c8f6', bottom: '#eaf4ff', fog: '#e4f0fb' };
  scene.fog = new THREE.Fog(SKY.fog, 50, 190);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 700);

  const matCache = new Map();
  function mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts }));
    return matCache.get(key);
  }
  function mesh(geo, material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  function canvasTex(size, draw, repeat = 1, srgb = true) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    draw(g, size);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 4;
    return t;
  }
  const radialTex = (inner = 0) => canvasTex(128, (g, S) => {
    const gr = g.createRadialGradient(S / 2, S / 2, S * 0.5 * inner, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  });
  const softTex = radialTex(0);
  softTex.wrapS = softTex.wrapT = THREE.ClampToEdgeWrapping;

  // ------------------------------------------------------------------
  // 하늘 — 맑은 겨울 낮 (위는 파랗고 지평선은 하얗게, 해 주변은 따뜻하게)
  // ------------------------------------------------------------------
  const sunDir = new THREE.Vector3(0.45, 0.62, -0.64).normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(SKY.top) }, mid: { value: new THREE.Color(SKY.mid) },
      bottom: { value: new THREE.Color(SKY.bottom) }, sunDir: { value: sunDir },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = mix(mid, top, smoothstep(0.08, 0.75, h));
        c = mix(bottom, c, smoothstep(-0.02, 0.22, h));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += vec3(1.0, 0.92, 0.78) * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat);
  scene.add(sky);

  // 몽실몽실 구름 — 부드러운 스프라이트 몇 장
  const cloudTex = canvasTex(256, (g, S) => {
    for (let i = 0; i < 14; i++) {
      const x = S * (0.2 + 0.6 * (i / 13)) + (Math.sin(i * 7.1) * S * 0.05);
      const y = S * 0.55 - Math.sin((i / 13) * Math.PI) * S * 0.16 + Math.cos(i * 3.3) * S * 0.04;
      const r = S * (0.1 + 0.08 * Math.sin((i / 13) * Math.PI));
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,.95)');
      gr.addColorStop(0.6, 'rgba(255,255,255,.6)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  });
  cloudTex.wrapS = cloudTex.wrapT = THREE.ClampToEdgeWrapping;
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    const a = rnd() * Math.PI * 2, r = 260 + rnd() * 80;
    s.position.set(Math.cos(a) * r, 70 + rnd() * 60, Math.sin(a) * r);
    s.scale.set(140 + rnd() * 80, 50 + rnd() * 20, 1);
    s.userData.a = a; s.userData.r = r;
    scene.add(s);
    clouds.push(s);
  }

  // 반사용 환경 — 하늘을 한 번 찍어 둡니다 (오너먼트 · 얼음이 하늘을 비춥니다)
  {
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: '#f2f6fb', side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.5;
    envScene.add(floor);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0.03).texture;
    pm.dispose();
  }

  // 빛 — 밝은 하늘빛 + 따뜻한 겨울 햇살
  const hemi = new THREE.HemisphereLight('#d6e9ff', '#f7f3ec', 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1dc', 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
  const SC = 34;
  Object.assign(sun.shadow.camera, { left: -SC, right: SC, top: SC, bottom: -SC, near: 1, far: 160 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // ------------------------------------------------------------------
  // 질감 — 눈 · 돌길 · 나무 · 줄무늬
  // ------------------------------------------------------------------
  const snowTex = canvasTex(256, (g, S) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = fbm(x / 32, y / 32, 4, 8, 8);
      const v = 228 + n * 27;
      const i = (y * S + x) * 4;
      img.data[i] = v - 6; img.data[i + 1] = v - 2; img.data[i + 2] = 255; img.data[i + 3] = 255;
      if (hash2(x * 7 + 3, y * 13 + 1) > 0.9965) { img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; }
    }
    g.putImageData(img, 0, 0);
  }, 70);
  const snowNormal = canvasTex(256, (g, S) => {
    const img = g.createImageData(S, S);
    const H = (x, y) => fbm(x / 22, y / 22, 4, S / 22, S / 22);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 3.2, dy = (H(x, y + 1) - H(x, y - 1)) * 3.2;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, 70, false);

  // 눈을 치운 돌길 — 둥근 돌 사이에 눈이 끼어 있게
  const cobbleTex = canvasTex(256, (g, S) => {
    g.fillStyle = '#f3f6fa';
    g.fillRect(0, 0, S, S);
    const n = 8, cs = S / n;
    const cols = ['#c9bba8', '#bfb09c', '#d3c6b3', '#b8a994', '#cdbfa9'];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const off = (j % 2) * cs / 2;
      const x = i * cs + off + 3, y = j * cs + 3, w = cs - 6, h = cs - 6;
      g.fillStyle = cols[Math.floor(hash2(i, j) * cols.length)];
      g.beginPath();
      g.roundRect ? g.roundRect(x, y, w, h, 9) : g.rect(x, y, w, h);
      g.fill();
      if (x + w > S) { g.beginPath(); g.roundRect ? g.roundRect(x - S, y, w, h, 9) : g.rect(x - S, y, w, h); g.fill(); }
      // 돌 위에 남은 눈가루
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.beginPath(); g.ellipse(x + w * 0.35, y + h * 0.3, w * 0.22, h * 0.12, 0.3, 0, Math.PI * 2); g.fill();
    }
  });
  const woodTex = canvasTex(128, (g, S) => {
    for (let y = 0; y < S; y++) {
      const plank = Math.floor(y / 16);
      const base = 0.85 + hash2(plank, 3) * 0.15;
      for (let x = 0; x < S; x++) {
        const n = noise2(x / 18, y / 3 + plank * 10) * 0.18;
        const v = base - n - (y % 16 === 0 ? 0.25 : 0);
        g.fillStyle = `rgb(${Math.floor(176 * v)},${Math.floor(124 * v)},${Math.floor(82 * v)})`;
        g.fillRect(x, y, 1, 1);
      }
    }
  });
  function stripeTex(a, b, n = 8, diag = true) {
    return canvasTex(128, (g, S) => {
      g.fillStyle = a; g.fillRect(0, 0, S, S);
      g.fillStyle = b;
      const w = S / n;
      for (let i = -n; i < n * 2; i += 2) {
        g.beginPath();
        if (diag) { g.moveTo(i * w, 0); g.lineTo(i * w + w, 0); g.lineTo(i * w + w + S, S); g.lineTo(i * w + S, S); }
        else { g.rect(i * w, 0, w, S); }
        g.fill();
      }
    });
  }
  const caneTex = stripeTex('#ffffff', '#d92b2b', 6, true);
  caneTex.repeat.set(10, 1);

  // ------------------------------------------------------------------
  // 땅 — 마을 안은 평평하고, 바깥으로 갈수록 눈 언덕
  // ------------------------------------------------------------------
  function groundY(x, z) {
    const d = Math.hypot(x, z);
    const hill = smooth(44, 75, d);
    if (hill <= 0) return 0;
    return hill * (fbm(x / 28 + 10, z / 28 + 5, 4) * 9 + 1.5) + smooth(90, 200, d) * 6;
  }
  const groundGeo = new THREE.PlaneGeometry(420, 420, 140, 140);
  groundGeo.rotateX(-Math.PI / 2);
  {
    const p = groundGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, groundY(p.getX(i), p.getZ(i)));
    groundGeo.computeVertexNormals();
  }
  const snowMat = new THREE.MeshStandardMaterial({ color: '#f4f8fd', map: snowTex, normalMap: snowNormal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.82, envMapIntensity: 0.6 });
  const ground = mesh(groundGeo, snowMat);
  ground.castShadow = false;
  scene.add(ground);
  const walkables = [ground];

  // 충돌
  const blockers = [];
  const circleBlock = (x, z, r) => { const b = { x, z, r }; blockers.push(b); return b; };
  const boxBlock = (x, z, hw, hd, ry, h) => { const b = { x, z, hw, hd, c: Math.cos(ry), s: Math.sin(ry), h }; blockers.push(b); return b; };
  const BODY = 0.35;
  function pushOut(p) {
    for (let it = 0; it < 3; it++) {
      let dx = 0, dz = 0;
      for (const b of blockers) {
        if (b.off) continue;
        const ox = p.x - b.x, oz = p.z - b.z;
        if (b.r !== undefined) {
          const d = Math.hypot(ox, oz), R = b.r + BODY;
          if (d < R && d > 1e-6) { dx += ox / d * (R - d); dz += oz / d * (R - d); }
        } else {
          const lx = ox * b.c - oz * b.s, lz = ox * b.s + oz * b.c;
          const hw = b.hw + BODY, hd = b.hd + BODY;
          if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
            const px = hw - Math.abs(lx), pz = hd - Math.abs(lz);
            let mx = 0, mz = 0;
            if (px < pz) mx = (lx < 0 ? -1 : 1) * px; else mz = (lz < 0 ? -1 : 1) * pz;
            dx += mx * b.c + mz * b.s;
            dz += -mx * b.s + mz * b.c;
          }
        }
      }
      if (!dx && !dz) break;
      p.x += dx; p.z += dz;
    }
    if (p.x > 500) {   // 집 안 — 방 벽 안쪽으로
      p.x = clamp(p.x, INT.x - INT.W / 2 + 0.45, INT.x + INT.W / 2 - 0.45);
      p.z = clamp(p.z, INT.z - INT.D / 2 + 0.45, INT.z + INT.D / 2 - 0.45);
      return;
    }
    const d = Math.hypot(p.x, p.z);
    if (d > 47) { p.x *= 47 / d; p.z *= 47 / d; }
  }

  // ------------------------------------------------------------------
  // 장소
  // ------------------------------------------------------------------
  const PLACES = [
    { id: 'tree', emoji: '🎄', name: '큰 트리 광장', x: 0, z: 0, r: 10, desc: '반짝이는 큰 트리 아래에서 불빛을 바꾸고, 소원 오너먼트를 달아 보세요.' },
    { id: 'cocoa', emoji: '☕', name: '코코아 노점', x: 0, z: -19, r: 5.5, desc: '따끈한 코코아 한 잔으로 손을 녹여요. 마시멜로는 덤!' },
    { id: 'workshop', emoji: '🎁', name: '산타의 선물 공방', x: -21, z: -10, r: 8, desc: '산타가 포장해 둔 선물 상자를 열어 보세요. 무엇이 들어 있을까요?' },
    { id: 'snowman', emoji: '☃️', name: '눈사람 마당', x: 19, z: -11, r: 7.5, desc: '눈을 굴려 나만의 눈사람을 만들고, 눈뭉치도 던져 봐요.' },
    { id: 'sleigh', emoji: '🛷', name: '산타의 썰매', x: -18, z: 14, r: 7.5, desc: '출발 준비를 마친 썰매예요. 올라앉아 방울을 흔들어 보세요.' },
    { id: 'pond', emoji: '⛸', name: '꽁꽁 스케이트장', x: 19, z: 15, r: 9.5, desc: '꽁꽁 언 연못이에요. 스케이트를 신으면 미끄러지듯 달릴 수 있어요.' },
  ];
  // 마을 집들 (장소와 길을 피해서)
  const HOUSES_AT = [
    [-36, 2, '#c58a55', '#b93b3b'], [-10, -34, '#8fb8de', '#3a5a8a'], [12, -35, '#f1e2c4', '#2f6b4a'],
    [37, 0, '#e9a3a8', '#7a3b52'], [-8, 35, '#9fd3b8', '#b93b3b'], [10, 35, '#f2cf6b', '#2f6b4a'],
    [-34, -26, '#f1e2c4', '#b93b3b'], [35, -27, '#c58a55', '#2f6b4a'],
  ];
  const placeById = Object.fromEntries(PLACES.map((p) => [p.id, p]));
  const POND = { x: 19, z: 15, rx: 7.2, rz: 5.4 };
  const onIce = (x, z) => ((x - POND.x) / POND.rx) ** 2 + ((z - POND.z) / POND.rz) ** 2 < 0.94;

  // 광장 · 길
  const cobbleMat = new THREE.MeshStandardMaterial({ map: cobbleTex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  {
    const t = cobbleTex.clone();
    t.repeat.set(7, 7); t.needsUpdate = true;
    const plaza = mesh(new THREE.CircleGeometry(10, 64), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), 0, 0.02, 0);
    plaza.rotation.x = -Math.PI / 2;
    plaza.castShadow = false;
    scene.add(plaza);
    walkables.push(plaza);
    // 광장 가장자리 — 치운 눈이 소복이 쌓인 둑
    const rim = mesh(new THREE.TorusGeometry(10.15, 0.32, 8, 80), mat('#f7fafe', { roughness: 0.75 }), 0, 0, 0);
    rim.rotation.x = -Math.PI / 2;
    rim.scale.z = 0.45;
    scene.add(rim);
  }
  for (const p of PLACES) {
    if (p.id === 'tree') continue;
    const ang = Math.atan2(p.x, p.z), d0 = 9.6, d1 = Math.hypot(p.x, p.z) - (p.id === 'pond' ? 6 : 3);
    const len = d1 - d0;
    const g = new THREE.Group();
    const t = cobbleTex.clone();
    t.repeat.set(1.2, len / 2.4); t.needsUpdate = true;
    const strip = mesh(new THREE.PlaneGeometry(2.8, len), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    strip.rotation.x = -Math.PI / 2;
    strip.castShadow = false;
    g.add(strip);
    g.rotation.y = ang;
    g.position.set(Math.sin(ang) * (d0 + len / 2), 0.012, Math.cos(ang) * (d0 + len / 2));
    scene.add(g);
    walkables.push(strip);
    p.pathAng = ang;
    p.pathLen = [d0, d1];
  }
  const nearPath = (x, z, pad = 2.4) => {
    if (Math.hypot(x, z) < 11 + pad) return true;
    for (const p of PLACES) {
      if (!p.pathLen) continue;
      const ax = Math.sin(p.pathAng), az = Math.cos(p.pathAng);
      const t = x * ax + z * az;
      if (t < p.pathLen[0] - 1 || t > p.pathLen[1] + 1) continue;
      if (Math.abs(x * az - z * ax) < 1.4 + pad) return true;
    }
    return false;
  };
  const floorY = (x, z) => (x > 500 ? 0 : groundY(x, z));
  const nearPlace = (x, z, pad = 0) => PLACES.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + pad);

  // ------------------------------------------------------------------
  // 장식 전구 — 모든 줄 전구를 한 번에 그립니다
  // ------------------------------------------------------------------
  const BULB_COLORS = ['#ff3b3b', '#ffd23f', '#2fd67a', '#3fa2ff', '#ff7ad9', '#ff9a2f'];
  const bulbPts = [];   // { p: Vector3, c: Color, ph }
  const wirePts = [];   // 전선 — 전구 사이를 잇는 가는 선
  function bulbLine(a, b, sag, n, colors = BULB_COLORS) {
    let prev = null;
    for (let i = 0; i <= n * 3; i++) {
      const t = i / (n * 3);
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      p.y -= Math.sin(t * Math.PI) * sag;
      if (prev) wirePts.push(prev, p);
      prev = p;
      if (i % 3 === 0) bulbPts.push({ p: p.clone().add(new THREE.Vector3(0, -0.06, 0)), c: new THREE.Color(colors[(i / 3) % colors.length]), ph: rnd() * 6.28 });
    }
  }

  // ------------------------------------------------------------------
  // 소나무 (숲) — 층층이 원뿔 + 눈 모자
  // ------------------------------------------------------------------
  function mergeGeos(list) {
    let total = 0, itotal = 0;
    const gs = list.map((g) => (g.index ? g : g.toNonIndexed()));
    for (const g of gs) { total += g.attributes.position.count; itotal += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), idx = [];
    let off = 0;
    for (const g of gs) {
      pos.set(g.attributes.position.array, off * 3);
      nor.set(g.attributes.normal.array, off * 3);
      if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.array[i] + off);
      else for (let i = 0; i < g.attributes.position.count; i++) idx.push(i + off);
      off += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setIndex(idx);
    return out;
  }
  const pineNeedles = [], pineSnow = [];
  for (let i = 0; i < 4; i++) {
    const t = i / 3, r = lerp(1.7, 0.6, t), h = lerp(1.9, 1.3, t), y = 0.9 + i * 0.95;
    pineNeedles.push(new THREE.ConeGeometry(r, h, 8, 1).translate(0, y + h / 2, 0));
    pineSnow.push(new THREE.ConeGeometry(r * 0.62, h * 0.48, 8, 1).translate(0, y + h - h * 0.24 + 0.03, 0));
  }
  const pineGeo = mergeGeos(pineNeedles), pineSnowGeo = mergeGeos(pineSnow);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.2, 7).translate(0, 0.6, 0);
  {
    const spots = [];
    let tries = 0;
    while (spots.length < (LOW ? 90 : 170) && tries++ < 4000) {
      const a = rnd() * Math.PI * 2, r = 24 + Math.pow(rnd(), 0.7) * 50;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (nearPath(x, z, 3) || nearPlace(x, z, 3)) continue;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 3.2)) continue;
      if (HOUSES_AT.some((hh) => Math.hypot(hh[0] - x, hh[1] - z) < 8.5) || Math.hypot(x + 23.3, z + 11.1) < 9.5) continue;
      spots.push({ x, z, s: 0.9 + rnd() * 1.1 });
    }
    const n = spots.length;
    const imN = new THREE.InstancedMesh(pineGeo, new THREE.MeshStandardMaterial({ color: '#2f6e4c', roughness: 0.85, flatShading: true }), n);
    const imS = new THREE.InstancedMesh(pineSnowGeo, new THREE.MeshStandardMaterial({ color: '#f6faff', roughness: 0.7, flatShading: true }), n);
    const imT = new THREE.InstancedMesh(trunkGeo, mat('#6b4a32', { roughness: 0.9 }), n);
    const d = new THREE.Object3D();
    const tint = new THREE.Color();
    spots.forEach((s, i) => {
      d.position.set(s.x, groundY(s.x, s.z) - 0.1, s.z);
      d.rotation.set(0, rnd() * 6.28, 0);
      d.scale.set(s.s, s.s * (0.9 + rnd() * 0.3), s.s);
      d.updateMatrix();
      imN.setMatrixAt(i, d.matrix); imS.setMatrixAt(i, d.matrix); imT.setMatrixAt(i, d.matrix);
      tint.setHSL(0.39 + rnd() * 0.04, 0.42, 0.24 + rnd() * 0.08);
      imN.setColorAt(i, tint);
      if (Math.hypot(s.x, s.z) < 40) circleBlock(s.x, s.z, 0.7 * s.s).h = 5.5 * s.s;
    });
    for (const im of [imN, imS, imT]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }
  }

  // 먼 숲 — 마을을 빙 둘러싼 눈 덮인 소나무 (멀수록 안개에 묻혀 하늘빛으로)
  {
    const N = LOW ? 420 : 900;
    const imN = new THREE.InstancedMesh(pineGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }), N);
    const imS = new THREE.InstancedMesh(pineSnowGeo, new THREE.MeshStandardMaterial({ color: '#f8fbff', roughness: 0.7, flatShading: true }), N);
    const imT = new THREE.InstancedMesh(trunkGeo, mat('#6b4a32', { roughness: 0.9 }), N);
    const d = new THREE.Object3D(), tint = new THREE.Color();
    let i = 0, tries = 0;
    while (i < N && tries++ < 20000) {
      const a2 = rnd() * Math.PI * 2, r = 74 + Math.pow(rnd(), 0.8) * 120;
      const x = Math.cos(a2) * r, z = Math.sin(a2) * r;
      const sc = 1.6 + rnd() * 1.8 + (r - 74) / 120 * 1.2;
      d.position.set(x, groundY(x, z) - 0.2, z);
      d.rotation.set(0, rnd() * 6.28, 0);
      d.scale.set(sc, sc * (0.95 + rnd() * 0.35), sc);
      d.updateMatrix();
      imN.setMatrixAt(i, d.matrix); imS.setMatrixAt(i, d.matrix); imT.setMatrixAt(i, d.matrix);
      tint.setHSL(0.4 + rnd() * 0.04, 0.32, 0.27 + rnd() * 0.1);
      imN.setColorAt(i, tint);
      i++;
    }
    imN.count = imS.count = imT.count = i;
    for (const im of [imN, imS, imT]) { im.receiveShadow = true; scene.add(im); }
  }

  // ------------------------------------------------------------------
  // 큰 트리
  // ------------------------------------------------------------------
  const TREE = { tiers: [], bulbs: null, bulbBase: [], mode: 0, star: null, glow: null, wishes: [] };
  function treeRadiusAt(y) {
    let r = 0;
    for (const t of TREE.tiers) if (y >= t.y && y <= t.y + t.h) r = Math.max(r, t.r * (1 - (y - t.y) / t.h));
    return r;
  }
  {
    const g = new THREE.Group();
    scene.add(g);
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.55, 1.6, 12), mat('#6b4a32', { roughness: 0.9 }), 0, 0.8, 0));
    // 받침 — 빨간 화분 모양
    g.add(mesh(new THREE.CylinderGeometry(1.0, 0.8, 0.7, 20), mat('#c0302c', { roughness: 0.5 }), 0, 0.35, 0));
    g.add(mesh(new THREE.TorusGeometry(0.98, 0.07, 8, 28), mat('#e8b23a', { roughness: 0.35, metalness: 0.6 }), 0, 0.7, 0).rotateX(Math.PI / 2));
    const needle = new THREE.MeshStandardMaterial({ color: '#2b7547', roughness: 0.78, flatShading: true });
    const snowy = new THREE.MeshStandardMaterial({ color: '#f8fbff', roughness: 0.65, flatShading: true });
    const N = 7;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const r = lerp(4.0, 0.95, t), h = lerp(2.7, 1.7, t), y = 1.3 + i * 1.22;
      TREE.tiers.push({ r, h, y });
      const cone = mesh(new THREE.ConeGeometry(r, h, 16, 2), needle, 0, y + h / 2, 0);
      // 가지 끝이 들쭉날쭉하게
      const p = cone.geometry.attributes.position;
      for (let k = 0; k < p.count; k++) {
        if (p.getY(k) < -h / 2 + 0.01) {
          const a = Math.atan2(p.getZ(k), p.getX(k));
          const s = 1 + Math.sin(a * 8 + i) * 0.05;
          p.setX(k, p.getX(k) * s); p.setZ(k, p.getZ(k) * s);
          p.setY(k, p.getY(k) - 0.18 * (0.5 + 0.5 * Math.sin(a * 16 + i * 2)));
        }
      }
      cone.geometry.computeVertexNormals();
      g.add(cone);
      const cap = mesh(new THREE.ConeGeometry(r * 0.5, h * 0.42, 16, 1), snowy, 0, y + h - h * 0.21 + 0.03, 0);
      g.add(cap);
    }
    circleBlock(0, 0, 4.6);   // 트리 + 아래 선물 더미

    // 오너먼트 — 빨강 · 금 · 은 · 파랑 반짝이 공
    const ornCols = ['#d42a2a', '#f2b632', '#e9eef6', '#2d6fd6', '#d42a2a', '#f2b632'];
    const orn = [];
    for (let i = 0; i < 110; i++) {
      const y = 1.6 + Math.pow(rnd(), 0.85) * 8.4;
      const a = rnd() * Math.PI * 2;
      const r = treeRadiusAt(y);
      if (r < 0.4) continue;
      orn.push({ x: Math.cos(a) * (r + 0.05), y, z: Math.sin(a) * (r + 0.05), c: ornCols[i % ornCols.length], s: 0.13 + rnd() * 0.09 });
    }
    const ornIM = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ roughness: 0.18, metalness: 0.55, envMapIntensity: 1.4 }), orn.length);
    const d = new THREE.Object3D();
    orn.forEach((o, i) => {
      d.position.set(o.x, o.y, o.z); d.scale.setScalar(o.s); d.updateMatrix();
      ornIM.setMatrixAt(i, d.matrix);
      ornIM.setColorAt(i, new THREE.Color(o.c));
    });
    ornIM.castShadow = true;
    g.add(ornIM);

    // 금색 구슬 줄 (나선)
    const beads = [];
    for (let i = 0; i < 420; i++) {
      const s = i / 420, y = 1.5 + s * 9.0, a = s * Math.PI * 2 * 5.5 + 1.4;
      const r = treeRadiusAt(y);
      if (r < 0.2) continue;
      beads.push([Math.cos(a) * (r + 0.04), y - 0.25 * Math.abs(Math.sin(a * 2.75)), Math.sin(a) * (r + 0.04)]);
    }
    const beadIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshStandardMaterial({ color: '#f6c94a', roughness: 0.2, metalness: 0.8 }), beads.length);
    beads.forEach((b, i) => { d.position.set(b[0], b[1], b[2]); d.scale.setScalar(1); d.updateMatrix(); beadIM.setMatrixAt(i, d.matrix); });
    g.add(beadIM);

    // 전구 (나선) — 색을 매 프레임 바꿔 반짝이게
    const bl = [];
    for (let i = 0; i < 340; i++) {
      const s = i / 340, y = 1.45 + s * 9.2, a = -s * Math.PI * 2 * 7;
      const r = treeRadiusAt(y);
      if (r < 0.2) continue;
      bl.push([Math.cos(a) * (r + 0.08), y, Math.sin(a) * (r + 0.08)]);
    }
    const bulbIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.085, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), bl.length);
    bl.forEach((b, i) => {
      d.position.set(b[0], b[1], b[2]); d.updateMatrix();
      bulbIM.setMatrixAt(i, d.matrix);
      const c = new THREE.Color(BULB_COLORS[i % BULB_COLORS.length]);
      bulbIM.setColorAt(i, c);
      TREE.bulbBase.push({ c, ph: rnd() * 6.28, y: b[1] });
    });
    g.add(bulbIM);
    TREE.bulbs = bulbIM;

    // 별
    const sh = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.34 : 0.82;
      if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const starGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2 });
    starGeo.center();
    const star = mesh(starGeo, new THREE.MeshStandardMaterial({ color: '#ffd54a', emissive: '#ffb300', emissiveIntensity: 0.85, roughness: 0.25, metalness: 0.5 }), 0, 11.55, 0);
    g.add(star);
    TREE.star = star;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: '#fff1a8', transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(4.2);
    glow.position.set(0, 11.55, 0);
    g.add(glow);
    TREE.glow = glow;
    // 트리를 감싸는 은은한 빛 · 바닥에 비치는 빛 · 광장을 물들이는 조명
    TREE.halos = [];
    for (const [y, sc, op] of [[3.2, 13, 0.2], [6.2, 10.5, 0.2], [9.2, 7, 0.22]]) {
      const hs = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: '#ffe0a0', transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending }));
      hs.scale.setScalar(sc);
      hs.position.set(0, y, 0);
      hs.userData.op = op;
      g.add(hs);
      TREE.halos.push(hs);
    }
    const pool = new THREE.Mesh(new THREE.CircleGeometry(8.5, 48), new THREE.MeshBasicMaterial({ map: softTex, color: '#ffe0a0', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.05;
    g.add(pool);
    TREE.pool = pool;
    TREE.light = new THREE.PointLight('#ffe0a0', 5, 18, 1.2);
    TREE.light.position.set(0, 4.5, 0);
    g.add(TREE.light);
    TREE.glowCol = new THREE.Color('#ffe0a0');

    // 트리 아래 선물 더미
    const giftCols = [['#d63a3a', '#f4d35e'], ['#2f8a52', '#ffffff'], ['#3a6fd6', '#f4d35e'], ['#f4d35e', '#d63a3a'], ['#ffffff', '#d63a3a'], ['#9b59b6', '#ffffff'], ['#ff8fb1', '#ffffff']];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rnd() * 0.3, r = 3.3 + rnd() * 1.1;
      const s = 0.45 + rnd() * 0.45;
      const [c1, c2] = giftCols[i % giftCols.length];
      const gift = makeGift(s * (0.9 + rnd() * 0.5), s * (0.7 + rnd() * 0.5), s * (0.9 + rnd() * 0.5), c1, c2);
      gift.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r);
      gift.rotation.y = rnd() * 6.28;
      g.add(gift);
    }
  }

  function makeGift(w, h, dd, color, ribbon) {
    const g = new THREE.Group();
    const box = mesh(new THREE.BoxGeometry(w, h, dd), mat(color, { roughness: 0.55 }), 0, h / 2, 0);
    g.add(box);
    const rm = mat(ribbon, { roughness: 0.35, metalness: 0.15 });
    g.add(mesh(new THREE.BoxGeometry(w + 0.02, h + 0.02, Math.min(0.12, dd * 0.18)), rm, 0, h / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(Math.min(0.12, w * 0.18), h + 0.02, dd + 0.02), rm, 0, h / 2, 0));
    for (const s of [-1, 1]) {
      const bow = mesh(new THREE.TorusGeometry(Math.min(w, dd) * 0.16, Math.min(w, dd) * 0.05, 6, 14), rm, s * Math.min(w, dd) * 0.13, h + Math.min(w, dd) * 0.1, 0);
      bow.rotation.set(0, 0, s * 0.6);
      bow.scale.z = 0.6;
      g.add(bow);
    }
    return g;
  }

  // ------------------------------------------------------------------
  // 집 — 생강 쿠키 · 파스텔 오두막, 지붕엔 눈 · 처마엔 고드름
  // ------------------------------------------------------------------
  const iceMatSolid = new THREE.MeshStandardMaterial({ color: '#e3f4ff', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88, envMapIntensity: 1.4 });
  const icicleGeo = new THREE.CylinderGeometry(0.075, 0.032, 1, 7).translate(0, -0.5, 0);
  const winMat = new THREE.MeshStandardMaterial({ color: '#ffe7a8', emissive: '#ffbf55', emissiveIntensity: 0.75, roughness: 0.4 });
  const whiteM = mat('#ffffff', { roughness: 0.7 });
  const snowM = mat('#f7fafe', { roughness: 0.72 });
  function makeWreath(r = 0.3) {
    const g = new THREE.Group();
    const ring = mesh(new THREE.TorusGeometry(r, r * 0.32, 8, 22), mat('#2a6e40', { roughness: 0.85, flatShading: true }));
    g.add(ring);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      g.add(mesh(new THREE.SphereGeometry(r * 0.1, 6, 5), mat('#d42a2a', { roughness: 0.4 }), Math.cos(a) * r, Math.sin(a) * r, r * 0.25));
    }
    for (const s of [-1, 1]) {
      const b = mesh(new THREE.SphereGeometry(r * 0.22, 8, 6), mat('#d42a2a', { roughness: 0.5 }), s * r * 0.22, -r, r * 0.25);
      b.scale.set(1.2, 0.7, 0.5);
      g.add(b);
    }
    return g;
  }
  function makeHouse(o) {
    const g = new THREE.Group();
    const { w, d, h } = o;
    const wallM = mat(o.wall, { roughness: 0.85 });
    g.add(mesh(new THREE.BoxGeometry(w, h, d), wallM, 0, h / 2, 0));
    // 하얀 아이싱 띠 (생강 쿠키 집처럼)
    g.add(mesh(new THREE.BoxGeometry(w + 0.08, 0.12, d + 0.08), whiteM, 0, h - 0.05, 0));
    g.add(mesh(new THREE.BoxGeometry(w + 0.12, 0.2, d + 0.12), mat(o.trim || '#ffffff', { roughness: 0.8 }), 0, 0.1, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.14, h, 0.14), whiteM, sx * w / 2, h / 2, sz * d / 2));
    // 박공 (앞뒤 삼각형)
    const rh = w * 0.45;
    const tri = new THREE.Shape();
    tri.moveTo(-w / 2, 0); tri.lineTo(w / 2, 0); tri.lineTo(0, rh); tri.lineTo(-w / 2, 0);
    const gable = new THREE.ExtrudeGeometry(tri, { depth: d, bevelEnabled: false });
    gable.translate(0, 0, -d / 2);
    g.add(mesh(gable, wallM, 0, h, 0));
    // 지붕 두 장 + 눈 두 장
    const ang = Math.atan2(rh, w / 2), slope = Math.hypot(w / 2, rh), over = 0.45;
    const L = slope + over;
    const ica = [];
    for (const s of [-1, 1]) {
      const nx = s * Math.sin(ang), ny = Math.cos(ang);         // 바깥 법선
      const ddx = s * Math.cos(ang), ddy = -Math.sin(ang);      // 처마 쪽(아래)
      const cx = s * w / 4 + ddx * over / 2, cy = h + rh / 2 + ddy * over / 2;
      const roof = mesh(new THREE.BoxGeometry(L, 0.16, d + 0.7), mat(o.roof, { roughness: 0.7 }), cx + nx * 0.1, cy + ny * 0.1, 0);
      roof.rotation.z = -s * ang;
      g.add(roof);
      const sn = mesh(new THREE.BoxGeometry(L + 0.02, 0.2, d + 0.8), snowM, cx + nx * 0.26, cy + ny * 0.26, 0);
      sn.rotation.z = -s * ang;
      g.add(sn);
      // 처마 끝 눈 — 둥글게 말린 가장자리
      const ex = s * (w / 2 + over * Math.cos(ang)) + nx * 0.2, ey = h - over * Math.sin(ang) + ny * 0.2;
      const lip = mesh(new THREE.CylinderGeometry(0.15, 0.15, d + 0.8, 10), snowM, ex, ey, 0);
      lip.rotation.x = Math.PI / 2;
      g.add(lip);
      // 고드름
      for (let z = -d / 2 - 0.3; z <= d / 2 + 0.3; z += 0.32) ica.push([ex, ey - 0.08, z, 0.1 + rnd() * 0.17]);
    }
    const ridge = mesh(new THREE.CylinderGeometry(0.2, 0.2, d + 0.82, 10), snowM, 0, h + rh + 0.24, 0);
    ridge.rotation.x = Math.PI / 2;
    g.add(ridge);
    const icim = new THREE.InstancedMesh(icicleGeo, iceMatSolid, ica.length);
    const dm = new THREE.Object3D();
    ica.forEach((c, i) => { dm.position.set(c[0], c[1], c[2]); dm.scale.set(1, c[3], 1); dm.updateMatrix(); icim.setMatrixAt(i, dm.matrix); });
    g.add(icim);
    // 굴뚝
    const ch = mesh(new THREE.BoxGeometry(0.62, 1.5, 0.62), mat('#a8483a', { roughness: 0.9 }), w * 0.24, h + rh * 0.55 + 0.45, -d * 0.2);
    g.add(ch);
    g.add(mesh(new THREE.BoxGeometry(0.8, 0.18, 0.8), snowM, w * 0.24, h + rh * 0.55 + 1.25, -d * 0.2));
    g.userData.chimney = new THREE.Vector3(w * 0.24, h + rh * 0.55 + 1.4, -d * 0.2);
    // 문 · 리스
    const fz = d / 2;
    // 문 — 왼쪽 경첩을 축으로 바깥쪽으로 열립니다. 문 뒤는 따뜻한 불빛
    const glowIn = mesh(new THREE.PlaneGeometry(1.0, 1.85), new THREE.MeshBasicMaterial({ color: '#ffcf86' }), 0, 0.93, fz + 0.005);
    glowIn.castShadow = false;
    g.add(glowIn);
    const door = new THREE.Group();
    door.position.set(-0.525, 0, fz + 0.03);
    g.add(door);
    const panel = mesh(new THREE.BoxGeometry(1.05, 1.9, 0.12), mat(o.door || '#2f6b4a', { roughness: 0.6 }), 0.525, 0.95, 0);
    door.add(panel);
    door.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), mat('#e8b23a', { metalness: 0.7, roughness: 0.3 }), 0.525 + 0.34, 0.95, 0.09));
    const wr = makeWreath(0.26);
    wr.position.set(0.525, 1.42, 0.09);
    door.add(wr);
    g.add(mesh(new THREE.BoxGeometry(1.25, 0.12, 0.16), whiteM, 0, 1.95, fz + 0.04));
    g.userData.door = door;
    g.userData.doorPanel = panel;
    g.userData.doorColor = o.door || '#2f6b4a';
    g.userData.height = h + rh + 0.4;
    // 창문 — 안쪽 따뜻한 불빛
    const win = (x, y, z, ry) => {
      const wg = new THREE.Group();
      wg.add(mesh(new THREE.BoxGeometry(0.9, 0.9, 0.06), winMat));
      wg.add(mesh(new THREE.BoxGeometry(1.06, 0.1, 0.1), whiteM, 0, 0.5, 0.02));
      wg.add(mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), whiteM, 0, 0, 0.03));
      wg.add(mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), whiteM, 0, 0, 0.03));
      wg.add(mesh(new THREE.BoxGeometry(1.1, 0.14, 0.24), snowM, 0, -0.5, 0.08));
      wg.position.set(x, y, z);
      wg.rotation.y = ry;
      g.add(wg);
    };
    if (w > 3.6) { win(-w * 0.31, h * 0.56, fz + 0.02, 0); win(w * 0.31, h * 0.56, fz + 0.02, 0); }
    win(0, h + rh * 0.38, fz + 0.02, 0);
    for (const s of [-1, 1]) win(s * (w / 2 + 0.02), h * 0.56, 0, s * Math.PI / 2);
    // 앞 처마 박공을 따라 전구
    g.userData.lights = [
      [new THREE.Vector3(-w / 2 - 0.3, h - 0.1, fz + 0.5), new THREE.Vector3(0, h + rh + 0.15, fz + 0.5)],
      [new THREE.Vector3(0, h + rh + 0.15, fz + 0.5), new THREE.Vector3(w / 2 + 0.3, h - 0.1, fz + 0.5)],
    ];
    // 벽 밑 소복한 눈
    for (let i = 0; i < 8; i++) {
      const side = i % 4, t = rnd() - 0.5;
      const x = side === 0 ? t * w : side === 1 ? w / 2 + 0.1 : side === 2 ? t * w : -w / 2 - 0.1;
      const z = side === 0 ? -d / 2 - 0.1 : side === 1 ? t * d : side === 2 ? d / 2 + 0.1 : t * d;
      if (side === 2 && Math.abs(x) < 0.9) continue;
      const lump = mesh(new THREE.SphereGeometry(0.5 + rnd() * 0.3, 10, 8), snowM, x, 0, z);
      lump.scale.y = 0.45;
      g.add(lump);
    }
    g.userData.size = { w, d };
    return g;
  }
  function placeHouse(house, x, z, faceX = 0, faceZ = 0) {
    const ry = Math.atan2(faceX - x, faceZ - z);
    house.position.set(x, groundY(x, z), z);
    house.rotation.y = ry;
    scene.add(house);
    house.updateMatrixWorld(true);
    const { w, d } = house.userData.size;
    boxBlock(x, z, w / 2 + 0.25, d / 2 + 0.25, ry, house.userData.height);
    for (const [a, b] of house.userData.lights) bulbLine(house.localToWorld(a.clone()), house.localToWorld(b.clone()), 0.12, 9);
    return ry;
  }

  // ------------------------------------------------------------------
  // 집 안 — 모든 집이 같은 방을 쓰고, 벽 색 · 문 색만 집마다 바꿉니다
  //   방은 마을에서 멀리 떨어진 곳(x=1000)에 있고, 문을 열면 화면이 하얗게 바뀌며 옮겨 갑니다
  //   산타의 선물 공방은 소파 · 탁자 대신 선물 받침대 6개가 놓입니다
  // ------------------------------------------------------------------
  const INT = { x: 1000, z: 0, W: 11, D: 9, H: 4.2 };
  const HOUSE_LIST = [], doorMeshes = [], stationMeshes = [];
  const HOUSE_NAMES = ['생강쿠키 집', '하늘색 집', '크림색 집', '분홍 집', '민트색 집', '노란 집', '눈꽃 집', '통나무 집'];
  function registerHouse(house, name, wall, workshop = false) {
    const { d } = house.userData.size;
    const h = {
      g: house, name, wall, workshop, door: house.userData.door, doorT: 0, ry: house.rotation.y, doorColor: house.userData.doorColor,
      doorSpot: house.localToWorld(new THREE.Vector3(0, 0, d / 2 + 1.0)), doorLook: house.localToWorld(new THREE.Vector3(0, 0, d / 2)),
    };
    h.doorSpot.y = 0;
    h.place = { id: 'door' + HOUSE_LIST.length, emoji: '🚪', name, house: h,
      desc: workshop ? '산타가 준비한 선물이 가득한 공방이에요. 문을 열고 들어가 둘러볼까요?' : '창문 너머로 따뜻한 불빛이 보여요. 똑똑, 들어가 볼까요?' };
    house.userData.doorPanel.userData.house = h;
    doorMeshes.push(house.userData.doorPanel);
    HOUSE_LIST.push(h);
    return h;
  }
  const ROOM = new THREE.Group();
  ROOM.position.set(INT.x, 0, INT.z);
  scene.add(ROOM);
  const INSIDE = { id: 'inside', emoji: '🏠', name: '', desc: '' };
  const intWallTex = canvasTex(128, (g, S) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(0,0,0,.07)';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const cx = x * 32 + (y % 2) * 16 + 8, cy = y * 32 + 16;
      g.beginPath(); g.moveTo(cx, cy - 6); g.lineTo(cx + 5, cy); g.lineTo(cx, cy + 6); g.lineTo(cx - 5, cy); g.fill();
    }
  }, 1);
  intWallTex.repeat.set(5, 2);
  const intWallMat = new THREE.MeshStandardMaterial({ map: intWallTex, color: '#f6dccb', roughness: 0.92 });
  const intDoorMat = new THREE.MeshStandardMaterial({ color: '#2f6b4a', roughness: 0.6 });
  const fireFlames = [];
  let fireGlow = null, fireLight = null, winFlakes = null, intDoor = null, intDoorT = 0;
  const intTreeBulbs = [];
  let intTreeOn = true, intTreeHalo = null;
  const cookies = [];
  const INTS = {}, WALLS = {};
  let shopBanner = null;
  const homeStuff = new THREE.Group(), shopStuff = new THREE.Group();
  const homeBlocks = [], shopBlocks = [];
  const GIFT_ITEMS = [
    { emoji: '🧸', name: '곰인형', desc: '폭신폭신한 곰인형이에요. 꼭 안아 주면 마음까지 따뜻해져요.', c1: '#d63a3a', c2: '#f4d35e' },
    { emoji: '🚂', name: '장난감 기차', desc: '칙칙폭폭! 태엽을 감으면 방 안을 한 바퀴 돌아요.', c1: '#3a6fd6', c2: '#ffffff' },
    { emoji: '🔮', name: '눈꽃 스노볼', desc: '흔들면 작은 마을에 눈이 펑펑 내려요.', c1: '#9fd8ff', c2: '#ffffff' },
    { emoji: '🎵', name: '오르골 상자', desc: '뚜껑을 열면 고요한 밤 멜로디가 흘러나와요.', c1: '#2f8a52', c2: '#f4d35e' },
    { emoji: '🧣', name: '털목도리', desc: '산타 할머니가 한 땀 한 땀 뜬 빨간 목도리예요.', c1: '#ffffff', c2: '#d63a3a' },
    { emoji: '🍪', name: '진저쿠키 상자', desc: '방금 구운 진저쿠키가 한가득! 고소한 냄새가 나요.', c1: '#f4d35e', c2: '#d63a3a' },
  ];
  const STATIONS = [];
  {
    const { W, D, H } = INT;
    const R = ROOM;
    R.add(homeStuff, shopStuff);
    const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7 });
    // 바닥
    const ft = woodTex.clone(); ft.repeat.set(4, 4); ft.needsUpdate = true;
    const floor = mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: ft, color: '#f0d2b0', roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;
    R.add(floor);
    walkables.push(floor);
    // 벽 · 징두리 · 천장 · 들보
    const green = mat('#2f6b4a', { roughness: 0.7 });
    // 벽은 네 묶음 — 카메라가 벽 바깥으로 나가면 그 벽만 숨겨 인형의 집처럼 들여다봅니다
    for (const k of ['back', 'front', 'left', 'right']) { WALLS[k] = new THREE.Group(); R.add(WALLS[k]); }
    WALLS.back.add(mesh(new THREE.BoxGeometry(W + 0.4, H, 0.2), intWallMat, 0, H / 2, -D / 2 - 0.1));
    WALLS.front.add(mesh(new THREE.BoxGeometry(W + 0.4, H, 0.2), intWallMat, 0, H / 2, D / 2 + 0.1));
    WALLS.left.add(mesh(new THREE.BoxGeometry(0.2, H, D), intWallMat, -W / 2 - 0.1, H / 2, 0));
    WALLS.right.add(mesh(new THREE.BoxGeometry(0.2, H, D), intWallMat, W / 2 + 0.1, H / 2, 0));
    [[W, 0.06, 0, -D / 2 + 0.03, 'back'], [W, 0.06, 0, D / 2 - 0.03, 'front'], [0.06, D, -W / 2 + 0.03, 0, 'left'], [0.06, D, W / 2 - 0.03, 0, 'right']].forEach(([w, d, x, z, k]) => {
      WALLS[k].add(mesh(new THREE.BoxGeometry(w, 1.1, d), green, x, 0.55, z));
      WALLS[k].add(mesh(new THREE.BoxGeometry(w, 0.08, d + 0.06), whiteM, x, 1.12, z));
    });
    R.add(mesh(new THREE.BoxGeometry(W + 0.4, 0.2, D + 0.4), mat('#fbf3e6', { roughness: 0.9 }), 0, H + 0.1, 0));
    for (const z of [-2.8, 0, 2.8]) R.add(mesh(new THREE.BoxGeometry(W, 0.24, 0.3), wood, 0, H - 0.1, z));
    // 천장 등
    R.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6, 4), mat('#333333'), 0, H - 0.3, 0.6));
    const shade = mesh(new THREE.SphereGeometry(0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('#2f6b4a', { side: THREE.DoubleSide }), 0, H - 0.6, 0.6);
    R.add(shade);
    R.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshBasicMaterial({ color: '#fff3d6' })).translateY(H - 0.68).translateZ(0.6));
    const lamp = new THREE.PointLight('#ffe2b8', 10, 16, 1.1);
    lamp.position.set(0, H - 0.9, 0.6);
    R.add(lamp);

    // 벽난로
    const brickTex = canvasTex(128, (g, S) => {
      g.fillStyle = '#e9dfd3'; g.fillRect(0, 0, S, S);
      const cols = ['#b5533c', '#a64a35', '#c0604a', '#b8583f'];
      for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) {
        const x = c * 32 + (r % 2) * 16, y = r * 16;
        g.fillStyle = cols[Math.floor(hash2(r, c + 9) * 4)];
        g.fillRect(x + 1.5, y + 1.5, 29, 13);
      }
    });
    brickTex.repeat.set(2, 2);
    const fp = new THREE.Group();
    fp.position.set(0, 0, -D / 2);
    R.add(fp);
    fp.add(mesh(new THREE.BoxGeometry(2.9, 2.3, 0.9), new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.9 }), 0, 1.15, 0.45));
    fp.add(mesh(new THREE.BoxGeometry(1.5, 1.15, 0.2), mat('#1d1210', { roughness: 1 }), 0, 0.66, 0.82));
    fp.add(mesh(new THREE.BoxGeometry(3.3, 0.14, 1.4), mat('#9a8f86', { roughness: 0.8 }), 0, 0.07, 0.75));
    fp.add(mesh(new THREE.BoxGeometry(3.4, 0.18, 1.15), mat('#f6efe4', { roughness: 0.6 }), 0, 2.34, 0.52));
    for (const [x, rz, y] of [[-0.1, 0.15, 0.24], [0.15, -0.2, 0.24], [0, 0, 0.4]]) {
      const log = mesh(new THREE.CylinderGeometry(0.1, 0.11, 1.0, 8), mat('#6b4a32'), x, y, 0.95);
      log.rotation.set(0, rz, Math.PI / 2);
      fp.add(log);
    }
    for (let i = 0; i < 4; i++) {
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.17 - i * 0.02, 0.6 - i * 0.08, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffd56b' : '#ff8a2a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      fl.position.set(-0.3 + i * 0.2, 0.62, 1.0);
      fp.add(fl);
      fireFlames.push(fl);
    }
    fireGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: '#ff9a3c', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    fireGlow.scale.setScalar(2.4);
    fireGlow.position.set(0, 0.65, 1.15);
    fp.add(fireGlow);
    fireLight = new THREE.PointLight('#ff9b4a', 7, 10, 1.2);
    fireLight.position.set(0, 0.9, 1.6);
    fp.add(fireLight);
    // 양말 셋
    const sockCols = ['#c0302c', '#2f8a52', '#3a6fd6'];
    for (let i = 0; i < 3; i++) {
      const sg = new THREE.Group();
      sg.position.set(-0.95 + i * 0.95, 2.18, 1.12);
      sg.rotation.z = (i - 1) * 0.06;
      sg.add(mesh(new THREE.BoxGeometry(0.34, 0.13, 0.11), whiteM, 0, 0, 0));
      sg.add(mesh(new THREE.BoxGeometry(0.27, 0.5, 0.09), mat(sockCols[i], { roughness: 0.9 }), 0, -0.31, 0));
      sg.add(mesh(new THREE.BoxGeometry(0.4, 0.17, 0.09), mat(sockCols[i], { roughness: 0.9 }), 0.07, -0.6, 0));
      fp.add(sg);
    }
    // 벽난로 위 가랜드 · 촛불 · 리스
    const gar = mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.3, 8), mat('#2a6e40', { roughness: 0.9, flatShading: true }), 0, 2.3, 1.12);
    gar.rotation.z = Math.PI / 2;
    fp.add(gar);
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: BULB_COLORS[i % 6], toneMapped: false }));
      b.position.set(-1.55 + i * 0.24, 2.27, 1.2);
      fp.add(b);
    }
    for (const x of [-1.35, 1.35]) {
      fp.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 10), mat('#fff8ec'), x, 2.59, 0.45));
      const cf = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: '#ffc04a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      cf.scale.set(0.16, 0.26, 1);
      cf.position.set(x, 2.82, 0.45);
      fp.add(cf);
      fireFlames.push(cf);
    }
    const wr2 = makeWreath(0.45);
    wr2.position.set(0, 3.3, 0.14);
    fp.add(wr2);
    boxBlock(INT.x, INT.z - D / 2 + 0.75, 1.65, 0.75, 0);
    INTS.fire = new THREE.Vector3(INT.x, 0, INT.z - D / 2 + 2.15);

    // 구석 트리
    const tg = new THREE.Group();
    tg.position.set(-W / 2 + 1.3, 0, -D / 2 + 1.3);
    R.add(tg);
    tg.add(mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.4, 14), mat('#c0302c', { roughness: 0.5 }), 0, 0.2, 0));
    for (let i = 0; i < 4; i++) {
      const r = 1.05 - i * 0.24, h = 1.0 - i * 0.12, y = 0.35 + i * 0.6;
      tg.add(mesh(new THREE.ConeGeometry(r, h, 12), new THREE.MeshStandardMaterial({ color: '#2b7547', roughness: 0.8, flatShading: true }), 0, y + h / 2, 0));
    }
    for (let k = 0; k < 34; k++) {
      const t = k / 34, y = 0.5 + t * 2.3, a = t * Math.PI * 2 * 3.5;
      const r = 1.0 * (1 - t * 0.78) + 0.05;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: BULB_COLORS[k % 6], toneMapped: false }));
      b.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      b.userData.base = new THREE.Color(BULB_COLORS[k % 6]);
      b.userData.ph = rnd() * 6.28;
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: BULB_COLORS[k % 6], transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
      gl.scale.setScalar(0.38);
      b.add(gl);
      b.userData.glow = gl;
      tg.add(b);
      intTreeBulbs.push(b);
    }
    intTreeHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: '#ffe2a8', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
    intTreeHalo.scale.set(3.4, 4.2, 1);
    intTreeHalo.position.y = 1.6;
    tg.add(intTreeHalo);
    tg.add(mesh(new THREE.OctahedronGeometry(0.17), new THREE.MeshStandardMaterial({ color: '#ffd54a', emissive: '#ffb300', emissiveIntensity: 0.9 }), 0, 3.05, 0));
    for (const [x, z, c1, c2] of [[0.7, 0.6, '#d63a3a', '#f4d35e'], [-0.2, 0.9, '#3a6fd6', '#ffffff'], [0.9, -0.2, '#f4d35e', '#2f8a52']]) {
      const gg = makeGift(0.5, 0.4, 0.5, c1, c2); gg.position.set(x, 0, z); gg.rotation.y = x; tg.add(gg);
    }
    circleBlock(INT.x - W / 2 + 1.3, INT.z - D / 2 + 1.3, 1.2);

    // 양옆 창문 — 바깥 눈 내리는 풍경 (눈송이 그림이 아래로 흘러갑니다)
    const viewTex = canvasTex(128, (g, S) => {
      const gr = g.createLinearGradient(0, 0, 0, S);
      gr.addColorStop(0, '#8ec5f2'); gr.addColorStop(0.62, '#e4f1fc'); gr.addColorStop(0.63, '#ffffff'); gr.addColorStop(1, '#eef4fb');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
      g.fillStyle = '#2f6e4c';
      for (let i = 0; i < 6; i++) { const x = i * 24 + 2; g.beginPath(); g.moveTo(x, 81); g.lineTo(x + 10, 46 + (i % 2) * 8); g.lineTo(x + 20, 81); g.fill(); }
    });
    viewTex.wrapS = viewTex.wrapT = THREE.ClampToEdgeWrapping;
    winFlakes = canvasTex(128, (g, S) => {
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(hash2(i, 1) * S, hash2(i, 2) * S, 1 + hash2(i, 3) * 2.2, 0, Math.PI * 2); g.fill(); }
    });
    for (const sd of [-1, 1]) {
      const wg = new THREE.Group();
      wg.position.set(sd * (W / 2 - 0.02), 2.1, -0.6);
      wg.rotation.y = -sd * Math.PI / 2;
      (sd < 0 ? WALLS.left : WALLS.right).add(wg);
      wg.add(new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.5), new THREE.MeshBasicMaterial({ map: viewTex })));
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.5), new THREE.MeshBasicMaterial({ map: winFlakes, transparent: true, depthWrite: false }));
      fl.position.z = 0.01;
      wg.add(fl);
      for (const [w, h, x, y] of [[1.9, 0.12, 0, 0.8], [1.9, 0.12, 0, -0.8], [0.12, 1.7, -0.9, 0], [0.12, 1.7, 0.9, 0], [0.07, 1.5, 0, 0], [1.7, 0.07, 0, 0]]) wg.add(mesh(new THREE.BoxGeometry(w, h, 0.1), whiteM, x, y, 0.04));
      wg.add(mesh(new THREE.BoxGeometry(2.0, 0.08, 0.3), whiteM, 0, -0.86, 0.12));
      wg.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 10), mat('#c0302c'), 0.6, -0.71, 0.14));
      const cf = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: '#ffc04a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      cf.scale.set(0.14, 0.22, 1); cf.position.set(0.6, -0.52, 0.14);
      wg.add(cf);
      fireFlames.push(cf);
      const wr3 = makeWreath(0.22); wr3.position.set(0, 0.95, 0.12); wg.add(wr3);
    }
    // 안쪽 문 (나가는 문)
    intDoor = new THREE.Group();
    intDoor.position.set(-0.55, 0, D / 2 - 0.02);
    WALLS.front.add(intDoor);
    const ip = mesh(new THREE.BoxGeometry(1.1, 2.0, 0.1), intDoorMat, 0.55, 1.0, -0.05);
    ip.userData.exit = true;
    intDoor.add(ip);
    intDoor.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), mat('#e8b23a', { metalness: 0.7, roughness: 0.3 }), 0.55 + 0.38, 1.0, -0.13));
    doorMeshes.push(ip);
    WALLS.front.add(mesh(new THREE.BoxGeometry(1.4, 0.12, 0.14), whiteM, 0, 2.06, D / 2 - 0.08));
    for (const x of [-0.64, 0.64]) WALLS.front.add(mesh(new THREE.BoxGeometry(0.12, 2.06, 0.14), whiteM, x, 1.03, D / 2 - 0.08));
    const mat2 = mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshStandardMaterial({ color: '#b8322f', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0, 0.012, D / 2 - 0.6);
    mat2.rotation.x = -Math.PI / 2; mat2.castShadow = false;
    R.add(mat2);
    INTS.door = new THREE.Vector3(INT.x, 0, INT.z + D / 2 - 1.2);

    // ---- 보통 집: 러그 · 소파 · 우유와 쿠키 · 책장
    const rugTex = canvasTex(256, (g, S) => {
      const cols = ['#c0302c', '#f6efe4', '#2f8a52', '#f6efe4', '#c0302c', '#f6efe4', '#2f8a52'];
      for (let i = 0; i < cols.length; i++) { g.fillStyle = cols[i]; g.beginPath(); g.arc(S / 2, S / 2, S / 2 * (1 - i / cols.length), 0, Math.PI * 2); g.fill(); }
    });
    rugTex.wrapS = rugTex.wrapT = THREE.ClampToEdgeWrapping;
    const rug = mesh(new THREE.CircleGeometry(2.5, 48), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0, 0.01, -0.2);
    rug.rotation.x = -Math.PI / 2; rug.scale.y = 0.75; rug.castShadow = false;
    homeStuff.add(rug);
    const sofa = new THREE.Group();
    sofa.position.set(0, 0, 1.5);
    homeStuff.add(sofa);
    const red = mat('#b8322f', { roughness: 0.92 }), red2 = mat('#c94a3f', { roughness: 0.92 });
    sofa.add(mesh(new THREE.BoxGeometry(2.7, 0.45, 1.0), red, 0, 0.25, 0));
    for (const x of [-0.63, 0.63]) sofa.add(mesh(new THREE.BoxGeometry(1.24, 0.18, 0.85), red2, x, 0.56, -0.05));
    sofa.add(mesh(new THREE.BoxGeometry(2.7, 0.85, 0.28), red, 0, 0.78, 0.4));
    for (const x of [-1.38, 1.38]) sofa.add(mesh(new THREE.BoxGeometry(0.26, 0.68, 1.0), red, x, 0.42, 0));
    const plaid = stripeTex('#2f8a52', '#f6efe4', 6, false);
    for (const x of [-0.95, 0.95]) { const pl = mesh(new THREE.BoxGeometry(0.46, 0.42, 0.15), new THREE.MeshStandardMaterial({ map: plaid, roughness: 0.95 }), x, 0.88, 0.2); pl.rotation.set(-0.2, 0, x * 0.15); sofa.add(pl); }
    homeBlocks.push(boxBlock(INT.x, INT.z + 1.5, 1.45, 0.5, 0));
    INTS.seats = [new THREE.Vector3(INT.x - 0.6, 0, INT.z + 1.45), new THREE.Vector3(INT.x + 0.6, 0, INT.z + 1.45)];
    const tb = new THREE.Group();
    tb.position.set(0, 0, -0.5);
    homeStuff.add(tb);
    tb.add(mesh(new THREE.BoxGeometry(1.3, 0.08, 0.7), wood, 0, 0.45, 0));
    for (const sx of [-0.55, 0.55]) for (const sz of [-0.27, 0.27]) tb.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 8), wood, sx, 0.21, sz));
    tb.add(mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.03, 20), whiteM, -0.25, 0.505, 0));
    for (let i = 0; i < 5; i++) {
      const ck = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 14), mat('#c98a4b', { roughness: 0.9 }), -0.25 + (i === 4 ? 0 : Math.cos(i * 1.57) * 0.11), 0.535 + (i === 4 ? 0.026 : 0), i === 4 ? 0 : Math.sin(i * 1.57) * 0.11);
      tb.add(ck);
      cookies.push(ck);
    }
    tb.add(mesh(new THREE.CylinderGeometry(0.065, 0.058, 0.22, 14), mat('#fdfdfb', { roughness: 0.3 }), 0.25, 0.6, 0));
    homeBlocks.push(boxBlock(INT.x, INT.z - 0.5, 0.65, 0.35, 0));
    INTS.table = new THREE.Vector3(INT.x + 1.3, 0, INT.z - 0.5);
    const shelf = new THREE.Group();
    shelf.position.set(W / 2 - 0.3, 0, 2.9);
    shelf.rotation.y = -Math.PI / 2;
    homeStuff.add(shelf);
    const dark = mat('#7a5236', { roughness: 0.8 });
    shelf.add(mesh(new THREE.BoxGeometry(1.6, 2.2, 0.06), dark, 0, 1.1, -0.17));
    for (const x of [-0.78, 0.78]) shelf.add(mesh(new THREE.BoxGeometry(0.05, 2.2, 0.4), dark, x, 1.1, 0));
    for (let r = 0; r < 4; r++) {
      shelf.add(mesh(new THREE.BoxGeometry(1.6, 0.05, 0.4), dark, 0, 0.1 + r * 0.6, 0));
      let x = -0.7, k = 0;
      while (x < 0.6) {
        const bw = 0.07 + hash2(r, k) * 0.07, bh = 0.32 + hash2(r + 5, k) * 0.16;
        shelf.add(mesh(new THREE.BoxGeometry(bw, bh, 0.28), mat(['#c0302c', '#2f8a52', '#3a6fd6', '#f4d35e', '#f6efe4', '#8b5a3c'][Math.floor(hash2(r * 7, k) * 6)], { roughness: 0.8 }), x + bw / 2, 0.125 + r * 0.6 + bh / 2, 0));
        x += bw + 0.012; k++;
      }
    }
    homeBlocks.push(boxBlock(INT.x + W / 2 - 0.3, INT.z + 2.9, 0.25, 0.8, 0));

    // ---- 산타의 공방: 선물 받침대 6개 · 작업대 · 선물 더미
    const models = [makeBear, makeTrain, makeGlobe, makeMusicBox, makeScarf, makeGinger];
    GIFT_ITEMS.forEach((it, i) => { it.make = models[i]; });
    const spots = [[-3.2, -0.9], [-3.2, 2.0], [-0.9, 0.4], [1.1, 0.4], [3.3, -0.4], [3.3, 2.3]];
    spots.forEach(([x, z], i) => {
      const it = GIFT_ITEMS[i];
      const st = new THREE.Group();
      st.position.set(x, 0, z);
      shopStuff.add(st);
      const ped = mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.8, 20), mat('#fbf6ee', { roughness: 0.6 }), 0, 0.4, 0);
      st.add(ped);
      st.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 24), mat(it.c1 === '#ffffff' ? '#d63a3a' : it.c1, { roughness: 0.8 }), 0, 0.82, 0));
      st.add(mesh(new THREE.TorusGeometry(0.45, 0.03, 6, 24), mat('#e8b23a', { metalness: 0.7, roughness: 0.3 }), 0, 0.6, 0).rotateX(Math.PI / 2));
      const item = models[i]();
      item.position.y = 0.85;
      st.add(item);
      const lb = makeLabel(`${it.emoji} ${it.name}`, { size: 34, scale: 0.5 });
      lb.position.y = 1.85;
      st.add(lb);
      const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: '#fff2b0', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
      spark.scale.setScalar(1.2); spark.position.y = 1.15;
      st.add(spark);
      ped.userData.station = i;
      stationMeshes.push(ped);
      const pos = new THREE.Vector3(INT.x + x, 0, INT.z + z);
      const toC = new THREE.Vector3(INT.x - pos.x, 0, INT.z + 1.5 - pos.z).normalize();
      STATIONS.push({ i, item, pos, spot: pos.clone().addScaledVector(toC, 1.15), place: { id: 'gift' + i, emoji: it.emoji, name: it.name, desc: it.desc, station: i } });
      shopBlocks.push(circleBlock(INT.x + x, INT.z + z, 0.5));
    });
    const bench = new THREE.Group();
    bench.position.set(W / 2 - 0.6, 0, -3.1);
    shopStuff.add(bench);
    bench.add(mesh(new THREE.BoxGeometry(0.9, 0.1, 2.0), wood, 0, 0.9, 0));
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) bench.add(mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), wood, sx * 0.38, 0.45, sz * 0.9));
    for (let i = 0; i < 3; i++) { const gg = makeGift(0.3, 0.25, 0.3, ['#d63a3a', '#2f8a52', '#3a6fd6'][i], '#f4d35e'); gg.position.set(0, 0.95, -0.6 + i * 0.55); bench.add(gg); }
    shopBlocks.push(boxBlock(INT.x + W / 2 - 0.6, INT.z - 3.1, 0.45, 1.0, 0));
    for (let i = 0; i < 8; i++) {
      const gg = makeGift(0.5, 0.42, 0.5, ['#2f8a52', '#3a6fd6', '#f4d35e', '#d63a3a', '#ff8fb1', '#ffffff', '#9b59b6', '#d63a3a'][i], ['#f4d35e', '#ffffff', '#d63a3a', '#ffffff', '#ffffff', '#d63a3a', '#ffffff', '#2f8a52'][i]);
      gg.position.set(-W / 2 + 0.55 + (i % 2) * 0.55, i >= 6 ? 0.43 : 0, 3.6 - Math.floor(i / 2) * 0.55);
      gg.rotation.y = i * 0.7;
      shopStuff.add(gg);
    }
    shopBlocks.push(boxBlock(INT.x - W / 2 + 0.8, INT.z + 2.8, 0.6, 1.1, 0));
    const banner = makeSign('🎁 산타의 선물 공방 — 마음에 드는 선물을 골라 보세요!', 4.6, 0.5, '#fff6e6', '#b82a2a');
    banner.position.set(-W / 2 + 0.12, 3.62, -0.6);
    banner.rotation.y = Math.PI / 2;
    WALLS.left.add(banner);
    shopBanner = banner;
    shopStuff.visible = false;
    for (const b of shopBlocks) b.off = true;
  }
  function makeBear() {
    const bear = new THREE.Group();
    const bm = mat('#b07a4a', { roughness: 1 });
    bear.add(mesh(new THREE.SphereGeometry(0.17, 12, 10), bm, 0, 0.17, 0));
    bear.add(mesh(new THREE.SphereGeometry(0.13, 12, 10), bm, 0, 0.42, 0));
    for (const sd of [-1, 1]) {
      bear.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), bm, sd * 0.1, 0.53, 0));
      bear.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), bm, sd * 0.15, 0.2, 0.06));
      bear.add(mesh(new THREE.SphereGeometry(0.018, 6, 5), mat('#1c1820'), sd * 0.045, 0.45, 0.12));
    }
    bear.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), mat('#e8d6bf'), 0, 0.4, 0.12));
    const bow = mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12), mat('#c0302c'), 0, 0.31, 0.02);
    bow.rotation.x = Math.PI / 2;
    bear.add(bow);
    return bear;
  }
  function makeTrain() {
    const train = new THREE.Group();
    train.add(mesh(new THREE.BoxGeometry(0.4, 0.2, 0.2), mat('#c0302c', { roughness: 0.4 }), 0, 0.14, 0));
    train.add(mesh(new THREE.BoxGeometry(0.16, 0.18, 0.2), mat('#3a6fd6', { roughness: 0.4 }), -0.13, 0.32, 0));
    train.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.14, 8), mat('#1e1a1f'), 0.12, 0.3, 0));
    for (const x of [-0.12, 0.12]) for (const z of [-0.11, 0.11]) { const wh = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), mat('#f4d35e'), x, 0.06, z); wh.rotation.x = Math.PI / 2; train.add(wh); }
    return train;
  }
  function makeGlobe() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.12, 20), mat('#c0302c', { roughness: 0.4 }), 0, 0.06, 0));
    g.add(mesh(new THREE.ConeGeometry(0.07, 0.18, 8), mat('#2f7a4c', { flatShading: true }), 0, 0.24, 0));
    g.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), whiteM, 0.07, 0.15, 0.04));
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 16), new THREE.MeshStandardMaterial({ color: '#dff2ff', transparent: true, opacity: 0.32, roughness: 0.02, metalness: 0.1, envMapIntensity: 1.5, depthWrite: false }));
    glass.position.y = 0.28;
    g.add(glass);
    return g;
  }
  function makeMusicBox() {
    const g = new THREE.Group();
    const wd = new THREE.MeshStandardMaterial({ map: woodTex, color: '#e0b07a', roughness: 0.5 });
    g.add(mesh(new THREE.BoxGeometry(0.36, 0.16, 0.26), wd, 0, 0.08, 0));
    const lid = mesh(new THREE.BoxGeometry(0.36, 0.03, 0.26), wd, 0, 0.27, -0.12);
    lid.rotation.x = -1.2;
    g.add(lid);
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.25, 10), mat('#e8b23a', { metalness: 0.8, roughness: 0.2 }), 0, 0.18, 0).rotateZ(Math.PI / 2));
    g.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), mat('#ff8fb1'), 0, 0.25, 0.05));
    return g;
  }
  function makeScarf() {
    const g = new THREE.Group();
    const st = stripeTex('#d63a3a', '#ffffff', 8, false);
    const sm = new THREE.MeshStandardMaterial({ map: st, roughness: 0.95 });
    const ring = mesh(new THREE.TorusGeometry(0.15, 0.06, 8, 20), sm, 0, 0.12, 0);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    for (const sd of [-1, 1]) { const tl = mesh(new THREE.BoxGeometry(0.1, 0.03, 0.3), sm, sd * 0.07, 0.04, 0.24); tl.rotation.y = sd * 0.2; g.add(tl); }
    return g;
  }
  function makeGinger() {
    const g = new THREE.Group();
    const gm = mat('#b5713a', { roughness: 0.9 });
    const body = new THREE.Group();
    body.add(mesh(new THREE.SphereGeometry(0.1, 12, 10), gm, 0, 0.42, 0));
    body.add(mesh(new THREE.CapsuleGeometry(0.09, 0.12, 4, 10), gm, 0, 0.24, 0));
    for (const sd of [-1, 1]) {
      const arm = mesh(new THREE.CapsuleGeometry(0.04, 0.12, 4, 8), gm, sd * 0.13, 0.28, 0); arm.rotation.z = sd * 1.0; body.add(arm);
      const leg = mesh(new THREE.CapsuleGeometry(0.045, 0.12, 4, 8), gm, sd * 0.06, 0.08, 0); leg.rotation.z = sd * 0.25; body.add(leg);
      body.add(mesh(new THREE.SphereGeometry(0.015, 6, 5), mat('#2a2335'), sd * 0.035, 0.44, 0.09));
    }
    for (let i = 0; i < 3; i++) body.add(mesh(new THREE.SphereGeometry(0.018, 6, 5), mat(i === 1 ? '#2f8a52' : '#d63a3a'), 0, 0.3 - i * 0.07, 0.085));
    body.scale.z = 0.45;
    g.add(body);
    return g;
  }
  const chimneys = [];
  for (const [x, z, wall, roof] of HOUSES_AT) {
    const hz = makeHouse({ w: 5 + rnd() * 1.4, d: 4.6 + rnd(), h: 3 + rnd() * 0.6, wall, roof, door: pick(['#2f6b4a', '#b93b3b', '#3a5a8a']) });
    placeHouse(hz, x, z);
    registerHouse(hz, HOUSE_NAMES[HOUSE_LIST.length], wall);
    if (rnd() < 0.6) chimneys.push(hz.localToWorld(hz.userData.chimney.clone()));
  }

  // ------------------------------------------------------------------
  // 산타의 선물 공방 + 열어 볼 선물
  // ------------------------------------------------------------------
  const WS = placeById.workshop;
  const giftOpen = { g: null, lid: null, t: -1, colorI: 0 };
  {
    const house = makeHouse({ w: 7.4, d: 6, h: 3.8, wall: '#c0352f', roof: '#2f6b4a', door: '#2f6b4a', trim: '#f4d35e' });
    const ry = placeHouse(house, WS.x - Math.sin(Math.atan2(-WS.x, -WS.z)) * 2.5, WS.z - Math.cos(Math.atan2(-WS.x, -WS.z)) * 2.5);
    chimneys.push(house.localToWorld(house.userData.chimney.clone()));
    registerHouse(house, '산타의 선물 공방', '#c0352f', true);
    // 간판
    const sign = makeSign('🎁 산타의 선물 공방', 3.6, 0.8, '#f8f1e2', '#b82a2a');
    sign.position.set(0, 3.15, 3.12);
    house.add(sign);
    const dir = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    WS.front = dir;
    // 문 앞 커다란 선물
    const gx = house.position.x + dir.x * 5.4, gz = house.position.z + dir.z * 5.4;
    const big = new THREE.Group();
    big.position.set(gx, 0, gz);
    big.rotation.y = ry;
    scene.add(big);
    giftOpen.g = big;
    buildBigGift();
    circleBlock(gx, gz, 0.9);
    WS.go = [gx + dir.x * 2.1, gz + dir.z * 2.1];
    WS.giftPos = new THREE.Vector3(gx, 1.2, gz);
    // 공방 옆 쌓인 선물 · 나무 썰매
    for (let i = 0; i < 6; i++) {
      const side = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
      const k = 4.6 + (i % 3) * 0.9, up = i >= 3 ? 1 : 0;
      const gg = makeGift(0.8, 0.7, 0.8, ['#2f8a52', '#3a6fd6', '#f4d35e', '#d63a3a', '#ffffff', '#ff8fb1'][i], ['#f4d35e', '#ffffff', '#d63a3a', '#ffffff', '#2f8a52', '#ffffff'][i]);
      gg.position.set(house.position.x + side.x * k + dir.x * 2.2, up * 0.72, house.position.z + side.z * k + dir.z * 2.2);
      gg.rotation.y = rnd();
      scene.add(gg);
    }
    circleBlock(house.position.x + Math.cos(ry) * 5.5 + dir.x * 2.2, house.position.z - Math.sin(ry) * 5.5 + dir.z * 2.2, 1.4);
  }
  function buildBigGift() {
    const g = giftOpen.g;
    while (g.children.length) g.remove(g.children[0]);
    const C = [['#d63a3a', '#f4d35e'], ['#2f8a52', '#ffffff'], ['#3a6fd6', '#f4d35e'], ['#f4d35e', '#d63a3a'], ['#ff8fb1', '#ffffff']][giftOpen.colorI % 5];
    const box = makeGift(1.3, 1.05, 1.3, C[0], C[1]);
    // 뚜껑은 따로 (리본 매듭 포함)
    box.children.slice(3).forEach((c) => box.remove(c));
    g.add(box);
    const lid = new THREE.Group();
    lid.position.y = 1.05;
    lid.add(mesh(new THREE.BoxGeometry(1.42, 0.26, 1.42), mat(C[0], { roughness: 0.55 }), 0, 0.1, 0));
    lid.add(mesh(new THREE.BoxGeometry(1.44, 0.27, 0.18), mat(C[1], { roughness: 0.35 }), 0, 0.1, 0));
    lid.add(mesh(new THREE.BoxGeometry(0.18, 0.27, 1.44), mat(C[1], { roughness: 0.35 }), 0, 0.1, 0));
    for (const s of [-1, 1]) {
      const bow = mesh(new THREE.TorusGeometry(0.22, 0.07, 8, 16), mat(C[1], { roughness: 0.35 }), s * 0.2, 0.36, 0);
      bow.rotation.z = s * 0.6; bow.scale.z = 0.6;
      lid.add(bow);
    }
    g.add(lid);
    giftOpen.lid = lid;
    giftOpen.t = -1;
  }
  function makeSign(text, w, h, bg, fg) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = Math.round(512 * h / w);
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#2f6b4a'; g.lineWidth = 14; g.strokeRect(7, 7, c.width - 14, c.height - 14);
    g.fillStyle = fg;
    g.font = `800 ${Math.round(c.height * 0.48)}px "Malgun Gothic", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
    return m;
  }

  // ------------------------------------------------------------------
  // 코코아 노점
  // ------------------------------------------------------------------
  const CO = placeById.cocoa;
  const steamSpots = [];
  {
    const g = new THREE.Group();
    g.position.set(CO.x, 0, CO.z);   // 앞(+z)이 트리를 봅니다
    scene.add(g);
    const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 });
    g.add(mesh(new THREE.BoxGeometry(3.6, 1.1, 1.0), wood, 0, 0.55, 0.3));
    g.add(mesh(new THREE.BoxGeometry(3.8, 0.1, 1.2), mat('#f7f2e8', { roughness: 0.6 }), 0, 1.15, 0.3));
    for (const sx of [-1.7, 1.7]) for (const sz of [-0.9, 0.7]) g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 8), mat('#7a5236'), sx, 1.5, sz));
    // 줄무늬 차양
    const aw = stripeTex('#ffffff', '#d63a3a', 8, false);
    aw.repeat.set(2, 1);
    const awning = mesh(new THREE.BoxGeometry(4.2, 0.08, 2.4), new THREE.MeshStandardMaterial({ map: aw, roughness: 0.7 }), 0, 3.05, -0.05);
    awning.rotation.x = 0.22;
    g.add(awning);
    const awSnow = mesh(new THREE.BoxGeometry(4.2, 0.1, 2.3), snowM, 0, 3.14, -0.07);
    awSnow.rotation.x = 0.22;
    g.add(awSnow);
    // 차양 끝 물결 장식
    for (let i = 0; i < 9; i++) {
      const sc = mesh(new THREE.SphereGeometry(0.24, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(i % 2 ? '#d63a3a' : '#ffffff', { roughness: 0.7, side: THREE.DoubleSide }), -1.9 + i * 0.475, 2.83, 1.1);
      sc.scale.set(1, 0.7, 0.3);
      g.add(sc);
    }
    const sign = makeSign('☕ 따끈한 코코아', 2.6, 0.6, '#fff6e6', '#7a3b1e');
    sign.position.set(0, 0.6, 0.81);
    g.add(sign);
    // 냄비 · 컵들
    g.add(mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.42, 16), mat('#b5463a', { roughness: 0.4, metalness: 0.3 }), -1.1, 1.41, 0.25));
    steamSpots.push(new THREE.Vector3(CO.x - 1.1, 1.7, CO.z + 0.25));
    for (let i = 0; i < 4; i++) {
      const cup = makeMug(['#ffffff', '#d63a3a', '#2f8a52', '#ffffff'][i]);
      cup.position.set(0.1 + i * 0.42, 1.2, 0.55);
      g.add(cup);
    }
    // 지팡이 사탕 두 개
    for (const sx of [-2.2, 2.2]) { const c = makeCane(1.4); c.position.set(sx, 0, 1.1); c.rotation.y = sx > 0 ? Math.PI : 0; g.add(c); }
    boxBlock(CO.x, CO.z, 2.0, 1.2, 0);
    CO.go = [CO.x + 0.6, CO.z + 2.6];
    CO.counter = new THREE.Vector3(CO.x + 0.6, 0, CO.z + 1.75);   // 계산대 바로 앞
    for (const sx of [-1, 1]) bulbLine(new THREE.Vector3(CO.x - 2.05, 2.92, CO.z + 1.15), new THREE.Vector3(CO.x + 2.05, 2.92, CO.z + 1.15), 0.25, 14);
  }
  function makeMug(color) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.2, 14), mat(color, { roughness: 0.4 }), 0, 0.1, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 14), mat('#6b3b22', { roughness: 0.3 }), 0, 0.19, 0));
    const handle = mesh(new THREE.TorusGeometry(0.05, 0.016, 6, 12), mat(color, { roughness: 0.4 }), 0.1, 0.1, 0);
    g.add(handle);
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.04, 0.05), whiteM, 0.02, 0.21, 0.01));
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.04, 0.05), whiteM, -0.03, 0.21, -0.02));
    return g;
  }
  function makeCane(h = 1.3) {
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push(new THREE.Vector3(0, (i / 10) * h, 0));
    for (let i = 1; i <= 10; i++) { const a = (i / 10) * Math.PI; pts.push(new THREE.Vector3(0.22 - Math.cos(a) * 0.22, h + Math.sin(a) * 0.22, 0)); }
    pts.push(new THREE.Vector3(0.44, h - 0.12, 0));
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 48, 0.07, 10, false);
    return mesh(geo, new THREE.MeshStandardMaterial({ map: caneTex, roughness: 0.3 }));
  }

  // ------------------------------------------------------------------
  // 눈사람 마당
  // ------------------------------------------------------------------
  const SM = placeById.snowman;
  const snowMan = { stage: 0, parts: [], grow: [] };
  function makeSnowman(s = 1) {
    const g = new THREE.Group();
    const sm = mat('#fbfdff', { roughness: 0.75 });
    const b1 = mesh(new THREE.SphereGeometry(0.75 * s, 22, 16), sm, 0, 0.62 * s, 0);
    const b2 = mesh(new THREE.SphereGeometry(0.55 * s, 22, 16), sm, 0, 1.62 * s, 0);
    const b3 = mesh(new THREE.SphereGeometry(0.4 * s, 22, 16), sm, 0, 2.38 * s, 0);
    g.add(b1, b2, b3);
    addSnowmanFace(g, s);
    return g;
  }
  function addSnowmanFace(g, s, parts) {
    const add = (o) => { g.add(o); if (parts) parts.push(o); return o; };
    const coal = mat('#26222a', { roughness: 0.6 });
    const face = new THREE.Group();
    for (const sx of [-1, 1]) face.add(mesh(new THREE.SphereGeometry(0.05 * s, 8, 6), coal, sx * 0.13 * s, 2.47 * s, 0.35 * s));
    const nose = mesh(new THREE.ConeGeometry(0.06 * s, 0.32 * s, 10), mat('#f28a2e', { roughness: 0.6 }), 0, 2.38 * s, 0.53 * s);
    nose.rotation.x = Math.PI / 2;
    face.add(nose);
    for (let i = 0; i < 5; i++) {
      const a = -0.6 + i * 0.3;
      face.add(mesh(new THREE.SphereGeometry(0.03 * s, 6, 5), coal, Math.sin(a) * 0.18 * s, 2.24 * s - Math.cos(a) * 0.04 * s, 0.35 * s));
    }
    for (let i = 0; i < 3; i++) face.add(mesh(new THREE.SphereGeometry(0.05 * s, 8, 6), coal, 0, (1.42 + i * 0.22) * s, 0.53 * s - Math.abs(i - 1) * 0.03 * s));
    add(face);
    const acc = new THREE.Group();
    const scarf = mesh(new THREE.TorusGeometry(0.36 * s, 0.09 * s, 8, 20), mat('#d63a3a', { roughness: 0.8 }), 0, 2.06 * s, 0);
    scarf.rotation.x = Math.PI / 2;
    acc.add(scarf);
    const tail = mesh(new THREE.BoxGeometry(0.16 * s, 0.5 * s, 0.06 * s), mat('#d63a3a', { roughness: 0.8 }), 0.22 * s, 1.85 * s, 0.32 * s);
    tail.rotation.z = 0.25;
    acc.add(tail);
    const hat = new THREE.Group();
    hat.add(mesh(new THREE.CylinderGeometry(0.36 * s, 0.36 * s, 0.05 * s, 18), coal, 0, 0, 0));
    hat.add(mesh(new THREE.CylinderGeometry(0.24 * s, 0.25 * s, 0.4 * s, 18), coal, 0, 0.2 * s, 0));
    hat.add(mesh(new THREE.CylinderGeometry(0.255 * s, 0.255 * s, 0.08 * s, 18), mat('#2f8a52'), 0, 0.06 * s, 0));
    hat.position.set(0, 2.72 * s, 0);
    hat.rotation.z = 0.15;
    acc.add(hat);
    for (const sx of [-1, 1]) {
      const arm = mesh(new THREE.CylinderGeometry(0.025 * s, 0.035 * s, 0.9 * s, 6), mat('#6b4a32'), sx * 0.85 * s, 1.85 * s, 0);
      arm.rotation.z = sx * -1.0;
      acc.add(arm);
      const twig = mesh(new THREE.CylinderGeometry(0.015 * s, 0.02 * s, 0.25 * s, 5), mat('#6b4a32'), sx * 1.2 * s, 2.12 * s, 0);
      twig.rotation.z = sx * -0.2;
      acc.add(twig);
    }
    add(acc);
    return [face, acc];
  }
  {
    // 완성된 큰 눈사람 (마당 지킴이)
    const big = makeSnowman(1.35);
    big.position.set(SM.x + 2.6, 0, SM.z - 2.2);
    big.rotation.y = Math.atan2(-SM.x, -SM.z) - 0.3;
    scene.add(big);
    circleBlock(SM.x + 2.6, SM.z - 2.2, 1.1);
    // 작은 눈사람 둘
    for (const [dx, dz, s] of [[-3.2, -2.6, 0.6], [-4.0, -1.6, 0.45]]) {
      const m = makeSnowman(s);
      m.position.set(SM.x + dx, 0, SM.z + dz);
      m.rotation.y = Math.atan2(-SM.x, -SM.z) + 0.4;
      scene.add(m);
      circleBlock(SM.x + dx, SM.z + dz, 0.5 * s + 0.1);
    }
    // 눈뭉치 더미
    for (let i = 0; i < 9; i++) {
      const b = mesh(new THREE.SphereGeometry(0.16, 10, 8), snowM, SM.x - 1 + (i % 3) * 0.3 + (i > 5 ? 0.15 : 0), 0.14 + Math.floor(i / 3) * 0.24, SM.z + 2.4 + (i % 2) * 0.1);
      scene.add(b);
    }
    circleBlock(SM.x - 0.62, SM.z + 2.45, 0.45);
    // 내가 만들 눈사람 자리
    SM.build = new THREE.Vector3(SM.x - 0.4, 0, SM.z - 0.6);
    SM.go = [SM.x - 0.4, SM.z + 1.4];
    const ring = mesh(new THREE.RingGeometry(0.9, 1.05, 32), new THREE.MeshBasicMaterial({ color: '#bfe0ff', transparent: true, opacity: 0.6 }), SM.build.x, 0.03, SM.build.z);
    ring.rotation.x = -Math.PI / 2;
    ring.castShadow = false;
    scene.add(ring);
    SM.ring = ring;
    const sign = makeSign('☃️ 눈사람 마당', 2.2, 0.55, '#ffffff', '#2f6b4a');
    const post = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), mat('#7a5236'), SM.x - 3, 0.8, SM.z + 3);
    scene.add(post);
    sign.position.set(SM.x - 3, 1.7, SM.z + 3.04);
    sign.rotation.y = Math.atan2(-SM.x + 3, -SM.z - 3) * 0 + 0;
    scene.add(sign);
  }

  // ------------------------------------------------------------------
  // 산타의 썰매 + 순록
  // ------------------------------------------------------------------
  const SL = placeById.sleigh;
  {
    const g = new THREE.Group();
    g.position.set(SL.x - 2.2, 0, SL.z + 0.5);
    // 썰매 앞(+x)이 마을 가운데를 도는 원의 접선 — '한 바퀴 날기'가 그대로 이어지도록
    const ry = Math.atan2(g.position.x, g.position.z);
    g.rotation.order = 'YZX';
    g.rotation.y = ry;
    scene.add(g);
    SL.group = g;
    SL.home = { pos: g.position.clone(), ry };
    const red = mat('#c62828', { roughness: 0.35, metalness: 0.1 });
    const gold = mat('#e8b23a', { roughness: 0.25, metalness: 0.75 });
    // 옆모습 — 앞이 동그랗게 말려 올라간 썰매
    const sh = new THREE.Shape();
    sh.moveTo(-1.7, 0.45);
    sh.lineTo(1.1, 0.45);
    sh.bezierCurveTo(1.7, 0.45, 2.0, 0.9, 1.85, 1.35);
    sh.bezierCurveTo(1.75, 1.6, 1.45, 1.55, 1.5, 1.3);
    sh.bezierCurveTo(1.55, 1.1, 1.3, 1.0, 1.0, 1.05);
    sh.lineTo(-1.1, 1.05);
    sh.bezierCurveTo(-1.4, 1.1, -1.5, 1.6, -1.75, 1.75);
    sh.bezierCurveTo(-2.0, 1.85, -2.05, 1.5, -1.85, 1.3);
    sh.lineTo(-1.7, 0.45);
    for (const s of [-1, 1]) {
      const side = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
      g.add(mesh(side, red, 0, 0, s * 0.62 - 0.06));
    }
    g.add(mesh(new THREE.BoxGeometry(2.9, 0.12, 1.24), red, -0.25, 0.5, 0));
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.65, 1.24), red, -1.55, 0.8, 0));
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.5, 1.24), red, 1.0, 0.75, 0));
    // 좌석 (벨벳)
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.2, 1.1), mat('#7a1717', { roughness: 0.9 }), -0.55, 0.92, 0));
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.7, 1.1), mat('#7a1717', { roughness: 0.9 }), -1.05, 1.25, 0));
    // 금테
    for (const s of [-1, 1]) {
      const trim = mesh(new THREE.BoxGeometry(2.3, 0.06, 0.05), gold, -0.05, 1.07, s * 0.66);
      g.add(trim);
    }
    // 썰매 날
    for (const s of [-1, 1]) {
      const pts = [new THREE.Vector3(-1.9, 0.12, 0), new THREE.Vector3(0.8, 0.08, 0), new THREE.Vector3(1.6, 0.18, 0), new THREE.Vector3(2.05, 0.55, 0), new THREE.Vector3(1.85, 0.8, 0)];
      const runner = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.05, 8, false), gold, 0, 0, s * 0.55);
      g.add(runner);
      for (const x of [-1.3, -0.2, 0.8]) g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 6), gold, x, 0.3, s * 0.55));
    }
    // 선물 자루
    const sack = mesh(new THREE.SphereGeometry(0.62, 16, 12), mat('#8b5a2b', { roughness: 0.95 }), -1.25, 1.35, 0);
    sack.scale.set(0.8, 1.05, 0.85);
    g.add(sack);
    const g1 = makeGift(0.4, 0.4, 0.4, '#2f8a52', '#ffffff'); g1.position.set(-1.15, 1.85, 0.15); g1.rotation.set(0.2, 0.5, 0.15); g.add(g1);
    const g2 = makeGift(0.32, 0.3, 0.32, '#3a6fd6', '#f4d35e'); g2.position.set(-1.35, 1.88, -0.2); g2.rotation.set(-0.2, 0.2, -0.2); g.add(g2);
    const g3 = makeGift(0.5, 0.45, 0.5, '#d63a3a', '#f4d35e'); g3.position.set(0.35, 0.56, 0.05); g3.rotation.y = 0.4; g.add(g3);
    // 순록 넷
    const deer = [];
    for (let i = 0; i < 4; i++) {
      const r = makeReindeer();
      r.position.set(3.0 + Math.floor(i / 2) * 2.0, 0, (i % 2 ? 0.55 : -0.55));
      g.add(r);
      deer.push(r);
    }
    SL.deer = deer;
    // 고삐
    const reinM = new THREE.LineBasicMaterial({ color: '#7a1717' });
    for (const s of [-1, 1]) {
      const pts = [new THREE.Vector3(0.6, 1.25, s * 0.35), new THREE.Vector3(3.3, 1.3, s * 0.55), new THREE.Vector3(5.3, 1.35, s * 0.55)];
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), reinM));
    }
    g.updateMatrixWorld(true);
    // 충돌 — 썰매와 순록 전체를 회전 상자 하나로
    const c = g.localToWorld(new THREE.Vector3(1.8, 0, 0));
    boxBlock(c.x, c.z, 4.3, 1.0, ry);
    // 앉는 자리
    SL.seat = g.localToWorld(new THREE.Vector3(-0.5, 0, 0));
    SL.seatRy = ry + Math.PI / 2;
    SL.seatY = 1.02;
    const side = new THREE.Vector3(-Math.sin(ry), 0, -Math.cos(ry));   // 썰매 왼쪽(-z 로컬 → 월드)
    const sideW = g.localToWorld(new THREE.Vector3(-0.5, 0, 1.0)).sub(g.position).normalize().multiplyScalar(0);
    SL.go = [SL.seat.x + Math.sin(ry) * 2.0 + sideW.x, SL.seat.z + Math.cos(ry) * 2.0 + sideW.z];
    void side;
    // 썰매 아래 바퀴 자국
    for (let k = 0; k < 2; k++) {
      const tr = mesh(new THREE.PlaneGeometry(9, 0.18), new THREE.MeshBasicMaterial({ color: '#d7e4f2', transparent: true, opacity: 0.8, depthWrite: false }), 0, 0, 0);
      tr.rotation.x = -Math.PI / 2;
      tr.castShadow = false;
      const pos = g.localToWorld(new THREE.Vector3(-6, 0.025, k ? 0.55 : -0.55));
      tr.position.copy(pos);
      tr.rotation.z = ry;
      scene.add(tr);
    }
  }
  function makeReindeer() {
    const g = new THREE.Group();
    const fur = mat('#8a5a3c', { roughness: 0.9 });
    const light = mat('#e8d6bf', { roughness: 0.9 });
    const dark = mat('#3b2a20', { roughness: 0.7 });
    const body = mesh(new THREE.CapsuleGeometry(0.32, 0.8, 6, 12), fur, 0, 1.05, 0);
    body.rotation.z = Math.PI / 2;
    g.add(body);
    const belly = mesh(new THREE.CapsuleGeometry(0.24, 0.6, 6, 10), light, 0, 0.92, 0);
    belly.rotation.z = Math.PI / 2;
    g.add(belly);
    const legs = [];
    for (const lx of [-0.42, 0.42]) for (const lz of [-0.17, 0.17]) {
      const hip = new THREE.Group();
      hip.position.set(lx, 0.95, lz);
      hip.add(mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.85, 8), fur, 0, -0.42, 0));
      hip.add(mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.1, 8), dark, 0, -0.88, 0));
      g.add(hip);
      legs.push(hip);
    }
    const neck = new THREE.Group();
    neck.position.set(0.55, 1.2, 0);
    g.add(neck);
    const n = mesh(new THREE.CapsuleGeometry(0.15, 0.45, 5, 10), fur, 0.12, 0.25, 0);
    n.rotation.z = -0.5;
    neck.add(n);
    const head = new THREE.Group();
    head.position.set(0.3, 0.6, 0);
    neck.add(head);
    const skull = mesh(new THREE.SphereGeometry(0.2, 14, 10), fur, 0, 0, 0);
    head.add(skull);
    const snout = mesh(new THREE.CapsuleGeometry(0.11, 0.18, 5, 10), light, 0.2, -0.06, 0);
    snout.rotation.z = Math.PI / 2;
    head.add(snout);
    head.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), dark, 0.37, -0.04, 0));
    for (const s of [-1, 1]) {
      head.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), mat('#1c1820'), 0.12, 0.06, s * 0.16));
      const ear = mesh(new THREE.SphereGeometry(0.07, 8, 6), fur, -0.05, 0.12, s * 0.2);
      ear.scale.set(0.5, 0.9, 1.5);
      head.add(ear);
      // 뿔
      const am = mat('#d8c3a0', { roughness: 0.8 });
      const a1 = mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.42, 6), am, -0.05, 0.36, s * 0.14);
      a1.rotation.set(s * 0.35, 0, 0.25);
      head.add(a1);
      const a2 = mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.24, 6), am, 0.04, 0.42, s * 0.2);
      a2.rotation.set(s * 0.2, 0, -0.6);
      head.add(a2);
      const a3 = mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.2, 6), am, -0.12, 0.55, s * 0.22);
      a3.rotation.set(s * 0.6, 0, 0.5);
      head.add(a3);
    }
    const tail = mesh(new THREE.SphereGeometry(0.09, 8, 6), light, -0.68, 1.15, 0);
    g.add(tail);
    // 마구 — 빨간 띠와 금방울
    const strap = mesh(new THREE.TorusGeometry(0.34, 0.04, 6, 18), mat('#c62828', { roughness: 0.5 }), 0.3, 1.05, 0);
    strap.rotation.y = Math.PI / 2;
    g.add(strap);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i - 2) * 0.35;
      g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), mat('#e8b23a', { metalness: 0.8, roughness: 0.25 }), 0.32, 1.05 + Math.cos(a) * 0.36, Math.sin(a) * 0.36));
    }
    g.userData = { legs, head, neck, t: rnd() * 10 };
    return g;
  }

  // ------------------------------------------------------------------
  // 꽁꽁 스케이트장
  // ------------------------------------------------------------------
  {
    const iceTex = canvasTex(512, (g, S) => {
      g.fillStyle = '#cfe8f8'; g.fillRect(0, 0, S, S);
      const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, 'rgba(120,180,225,.35)'); gr.addColorStop(1, 'rgba(255,255,255,.5)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
      // 스케이트 자국
      g.strokeStyle = 'rgba(255,255,255,.55)';
      for (let i = 0; i < 70; i++) {
        g.lineWidth = 0.6 + Math.random() * 1.2;
        g.beginPath();
        const r = S * (0.15 + Math.random() * 0.3), a = Math.random() * 6.28, l = 0.5 + Math.random() * 1.6;
        g.ellipse(S / 2, S / 2, r * 1.1, r * 0.85, Math.random() * 0.3, a, a + l);
        g.stroke();
      }
    });
    iceTex.wrapS = iceTex.wrapT = THREE.ClampToEdgeWrapping;
    const ice = mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ map: iceTex, roughness: 0.06, metalness: 0.15, envMapIntensity: 1.3, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), POND.x, 0.03, POND.z);
    ice.rotation.x = -Math.PI / 2;
    ice.scale.set(POND.rx, POND.rz, 1);
    ice.castShadow = false;
    scene.add(ice);
    walkables.push(ice);
    // 눈둑
    const bank = mesh(new THREE.TorusGeometry(1, 0.06, 8, 72), snowM, POND.x, 0.02, POND.z);
    bank.rotation.x = -Math.PI / 2;
    bank.scale.set(POND.rx + 0.15, POND.rz + 0.15, 4);
    scene.add(bank);
    // 둘레에 기둥과 전구
    const posts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const x = POND.x + Math.cos(a) * (POND.rx + 1.0), z = POND.z + Math.sin(a) * (POND.rz + 1.0);
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.atan2(-(POND.z), -(POND.x)) ) < 0.35) { posts.push(null); continue; }   // 입구
      scene.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 8), mat('#2f6b4a'), x, 1.1, z));
      scene.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), mat('#f4d35e', { metalness: 0.6, roughness: 0.3 }), x, 2.25, z));
      circleBlock(x, z, 0.12);
      posts.push(new THREE.Vector3(x, 2.15, z));
    }
    for (let i = 0; i < posts.length; i++) {
      const a = posts[i], b = posts[(i + 1) % posts.length];
      if (a && b) bulbLine(a, b, 0.35, 10);
    }
    // 벤치
    const bench = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 });
    bench.add(mesh(new THREE.BoxGeometry(2.0, 0.1, 0.5), wood, 0, 0.5, 0));
    bench.add(mesh(new THREE.BoxGeometry(2.0, 0.4, 0.08), wood, 0, 0.8, -0.23));
    bench.add(mesh(new THREE.BoxGeometry(2.1, 0.08, 0.6), snowM, 0, 0.57, 0.02));
    for (const s of [-0.85, 0.85]) bench.add(mesh(new THREE.BoxGeometry(0.08, 0.5, 0.45), mat('#2b2b33'), s, 0.25, 0));
    bench.position.set(POND.x + 3, 0, POND.z + POND.rz + 2.2);
    bench.rotation.y = Math.PI;
    scene.add(bench);
    boxBlock(bench.position.x, bench.position.z, 1.0, 0.3, Math.PI);
    const sign = makeSign('⛸ 꽁꽁 스케이트장', 2.4, 0.55, '#ffffff', '#3a5a8a');
    const ang = Math.atan2(-POND.x, -POND.z);
    const ex = POND.x + Math.sin(ang) * (POND.rx + 0.4) , ez = POND.z + Math.cos(ang) * (POND.rz + 1.6);
    scene.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.7, 8), mat('#7a5236'), ex - 1.6, 0.85, ez));
    sign.position.set(ex - 1.6, 1.75, ez + 0.04);
    sign.rotation.y = -0.6;
    scene.add(sign);
    placeById.pond.go = [POND.x - POND.rx * 0.55, POND.z - POND.rz * 0.25];
  }

  // ------------------------------------------------------------------
  // 광장 가로등 · 줄 전구 · 지팡이 사탕
  // ------------------------------------------------------------------
  {
    const lamps = [];
    const N = 8;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + Math.PI / N;
      const x = Math.sin(a) * 10.9, z = Math.cos(a) * 10.9;
      if (nearPath(x, z, -0.6) && Math.hypot(x, z) > 12) continue;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.35, 10), mat('#1f3b2c', { roughness: 0.5, metalness: 0.4 }), 0, 0.17, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.3, 10), mat('#1f3b2c', { roughness: 0.5, metalness: 0.4 }), 0, 1.8, 0));
      g.add(mesh(new THREE.BoxGeometry(0.38, 0.5, 0.38), new THREE.MeshStandardMaterial({ color: '#fff3c8', emissive: '#ffcf6a', emissiveIntensity: 0.7 }), 0, 3.6, 0));
      g.add(mesh(new THREE.ConeGeometry(0.34, 0.3, 4), mat('#1f3b2c', { roughness: 0.5, metalness: 0.4 }), 0, 4.0, 0).rotateY(Math.PI / 4));
      g.add(mesh(new THREE.ConeGeometry(0.28, 0.16, 4), snowM, 0, 4.12, 0).rotateY(Math.PI / 4));
      const wr = makeWreath(0.3);
      wr.position.set(0, 2.5, 0);
      wr.rotation.y = a;
      g.add(wr);
      scene.add(g);
      circleBlock(x, z, 0.25);
      lamps.push(new THREE.Vector3(x, 3.3, z));
    }
    // 가로등 → 트리 꼭대기로 이어지는 줄 전구 (광장을 덮는 지붕처럼)
    for (const l of lamps) bulbLine(l, new THREE.Vector3(l.x * 0.12, 9.6, l.z * 0.12), -0.6, 22);
    // 길 입구마다 지팡이 사탕 한 쌍
    for (const p of PLACES) {
      if (!p.pathLen) continue;
      const ax = Math.sin(p.pathAng), az = Math.cos(p.pathAng);
      for (const s of [-1, 1]) {
        const x = ax * 10.8 + az * s * 2.0, z = az * 10.8 - ax * s * 2.0;
        const c = makeCane(1.5);
        c.position.set(x, 0, z);
        c.rotation.y = p.pathAng + (s > 0 ? Math.PI / 2 : -Math.PI / 2);
        scene.add(c);
        circleBlock(x, z, 0.15);
      }
    }
  }

  // 눈더미 · 작은 장식 트리
  {
    for (let i = 0; i < 60; i++) {
      const a = rnd() * Math.PI * 2, r = 12 + rnd() * 32;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (nearPath(x, z, 0.6) || nearPlace(x, z, -1) || onIce(x, z)) continue;
      const rr = 0.4 + rnd() * 0.5, sx = 1 + rnd() * 0.5, sz = 1 + rnd() * 0.5;
      const m = mesh(new THREE.SphereGeometry(rr, 12, 8), snowM, x, -0.1, z);
      m.scale.set(sx, 0.4 + rnd() * 0.2, sz);
      m.rotation.y = rnd() * 3;
      scene.add(m);
      circleBlock(x, z, rr * Math.max(sx, sz) * 0.8);   // 눈더미도 통과하지 않게
    }
    // 길가 작은 트리 (전구 감긴)
    const spots = [[-7, 14], [7, 14], [-14, -4], [14, -4], [-6, -14], [7, -13], [-13, 6], [13, 7]];
    for (const [x, z] of spots) {
      if (nearPath(x, z, 0.2)) continue;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.6, 7), mat('#6b4a32'), 0, 0.3, 0));
      for (let i = 0; i < 3; i++) {
        const r = 0.95 - i * 0.26, h = 1.0 - i * 0.15, y = 0.45 + i * 0.62;
        g.add(mesh(new THREE.ConeGeometry(r, h, 10), new THREE.MeshStandardMaterial({ color: '#2f7a4c', roughness: 0.8, flatShading: true }), 0, y + h / 2, 0));
        g.add(mesh(new THREE.ConeGeometry(r * 0.55, h * 0.4, 10), snowM, 0, y + h * 0.82, 0));
      }
      scene.add(g);
      circleBlock(x, z, 0.8);
      for (let k = 0; k < 26; k++) {
        const t = k / 26, y = 0.55 + t * 1.85, a = t * Math.PI * 2 * 3;
        const r = 0.95 * (1 - t * 0.75) + 0.04;
        bulbPts.push({ p: new THREE.Vector3(x + Math.cos(a) * r, y, z + Math.sin(a) * r), c: new THREE.Color(BULB_COLORS[k % 6]), ph: rnd() * 6.28 });
      }
      const st = mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshStandardMaterial({ color: '#ffd54a', emissive: '#ffb300', emissiveIntensity: 0.8 }), x, 2.62, z);
      scene.add(st);
    }
  }

  // 줄 전구 한꺼번에
  let bulbIM2 = null;
  {
    const n = bulbPts.length;
    bulbIM2 = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
    const d = new THREE.Object3D();
    bulbPts.forEach((b, i) => { d.position.copy(b.p); d.updateMatrix(); bulbIM2.setMatrixAt(i, d.matrix); bulbIM2.setColorAt(i, b.c); });
    scene.add(bulbIM2);
    // 전선 — 아주 가는 선
    const wg = new THREE.BufferGeometry().setFromPoints(wirePts);
    scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#2a3a30', transparent: true, opacity: 0.75 })));
  }

  // ------------------------------------------------------------------
  // 내리는 눈 · 반짝이는 눈밭
  // ------------------------------------------------------------------
  const snowfall = (() => {
    const N = LOW ? 1400 : 2800;
    const g = new THREE.BufferGeometry();
    const P = new Float32Array(N * 3), S = new Float32Array(N);
    for (let i = 0; i < N; i++) { P[i * 3] = (Math.random() - 0.5) * 70; P[i * 3 + 1] = Math.random() * 36; P[i * 3 + 2] = (Math.random() - 0.5) * 70; S[i] = Math.random(); }
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(S, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uSize: { value: 0.14 * DPR } },
      vertexShader: `uniform float uTime; uniform vec3 uCam; uniform float uSize; attribute float aSeed; varying float vA;
        void main(){
          vec3 p = position;
          float sp = 0.55 + aSeed * 0.75;
          p.y -= uTime * sp;
          p.x += sin(uTime * 0.6 + aSeed * 40.0) * 0.7 + uTime * 0.25;
          p.z += cos(uTime * 0.45 + aSeed * 23.0) * 0.6;
          vec3 box = vec3(70.0, 36.0, 70.0);
          vec3 rel = p - uCam + vec3(0.0, 8.0, 0.0);
          rel = mod(rel + box * 0.5, box) - box * 0.5;
          p = uCam + rel;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * (0.6 + aSeed) * (320.0 / -mv.z);
          vA = smoothstep(55.0, 18.0, -mv.z) * smoothstep(0.3, 1.5, -mv.z);
        }`,
      fragmentShader: `varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA;
          gl_FragColor = vec4(1.0, 1.0, 1.0, a * 0.95); }`,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    scene.add(pts);
    return m;
  })();
  const glitter = (() => {
    const N = LOW ? 1500 : 3000;
    const g = new THREE.BufferGeometry();
    const P = new Float32Array(N * 3), S = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 44;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      P[i * 3] = x; P[i * 3 + 1] = groundY(x, z) + 0.04; P[i * 3 + 2] = z; S[i] = Math.random();
    }
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(S, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSize: { value: 0.12 * DPR } },
      vertexShader: `uniform float uTime; uniform float uSize; attribute float aSeed; varying float vB;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float tw = pow(max(0.0, sin(uTime * (1.5 + aSeed * 2.5) + aSeed * 60.0)), 18.0);
          vB = tw * smoothstep(30.0, 4.0, -mv.z);
          gl_PointSize = uSize * (320.0 / -mv.z) * (0.6 + tw);
        }`,
      fragmentShader: `varying float vB;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
          float cross = max(0.0, 1.0 - abs(c.x) * 12.0) * max(0.0, 1.0 - abs(c.y) * 2.2) + max(0.0, 1.0 - abs(c.y) * 12.0) * max(0.0, 1.0 - abs(c.x) * 2.2);
          float a = (smoothstep(0.25, 0.0, d) + cross * 0.6) * vB;
          gl_FragColor = vec4(0.92, 0.97, 1.0, a); }`,
    });
    const pts = new THREE.Points(g, m);
    scene.add(pts);
    return m;
  })();

  // ------------------------------------------------------------------
  // 이름표 · 말풍선
  // ------------------------------------------------------------------
  function makeLabel(text, { size = 40, color = '#2b2f45', bg = 'rgba(255,255,255,.85)', scale = 1 } = {}) {
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    const font = `700 ${size}px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
    g.font = font;
    const w = Math.ceil(g.measureText(text).width) + size * 1.0, h = Math.ceil(size * 1.6);
    c.width = w; c.height = h;
    g.font = font;
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect ? g.roundRect(0, 0, w, h, h / 2) : g.rect(0, 0, w, h);
    g.fill();
    g.fillStyle = color;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 1);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
    s.scale.set((w / h) * 0.42 * scale, 0.42 * scale, 1);
    s.renderOrder = 10;
    return s;
  }
  // 장소 이름표 (공중에)
  for (const p of PLACES) {
    const l = makeLabel(`${p.emoji} ${p.name}`, { size: 44, scale: 1.9, color: '#b82a2a' });
    const y = p.id === 'tree' ? 13.4 : p.id === 'workshop' ? 9.4 : 4.6;
    let x = p.x, z = p.z;
    if (p.id === 'workshop') { x = WS.giftPos.x - WS.front.x * 7.9; z = WS.giftPos.z - WS.front.z * 7.9; }
    l.position.set(x, y, z);
    scene.add(l);
    p.label = l;
  }

  // ------------------------------------------------------------------
  // 아바타 — 쉼터와 같은 3.5등신 (겨울옷 · 털모자 · 목도리)
  // ------------------------------------------------------------------
  const SKIN = ['#f7d5b8', '#efbf9d', '#dda67c', '#c6895e'];
  const HAIRC = ['#241d1a', '#3b2a21', '#54382a', '#17151c'];
  function makeAvatar(color, name, opts = {}) {
    const h = hashStr(String(name || 'guest'));
    const root = new THREE.Group();
    const inner = new THREE.Group();
    root.add(inner);
    const body = new THREE.Group();
    inner.add(body);
    const base = new THREE.Color(color);
    const mSkin = new THREE.MeshStandardMaterial({ color: opts.skin || SKIN[h % SKIN.length], roughness: 0.88, envMapIntensity: 0.12 });
    const mHair = new THREE.MeshStandardMaterial({ color: opts.hairColor || HAIRC[(h >>> 3) % HAIRC.length], roughness: 0.84, envMapIntensity: 0.1 });
    const mTop = new THREE.MeshStandardMaterial({ color: base, roughness: 0.92, envMapIntensity: 0.15 });
    const mSash = new THREE.MeshStandardMaterial({ color: opts.sash || base.clone().lerp(new THREE.Color('#ffffff'), 0.5), roughness: 0.9, envMapIntensity: 0.1 });
    const mPant = new THREE.MeshStandardMaterial({ color: opts.pants || base.clone().lerp(new THREE.Color('#2b2a3c'), 0.86), roughness: 0.94, envMapIntensity: 0.08 });
    const mShoe = new THREE.MeshStandardMaterial({ color: opts.shoe || '#3a2a24', roughness: 0.78, envMapIntensity: 0.12 });
    const mEye = new THREE.MeshBasicMaterial({ color: '#2a2335' });
    const mGlint = new THREE.MeshBasicMaterial({ color: '#ffffff' });

    const legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.13, 0.72, 0);
      hip.add(mesh(new THREE.CapsuleGeometry(0.115, 0.2, 4, 10), mPant, 0, -0.17, 0));
      const knee = new THREE.Group();
      knee.position.y = -0.34;
      knee.add(mesh(new THREE.CapsuleGeometry(0.1, 0.18, 4, 10), mPant, 0, -0.14, 0));
      const shoe = mesh(new THREE.BoxGeometry(0.2, 0.14, 0.3), mShoe, 0, -0.28, 0.05);
      knee.add(shoe);
      // 스케이트 날 (스케이트 신었을 때만)
      const blade = mesh(new THREE.BoxGeometry(0.03, 0.06, 0.38), mat('#d9e2ec', { metalness: 0.9, roughness: 0.2 }), 0, -0.38, 0.05);
      blade.visible = false;
      knee.add(blade);
      hip.add(knee);
      body.add(hip);
      legs.push({ hip, knee, shoe, blade });
    }
    const upper = new THREE.Group();
    upper.position.y = 0.72;
    body.add(upper);
    const torso = mesh(new THREE.CapsuleGeometry(0.235, 0.3, 5, 14), mTop, 0, 0.3, 0);
    torso.scale.z = 0.84;
    if (opts.belly) { torso.scale.set(1.28, 1, 1.15); }
    upper.add(torso);
    // 외투 밑단 털 (산타 · 겨울 외투 느낌)
    const hem = mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 20), mSash, 0, 0.06, 0);
    hem.rotation.x = Math.PI / 2;
    hem.scale.set(opts.belly ? 1.25 : 1.02, opts.belly ? 1.12 : 0.86, 1);
    upper.add(hem);
    upper.add(mesh(new THREE.CylinderGeometry(0.082, 0.092, 0.14, 10), mSkin, 0, 0.64, 0));
    const placket = mesh(new THREE.BoxGeometry(0.07, 0.42, 0.03), mSash, 0, 0.33, opts.belly ? 0.235 : 0.19);
    upper.add(placket);
    if (opts.belly) {
      const belt = mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 20), mat('#1e1a1f', { roughness: 0.5 }), 0, -0.1, 0);
      torso.add(belt);
      torso.add(mesh(new THREE.BoxGeometry(0.1, 0.09, 0.04), mat('#e8b23a', { metalness: 0.8, roughness: 0.3 }), 0, -0.1, 0.235));
    }
    // 목도리
    if (opts.scarf) {
      const sm = mat(opts.scarf, { roughness: 0.95 });
      const sc = mesh(new THREE.TorusGeometry(0.12, 0.055, 8, 18), sm, 0, 0.6, 0);
      sc.rotation.x = Math.PI / 2;
      upper.add(sc);
      const tail = mesh(new THREE.BoxGeometry(0.09, 0.3, 0.04), sm, 0.08, 0.45, 0.19);
      tail.rotation.z = 0.1;
      upper.add(tail);
    } else {
      const collar = mesh(new THREE.TorusGeometry(0.125, 0.032, 8, 18), mSash, 0, 0.6, 0);
      collar.rotation.x = Math.PI / 2;
      upper.add(collar);
    }
    const arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * (opts.belly ? 0.3 : 0.26), 0.52, 0);
      sh.add(mesh(new THREE.CapsuleGeometry(0.085, 0.17, 4, 10), mTop, 0, -0.13, 0));
      const elbow = new THREE.Group();
      elbow.position.y = -0.27;
      elbow.add(mesh(new THREE.CapsuleGeometry(0.078, 0.12, 4, 10), mTop, 0, -0.09, 0));
      // 손목 털 · 벙어리장갑
      const cuff = mesh(new THREE.TorusGeometry(0.075, 0.026, 6, 14), mSash, 0, -0.17, 0);
      cuff.rotation.x = Math.PI / 2;
      elbow.add(cuff);
      elbow.add(mesh(new THREE.SphereGeometry(0.088, 10, 8), opts.mitten ? mat(opts.mitten, { roughness: 0.95 }) : mSkin, 0, -0.25, 0));
      sh.add(elbow);
      upper.add(sh);
      arms.push({ sh, elbow });
    }
    const head = new THREE.Group();
    head.position.y = 0.91;
    upper.add(head);
    const skull = mesh(new THREE.SphereGeometry(0.26, 26, 20), mSkin);
    skull.scale.set(1, 1.03, 0.97);
    head.add(skull);
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.SphereGeometry(0.055, 10, 8), mSkin, s * 0.252, -0.01, 0);
      ear.scale.set(0.55, 1, 0.8);
      head.add(ear);
    }
    const cap = mesh(new THREE.SphereGeometry(0.272, 26, 20, 0, Math.PI * 2, 0, Math.PI * 0.52), mHair, 0, 0.028, -0.022);
    cap.scale.set(1, 1.02, 1.04);
    head.add(cap);
    const side2 = (h >>> 5) % 2 ? 1 : -1;
    const fringe = mesh(new THREE.SphereGeometry(0.232, 20, 15, 0, Math.PI * 2, 0, Math.PI * 0.5), mHair, side2 * 0.022, 0.062, 0.05);
    fringe.scale.set(1.06, 0.56, 1.0);
    fringe.rotation.set(0.46, 0, side2 * 0.16);
    head.add(fringe);
    const back = mesh(new THREE.SphereGeometry(0.2, 16, 12), mHair, 0, 0.03, -0.14);
    back.scale.set(1.12, 0.95, 0.85);
    head.add(back);
    if ((opts.hair ?? h % 3) === 0) for (const s of [-1, 1]) {
      const side = mesh(new THREE.SphereGeometry(0.135, 14, 12), mHair, s * 0.2, -0.07, -0.04);
      side.scale.set(0.6, 1.35, 1);
      head.add(side);
    }
    // 모자
    if (opts.hat === 'santa') {
      const red = mat(opts.hatColor || '#d32f2f', { roughness: 0.85 });
      const fur = mat('#ffffff', { roughness: 0.95 });
      const brim = mesh(new THREE.TorusGeometry(0.262, 0.07, 10, 26), fur, 0, 0.12, -0.01);
      brim.rotation.x = Math.PI / 2 - 0.1;
      head.add(brim);
      const low = mesh(new THREE.CylinderGeometry(0.13, 0.27, 0.3, 20), red, 0, 0.27, -0.03);
      low.rotation.x = -0.12;
      head.add(low);
      const piv = new THREE.Group();
      piv.position.set(0, 0.4, -0.06);
      piv.rotation.set(-0.5, 0, -0.85);
      head.add(piv);
      piv.add(mesh(new THREE.CylinderGeometry(0.02, 0.13, 0.36, 14), red, 0, 0.16, 0));
      piv.add(mesh(new THREE.SphereGeometry(0.075, 12, 10), fur, 0, 0.35, 0));
    } else if (opts.hat === 'beanie') {
      const bm = mat(opts.hatColor || '#2f8a52', { roughness: 0.95 });
      const crown = mesh(new THREE.SphereGeometry(0.285, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), bm, 0, 0.07, -0.01);
      head.add(crown);
      const fold = mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.1, 20), mat('#ffffff', { roughness: 0.95 }), 0, 0.1, -0.01);
      head.add(fold);
      head.add(mesh(new THREE.SphereGeometry(0.085, 10, 8), mat('#ffffff', { roughness: 0.95 }), 0, 0.37, -0.01));
    } else if (opts.hat === 'earmuff') {
      const em = mat(opts.hatColor || '#ff8fb1', { roughness: 0.95 });
      const band = mesh(new THREE.TorusGeometry(0.27, 0.02, 6, 20, Math.PI), mat('#e9e2ee'), 0, 0.02, 0);
      head.add(band);
      for (const s of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.085, 12, 10), em, s * 0.27, -0.02, 0));
    }
    if (opts.beard) {
      const wm = mat('#ffffff', { roughness: 0.95 });
      const bd = mesh(new THREE.SphereGeometry(0.22, 18, 14), wm, 0, -0.27, 0.07);
      bd.scale.set(1.08, 1.0, 0.75);
      head.add(bd);
      for (const s of [-1, 1]) {
        const mu = mesh(new THREE.CapsuleGeometry(0.035, 0.08, 4, 8), wm, s * 0.06, -0.075, 0.235);
        mu.rotation.z = s * 1.2;
        head.add(mu);
      }
    }
    // 얼굴
    const eyes = [];
    const blushMat = new THREE.MeshBasicMaterial({ color: '#ff8a8a', transparent: true, opacity: 0.38 });
    for (const s2 of [-1, 1]) {
      const eye = mesh(new THREE.SphereGeometry(0.034, 18, 14), mEye, s2 * 0.103, -0.028, 0.237);
      eye.scale.set(1.02, 1.08, 0.36);
      head.add(eye);
      eyes.push(eye);
      head.add(mesh(new THREE.SphereGeometry(0.0095, 8, 6), mGlint, s2 * 0.091, -0.004, 0.252));
      const blush = mesh(new THREE.SphereGeometry(0.046, 10, 8), blushMat, s2 * 0.158, -0.085, 0.185);
      blush.scale.set(1, 0.45, 0.2);
      head.add(blush);
    }
    const nose = mesh(new THREE.SphereGeometry(0.02, 8, 6), opts.beard ? mat('#f2a593') : mSkin, 0, -0.058, 0.25);
    head.add(nose);
    if (!opts.beard) {
      const mouth = mesh(new THREE.TorusGeometry(0.026, 0.0062, 8, 18, Math.PI * 0.8), mEye, 0, -0.084, 0.234);
      mouth.rotation.z = Math.PI * 1.05;
      mouth.rotation.x = -0.1;
      head.add(mouth);
    }
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ map: softTex, color: '#5a6f8f', transparent: true, opacity: 0.35, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.04;
    root.add(blob);
    root.traverse((o) => { if (o.isMesh && o !== blob && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
    let label = null;
    if (name && !opts.npc) {
      label = makeLabel(name, { size: 32, scale: 0.46 });
      label.position.y = 2.25;
      root.add(label);
    }
    if (opts.scale) root.scale.setScalar(opts.scale);
    root.userData = { inner, body, upper, head, legs, arms, eyes, blob, label, pose: 'stand', gesture: null, t: rnd() * 10, gait: 0, walk: 0, blink: 2 + rnd() * 3, skate: false };
    return root;
  }
  const tmpV = new THREE.Vector3();
  function animateAvatar(av, dt, moving, speed = 1) {
    const u = av.userData;
    const k = Math.min(1, dt * 12);
    u.t += dt;
    const skating = u.skate && u.onIce;
    const run = clamp(speed - 1.05, 0, 1);
    u.gait += dt * (moving ? (skating ? 3.2 : 9.5 * clamp(speed, 0.3, 1.45)) : 0);
    u.walk = lerp(u.walk, moving ? 1 : 0, Math.min(1, dt * 7));
    const w = u.walk, s = Math.sin(u.gait);
    let rootY = 0, upperRx = run * 0.2 * w + (u.push ? 0.45 : 0), hipA = s * 0.62 * w * (1 + run * 0.45), kneeA = Math.max(0, -s) * 0.5 * w * (1 + run);
    u.airAmt = lerp(u.airAmt || 0, u.air ? 1 : 0, Math.min(1, dt * 14));
    const air = u.airAmt;
    if (u.pose === 'sit') rootY = -0.3;
    if (u.pose === 'crouch') { rootY = -0.52; upperRx += 0.18; }
    let waveAmt = 0, bowAmt = 0, danceAmt = 0, throwAmt = 0, throwT = 0, cheerAmt = 0, joyAmt = 0, hop = 0;
    if (u.gesture) {
      u.gesture.t += dt;
      const dur = u.gesture.dur || 2.2, gt = u.gesture.t;
      const g = Math.sin(Math.min(1, gt / dur) * Math.PI);
      const env = smooth(0, 0.4, gt) * (1 - smooth(dur - 0.4, dur, gt));
      if (u.gesture.type === 'bow') { bowAmt = g; upperRx += 0.72 * g; }
      if (u.gesture.type === 'wave') waveAmt = env;
      if (u.gesture.type === 'dance') danceAmt = env;
      if (u.gesture.type === 'cheer') cheerAmt = env;
      if (u.gesture.type === 'joy') { joyAmt = env; hop = Math.abs(Math.sin(gt * Math.PI / 0.55)) * (gt < dur - 0.3 ? 1 : 0); }
      if (u.gesture.type === 'throw') { throwAmt = 1 - smooth(0.75, 1.0, gt); throwT = gt; }
      if (gt > dur) u.gesture = null;
    }
    const beat = u.t * 6.2;
    if (danceAmt > 0.02) rootY += Math.abs(Math.sin(beat)) * 0.07 * danceAmt;
    if (cheerAmt > 0.02) rootY += Math.abs(Math.sin(u.t * 9)) * 0.12 * cheerAmt;
    if (joyAmt > 0.02) rootY += hop * 0.55 * joyAmt;
    // 스케이트 — 한 발씩 비스듬히 밀며 미끄러지기
    const sk = skating ? w : 0;
    for (const l of u.legs) l.blade.visible = !!u.skate;
    for (let i = 0; i < u.legs.length; i++) {
      const sgn = i ? 1 : -1;
      let hr = hipA * sgn, kr = kneeA, hz = 0;
      if (sk > 0.02) {
        const push = Math.max(0, Math.sin(u.gait + i * Math.PI));
        hr = lerp(hr, -0.25 + push * 0.55, sk);
        kr = lerp(kr, 0.35 - push * 0.2, sk);
        hz = sgn * push * 0.35 * sk;
      }
      if (air > 0.02) { hr = lerp(hr, -0.55 + sgn * 0.1, air); kr = lerp(kr, 1.0, air); }
      if (joyAmt > 0.02) { hr = lerp(hr, -0.5 * hop, joyAmt); kr = lerp(kr, 0.9 * hop, joyAmt); }
      if (u.pose === 'sit') { hr = -1.3; kr = 1.4; hz = 0; }
      if (u.pose === 'crouch') { hr = -1.45 + sgn * 0.12; kr = 1.95; }
      if (danceAmt > 0.02 && u.pose === 'stand') {
        hr = lerp(hr, -0.12 + Math.sin(beat * 0.5 + i * Math.PI) * 0.28, danceAmt);
        kr = lerp(kr, 0.28 + 0.28 * Math.sin(beat + i * Math.PI), danceAmt);
      }
      u.legs[i].hip.rotation.x = lerp(u.legs[i].hip.rotation.x, hr, k);
      u.legs[i].hip.rotation.z = lerp(u.legs[i].hip.rotation.z, hz, k);
      u.legs[i].knee.rotation.x = lerp(u.legs[i].knee.rotation.x, kr, k);
    }
    for (let i = 0; i < u.arms.length; i++) {
      const sgn = i ? 1 : -1;
      let rx = -hipA * sgn * 0.8, rz = sgn * (0.14 + Math.sin(u.t * 1.3) * 0.02 * (1 - w)), er = -0.25 - w * 0.2 - run * 0.9, ez = 0;
      if (air > 0.02) { rz = lerp(rz, sgn * 1.1, air); rx = lerp(rx, -0.3, air); er = lerp(er, -0.5, air); }
      if (u.carry) { rx = -1.05; rz = sgn * 0.1; er = -0.75; }
      if (u.push) { rx = -1.25; rz = sgn * 0.12; er = -0.15; }
      if (sk > 0.02) { rx = lerp(rx, -0.2 + Math.sin(u.gait + i * Math.PI) * 0.25, sk); rz = lerp(rz, sgn * 0.75, sk); er = lerp(er, -0.2, sk); }
      if (u.pose === 'sit') { rx = -0.35; rz = sgn * 0.2; er = -0.5; }
      if (u.pose === 'crouch') { rx = -0.9 + Math.sin(u.t * 6 + i) * 0.15; rz = sgn * 0.2; er = -0.3; }
      if (u.drink > 0 && i === 1) {
        const cyc = u.drink % 4;
        const sip = smooth(2.0, 2.7, cyc) * (1 - smooth(3.4, 4.0, cyc));
        u.sip = sip;
        rx = -0.5 - sip * 0.32; rz = sgn * (0.12 - sip * 0.42); er = -1.15 - sip * 0.95;
      }
      if (u.ringBell > 0 && i === 1) { rx = -1.6; rz = sgn * 0.35; er = -0.5 + Math.sin(u.t * 26) * 0.35; }
      if (i === 1 && waveAmt > 0.02) {
        const sway = Math.sin(u.t * 10.5) * waveAmt;
        rz = sgn * (0.14 + 0.88 * waveAmt + sway * 0.05);
        rx = -0.62 * waveAmt;
        er = -0.25 - 1.75 * waveAmt;
        ez = -sgn * (0.12 * waveAmt + sway * 0.36);
      }
      if (danceAmt > 0.02) {
        const up = 0.5 + 0.5 * Math.sin(beat * 0.5 + i * Math.PI);
        rz = lerp(rz, sgn * (0.45 + 1.9 * up), danceAmt);
        rx = lerp(rx, -0.35, danceAmt);
        er = lerp(er, -1.0 + up * 0.7, danceAmt);
      }
      if (cheerAmt > 0.02) { rz = lerp(rz, sgn * 2.6, cheerAmt); rx = lerp(rx, -0.2, cheerAmt); er = lerp(er, -0.15, cheerAmt); }
      if (throwAmt > 0.02 && i === 1) {
        const bk = smooth(0, 0.3, throwT), fw = smooth(0.3, 0.5, throwT);
        rx = lerp(rx, lerp(0.95 * bk, -1.9, fw), throwAmt);
        er = lerp(er, lerp(-1.4 * bk, -0.15, fw), throwAmt);
        rz = lerp(rz, sgn * 0.25, throwAmt);
      }
      if (bowAmt > 0.02) { rx = -0.42 * bowAmt; rz = sgn * (0.1 + 0.12 * bowAmt); er = -0.5 - 0.5 * bowAmt; }
      if (joyAmt > 0.02) { rz = lerp(rz, sgn * (u.carry ? 2.75 : 2.5 + Math.sin(u.t * 14) * 0.25), joyAmt); rx = lerp(rx, u.carry ? -0.25 : -0.15, joyAmt); er = lerp(er, u.carry ? -0.6 : -0.2, joyAmt); }
      u.arms[i].sh.rotation.x = lerp(u.arms[i].sh.rotation.x, rx, k);
      u.arms[i].sh.rotation.z = lerp(u.arms[i].sh.rotation.z, rz, k);
      u.arms[i].elbow.rotation.x = lerp(u.arms[i].elbow.rotation.x, er, k);
      u.arms[i].elbow.rotation.z = lerp(u.arms[i].elbow.rotation.z, ez, Math.min(1, dt * 18));
      if (i === 1 && u.cup) u.cup.rotation.x = -(u.arms[1].sh.rotation.x + u.arms[1].elbow.rotation.x) - (u.sip || 0) * 0.9;
    }
    const bob = skating ? 0 : w * Math.abs(Math.sin(u.gait)) * 0.055 + (1 - w) * Math.sin(u.t * 1.5) * 0.012;
    u.inner.position.y = lerp(u.inner.position.y, rootY + bob - sk * 0.08, k);
    u.upper.rotation.x = lerp(u.upper.rotation.x, upperRx + w * 0.08 + sk * 0.22, k);
    if (u.carry) u.carry.position.set(0, lerp(0.34, 1.35, joyAmt), lerp(0.42, 0.04, joyAmt));
    u.body.rotation.z = lerp(u.body.rotation.z, Math.sin(u.gait) * (0.03 + sk * 0.1) * w + Math.sin(beat * 0.5) * 0.11 * danceAmt, k);
    u.inner.rotation.y = lerp(u.inner.rotation.y, Math.sin(beat * 0.25) * 0.45 * danceAmt, k);
    u.head.rotation.x = lerp(u.head.rotation.x, bowAmt * 0.3, k);
    u.head.rotation.z = lerp(u.head.rotation.z, -Math.sin(u.gait) * 0.05 * w + Math.sin(u.t * 0.9) * 0.03 * (1 - w) + waveAmt * 0.1, k);
    u.head.rotation.y = lerp(u.head.rotation.y, Math.sin(u.t * 0.45) * 0.22 * (1 - w), Math.min(1, dt * 2));
    u.blink -= dt;
    if (u.blink < 0) {
      const closing = u.blink > -0.07;
      for (const e of u.eyes) e.scale.y = closing ? 0.12 : 1.08;
      if (u.blink < -0.14) u.blink = 2.5 + Math.random() * 4;
    }
    u.blob.visible = u.pose !== 'sit';
  }

  // 손에 드는 코코아
  function giveCup(av) {
    if (av.userData.cup) return;
    const cup = makeMug('#ffffff');
    cup.scale.setScalar(1.15);
    cup.position.set(0, -0.3, 0.06);
    av.userData.arms[1].elbow.add(cup);
    av.userData.cup = cup;
  }
  function takeCup(av) {
    const u = av.userData;
    if (u.cup) { u.cup.parent.remove(u.cup); u.cup = null; }
  }
  // 손에 드는 방울
  function giveBell(av) {
    if (av.userData.bell) return;
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 6), mat('#7a5236'), 0, -0.12, 0));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), mat('#e8b23a', { metalness: 0.85, roughness: 0.2 }), (i - 1) * 0.06, -0.28 - (i % 2) * 0.04, 0.03));
    g.add(mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 12), mat('#d63a3a'), 0, -0.02, 0));
    g.position.set(0, -0.26, 0.04);
    av.userData.arms[1].elbow.add(g);
    av.userData.bell = g;
  }
  function takeBell(av) { const u = av.userData; if (u.bell) { u.bell.parent.remove(u.bell); u.bell = null; } }

  // ------------------------------------------------------------------
  // 나 · 이웃
  // ------------------------------------------------------------------
  const player = makeAvatar('#d63a3a', myName, { hat: 'santa', scarf: '#2f8a52', sash: '#ffffff', mitten: '#2f8a52', pants: '#3a3550' });
  player.position.set(0, 0, 16);
  player.rotation.y = Math.PI;
  scene.add(player);

  // 산타 할아버지 — 썰매 옆
  const santa = makeAvatar('#c62828', '산타', { npc: true, hat: 'santa', beard: true, belly: true, sash: '#ffffff', pants: '#c62828', shoe: '#1e1a1f', mitten: '#1e1a1f', skin: '#f2c9a8', hairColor: '#f4f4f4', scale: 1.12 });
  {
    const p = SL.group.localToWorld(new THREE.Vector3(-0.2, 0, -1.9));
    santa.position.set(p.x, 0, p.z);
    santa.rotation.y = Math.atan2(-p.x, -p.z);
    scene.add(santa);
    circleBlock(p.x, p.z, 0.45);
    santa.userData.home = santa.rotation.y;
  }
  // 코코아 아저씨
  const vendor = makeAvatar('#8b5a3c', '코코아', { npc: true, hat: 'beanie', hatColor: '#d63a3a', scarf: '#f4d35e', skin: '#efbf9d' });
  vendor.position.set(CO.x + 0.6, 0, CO.z - 0.55);
  vendor.rotation.y = 0;
  scene.add(vendor);

  // 산책하는 이웃 · 스케이트 타는 이웃
  const npcs = [];
  const WAY = [[0, 12], [8, 9], [12, 0], [8, -10], [0, -12.5], [-9, -9], [-12, 0], [-8, 9], [-4, 22], [5, -24], [-26, 4], [26, 2]];
  const looks = [
    ['#3a6fd6', { hat: 'beanie', hatColor: '#f4d35e', scarf: '#d63a3a' }],
    ['#2f8a52', { hat: 'earmuff', hatColor: '#ff8fb1', scarf: '#ffffff', hair: 0 }],
    ['#f4d35e', { hat: 'santa', scarf: '#3a6fd6' }],
  ];
  looks.forEach(([c, o], i) => {
    const av = makeAvatar(c, 'npc' + i, { npc: true, ...o, scale: 0.95 + i * 0.04 });
    const w = WAY[i * 3];
    av.position.set(w[0], 0, w[1]);
    scene.add(av);
    npcs.push({ av, mode: 'walk', target: null, wait: rnd() * 3 });
  });
  const skaters = [];
  const bodies = [santa, vendor, ...npcs.map((n) => n.av)];
  for (let i = 0; i < 2; i++) {
    const av = makeAvatar(i ? '#9b59b6' : '#ff8fb1', 'sk' + i, { npc: true, hat: i ? 'beanie' : 'earmuff', hatColor: i ? '#ffffff' : '#ffffff', scarf: i ? '#f4d35e' : '#3a6fd6', scale: i ? 0.8 : 0.92 });
    av.userData.skate = true; av.userData.onIce = true;
    scene.add(av);
    skaters.push({ av, a: i * Math.PI, sp: i ? 0.42 : 0.33, r: i ? 0.55 : 0.75 });
    bodies.push(av);
  }

  // ------------------------------------------------------------------
  // 효과 — 색종이 · 눈 가루 · 김 · 굴뚝 연기
  // ------------------------------------------------------------------
  const CONF_N = 500;
  const conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.11, 0.07), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), CONF_N);
  conf.frustumCulled = false;
  scene.add(conf);
  const confData = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < CONF_N; i++) {
    confData.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3() });
    dummy.scale.setScalar(0); dummy.updateMatrix(); conf.setMatrixAt(i, dummy.matrix);
    conf.setColorAt(i, new THREE.Color('#fff'));
  }
  let confI = 0;
  const CONF_COLORS = ['#ff3b3b', '#ffd23f', '#2fd67a', '#3fa2ff', '#ff7ad9', '#ffffff'].map((c) => new THREE.Color(c));
  function confetti(pos, n = 120, power = 5) {
    for (let k = 0; k < n; k++) {
      const c = confData[confI];
      conf.setColorAt(confI, CONF_COLORS[k % CONF_COLORS.length]);
      confI = (confI + 1) % CONF_N;
      c.life = 2.6 + Math.random();
      c.p.copy(pos);
      const a = Math.random() * Math.PI * 2, up = 0.5 + Math.random() * 0.8;
      c.v.set(Math.cos(a) * power * (0.3 + Math.random() * 0.5), power * up, Math.sin(a) * power * (0.3 + Math.random() * 0.5));
      c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      c.w.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
    }
    conf.instanceColor.needsUpdate = true;
  }
  function updateConfetti(dt) {
    let any = false;
    for (let i = 0; i < CONF_N; i++) {
      const c = confData[i];
      if (c.life <= 0) continue;
      any = true;
      c.life -= dt;
      c.v.y -= 6 * dt;
      c.v.multiplyScalar(1 - dt * 1.6);
      if (c.v.y < -1.4) c.v.y = -1.4;
      c.p.addScaledVector(c.v, dt);
      if (c.p.y < 0.03) { c.p.y = 0.03; c.v.set(0, 0, 0); c.w.set(0, 0, 0); c.r.x = -Math.PI / 2; }
      c.r.addScaledVector(c.w, dt);
      dummy.position.copy(c.p);
      dummy.rotation.set(c.r.x, c.r.y, c.r.z);
      dummy.scale.setScalar(c.life <= 0 ? 0 : Math.min(1, c.life * 2));
      dummy.updateMatrix();
      conf.setMatrixAt(i, dummy.matrix);
    }
    if (any) conf.instanceMatrix.needsUpdate = true;
  }
  const puffs = [];
  function puff(pos, { n = 10, color = '#ffffff', size = 0.5, up = 0.6, spread = 1.2, life = 1.2, opacity = 0.85 } = {}) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color, transparent: true, opacity, depthWrite: false }));
      s.position.copy(pos);
      s.scale.setScalar(size * (0.6 + Math.random() * 0.6));
      scene.add(s);
      const a = Math.random() * Math.PI * 2;
      puffs.push({ s, t: 0, life: life * (0.7 + Math.random() * 0.6), v: new THREE.Vector3(Math.cos(a) * spread * Math.random(), up * (0.5 + Math.random()), Math.sin(a) * spread * Math.random()), g: size * 1.4, o: opacity });
    }
  }
  function updatePuffs(dt) {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.t += dt;
      p.s.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(1 - dt * 1.5);
      p.s.scale.setScalar(p.s.scale.x + p.g * dt);
      p.s.material.opacity = p.o * (1 - p.t / p.life);
      if (p.t >= p.life) { scene.remove(p.s); p.s.material.dispose(); puffs.splice(i, 1); }
    }
  }
  let smokeT = 0;
  function emitSmoke(dt) {
    smokeT += dt;
    if (smokeT < 0.35) return;
    smokeT = 0;
    for (const c of chimneys) puff(c, { n: 1, color: '#f2f2f2', size: 0.7, up: 1.2, spread: 0.25, life: 3.5, opacity: 0.55 });
    for (const s of steamSpots) puff(s, { n: 1, color: '#ffffff', size: 0.35, up: 0.6, spread: 0.1, life: 1.8, opacity: 0.45 });
    const u = player.userData;
    if (u.cup) { u.cup.getWorldPosition(tmpV); tmpV.y += 0.22; puff(tmpV, { n: 1, size: 0.18, up: 0.4, spread: 0.05, life: 1.2, opacity: 0.4 }); }
  }

  // 눈뭉치
  const balls = [];
  const ballGeo = new THREE.SphereGeometry(0.12, 10, 8);
  function throwSnowball(av) {
    const u = av.userData;
    u.gesture = { type: 'throw', t: 0, dur: 0.9 };
    if (av === player) faceCam(1.45, 6, 0.22);
    setTimeout(() => {
      const b = mesh(ballGeo, snowM);
      u.arms[1].elbow.getWorldPosition(b.position);
      b.position.y += 0.1;
      const ry = av.rotation.y;
      const v = new THREE.Vector3(Math.sin(ry) * 9, 5.2, Math.cos(ry) * 9);
      scene.add(b);
      balls.push({ b, v });
      whoosh();
    }, 420);
  }
  function updateBalls(dt) {
    for (let i = balls.length - 1; i >= 0; i--) {
      const o = balls[i];
      o.v.y -= 9.8 * dt;
      o.b.position.addScaledVector(o.v, dt);
      let hit = o.b.position.y < groundY(o.b.position.x, o.b.position.z) + 0.1;
      if (!hit) for (const bl of blockers) {
        if (bl.r === undefined) {
          const ox = o.b.position.x - bl.x, oz = o.b.position.z - bl.z;
          if (Math.abs(ox * bl.c - oz * bl.s) < bl.hw && Math.abs(ox * bl.s + oz * bl.c) < bl.hd && o.b.position.y < 4) { hit = true; break; }
        } else if (Math.hypot(o.b.position.x - bl.x, o.b.position.z - bl.z) < bl.r && o.b.position.y < 3) { hit = true; break; }
      }
      if (hit) {
        puff(o.b.position, { n: 9, size: 0.3, up: 1.2, spread: 1.5, life: 0.9 });
        crunch(1.4);
        scene.remove(o.b);
        balls.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------
  // 소리 — 전부 WebAudio 로 (지속음 없이)
  // ------------------------------------------------------------------
  let actx = null, master = null, noiseBuf = null, soundOn = true, songBus = null;
  function ensureAudio() {
    if (actx) { if (actx.state !== 'running') actx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    master = actx.createGain();
    master.gain.value = soundOn ? 0.9 : 0;
    const comp = actx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function tone(freq, vol = 0.2, dur = 1.6, when = 0, out = master, type = 'sine') {
    if (!actx) return;
    const t0 = actx.currentTime + when;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(out);
    const o = actx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  // 오르골 한 음 — 기본음 + 맑은 배음
  function boxNote(f, vol, when, out) {
    tone(f, vol, 1.9, when, out);
    tone(f * 2, vol * 0.3, 0.9, when, out);
    tone(f * 4.02, vol * 0.12, 0.35, when, out);
  }
  // 썰매 방울 — 높은 금속성 배음 여러 개 + 아주 짧은 '착'
  function bell(vol = 0.06, when = 0) {
    if (!actx) return;
    const base = 2200 + Math.random() * 900;
    for (const r of [1, 1.47, 2.09, 2.56]) tone(base * r, vol / r, 0.28 + Math.random() * 0.12, when);
    noiseHit({ freq: 7000, q: 1.5, vol: vol * 0.5, dur: 0.04, when });
  }
  function jingle(n = 8, vol = 0.06) { for (let i = 0; i < n; i++) bell(vol * (0.6 + Math.random() * 0.5), i * 0.06 + Math.random() * 0.05); }
  function noiseHit({ freq = 1000, q = 1, vol = 0.05, dur = 0.08, when = 0, type = 'bandpass' } = {}) {
    if (!actx) return;
    const t0 = actx.currentTime + when;
    const src = actx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = actx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }
  const crunch = (k = 1) => { noiseHit({ freq: 900 + Math.random() * 600, q: 0.8, vol: 0.05 * k, dur: 0.09, type: 'bandpass' }); noiseHit({ freq: 3200, q: 0.6, vol: 0.015 * k, dur: 0.05 }); };
  const whoosh = () => noiseHit({ freq: 1400, q: 0.5, vol: 0.04, dur: 0.25 });
  const scrape = () => noiseHit({ freq: 5200, q: 2.5, vol: 0.02, dur: 0.35, type: 'bandpass' });
  const sparkle = () => { const sc = [1318.5, 1568, 1760, 2093, 2637]; for (let i = 0; i < 5; i++) tone(sc[i], 0.05, 0.9, i * 0.07); };
  const pop = () => { tone(660, 0.12, 0.25); tone(990, 0.08, 0.35, 0.05); noiseHit({ freq: 2500, q: 0.7, vol: 0.08, dur: 0.12 }); };
  function chickadee() {
    if (!actx) return;
    for (const [f0, f1, t] of [[3900, 3800, 0], [3300, 3200, 0.28]]) {
      const t0 = actx.currentTime + t;
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.setValueAtTime(f0, t0); o.frequency.linearRampToValueAtTime(f1, t0 + 0.22);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.02, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
      o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.3);
    }
  }
  let windGain = null;
  function startAmbient() {
    if (!actx || windGain) return;
    const src = actx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = actx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420;
    windGain = actx.createGain();
    windGain.gain.value = 0.02;
    src.connect(f); f.connect(windGain); windGain.connect(master);
    src.start();
  }
  // 캐럴 (모두 저작권이 끝난 옛 노래) — [미디 음, 박자]
  const SONGS = [
    { name: '징글벨', bpm: 200, bells: true, notes: [
      [76, 1], [76, 1], [76, 2], [76, 1], [76, 1], [76, 2], [76, 1], [79, 1], [72, 1.5], [74, 0.5], [76, 4],
      [77, 1], [77, 1], [77, 1.5], [77, 0.5], [77, 1], [76, 1], [76, 1], [76, 0.5], [76, 0.5], [76, 1], [74, 1], [74, 1], [76, 1], [74, 2], [79, 2],
      [76, 1], [76, 1], [76, 2], [76, 1], [76, 1], [76, 2], [76, 1], [79, 1], [72, 1.5], [74, 0.5], [76, 4],
      [77, 1], [77, 1], [77, 1.5], [77, 0.5], [77, 1], [76, 1], [76, 1], [76, 0.5], [76, 0.5], [79, 1], [79, 1], [77, 1], [74, 1], [72, 4]] },
    { name: '위 위시 유 어 메리 크리스마스', bpm: 150, notes: [
      [67, 1], [72, 1], [72, 0.5], [74, 0.5], [72, 0.5], [71, 0.5], [69, 1], [69, 1], [69, 1],
      [74, 1], [74, 0.5], [76, 0.5], [74, 0.5], [72, 0.5], [71, 1], [67, 1], [67, 1],
      [76, 1], [76, 0.5], [77, 0.5], [76, 0.5], [74, 0.5], [72, 1], [69, 1], [67, 0.5], [67, 0.5], [69, 1], [74, 1], [71, 1], [72, 3]] },
    { name: '고요한 밤', bpm: 110, notes: [
      [67, 1.5], [69, 0.5], [67, 1], [64, 3], [67, 1.5], [69, 0.5], [67, 1], [64, 3],
      [74, 2], [74, 1], [71, 3], [72, 2], [72, 1], [67, 3],
      [69, 2], [69, 1], [72, 1.5], [71, 0.5], [69, 1], [67, 1.5], [69, 0.5], [67, 1], [64, 3],
      [69, 2], [69, 1], [72, 1.5], [71, 0.5], [69, 1], [67, 1.5], [69, 0.5], [67, 1], [64, 3],
      [74, 2], [74, 1], [77, 1.5], [74, 0.5], [71, 1], [72, 3], [76, 3],
      [72, 1], [67, 1], [64, 1], [67, 1.5], [65, 0.5], [62, 1], [60, 6]] },
  ];
  let songI = 0, songPlaying = false, songTimer = null;
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function playSong() {
    ensureAudio();
    if (!actx) return;
    stopSong();
    const s = SONGS[songI % SONGS.length];
    songBus = actx.createGain();
    songBus.gain.value = 1;
    songBus.connect(master);
    const beat = 60 / s.bpm;
    let t = 0.1;
    for (const [m, b] of s.notes) {
      boxNote(midi(m), 0.11, t, songBus);
      if (s.bells && Math.round(t / beat) % 2 === 1) for (let k = 0; k < 3; k++) bell(0.025, t + k * 0.04);
      t += b * beat;
    }
    songPlaying = true;
    toast(`🎶 오르골 — ${s.name}`);
    songTimer = setTimeout(() => { songPlaying = false; songI++; refreshPanel(true); }, (t + 1.5) * 1000);
    refreshPanel(true);
  }
  function stopSong() {
    clearTimeout(songTimer);
    if (songBus) {
      const b = songBus;
      b.gain.setTargetAtTime(0, actx.currentTime, 0.08);
      setTimeout(() => b.disconnect(), 400);
      songBus = null;
    }
    songPlaying = false;
  }

  // ------------------------------------------------------------------
  // 할 일
  // ------------------------------------------------------------------
  const MODES = ['반짝반짝', '물결', '무지개', '금빛'];
  const WISH_KEY = 'santa.wishes';
  const wishMeshes = [];
  function addWishOrnament(w, fresh) {
    const y = w.y, a = w.a;
    const r = treeRadiusAt(y) + 0.12;
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    const ball = mesh(new THREE.SphereGeometry(0.24, 18, 14), new THREE.MeshStandardMaterial({ color: '#ff7aa8', roughness: 0.2, metalness: 0.4, emissive: '#ff4d8d', emissiveIntensity: 0.35 }));
    g.add(ball);
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 10), mat('#e8b23a', { metalness: 0.8, roughness: 0.3 }), 0, 0.26, 0));
    const heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: '#ffc2d8', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    heart.scale.setScalar(1.0);
    g.add(heart);
    ball.userData.wish = w.text;
    scene.add(g);
    wishMeshes.push(ball);
    if (fresh) { g.scale.setScalar(0.01); g.userData.grow = 0; }
    return g;
  }
  const wishes = (() => { try { return JSON.parse(localStorage.getItem(WISH_KEY) || '[]'); } catch { return []; } })();
  const growing = [];
  for (const w of wishes) addWishOrnament(w, false);

  function askText() {
    return new Promise((res) => {
      const m = $('#modal'), inp = $('#modal-input');
      inp.value = '';
      $('#modal-count').textContent = '0 / 40';
      m.classList.add('show');
      setTimeout(() => inp.focus(), 30);
      const done = (v) => { m.classList.remove('show'); $('#modal-ok').onclick = $('#modal-cancel').onclick = inp.onkeydown = null; res(v); };
      inp.oninput = () => { $('#modal-count').textContent = `${inp.value.length} / 40`; };
      $('#modal-ok').onclick = () => done(inp.value.trim());
      $('#modal-cancel').onclick = () => done(null);
      inp.onkeydown = (e) => { if (e.key === 'Enter') done(inp.value.trim()); if (e.key === 'Escape') done(null); e.stopPropagation(); };
    });
  }

  const GIFT_MSG = [
    '🧸 포근한 곰인형이 들어 있어요! "올해도 정말 수고했어요."',
    '🧦 빨간 털양말이에요. 발끝까지 따뜻하게!',
    '🍪 갓 구운 진저쿠키 한 봉지가 나왔어요.',
    '⭐ 작은 별 하나 — "당신은 누군가의 반짝이는 별이에요."',
    '📮 산타의 편지: "착한 일을 많이 했구나, 허허!"',
    '🎨 크레파스 한 상자! 내년엔 무엇을 그려 볼까요?',
    '🧣 손뜨개 목도리예요. 감기 조심!',
    '🍫 핫초코 가루 — 코코아 노점에 가져가면 좋겠어요.',
  ];
  function openGift() {
    if (giftOpen.t >= 0) return;
    giftOpen.t = 0;
    faceTo(player, WS.giftPos);
    faceCam(1.25, 6, 0.24);
    // 뚜껑이 날아가면 상자 안에서 진짜 선물이 빙글빙글 떠오르고, 내 손으로 쏙
    const item = pick(GIFT_ITEMS);
    const obj = item.make();
    obj.scale.setScalar(1.8);
    obj.position.y = 0.5;
    giftOpen.g.add(obj);
    giftOpen.item = obj;
    setTimeout(() => {
      confetti(WS.giftPos.clone().add(new THREE.Vector3(0, 0.4, 0)), 160, 6);
      pop(); sparkle();
      toast(`${item.emoji} 상자에서 ${josa(item.name, '이', '가')} 나왔어요!`, 2200);
    }, 450);
    setTimeout(() => {
      if (giftOpen.item) { giftOpen.item.parent.remove(giftOpen.item); giftOpen.item = null; }
      faceTo(player, WS.giftPos);
      receiveGift(item);
    }, 1900);
  }
  function updateGift(dt) {
    if (giftOpen.t < 0) return;
    giftOpen.t += dt;
    const t = giftOpen.t, lid = giftOpen.lid;
    if (t > 0.35) {
      const k = t - 0.35;
      lid.position.y = 1.05 + Math.min(k, 1.2) * 2.8 - Math.max(0, k - 0.5) ** 2 * 3.5;
      lid.position.x = Math.min(k, 1.6) * 1.1;
      lid.rotation.z = -Math.min(k * 3, 2.4);
      if (lid.position.y < 0.15) { lid.position.y = 0.15; }
    }
    if (giftOpen.item) {   // 상자 안에서 떠오르는 선물
      const k = smooth(0.4, 1.3, t);
      giftOpen.item.position.y = 0.5 + k * 1.15 + Math.sin(t * 4) * 0.05 * k;
      giftOpen.item.rotation.y = t * 3;
    }
    if (t > 5.5) { giftOpen.colorI++; buildBigGift(); puff(WS.giftPos, { n: 14, size: 0.6, spread: 1.6 }); sparkle(); }
  }

  const SNOW_STEPS = ['아래 몸통', '윗 몸통', '머리', '얼굴', '목도리 · 모자'];
  function rollSnow() {
    if (snowMan.stage >= 5 || roll || performance.now() - rollPending < 6000 || sitting === 'ride') return;
    if (sitting) standUp();
    if (snowMan.stage < 3) { startRoll(snowMan.stage); return; }
    // 얼굴 · 목도리는 눈사람 바로 앞에 서서 손을 뻗어 붙입니다
    const dirGo = Math.atan2(SM.go[1] - SM.build.z, SM.go[0] - SM.build.x);
    const spot = new THREE.Vector3(SM.build.x + Math.cos(dirGo) * 1.25, 0, SM.build.z + Math.sin(dirGo) * 1.25);
    rollPending = performance.now();
    walkThen(spot, () => {
      rollPending = 0;
      const u = player.userData;
      faceTo(player, SM.build);
      faceCam(1.75, 5.5, 0.3);   // 옆(살짝 뒤)에서 — 카메라가 눈사람과 겹치지 않게
      u.push = true;
      crunch(1.2);
      setTimeout(() => { addSnowPart(snowMan.stage, false); u.push = false; }, 700);
    });
  }
  // 눈 굴리기 — 작은 눈뭉치를 밀고 가며 점점 크게 만들고, 멈춘 자리에서 눈사람이 됩니다
  //   아래 몸통: 굴리다 멈춘 그 자리가 눈사람 자리
  //   윗 몸통 · 머리: 다른 쪽에서 굴려 와 아래 몸통에 닿으면 번쩍 들어 위에 올림
  let roll = null, rollPending = 0;   // rollPending: 출발점으로 걸어가기 시작한 시각 (도중에 멈추면 6초 뒤 다시 누를 수 있음)
  const rollAxis = new THREE.Vector3();
  const ROLL_R = [0.55, 0.41, 0.3], ROLL_Y = [0.46, 1.2, 1.76], ROLL_ANG = [0.9, 2.6, 0.3];
  function startRoll(st) {
    const a = ROLL_ANG[st];
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));   // 눈사람 자리에서 출발점 쪽
    const startD = 3.8, endD = st === 0 ? 0 : ROLL_R[0] + ROLL_R[st] + 0.04;
    const ballStart = SM.build.clone().addScaledVector(out, startD);
    const playerStart = ballStart.clone().addScaledVector(out, 0.55);
    rollPending = performance.now();
    walkThen(playerStart, () => {
      rollPending = 0;
      const ball = mesh(new THREE.SphereGeometry(1, 22, 16), mat('#fbfdff', { roughness: 0.75 }));
      ball.scale.setScalar(0.12);
      ball.position.copy(ballStart).setY(0.12);
      scene.add(ball);
      roll = { st, R: ROLL_R[st], ball, t: 0, T: [3.2, 2.8, 2.4][st], out, startD, endD, phase: 0, cr: 0, pf: 0 };
      sitting = 'roll';
      moveTarget = null; pendingAct = null;
      player.userData.push = true;
      player.rotation.y = targetYaw = Math.atan2(-out.x, -out.z);
      faceCam(1.35, 7.5, 0.34);
      toast(`❄️ 데굴데굴~ ${SNOW_STEPS[st]}을 굴리는 중`);
      refreshPanel(true);
    });
  }
  function updateRoll(dt) {
    const r = roll;
    r.t += dt;
    if (r.phase === 0) {
      const k = Math.min(1, r.t / r.T);
      const e = k < 0.85 ? k / 0.85 * 0.92 : 0.92 + smooth(0.85, 1, k) * 0.08;   // 끝에서 천천히 멈춤
      const rad = lerp(0.12, r.R, Math.min(1, k * 1.1));
      const d = lerp(r.startD, r.endD, e);
      const ox = r.ball.position.x, oz = r.ball.position.z;
      r.ball.position.set(SM.build.x + r.out.x * d, rad, SM.build.z + r.out.z * d);
      r.ball.scale.setScalar(rad);
      // 내 캐릭터는 눈덩이 바로 뒤에 붙어서 같이 걷습니다
      const pd = d + rad + 0.42;
      player.position.set(SM.build.x + r.out.x * pd, 0, SM.build.z + r.out.z * pd);
      const mv = Math.hypot(r.ball.position.x - ox, r.ball.position.z - oz);
      if (mv > 0 && mv < 1) r.ball.rotateOnWorldAxis(rollAxis.set(-r.out.z, 0, r.out.x).normalize(), mv / rad);
      r.moving = mv > 0.002;
      r.cr -= dt;
      if (r.cr < 0) { r.cr = 0.3; crunch(0.6 + k); }
      r.pf -= dt;
      if (r.pf < 0) { r.pf = 0.12; puff(new THREE.Vector3(r.ball.position.x + r.out.x * rad, 0.08, r.ball.position.z + r.out.z * rad), { n: 1, size: 0.25 + rad * 0.4, up: 0.2, spread: 0.2, life: 0.7, opacity: 0.7 }); }
      if (k >= 1) {
        r.moving = false;
        if (r.st === 0) { finishRoll(); return; }
        r.phase = 1; r.t = 0; r.from = r.ball.position.clone();
        player.userData.push = false;
        player.userData.gesture = { type: 'cheer', t: 0, dur: 0.9 };
      }
    } else {
      // 번쩍 들어 아래 몸통 위에 올리기
      const k = smooth(0, 1, r.t / 0.7);
      r.ball.position.lerpVectors(r.from, tmpV.set(SM.build.x, ROLL_Y[r.st], SM.build.z), k);
      r.ball.position.y += Math.sin(k * Math.PI) * 0.6;
      if (r.t >= 0.75) finishRoll();
    }
  }
  function finishRoll() {
    const r = roll;
    scene.remove(r.ball);
    roll = null;
    sitting = null;
    player.userData.push = false;
    addSnowPart(r.st, true);
  }
  function addSnowPart(st, instant) {
    const u = player.userData;
    {
      const g = snowMan.root || (snowMan.root = (() => { const r = new THREE.Group(); r.position.copy(SM.build); r.rotation.y = Math.atan2(SM.go[0] - SM.build.x, SM.go[1] - SM.build.z); scene.add(r); return r; })());
      const sm = mat('#fbfdff', { roughness: 0.75 });
      let obj;
      if (st === 0) obj = mesh(new THREE.SphereGeometry(0.55, 22, 16), sm, 0, 0.46, 0);
      if (st === 1) obj = mesh(new THREE.SphereGeometry(0.41, 22, 16), sm, 0, 1.2, 0);
      if (st === 2) obj = mesh(new THREE.SphereGeometry(0.3, 22, 16), sm, 0, 1.76, 0);
      if (st === 3 || st === 4) {
        const tmp = new THREE.Group();
        const [face, acc] = addSnowmanFace(tmp, 0.74);
        obj = st === 3 ? face : acc;
        tmp.remove(obj);
      }
      g.add(obj);
      snowMan.parts.push(obj);
      if (!instant) { obj.scale.setScalar(0.01); snowMan.grow.push({ o: obj, t: 0 }); }
      if (st === 0) circleBlock(SM.build.x, SM.build.z, 0.5);
      snowMan.stage++;
      puff(new THREE.Vector3(SM.build.x, 0.5 + st * 0.4, SM.build.z), { n: 10, size: 0.4, spread: 1.0 });
      if (snowMan.stage === 5) {
        setTimeout(() => { confetti(new THREE.Vector3(SM.build.x, 2, SM.build.z), 140, 5); sparkle(); toast('☃️ 눈사람 완성! 정말 귀여워요', 3200); }, 300);
      } else toast(`❄️ ${SNOW_STEPS[st]} 완성 (${snowMan.stage}/5)`);
      u.pose = 'stand';
      refreshPanel(true);
    }
  }
  function resetSnowman() {
    if (snowMan.root) { scene.remove(snowMan.root); snowMan.root = null; }
    snowMan.parts = []; snowMan.stage = 0;
    const i = blockers.findIndex((b) => b.x === SM.build.x && b.z === SM.build.z);
    if (i >= 0) blockers.splice(i, 1);
    puff(new THREE.Vector3(SM.build.x, 0.6, SM.build.z), { n: 16, size: 0.6, spread: 1.5 });
    refreshPanel(true);
  }

  function faceTo(av, target) { av.rotation.y = Math.atan2(target.x - av.position.x, target.z - av.position.z); targetYaw = av.rotation.y; }

  let sitting = null;
  function sitSleigh() {
    sitting = 'sleigh';
    moveTarget = null;
    player.position.set(SL.seat.x, SL.seatY - 0.42, SL.seat.z);
    player.rotation.y = targetYaw = SL.seatRy;
    player.userData.pose = 'sit';
    faceCam(1.0, 6.5, 0.25);
    jingle(6, 0.05);
    toast('🛷 썰매에 앉았어요. 방울을 흔들어 보세요!');
    refreshPanel(true);
  }
  function standUp() {
    if (!sitting || sitting === 'ride' || sitting === 'roll') return;
    if (sitting === 'sleigh') player.position.set(SL.go[0], 0, SL.go[1]);
    if (sitting === 'sofa') player.position.z -= 0.95;
    sitting = null;
    player.userData.pose = 'stand';
    takeBell(player);
    refreshPanel(true);
  }
  function ringBell() {
    giveBell(player);
    player.userData.ringBell = 1.6;
    faceCam(sitting ? 1.0 : 0.8, sitting ? 6.5 : 5, 0.25);
    jingle(12, 0.07);
    setTimeout(() => jingle(10, 0.06), 500);
    setTimeout(() => jingle(8, 0.05), 1000);
    for (const d of SL.deer) d.userData.excite = 2.2;
  }
  function greetSanta() {
    santa.userData.gesture = { type: 'wave', t: 0, dur: 2.6 };
    santa.rotation.y = Math.atan2(player.position.x - santa.position.x, player.position.z - santa.position.z);
    santa.userData.lookT = 4;
    faceTo(player, santa.position);
    faceCam(1.35, 6, 0.22);
    player.userData.gesture = { type: 'bow', t: 0, dur: 1.6 };
    sayBubble(santa, pick(['허허허, 메리 크리스마스!', '올해도 착하게 지냈구나!', '루돌프들이 출발 준비 중이란다', '선물은 공방에 많이 있단다, 허허']));
    jingle(5, 0.05);
  }
  // 가게 앞까지 걸어간 뒤에 할 일 (도착하면 실행, 다른 데로 움직이면 취소)
  let pendingAct = null;
  // 집 안 길찾기 — 0.3m 칸으로 나눈 방에서 A* 로 가구를 피해 가는 길, 직선으로 갈 수 있는 점은 건너뜁니다
  const CELL = 0.3;
  function roomFree(x, z) {
    if (Math.abs(x - INT.x) > INT.W / 2 - 0.45 || Math.abs(z - INT.z) > INT.D / 2 - 0.45) return false;
    for (const b of blockers) {
      if (b.off || b.x < 500) continue;
      const ox = x - b.x, oz = z - b.z;
      if (b.r !== undefined) { if (Math.hypot(ox, oz) < b.r + BODY + 0.05) return false; }
      else if (Math.abs(ox * b.c - oz * b.s) < b.hw + BODY + 0.05 && Math.abs(ox * b.s + oz * b.c) < b.hd + BODY + 0.05) return false;
    }
    return true;
  }
  function lineFree(a, b) {
    const n = Math.ceil(a.distanceTo(b) / 0.15);
    for (let i = 1; i < n; i++) if (!roomFree(lerp(a.x, b.x, i / n), lerp(a.z, b.z, i / n))) return false;
    return true;
  }
  function roomPath(from, to) {
    const f = new THREE.Vector3(from.x, 0, from.z), t = new THREE.Vector3(to.x, 0, to.z);
    if (lineFree(f, t)) return null;
    const x0 = INT.x - INT.W / 2, z0 = INT.z - INT.D / 2, NX = Math.floor(INT.W / CELL), NZ = Math.floor(INT.D / CELL);
    const ci = (x, z) => [clamp(Math.floor((x - x0) / CELL), 0, NX - 1), clamp(Math.floor((z - z0) / CELL), 0, NZ - 1)];
    const cx = (i) => x0 + (i + 0.5) * CELL, cz = (j) => z0 + (j + 0.5) * CELL;
    const free = new Uint8Array(NX * NZ);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) free[j * NX + i] = roomFree(cx(i), cz(j)) ? 1 : 0;
    const [si, sj] = ci(f.x, f.z), [ti, tj] = ci(t.x, t.z);
    const S = sj * NX + si, T = tj * NX + ti;
    free[S] = 1; free[T] = 1;
    const g = new Float32Array(NX * NZ).fill(1e9), prev = new Int32Array(NX * NZ).fill(-1), done = new Uint8Array(NX * NZ);
    g[S] = 0;
    const open = [S];
    while (open.length) {
      let bi = 0, bf = 1e9;
      for (let k = 0; k < open.length; k++) { const c = open[k], h = g[c] + Math.hypot((c % NX) - ti, Math.floor(c / NX) - tj); if (h < bf) { bf = h; bi = k; } }
      const c = open.splice(bi, 1)[0];
      if (c === T) break;
      if (done[c]) continue;
      done[c] = 1;
      const i = c % NX, j = Math.floor(c / NX);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
        const n = nj * NX + ni;
        if (!free[n] || (di && dj && (!free[j * NX + ni] || !free[nj * NX + i]))) continue;
        const ng = g[c] + (di && dj ? 1.414 : 1);
        if (ng < g[n]) { g[n] = ng; prev[n] = c; open.push(n); }
      }
    }
    if (prev[T] < 0) return null;
    const cells = [];
    for (let c = T; c !== S && c >= 0; c = prev[c]) cells.push(new THREE.Vector3(cx(c % NX), 0, cz(Math.floor(c / NX))));
    cells.reverse();
    cells[cells.length - 1] = t;
    // 직선으로 갈 수 있는 점은 건너뛰기
    const out = [];
    let cur = f, k = 0;
    while (k < cells.length) {
      let far = k;
      for (let m = cells.length - 1; m > k; m--) if (lineFree(cur, cells[m])) { far = m; break; }
      out.push(cells[far]);
      cur = cells[far];
      k = far + 1;
    }
    return out;
  }
  function walkThen(spot, fn, direct = false) {
    if (Math.hypot(player.position.x - spot.x, player.position.z - spot.z) < 0.6) { fn(); return; }
    // 집 안 — 가구를 피해 가는 길을 찾아 그 길을 따라 걷습니다
    if (!direct && inHouse) {
      const path = roomPath(player.position, spot);
      if (path && path.length > 1) {
        let chain = () => fn();
        for (let i = path.length - 1; i >= 0; i--) { const wp = path[i], next = chain; chain = () => walkThen(wp, next, true); }
        chain();
        return;
      }
    }
    standUp();
    moveTarget = spot.clone();
    stuckT = 0; bestD = Infinity;
    pendingAct = { spot, fn };
  }
  function drinkCocoa() {
    if (Math.hypot(player.position.x - CO.counter.x, player.position.z - CO.counter.z) > 0.6) { walkThen(CO.counter, drinkCocoa); return; }
    giveCup(player);
    player.userData.drink = 8.5;
    faceTo(player, vendor.position);
    faceCam(1.3, 4.6, 0.2);
    sayBubble(vendor, pick(['따끈할 때 드세요!', '마시멜로 두 개 넣었어요', '손 녹이고 가요~', '오늘 눈이 참 예쁘죠?']));
    tone(523, 0.05, 0.6); tone(659, 0.04, 0.8, 0.1);
  }
  const SKATE_MSG = '⛸ 스케이트를 신고는 얼음 밖으로 못 나가요. 먼저 스케이트를 벗어 주세요';
  function toggleSkate() {
    const u = player.userData;
    if (!u.skate && !onIce(player.position.x, player.position.z)) {
      // 얼음 가장자리 안쪽(플레이어에게 가장 가까운 곳)으로 걸어가서 신습니다
      const a = Math.atan2((player.position.z - POND.z) / POND.rz, (player.position.x - POND.x) / POND.rx);
      walkThen(new THREE.Vector3(POND.x + Math.cos(a) * POND.rx * 0.8, 0, POND.z + Math.sin(a) * POND.rz * 0.8), toggleSkate);
      return;
    }
    u.skate = !u.skate;
    faceCam(0.9, 5.5, 0.25);
    toast(u.skate ? '⛸ 스케이트를 신었어요! 얼음 위에서 미끄러져 봐요' : '스케이트를 벗었어요');
    refreshPanel(true);
  }
  function lookTree() { if (sitting) return; faceTo(player, new THREE.Vector3(0, 0, 0)); faceCam(1.3, 9, 0.18); }
  function cycleLights() {
    lookTree();
    TREE.mode = (TREE.mode + 1) % MODES.length;
    sparkle();
    toast(`✨ 트리 불빛: ${MODES[TREE.mode]}`);
    refreshPanel(true);
  }
  async function hangWish() {
    const text = await askText();
    if (!text) return;
    const w = { text: text.slice(0, 40), y: 2.2 + Math.random() * 6.5, a: Math.atan2(player.position.z, player.position.x) + (Math.random() - 0.5) * 1.4 };
    wishes.push(w);
    localStorage.setItem(WISH_KEY, JSON.stringify(wishes.slice(-60)));
    lookTree();
    const g = addWishOrnament(w, true);
    growing.push(g);
    sparkle();
    confetti(g.position.clone(), 50, 3);
    toast('💌 소원 오너먼트를 달았어요');
    refreshPanel(true);
  }
  // ------------------------------------------------------------------
  // 집 드나들기
  // ------------------------------------------------------------------
  // 상호작용할 때 카메라를 내 캐릭터의 옆 · 앞쪽으로 돌립니다 (ang: 0 = 정면, π/2 = 옆)
  function faceCam(ang = 1.2, d = 5, p = 0.25) {
    if (ride) return;
    const c1 = targetYaw + ang, c2 = targetYaw - ang;
    const diff = (a) => Math.abs(Math.atan2(Math.sin(a - yaw), Math.cos(a - yaw)));
    lookFrom(diff(c1) <= diff(c2) ? c1 : c2, p, d);
  }
  let inHouse = null, doorBusy = false;
  const knock = () => { noiseHit({ freq: 380, q: 2.5, vol: 0.14, dur: 0.07 }); noiseHit({ freq: 380, q: 2.5, vol: 0.12, dur: 0.07, when: 0.2 }); };
  const creak = () => { if (!actx) return; const t0 = actx.currentTime; const o = actx.createOscillator(), g = actx.createGain(), f = actx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t0); o.frequency.linearRampToValueAtTime(95, t0 + 0.5); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 4; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.025, t0 + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55); o.connect(f); f.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.6); };
  function setWorkshop(on) {
    shopStuff.visible = on; homeStuff.visible = !on; shopBanner.visible = on;
    for (const b of shopBlocks) b.off = !on;
    for (const b of homeBlocks) b.off = on;
  }
  function enterHouse(h) {
    if (doorBusy || inHouse || sitting === 'ride' || sitting === 'roll') return;
    if (player.userData.skate) { toast(SKATE_MSG); return; }
    if (sitting) standUp();
    walkThen(h.doorSpot, () => {
      doorBusy = true;
      faceTo(player, h.doorLook);
      knock();
      setTimeout(() => { h.doorT = 1; creak(); }, 380);
      setTimeout(() => $('#fade').classList.add('on'), 800);
      setTimeout(() => {
        inHouse = h;
        INSIDE.name = h.name;
        INSIDE.emoji = h.workshop ? '🎁' : '🏠';
        INSIDE.desc = h.workshop ? '산타가 준비한 선물이 가득해요! 마음에 드는 받침대 가까이 가 보세요.' : '벽난로가 타닥타닥, 따뜻한 집 안이에요. 소파에 앉아 쉬어 가요.';
        intWallMat.color.set(h.wall).lerp(tmpC3.set('#ffffff'), h.workshop ? 0.55 : 0.62);
        intDoorMat.color.set(h.doorColor);
        setWorkshop(h.workshop);
        player.position.set(INTS.door.x, 0, INTS.door.z);
        player.rotation.y = targetYaw = Math.PI;
        camTarget.set(player.position.x, 1.4, player.position.z);
        yaw = 0.35; pitch = 0.36; dist = 7.5; camDist = 7.5; yawGoal = null;
        moveTarget = null; pendingAct = null; vel.set(0, 0, 0);
        snowfall.visible = false;
        h.doorT = 0; h.door.rotation.y = 0;
        $('#fade').classList.remove('on');
        doorBusy = false;
        curPlace = null;
        toast(h.workshop ? '🎁 산타의 선물 공방에 들어왔어요! 선물을 둘러보세요' : `🏠 ${h.name}에 들어왔어요`);
      }, 1250);
    });
  }
  function exitHouse(after) {
    if (doorBusy || !inHouse) return;
    if (sitting) standUp();
    walkThen(INTS.door, () => {
      doorBusy = true;
      player.rotation.y = targetYaw = 0;
      intDoorT = 1; creak();
      setTimeout(() => $('#fade').classList.add('on'), 420);
      setTimeout(() => {
        const h = inHouse;
        inHouse = null;
        player.position.set(h.doorSpot.x, floorY(h.doorSpot.x, h.doorSpot.z), h.doorSpot.z);
        player.rotation.y = targetYaw = h.ry;
        camTarget.set(player.position.x, player.position.y + 1.4, player.position.z);
        yaw = h.ry; pitch = 0.32; dist = 7; camDist = 7; yawGoal = null;
        moveTarget = null; pendingAct = null; vel.set(0, 0, 0);
        h.doorT = 1; h.door.rotation.y = -1.6;
        setTimeout(() => { h.doorT = 0; }, 700);
        intDoorT = 0; intDoor.rotation.y = 0;
        snowfall.visible = true;
        $('#fade').classList.remove('on');
        doorBusy = false;
        curPlace = null;
        if (typeof after === 'function') setTimeout(after, 250);
      }, 900);
    });
  }
  // 집 안 할 일
  function sitSofa() {
    const seat = INTS.seats.reduce((a, b) => (a.distanceTo(player.position) < b.distanceTo(player.position) ? a : b));
    walkThen(seat.clone().setZ(seat.z - 0.95), () => {
      sitting = 'sofa';
      player.position.set(seat.x, 0.62 - 0.42, seat.z);
      player.rotation.y = targetYaw = Math.PI;
      player.userData.pose = 'sit';
      faceCam(1.2, 4.4, 0.22);   // 옆에서 — 앉은 얼굴과 벽난로가 함께 보이게
      toast('🛋 폭신폭신~ 벽난로 불이 따뜻해요');
      refreshPanel(true);
    });
  }
  function warmFire() {
    walkThen(INTS.fire, () => {
      faceTo(player, new THREE.Vector3(INT.x, 0, INT.z - INT.D / 2));
      sitting = 'fire';
      player.userData.pose = 'crouch';
      faceCam(1.9, 4.0, 0.24);   // 비스듬히 뒤옆에서 — 불 쬐는 옆얼굴과 불꽃이 함께 (앞쪽은 벽난로라 카메라가 못 들어감)
      for (let i = 0; i < 6; i++) noiseHit({ freq: 2500 + Math.random() * 3000, q: 1, vol: 0.04, dur: 0.03, when: i * 0.12 + Math.random() * 0.1 });
      toast('🔥 손끝까지 따뜻해져요');
      refreshPanel(true);
    });
  }
  function eatCookie() {
    walkThen(INTS.table, () => {
      faceTo(player, new THREE.Vector3(INT.x, 0, INT.z - 0.5));
      const left = cookies.filter((c) => c.visible);
      if (!left.length) { for (const c of cookies) c.visible = true; toast('🍪 쿠키를 새로 구웠어요! 다시 눌러 드세요'); sparkle(); return; }
      left[left.length - 1].visible = false;
      faceCam(0.9, 3.6, 0.3);   // 앞옆에서 — 쿠키 먹는 얼굴이 보이게
      player.userData.gesture = { type: 'bow', t: 0, dur: 1.0 };
      player.getWorldPosition(tmpV); tmpV.y += 1.5;
      puff(tmpV.clone().add(new THREE.Vector3(Math.sin(player.rotation.y) * 0.3, 0, Math.cos(player.rotation.y) * 0.3)), { n: 6, color: '#c98a4b', size: 0.08, up: -0.5, spread: 0.4, life: 0.8, opacity: 0.9 });
      for (let i = 0; i < 4; i++) noiseHit({ freq: 2200, q: 0.8, vol: 0.05, dur: 0.05, when: i * 0.16 });
      toast(left.length > 1 ? '🍪 바삭! 산타 몫은 남겨 둘게요' : '🍪 마지막 쿠키였어요… 산타 미안해요!');
    });
  }
  function toggleIntTree() { intTreeOn = !intTreeOn; sparkle(); refreshPanel(true); }

  // ------------------------------------------------------------------
  // 선물 받기 — 두 손으로 들고 신나서 폴짝폴짝
  // ------------------------------------------------------------------
  const josa = (w, a, b) => { const c = w.charCodeAt(w.length - 1); return w + ((c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28) ? a : b); };
  function hopSounds() { for (let k = 0; k < 3; k++) { tone(523 + k * 196, 0.06, 0.35, k * 0.55); tone(784 + k * 262, 0.04, 0.3, k * 0.55 + 0.08); } }
  function dropCarry() {
    const u = player.userData;
    if (!u.carry) return;
    u.carry.getWorldPosition(tmpV);
    puff(tmpV, { n: 8, color: '#fff6c8', size: 0.3, spread: 0.6, life: 0.8 });
    u.carry.parent.remove(u.carry);
    u.carry = null;
  }
  function receiveGift(item) {
    const u = player.userData;
    if (u.gesture && u.gesture.type === 'joy') return;
    if (sitting) standUp();
    if (u.drink > 0) { u.drink = 0; takeCup(player); }
    dropCarry();
    // 포장 상자가 아니라 받은 물건 그대로 두 손에 듭니다
    const g = new THREE.Group();
    const obj = item.make();
    obj.scale.setScalar(1.5);
    obj.position.y = -0.2;
    g.add(obj);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.position.set(0, 0.34, 0.42);
    u.upper.add(g);
    u.carry = g;
    u.carryT = 14;
    u.gesture = { type: 'joy', t: 0, dur: 2.0 };
    faceCam(0.55, 5.2, 0.2);
    hopSounds();
    setTimeout(() => { player.getWorldPosition(tmpV); tmpV.y += 2.3; confetti(tmpV, 130, 5); sparkle(); }, 250);
    toast(`${item.emoji} ${josa(item.name, '을', '를')} 받았어요! 신난다~`, 3200);
  }

  // ------------------------------------------------------------------
  // 점프
  // ------------------------------------------------------------------
  function jump() {
    const u = player.userData;
    if (sitting === 'ride' || sitting === 'roll') return;
    if (sitting) { standUp(); }
    if (u.air || u.pose === 'crouch') return;
    u.air = true; u.jumpY = 0.001; u.jumpV = 5.6;
    whoosh();
  }

  // ------------------------------------------------------------------
  // 썰매 한 바퀴 — 마을 위를 크게 날아 제자리로
  // ------------------------------------------------------------------
  let ride = null;
  // 비행 중 시점 — 0: 옆 앞에서 (썰매 · 순록 · 마을이 다 보이게)  1: 썰매에 탄 내 눈으로  2: 높이서 넓게
  const RIDE_CAMS = ['옆에서 보기', '썰매에서 보기', '높이서 보기'];
  let rideCam = 0, rideCamReset = true;
  const rideCamPos = new THREE.Vector3(), rideLook = new THREE.Vector3(), rcA = new THREE.Vector3(), rcB = new THREE.Vector3(), rcW = new THREE.Vector3(), rcL = new THREE.Vector3();
  function cycleRideCam() {
    rideCam = (rideCam + 1) % RIDE_CAMS.length;
    rideCamReset = rideCam === 1;   // 내 눈 시점은 바로 옮겨야 머리가 안 보입니다
    toast(`📷 ${RIDE_CAMS[rideCam]}`);
    refreshPanel(true);
  }
  function updateRideCam(dt) {
    const g = SL.group, pp = player.position;
    const fw = rcA.set(Math.cos(g.rotation.y), 0, -Math.sin(g.rotation.y));
    const out = rcB.set(pp.x, 0, pp.z).normalize();
    if (rideCam === 0) {
      rcW.copy(pp).addScaledVector(out, 8).addScaledVector(fw, 7.5); rcW.y += 3.2;
      rcL.copy(pp).lerp(tmpV.set(0, 0, 0), 0.22); rcL.y = pp.y - 1.5;
    } else if (rideCam === 1) {
      // 자리에서 고개를 돌려 마을 쪽(원 안쪽)을 비스듬히 내려다봅니다 — 앞의 순록에 가리지 않게
      rcW.copy(pp).addScaledVector(fw, -0.1).addScaledVector(out, -0.5); rcW.y += 2.6;
      rcL.copy(rcW).addScaledVector(fw, 8).addScaledVector(out, -12); rcL.y -= 9;
    } else {
      rcW.copy(pp).addScaledVector(out, 15).addScaledVector(fw, -9); rcW.y += 10;
      rcL.copy(pp).lerp(tmpV.set(0, 0, 0), 0.45); rcL.y = 0;
    }
    if (rideCamReset) { rideCamPos.copy(rcW); rideLook.copy(rcL); rideCamReset = false; }
    const k = Math.min(1, dt * (rideCam === 1 ? 20 : 3));
    rideCamPos.lerp(rcW, k);
    rideLook.lerp(rcL, Math.min(1, dt * (rideCam === 1 ? 12 : 4)));
    camera.position.copy(rideCamPos);
    camera.lookAt(rideLook);
    player.visible = rideCam !== 1;
  }
  function startRide() {
    rideCamReset = true;
    if (ride || sitting !== 'sleigh') return;
    const P0 = SL.home.pos;
    const th0 = Math.atan2(P0.z, P0.x), R0 = Math.hypot(P0.x, P0.z);
    const h = new THREE.Vector3(Math.cos(SL.home.ry), 0, -Math.sin(SL.home.ry));
    const dir = (h.x * -Math.sin(th0) + h.z * Math.cos(th0)) >= 0 ? 1 : -1;
    ride = { t: 0, T: 26, th0, R0, dir, bellT: 0, trailT: 0 };
    sitting = 'ride';
    takeBell(player);
    santa.userData.gesture = { type: 'wave', t: 0, dur: 3 };
    sayBubble(santa, '잘 다녀오렴! 허허허');
    jingle(14, 0.07);
    toast('🛷 출발! 마을 위를 한 바퀴 날아요');
    refreshPanel(true);
  }
  function rideAt(s, out) {
    const lift = smooth(0.03, 0.2, s) * (1 - smooth(0.8, 0.97, s));
    const th = ride.th0 + ride.dir * Math.PI * 2 * s;
    const R = ride.R0 + lift * 5;
    out.set(Math.cos(th) * R, lift * (15 + Math.sin(s * Math.PI * 4) * 1.5), Math.sin(th) * R);
    return lift;
  }
  const rp = new THREE.Vector3(), rp1 = new THREE.Vector3(), rp2 = new THREE.Vector3();
  function updateRide(dt) {
    ride.t += dt;
    const g = SL.group;
    const uu = Math.min(1, ride.t / ride.T);
    if (uu >= 1) {
      g.position.copy(SL.home.pos);
      g.rotation.set(0, SL.home.ry, 0);
      ride = null;
      sitting = 'sleigh';
      player.position.set(SL.seat.x, SL.seatY - 0.42, SL.seat.z);
      player.rotation.y = targetYaw = SL.seatRy;
      sayBubble(santa, '어서 오렴! 하늘은 어땠니?');
      jingle(8, 0.06);
      toast('🛷 무사히 도착! 즐거운 비행이었어요');
      yawGoal = null;
      for (const d of SL.deer) d.userData.excite = 0;
      refreshPanel(true);
      return;
    }
    const sp = uu - Math.sin(2 * Math.PI * uu) / (2 * Math.PI) * 0.85;
    const lift = rideAt(sp, rp);
    rideAt(Math.min(1, sp + 0.003), rp2);
    rideAt(Math.max(0, sp - 0.003), rp1);
    rp2.sub(rp1);
    g.position.copy(rp);
    const hl = Math.hypot(rp2.x, rp2.z);
    if (hl > 1e-6) {
      g.rotation.y = Math.atan2(-rp2.z, rp2.x);
      g.rotation.z = Math.atan2(rp2.y, hl) * 0.8;
      g.rotation.x = ride.dir * 0.14 * lift;
    }
    g.updateMatrixWorld(true);
    g.localToWorld(player.position.set(-0.5, SL.seatY - 0.42, 0));
    player.rotation.y = targetYaw = g.rotation.y + Math.PI / 2;
    for (const d of SL.deer) d.userData.excite = 0.5;
    ride.bellT -= dt;
    if (ride.bellT < 0) { ride.bellT = 0.22; bell(0.025 + lift * 0.01); }
    ride.trailT -= dt;
    if (ride.trailT < 0 && lift > 0.08) {
      ride.trailT = 0.05;
      for (const sz of [-0.55, 0.55]) puff(g.localToWorld(new THREE.Vector3(-1.9, 0.1, sz)), { n: 1, color: pick(['#ffe08a', '#ffffff', '#ffd0f0']), size: 0.35, up: -0.2, spread: 0.2, life: 1.6, opacity: 0.85 });
    }
  }
  const bubbles = [];
  function sayBubble(av, text) {
    const u = av.userData;
    if (u.bubble) { av.remove(u.bubble); }
    const b = makeLabel(text, { size: 34, scale: 0.6, bg: 'rgba(255,255,255,.95)' });
    b.position.y = (u.label ? 2.62 : 2.35);
    av.add(b);
    u.bubble = b;
    bubbles.push({ av, b, t: 0 });
  }

  // ------------------------------------------------------------------
  // 장소 패널
  // ------------------------------------------------------------------
  let curPlace = null;
  function actionsFor(p) {
    const u = player.userData;
    if (p.id === 'tree') return [
      [`✨ 불빛 바꾸기 (지금: ${MODES[TREE.mode]})`, cycleLights],
      [songPlaying ? '⏹ 오르골 멈추기' : `🎶 캐럴 오르골 — ${SONGS[songI % SONGS.length].name}`, () => { if (songPlaying) { stopSong(); refreshPanel(true); } else { lookTree(); playSong(); } }, songPlaying],
      ['💌 소원 오너먼트 달기', hangWish],
    ];
    if (p.id === 'cocoa') return [['☕ 코코아 마시기', drinkCocoa], ['🎶 캐럴 흥얼거리기', () => { player.userData.gesture = { type: 'dance', t: 0, dur: 3 }; faceCam(0.6, 5, 0.2); if (!songPlaying) playSong(); }]];
    if (p.id === 'workshop') return [['🎁 선물 열어 보기', openGift], ['🎅 선물 받기', () => receiveGift(pick(GIFT_ITEMS))], ['🔔 방울 흔들기', ringBell]];
    if (p.house) return [[p.house.workshop ? '🚪 문 열고 공방 구경하기' : '🚪 문 열고 들어가기', () => enterHouse(p.house)]];
    if (p.station !== undefined) return [['🎁 이 선물 받기', () => receiveGift(GIFT_ITEMS[p.station])], ['🚪 밖으로 나가기', () => exitHouse()]];
    if (p.id === 'inside') {
      if (inHouse && inHouse.workshop) return [['🎁 아무 선물이나 받기', () => receiveGift(pick(GIFT_ITEMS))], ['🔥 벽난로 불 쬐기', warmFire], ['🚪 밖으로 나가기', () => exitHouse()]];
      if (sitting) return [['🙋 일어나기', standUp], ['🚪 밖으로 나가기', () => exitHouse()]];
      return [['🛋 소파에 앉기', sitSofa], ['🔥 벽난로 불 쬐기', warmFire], ['🍪 쿠키 먹기', eatCookie], [intTreeOn ? '🎄 작은 트리 불 끄기' : '🎄 작은 트리 불 켜기', toggleIntTree, intTreeOn], ['🚪 밖으로 나가기', () => exitHouse()]];
    }
    if (p.id === 'snowman' && roll) return [];
    if (p.id === 'snowman') return [
      snowMan.stage < 5 ? [`☃️ 눈 굴리기 — ${SNOW_STEPS[snowMan.stage]} (${snowMan.stage}/5)`, rollSnow] : ['🔄 새 눈사람 만들기', resetSnowman],
      ['❄️ 눈뭉치 던지기', () => throwSnowball(player)],
    ];
    if (p.id === 'sleigh' && sitting === 'ride') return [[`📷 시점 바꾸기 (지금: ${RIDE_CAMS[rideCam]})`, cycleRideCam]];
    if (p.id === 'sleigh') return sitting === 'sleigh'
      ? [['🌟 한 바퀴 날아 보기', startRide], ['🔔 방울 흔들기', ringBell], ['🙋 일어나기', standUp]]
      : [['🛷 썰매에 앉기', sitSleigh], ['🎅 산타에게 인사하기', greetSanta], ['🔔 방울 흔들기', ringBell]];
    if (p.id === 'pond') return [[u.skate ? '👟 스케이트 벗기' : '⛸ 스케이트 신기', toggleSkate, u.skate]];
    return [];
  }
  function infoFor(p) {
    if (p.id === 'tree') return `달린 소원 오너먼트 ${wishes.length}개 · 분홍 공을 누르면 읽을 수 있어요`;
    if (p.id === 'snowman' && roll) return '❄️ 데굴데굴 굴리는 중…';
    if (p.id === 'snowman') return snowMan.stage >= 5 ? '눈사람 완성!' : `눈사람 ${snowMan.stage}/5 단계`;
    if (p.id === 'sleigh' && sitting === 'ride') return '🛷 마을 위를 날고 있어요! 아래를 내려다보세요';
    if (p.id === 'inside' && inHouse && inHouse.workshop) return '받침대 가까이 가면 그 선물을 받을 수 있어요';
    if (p.id === 'pond') return player.userData.skate ? '방향키 · 클릭으로 미끄러지듯 움직여요' : '';
    return '';
  }
  function refreshPanel(force) {
    const el = $('#panel');
    if (!curPlace) { el.classList.remove('show'); return; }
    if (!force && el.dataset.id === curPlace.id) return;
    el.dataset.id = curPlace.id;
    el.innerHTML = '';
    const h = document.createElement('h3'); h.textContent = `${curPlace.emoji} ${curPlace.name}`;
    const d = document.createElement('p'); d.textContent = curPlace.desc;
    el.append(h, d);
    const info = infoFor(curPlace);
    if (info) { const i = document.createElement('div'); i.className = 'info'; i.textContent = info; el.append(i); }
    const box = document.createElement('div'); box.className = 'actions';
    for (const [label, fn, on] of actionsFor(curPlace)) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      if (on) b.classList.add('on');
      b.onclick = () => { ensureAudio(); fn(); };
      box.append(b);
    }
    el.append(box);
    el.classList.add('show');
  }

  // 길찾기
  {
    const box = $('#places');
    for (const p of PLACES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${p.emoji} ${p.name}`;
      b.onclick = () => { goTo(p); box.classList.remove('show'); };
      box.append(b);
    }
    $('#btn-places').onclick = () => box.classList.toggle('show');
  }
  placeById.tree.go = [0, 6.8];
  function goTo(p) {
    if (sitting === 'ride' || sitting === 'roll') return;
    if (player.userData.skate) { toast(SKATE_MSG); return; }
    if (inHouse) { exitHouse(() => goTo(p)); return; }
    yawGoal = Math.atan2(p.go[0] - p.x, p.go[1] - p.z);
    standUp();
    pendingAct = null;
    moveTarget = new THREE.Vector3(p.go[0], 0, p.go[1]);
    pushOut(moveTarget);
    stuckT = 0; bestD = Infinity;
  }

  // ------------------------------------------------------------------
  // 입력 · 카메라
  // ------------------------------------------------------------------
  let yaw = 0, pitch = 0.2, dist = 12.5;
  let targetYaw = Math.PI;
  let moveTarget = null, stuckT = 0, bestD = Infinity;
  const keys = new Set();
  const vel = new THREE.Vector3();
  const typing = () => document.activeElement && document.activeElement.tagName === 'INPUT';
  addEventListener('keydown', (e) => {
    if (typing()) return;
    const k = e.key.toLowerCase();
    if (sitting === 'ride' || sitting === 'roll') return;
    if (k === ' ') { e.preventDefault(); jump(); return; }
    if (k === 'shift') { keys.add('shift'); return; }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); if (sitting) standUp(); moveTarget = null; pendingAct = null; }
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  let running = false, runTipShown = false, yawGoal = null, camGoal = null;
  const lookFrom = (y, p, d) => { yawGoal = y; camGoal = { p, d }; };
  addEventListener('blur', () => keys.clear());
  const cv = renderer.domElement;
  let drag = null;
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }; cv.setPointerCapture(e.pointerId); ensureAudio(); });
  cv.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX; drag.y = e.clientY;
    yaw -= dx * 0.006;
    if (drag.moved > 8) { yawGoal = null; camGoal = null; }
    pitch = clamp(pitch + dy * 0.004, 0.06, 1.2);
  });
  cv.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.moved < 8) handleClick(e);
  });
  cv.addEventListener('wheel', (e) => {
    camGoal = null; dist = clamp(dist * (1 + Math.sign(e.deltaY) * 0.1), 4, 28); e.preventDefault(); }, { passive: false });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let lastClick = { t: 0, x: 0, y: 0 };
  function handleClick(e) {
    if (sitting === 'ride' || sitting === 'roll' || doorBusy) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const now = performance.now();
    const dbl = now - lastClick.t < 380 && Math.hypot(e.clientX - lastClick.x, e.clientY - lastClick.y) < 40;
    lastClick = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    // 문 · 선물 받침대 (앞에 가리는 것이 없을 때만)
    const first = ray.intersectObjects(inHouse ? [ROOM] : [...HOUSE_LIST.map((h) => h.g), ...walkables], true)[0];
    if (first && first.object.userData.house) { enterHouse(first.object.userData.house); return; }
    if (first && first.object.userData.exit) { exitHouse(); return; }
    if (first && first.object.userData.station !== undefined) { const st = STATIONS[first.object.userData.station]; walkThen(st.spot, () => faceTo(player, st.pos)); return; }
    const w = ray.intersectObjects(wishMeshes, false)[0];
    if (w) { toast(`💌 "${w.object.userData.wish}"`, 3800); tone(1046, 0.05, 0.8); return; }
    const hit = ray.intersectObjects(walkables, false)[0];
    if (!hit) return;
    if (player.userData.skate && !onIce(hit.point.x, hit.point.z)) { toast(SKATE_MSG); return; }
    if (sitting) standUp();
    pendingAct = null;
    moveTarget = hit.point.clone();
    pushOut(moveTarget);
    stuckT = 0; bestD = Infinity;
    running = dbl;
    if (dbl) {
      // 두 번 누르면 누른 곳보다 더 멀리 — 누른 방향으로 18m 더, 최소 42m 를 달려갑니다 (마을 끝 · 방 벽에서는 멈춤)
      const dx = moveTarget.x - player.position.x, dz = moveTarget.z - player.position.z, d = Math.hypot(dx, dz);
      if (d > 0.3) {
        const go = Math.max(d + 18, 42);
        moveTarget.set(player.position.x + dx / d * go, 0, player.position.z + dz / d * go);
        if (player.userData.skate && !onIce(moveTarget.x, moveTarget.z)) moveTarget.set(hit.point.x, 0, hit.point.z);
        pushOut(moveTarget);
      }
    }
    if (dbl && !runTipShown) { runTipShown = true; toast('🏃 두 번 누르면 폴짝폴짝 뛰면서 달려가요! (Space 점프 · Shift 달리기)'); }
    puff(new THREE.Vector3(moveTarget.x, floorY(moveTarget.x, moveTarget.z) + 0.1, moveTarget.z), { n: 4, size: 0.25, up: 0.3, spread: 0.5, life: 0.6, opacity: 0.6 });
  }

  $('#g-wave').onclick = () => { faceCam(0.5, 5.5, 0.2); player.userData.gesture = { type: 'wave', t: 0, dur: 2.4 }; };
  $('#g-bow').onclick = () => { faceCam(0.6, 5.5, 0.2); player.userData.gesture = { type: 'bow', t: 0, dur: 1.8 }; };
  $('#g-dance').onclick = () => { ensureAudio(); faceCam(0.5, 6, 0.2); player.userData.gesture = { type: 'dance', t: 0, dur: 4 }; jingle(6, 0.04); };
  $('#g-snow').onclick = () => { ensureAudio(); if (inHouse) { toast('집 안에서는 눈뭉치를 던질 수 없어요 😅'); return; } if (!sitting) throwSnowball(player); };
  $('#g-jump').onclick = () => { ensureAudio(); jump(); };
  $('#btn-help').onclick = () => $('#help').classList.add('show');
  $('#help-close').onclick = () => $('#help').classList.remove('show');
  $('#btn-sound').onclick = () => {
    ensureAudio();
    soundOn = !soundOn;
    if (master) master.gain.setTargetAtTime(soundOn ? 0.9 : 0, actx.currentTime, 0.05);
    $('#btn-sound').innerHTML = soundOn ? '🔊<span> 소리 켜짐</span>' : '🔇<span> 소리 꺼짐</span>';
  };
  $('#rename').onclick = async () => {
    $('#modal-title').textContent = '새 이름 (12자까지)';
    const v = await askText();
    $('#modal-title').textContent = '소원 오너먼트에 적을 말';
    if (!v) return;
    myName = v.slice(0, 12);
    localStorage.setItem('santa.name', myName);
    $('#myname').textContent = myName;
    const u = player.userData;
    if (u.label) { player.remove(u.label); }
    u.label = makeLabel(myName, { size: 32, scale: 0.46 });
    u.label.position.y = 2.25;
    player.add(u.label);
  };
  document.addEventListener('visibilitychange', () => {
    if (!actx) return;
    if (document.hidden) actx.suspend(); else actx.resume();
  });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.fov = camera.aspect < 0.8 ? 62 : 50;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  camera.fov = innerWidth / innerHeight < 0.8 ? 62 : 50;
  camera.updateProjectionMatrix();

  // ------------------------------------------------------------------
  // 루프
  // ------------------------------------------------------------------
  const clock = new THREE.Clock();
  const camTarget = new THREE.Vector3(0, 1.4, 16);
  let camDist = 12.5;
  let elapsed = 0, stepPhase = 0, birdT = 8, bellT = 14, lightT = 0, fireT = 0;
  const tmpC = new THREE.Color(), tmpC2 = new THREE.Color(), tmpC3 = new THREE.Color();
  function updateTreeLights(t) {
    const N = TREE.bulbBase.length;
    for (let i = 0; i < N; i++) {
      const b = TREE.bulbBase[i];
      if (TREE.mode === 0) { const k = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 + b.ph)) ; tmpC.copy(b.c).multiplyScalar(0.25 + k * 1.1); }
      else if (TREE.mode === 1) { const k = Math.pow(0.5 + 0.5 * Math.sin(b.y * 1.6 - t * 5), 3); tmpC.copy(b.c).multiplyScalar(0.2 + k * 1.3); }
      else if (TREE.mode === 2) { tmpC.setHSL(((i / N) * 4 - t * 0.25) % 1 + (((i / N) * 4 - t * 0.25) % 1 < 0 ? 1 : 0), 1, 0.55); }
      else { const k = 0.7 + 0.3 * Math.sin(t * 3 + b.ph); tmpC.setRGB(1.25 * k, 0.95 * k, 0.55 * k); }
      TREE.bulbs.setColorAt(i, tmpC);
    }
    TREE.bulbs.instanceColor.needsUpdate = true;
    // 은은한 빛 — 모드마다 색과 숨결이 다릅니다
    let gk = 1;
    const want = tmpC2;
    if (TREE.mode === 0) {
      const f = t * 0.45, i0 = Math.floor(f) % BULB_COLORS.length, i1 = (i0 + 1) % BULB_COLORS.length;
      want.set(BULB_COLORS[i0]).lerp(tmpC3.set(BULB_COLORS[i1]), smooth(0, 1, f % 1)).lerp(tmpC3.set('#fff2d8'), 0.35);
      gk = 0.8 + 0.2 * Math.sin(t * 2.2);
    } else if (TREE.mode === 1) {
      want.set('#9fd8ff').lerp(tmpC3.set('#ffffff'), 0.2);
      gk = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.5), 2);
    } else if (TREE.mode === 2) {
      want.setHSL(((-t * 0.25) % 1 + 1) % 1, 1, 0.62);
    } else {
      want.set('#ffc861');
      gk = 0.9 + 0.1 * Math.sin(t * 3);
    }
    TREE.glowCol.lerp(want, 0.12);
    for (const hs of TREE.halos) { hs.material.color.copy(TREE.glowCol); hs.material.opacity = hs.userData.op * gk; }
    TREE.pool.material.color.copy(TREE.glowCol);
    TREE.pool.material.opacity = 0.5 * gk;
    TREE.light.color.copy(TREE.glowCol);
    TREE.light.intensity = 6 * gk;
    TREE.glow.material.color.copy(TREE.glowCol).lerp(tmpC3.set('#fff1a8'), 0.5);
    for (let i = 0; i < bulbPts.length; i++) {
      const b = bulbPts[i];
      const k = 0.55 + 0.45 * Math.sin(t * 1.6 + b.ph);
      tmpC.copy(b.c).multiplyScalar(0.45 + k * 0.8);
      bulbIM2.setColorAt(i, tmpC);
    }
    bulbIM2.instanceColor.needsUpdate = true;
  }

  function tick() {
    const dt = Math.min(0.05, clock.getDelta());
    elapsed += dt;
    const t = elapsed;
    if (ride) updateRide(dt);
    if (roll) updateRoll(dt);

    // --- 내 이동
    const u = player.userData;
    let moving = false;
    const iced = onIce(player.position.x, player.position.z);
    u.onIce = iced;
    const skating = u.skate && iced;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let ix = 0, iz = 0;
    if (keys.has('w') || keys.has('arrowup')) { ix += fx; iz += fz; }
    if (keys.has('s') || keys.has('arrowdown')) { ix -= fx; iz -= fz; }
    if (keys.has('a') || keys.has('arrowleft')) { ix += fz; iz -= fx; }
    if (keys.has('d') || keys.has('arrowright')) { ix -= fz; iz += fx; }
    if (!sitting && moveTarget && !ix && !iz) {
      const dx = moveTarget.x - player.position.x, dz = moveTarget.z - player.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.25) { moveTarget = null; running = false; if (pendingAct) { const a = pendingAct; pendingAct = null; a.fn(); } }
      else {
        ix = dx / d; iz = dz / d;
        if (d < bestD - 0.05) { bestD = d; stuckT = 0; } else { stuckT += dt; if (stuckT > 2.5) { moveTarget = null; pendingAct = null; } }
      }
    }
    const il = Math.hypot(ix, iz);
    if (il > 0 && !sitting) { ix /= il; iz /= il; }
    const runNow = !skating && !sitting && (running && moveTarget || keys.has('shift'));
    const speed = skating ? 7.0 : runNow ? 8.6 : 4.4;
    // 두 번 눌러 달릴 때는 폴짝폴짝 뛰면서 달려갑니다
    if (running && moveTarget && !u.air && !sitting && !skating && il > 0) { u.air = true; u.jumpY = 0.001; u.jumpV = 4.6; }
    if (skating) {
      vel.x = lerp(vel.x, ix * speed, Math.min(1, dt * (il ? 1.6 : 0.5)));
      vel.z = lerp(vel.z, iz * speed, Math.min(1, dt * (il ? 1.6 : 0.5)));
    } else {
      vel.x = ix * speed; vel.z = iz * speed;
    }
    if (sitting || u.pose === 'crouch') vel.set(0, 0, 0);
    const vlen = Math.hypot(vel.x, vel.z);
    if (vlen > 0.15) {
      moving = true;
      const before = player.position.clone();
      player.position.x += vel.x * dt;
      player.position.z += vel.z * dt;
      pushOut(player.position);
      // 이웃 · 산타와도 부딪힙니다
      if (!inHouse) for (const o of bodies) {
        const ox = player.position.x - o.position.x, oz = player.position.z - o.position.z, od = Math.hypot(ox, oz);
        if (od < 0.75 && od > 1e-4) { player.position.x += ox / od * (0.75 - od); player.position.z += oz / od * (0.75 - od); }
      }
      if (u.skate && !onIce(player.position.x, player.position.z)) {
        player.position.copy(before);
        vel.multiplyScalar(-0.3);
        moveTarget = null;
        if (!u.edgeWarn || elapsed - u.edgeWarn > 4) { u.edgeWarn = elapsed; toast(SKATE_MSG); }
      }
      if (skating) { vel.x = (player.position.x - before.x) / dt; vel.z = (player.position.z - before.z) / dt; }
      targetYaw = Math.atan2(vel.x, vel.z);
      if (u.drink > 0) { u.drink = 0; takeCup(player); }
    }
    if (u.jumpV !== undefined) {
      u.jumpY += u.jumpV * dt; u.jumpV -= 15 * dt;
      if (u.jumpY <= 0) { u.jumpY = 0; u.jumpV = undefined; u.air = false; if (actx) { if (iced) scrape(); else crunch(1.2); } if (!iced && !inHouse) puff(player.position.clone().setY(floorY(player.position.x, player.position.z) + 0.1), { n: 5, size: 0.3, up: 0.4, spread: 0.8, life: 0.6, opacity: 0.6 }); }
    }
    if (!sitting) player.position.y = floorY(player.position.x, player.position.z) + (iced ? 0.03 : 0) + (u.jumpY || 0);
    let dy = targetYaw - player.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    player.rotation.y += dy * Math.min(1, dt * 10);
    if (u.drink > 0) { u.drink -= dt; if (u.drink <= 0) takeCup(player); }
    if (u.ringBell > 0) { u.ringBell -= dt; if (u.ringBell <= 0 && !sitting) takeBell(player); }
    animateAvatar(player, dt, (moving && !sitting && !u.air) || !!(roll && roll.moving), roll ? 0.45 : skating ? 1 : vlen / 4.4);
    if (u.carry) { u.carryT -= dt; if (u.carryT <= 0) dropCarry(); }
    // 발소리
    if (moving && !sitting && !u.air) {
      const ph = Math.floor(u.gait / Math.PI);
      if (ph !== stepPhase) { stepPhase = ph; if (actx) { if (skating) scrape(); else if (!iced) crunch(0.8); } }
    }

    // --- 장소 패널
    let near = null;
    for (const p of PLACES) if (Math.hypot(player.position.x - p.x, player.position.z - p.z) < p.r) { near = p; break; }
    let pnl = near;
    if (sitting === 'ride') pnl = SL;
    else if (inHouse) {
      pnl = INSIDE;
      if (inHouse.workshop) { let best = 1.7; for (const st of STATIONS) { const dd = Math.hypot(player.position.x - st.pos.x, player.position.z - st.pos.z); if (dd < best) { best = dd; pnl = st.place; } } }
    } else { let best = 2.0; for (const h of HOUSE_LIST) { const dd = Math.hypot(player.position.x - h.doorSpot.x, player.position.z - h.doorSpot.z); if (dd < best) { best = dd; pnl = h.place; } } }
    if (pnl !== curPlace) { curPlace = pnl; refreshPanel(true); }
    for (const p of PLACES) { const m = p.label.material; m.opacity = lerp(m.opacity, p === near ? 0 : 1, Math.min(1, dt * 5)); p.label.visible = m.opacity > 0.02; }

    // --- 카메라
    camTarget.lerp(tmpV.set(player.position.x, player.position.y - (u.jumpY || 0) * 0.6 + 1.4, player.position.z), Math.min(1, dt * (ride ? 10 : 6)));
    if (ride) {   // 원 바깥쪽 조금 뒤에서 마을 가운데를 내려다봅니다
      const ox = player.position.x, oz = player.position.z, ol = Math.hypot(ox, oz) || 1;
      const bx = -Math.sin(player.rotation.y), bz = -Math.cos(player.rotation.y);
      yawGoal = Math.atan2(ox / ol * 0.85 + bx * 0.55, oz / ol * 0.85 + bz * 0.55);
      pitch = lerp(pitch, 0.42, Math.min(1, dt * 1.5));
    }
    if (yawGoal !== null && !drag) {
      const dyw = Math.atan2(Math.sin(yawGoal - yaw), Math.cos(yawGoal - yaw));
      yaw += dyw * Math.min(1, dt * (ride ? 2.5 : 2.2));
      if (Math.abs(dyw) < 0.01 && !ride) yawGoal = null;
    }
    if (camGoal && !drag) {
      pitch = lerp(pitch, camGoal.p, Math.min(1, dt * 2.5));
      dist = lerp(dist, camGoal.d, Math.min(1, dt * 2.5));
      if (Math.abs(pitch - camGoal.p) < 0.005 && Math.abs(dist - camGoal.d) < 0.03) camGoal = null;
    }
    const wantDist = inHouse ? Math.min(dist, 8) : ride ? 14 : dist;
    // 건물에 가리면 카메라를 앞으로 당깁니다
    let allow = wantDist;
    if (!inHouse && !ride) {
      for (let i = 1; i <= 14; i++) {
        const k2 = (i / 14) * wantDist;
        const px = camTarget.x + Math.sin(yaw) * Math.cos(pitch) * k2, py = camTarget.y + Math.sin(pitch) * k2, pz = camTarget.z + Math.cos(yaw) * Math.cos(pitch) * k2;
        let hitB = false;
        for (const b of blockers) {
          if (!b.h || py > b.h) continue;
          const ox = px - b.x, oz = pz - b.z;
          if (b.r !== undefined) { if (Math.hypot(ox, oz) < b.r + 0.6) { hitB = true; break; } continue; }
          if (Math.abs(ox * b.c - oz * b.s) < b.hw + 0.3 && Math.abs(ox * b.s + oz * b.c) < b.hd + 0.3) { hitB = true; break; }
        }
        if (hitB) { allow = Math.max(1.8, k2 - wantDist / 14); break; }
      }
    }
    camDist = allow < camDist ? lerp(camDist, allow, Math.min(1, dt * 14)) : lerp(camDist, allow, Math.min(1, dt * 2.5));
    camera.position.set(
      camTarget.x + Math.sin(yaw) * Math.cos(pitch) * camDist,
      camTarget.y + Math.sin(pitch) * camDist,
      camTarget.z + Math.cos(yaw) * Math.cos(pitch) * camDist,
    );
    if (inHouse) {
      // 뒤쪽 벽(벽난로)은 넘지 않고, 앞 · 옆으로는 벽 밖까지 물러나 들여다봅니다
      camera.position.x = clamp(camera.position.x, INT.x - INT.W / 2 - 3, INT.x + INT.W / 2 + 3);
      camera.position.z = clamp(camera.position.z, INT.z - INT.D / 2 + 0.4, INT.z + INT.D / 2 + 4);
      camera.position.y = clamp(camera.position.y, 0.6, INT.H - 0.25);
      WALLS.front.visible = camera.position.z < INT.z + INT.D / 2;
      WALLS.left.visible = camera.position.x > INT.x - INT.W / 2;
      WALLS.right.visible = camera.position.x < INT.x + INT.W / 2;
    } else {
      const cg = groundY(camera.position.x, camera.position.z) + 0.6;
      if (camera.position.y < cg) camera.position.y = cg;
    }
    camera.lookAt(camTarget);
    if (ride) updateRideCam(dt); else if (!player.visible) player.visible = true;
    sun.position.copy(camTarget).addScaledVector(sunDir, 70);
    sun.target.position.copy(camTarget);
    sky.position.copy(camera.position);

    // --- 이웃
    for (const n of npcs) {
      const av = n.av;
      let mv = false;
      if (n.wait > 0) n.wait -= dt;
      else {
        if (!n.target) { const w = pick(WAY); n.target = new THREE.Vector3(w[0] + (Math.random() - 0.5) * 2, 0, w[1] + (Math.random() - 0.5) * 2); n.stuck = 0; }
        const dx = n.target.x - av.position.x, dz = n.target.z - av.position.z, d = Math.hypot(dx, dz);
        if (d < 0.4 || n.stuck > 6) { n.target = null; n.wait = 2 + Math.random() * 5; if (Math.random() < 0.3) av.userData.gesture = { type: 'wave', t: 0, dur: 2.2 }; }
        else {
          const before = av.position.clone();
          av.position.x += dx / d * 1.6 * dt; av.position.z += dz / d * 1.6 * dt;
          pushOut(av.position);
          if (av.position.distanceTo(before) < 0.6 * dt) n.stuck += dt;
          let r = Math.atan2(dx, dz) - av.rotation.y; r = Math.atan2(Math.sin(r), Math.cos(r));
          av.rotation.y += r * Math.min(1, dt * 5);
          mv = true;
        }
      }
      animateAvatar(av, dt, mv, 0.42);
    }
    for (const s of skaters) {
      s.a += dt * s.sp;
      const x = POND.x + Math.cos(s.a) * POND.rx * s.r, z = POND.z + Math.sin(s.a) * POND.rz * s.r;
      const dx = -Math.sin(s.a) * POND.rx, dz = Math.cos(s.a) * POND.rz;
      s.av.position.set(x, 0.03, z);
      s.av.rotation.y = Math.atan2(dx, dz);
      animateAvatar(s.av, dt, true);
      s.av.userData.inner.rotation.z = 0.12;
    }
    // 산타 — 가끔 손 흔들기, 플레이어가 오면 바라보기
    {
      const su = santa.userData;
      const pd = player.position.distanceTo(santa.position);
      if (su.lookT > 0) su.lookT -= dt;
      let want = su.home;
      if (pd < 6) want = Math.atan2(player.position.x - santa.position.x, player.position.z - santa.position.z);
      let r = want - santa.rotation.y; r = Math.atan2(Math.sin(r), Math.cos(r));
      santa.rotation.y += r * Math.min(1, dt * 3);
      if (!su.gesture && Math.random() < dt * 0.06) su.gesture = { type: 'wave', t: 0, dur: 2.4 };
      animateAvatar(santa, dt, false);
      animateAvatar(vendor, dt, false);
      if (!vendor.userData.gesture && Math.random() < dt * 0.04) vendor.userData.gesture = { type: 'wave', t: 0, dur: 2 };
    }
    // 순록 — 고개 끄덕 · 발 구르기
    for (const d of SL.deer) {
      const du = d.userData;
      du.t += dt;
      const ex = du.excite > 0 ? (du.excite -= dt, 1) : 0;
      du.neck.rotation.z = Math.sin(du.t * 0.8) * 0.08 + ex * Math.sin(du.t * 9) * 0.12;
      du.head.rotation.x = Math.sin(du.t * 0.6) * 0.1;
      for (let i = 0; i < du.legs.length; i++) du.legs[i].rotation.z = ex * Math.sin(du.t * 12 + i * 1.6) * 0.3;
      d.position.y = ex * Math.abs(Math.sin(du.t * 12)) * 0.06;
    }

    // --- 트리 · 별 · 전구
    TREE.star.rotation.y = t * 0.6;
    TREE.glow.material.opacity = 0.55 + Math.sin(t * 2.4) * 0.15;
    TREE.glow.scale.setScalar(4.0 + Math.sin(t * 2.4) * 0.4);
    lightT += dt;
    if (lightT > 1 / 30) { updateTreeLights(t); lightT = 0; }
    for (let i = growing.length - 1; i >= 0; i--) {
      const g = growing[i];
      g.userData.grow += dt * 2.5;
      const k = Math.min(1, g.userData.grow);
      g.scale.setScalar(k < 1 ? 1 + Math.sin(k * Math.PI) * 0.4 * (1 - k) + (k - 1) * 0.0 : 1);
      if (k >= 1) growing.splice(i, 1);
    }
    for (let i = snowMan.grow.length - 1; i >= 0; i--) {
      const g = snowMan.grow[i];
      g.t += dt * 2.2;
      const k = Math.min(1, g.t);
      g.o.scale.setScalar(k < 1 ? k + Math.sin(k * Math.PI) * 0.25 : 1);
      if (k >= 1) snowMan.grow.splice(i, 1);
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.t += dt;
      if (b.t > 4.5) { b.av.remove(b.b); if (b.av.userData.bubble === b.b) b.av.userData.bubble = null; bubbles.splice(i, 1); }
    }
    for (const c of clouds) { c.userData.a += dt * 0.004; c.position.x = Math.cos(c.userData.a) * c.userData.r; c.position.z = Math.sin(c.userData.a) * c.userData.r; }

    updateGift(dt);
    // 문 여닫기
    for (const h of HOUSE_LIST) { const want = -h.doorT * 1.6; if (Math.abs(h.door.rotation.y - want) > 0.001) h.door.rotation.y = lerp(h.door.rotation.y, want, Math.min(1, dt * 5)); }
    intDoor.rotation.y = lerp(intDoor.rotation.y, intDoorT * 1.5, Math.min(1, dt * 5));
    // 집 안 — 불꽃 · 창밖 눈 · 작은 트리 · 선물 받침대
    if (inHouse) {
      for (let i = 0; i < fireFlames.length; i++) {
        const f = fireFlames[i];
        const k3 = 1 + Math.sin(t * 13 + i * 2.1) * 0.12 + Math.sin(t * 23 + i) * 0.08;
        if (f.isSprite) f.material.opacity = 0.75 + Math.sin(t * 17 + i) * 0.2; else f.scale.set(1, k3, 1);
      }
      fireLight.intensity = 7 + Math.sin(t * 11) * 0.8 + Math.sin(t * 27) * 0.5;
      fireGlow.material.opacity = 0.6 + Math.sin(t * 9) * 0.1;
      winFlakes.offset.y += dt * 0.07;
      winFlakes.offset.x = Math.sin(t * 0.4) * 0.03;
      for (const b of intTreeBulbs) {
        const tw = 0.5 + 0.5 * Math.sin(t * 2.4 + b.userData.ph);
        b.material.color.copy(b.userData.base).multiplyScalar(intTreeOn ? 0.5 + 0.6 * tw : 0.12);
        b.userData.glow.material.opacity = intTreeOn ? 0.15 + 0.6 * tw * tw : 0;
      }
      intTreeHalo.material.opacity = intTreeOn ? 0.22 + 0.08 * Math.sin(t * 1.3) : 0;
      for (const st of STATIONS) st.item.rotation.y = t * 0.6 + st.i;
    }
    updateConfetti(dt);
    updateBalls(dt);
    updatePuffs(dt);
    emitSmoke(dt);
    snowfall.uniforms.uTime.value = t;
    snowfall.uniforms.uCam.value.copy(camera.position);
    glitter.uniforms.uTime.value = t;

    // --- 배경 소리
    if (actx && soundOn) {
      birdT -= dt;
      if (birdT < 0) { birdT = 14 + Math.random() * 18; if (!inHouse) chickadee(); }
      bellT -= dt;
      if (bellT < 0) { bellT = 18 + Math.random() * 20; jingle(5, 0.012); }
      if (windGain) windGain.gain.value = (0.016 + 0.01 * (0.5 + 0.5 * Math.sin(t * 0.13) * Math.sin(t * 0.31))) * (inHouse ? 0.2 : 1);
      if (inHouse) { fireT -= dt; if (fireT < 0) { fireT = 0.05 + Math.random() * 0.35; noiseHit({ freq: 1500 + Math.random() * 4000, q: 1.2, vol: 0.006 + Math.random() * 0.03, dur: 0.03 }); } }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  // 시험용 손잡이
  window.__santa = {
    tp(x, z, ry) { player.position.set(x, 0, z); camTarget.set(x, 1.4, z); if (ry !== undefined) { player.rotation.y = targetYaw = ry; } },
    cam(y, p, d) { yaw = y; pitch = p; dist = d; },
    goTo: (id) => goTo(placeById[id]),
    act: (id, i) => actionsFor(placeById[id])[i][1](),
    actP: (p, i) => actionsFor(p)[i][1](),
    runTo: (x, z) => { moveTarget = new THREE.Vector3(x, 0, z); running = true; stuckT = 0; bestD = Infinity; },
    houses: () => HOUSE_LIST, stations: () => STATIONS, inside: () => INSIDE, player: () => player, enter: (i) => enterHouse(HOUSE_LIST[i]), exit: () => exitHouse(), jump: () => jump(),
    places: placeById,
  };

  // 셰이더를 미리 준비하고 시작
  try { await renderer.compileAsync(scene, camera); } catch (e) { /* 오래된 브라우저 */ }
  requestAnimationFrame(tick);
  const enter = $('#enter');
  enter.disabled = false;
  enter.textContent = '🎄 마을로 들어가기';
  enter.onclick = () => {
    ensureAudio();
    startAmbient();
    jingle(10, 0.05);
    $('#intro').classList.remove('show');
    setTimeout(() => toast('❄️ 눈 내리는 산타 마을에 오신 걸 환영해요!', 3200), 300);
  };
})();
