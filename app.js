// AR-Bauanleitung „Schulhaus HTL" – HTL Wolfsberg
// Tracking: zwei ArUco-Marker (MIP 36h12, ID 7 und 11) im Etikettenfeld des Kit-Card-Rahmens.
// Alle Maße in mm; Rahmen-Koordinaten: x nach rechts, y zur Kartenoberkante, z aus der Karte heraus.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import MODEL64 from './model.js';

const q = new URLSearchParams(location.search);
const FOCAL = parseFloat(q.get('f') || '0.78');     // Brennweite relativ zur langen Bildseite
const DET_MAX = 800;
const INIT = +(q.get('step') || 0);                                 // Auflösung für die Markererkennung
const Z_OFF = 2.4;                                   // Haus steht auf dem Rahmen (Rahmenstärke + Luft)
const HOUSE_X = -11;                                 // Hausmitte auf der Bodenplatte (Teelicht)

const STEPS = [
  { t: 'TEILE FINDEN', p: [], x: 'So liegen die 11 Teile auf deiner Karte. Knipse sie mit dem Seitenschneider <b>direkt am Teil</b> ab – die Nummer steht am Rahmen.' },
  { t: 'SEITENWÄNDE', p: [1, 4, 5], x: 'Bodenplatte <b>1</b> hinlegen, Seitenwände <b>4</b> und <b>5</b> einstecken – die Schlitze an den Enden zeigen <b>nach oben</b>.' },
  { t: 'GIEBEL', p: [2, 3], x: 'Giebel <b>2</b> (mit Tür) nach vorne, Giebel <b>3</b> nach hinten. Von oben einschieben, die Eckschlitze greifen ineinander.' },
  { t: 'LICHT & DACH', p: [6, 7], light: true, x: 'LED-Teelicht einschalten und hineinstellen. Dann Dach <b>6</b> (rechts) und <b>7</b> über die Lappen der Giebel legen.' },
  { t: 'KAMIN', p: [8], x: 'Kamin <b>8</b> in den Schlitz im Dach <b>6</b> stecken – die schräge Kante liegt flach auf.' },
  { t: 'TANNE & STERN', p: [9, 10, 11], x: 'Tanne <b>9</b> in die Bodenplatte, Tanne <b>10</b> von oben über Kreuz, Stern <b>11</b> auf die Spitze.' },
  { t: 'FERTIG!', p: [], final: true, x: 'Licht aus, Teelicht an – frohe Weihnachten von der <b>HTL Wolfsberg</b>!' },
];

// ---------- Grundgerüst ----------
const $ = (id) => document.getElementById(id);
const stage = $('stage'), video = $('video');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 5, 6000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x50507a, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(-300, 600, 500); scene.add(sun);

const world = new THREE.Group(); world.matrixAutoUpdate = false; world.visible = false; scene.add(world);
const DATA = await (await fetch('schulhaus.json')).json();
const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(atob(MODEL64), (c) => c.charCodeAt(0)).buffer, '');

const COL = { body: 0xf1ece0, navy: 0x2a2f8c, orange: 0xe39a2d };
const mk = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0 });
const parts = {}, frameGroup = new THREE.Group();
world.add(frameGroup);
gltf.scene.updateMatrixWorld(true);
const meshes = [];
gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
for (const o of meshes) {
  const m = o.name.match(/^p(\d+)_(body|navy|orange)/) || o.name.match(/^(frame)_(body|navy|orange)/);
  if (!m) continue;
  const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
  geo.computeVertexNormals();
  if (m[1] === 'frame') { frameGroup.add(new THREE.Mesh(geo, mk(COL[m[2]]))); continue; }
  const n = +m[1];
  if (!parts[n]) {
    const g = new THREE.Group(); g.userData.mats = []; parts[n] = g; world.add(g);
    const [px, py] = DATA.card_pos[n];
    g.userData.cardPos = new THREE.Vector3(px, py, 0);
    const A = new THREE.Matrix4().fromArray(DATA.asm[n]);
    const p = new THREE.Vector3(), r = new THREE.Quaternion(), s = new THREE.Vector3();
    A.decompose(p, r, s); p.z += Z_OFF;
    g.userData.asmPos = p; g.userData.asmQuat = r;
  }
  const mat = mk(COL[m[2]]); parts[n].userData.mats.push(mat);
  parts[n].add(new THREE.Mesh(geo, mat));
}

// Teelicht
const tea = new THREE.Group();
const cup = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 14, 40), new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 }));
cup.rotation.x = Math.PI / 2; cup.position.z = 7; tea.add(cup);
const flame = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
flame.scale.set(1, 1, 1.7); flame.position.z = 18; tea.add(flame);
const glow = new THREE.PointLight(0xff9a40, 0, 260, 1.4); glow.position.z = 26; tea.add(glow);
tea.position.set(HOUSE_X, 0, Z_OFF + 2); world.add(tea);

// Nummern-Schildchen
function label(n) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#ff5b1f'; x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff'; x.font = '800 70px BC, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(n, 64, 68);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.set(12, 12, 1); s.renderOrder = 10; world.add(s); return s;
}
await document.fonts.ready;
const labels = {}; for (const n in parts) labels[n] = label(n);

// ---------- Schritte & Animation ----------
let step = 0, t0 = performance.now();
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const stepOf = {}; STEPS.forEach((s, i) => s.p.forEach((n) => (stepOf[n] = i)));
const IDQ = new THREE.Quaternion();

function setGhost(g, ghost) {
  for (const m of g.userData.mats) {
    m.transparent = ghost; m.opacity = ghost ? 0.22 : 1; m.depthWrite = !ghost;
  }
}
function place(g, u) {
  const e = ease(Math.min(Math.max(u, 0), 1));
  g.position.lerpVectors(g.userData.cardPos, g.userData.asmPos, e);
  g.position.z += Math.sin(Math.PI * e) * 70;
  g.quaternion.slerpQuaternions(IDQ, g.userData.asmQuat, e);
}
function animate(now) {
  const S = STEPS[step], cur = S.p, dur = 2.2, gap = 0.7;
  const total = (cur.length ? (cur.length - 1) * gap + dur : 0) + 1.6;
  const t = ((now - t0) / 1000) % Math.max(total, 0.001);
  for (const n in parts) {
    const g = parts[n], k = stepOf[n], i = cur.indexOf(+n);
    let u;
    if (step === 0) u = 0;
    else if (S.final || k < step) u = 1;
    else if (i >= 0) u = (t - i * gap) / dur;
    else u = 0;
    place(g, u);
    setGhost(g, step > 0 && !S.final && k > step);
    const hl = step === 0 || i >= 0;
    const pulse = i >= 0 ? 0.25 + 0.25 * Math.sin(now / 180) : 0;
    g.userData.mats.forEach((m, j) => { if (j === 0) m.emissive.setRGB(pulse, pulse * 0.35, 0); });
    const L = labels[n]; L.visible = hl;
    if (hl) { L.position.copy(g.position); L.position.z += 26; }
  }
  const lit = step >= 3;
  tea.visible = lit; glow.intensity = S.final ? 9000 : lit ? 3500 : 0;
}

// ---------- UI ----------
const dots = $('dots'); STEPS.forEach(() => dots.appendChild(document.createElement('i')));
function showStep(i) {
  step = Math.max(0, Math.min(STEPS.length - 1, i)); t0 = performance.now();
  const S = STEPS[step];
  $('stepNum').textContent = S.final ? '✓' : step; $('stepTitle').textContent = S.t; $('stepText').innerHTML = S.x;
  [...dots.children].forEach((d, k) => d.classList.toggle('on', k === step));
  $('prev').disabled = step === 0; $('next').disabled = step === STEPS.length - 1;
  $('next').textContent = step === 0 ? 'LOS GEHT’S ›' : 'WEITER ›';
}
$('prev').onclick = () => showStep(step - 1); $('next').onclick = () => showStep(step + 1); $('replay').onclick = () => { t0 = performance.now(); };

// ---------- Modus: 3D ohne Kamera ----------
let controls = null, mode = null;
function start3D() {
  mode = '3d'; $('start').classList.add('hidden'); $('panel').classList.remove('hidden'); $('top').classList.remove('hidden');
  $('status').className = 'pill ok'; $('statusTx').textContent = '3D-Ansicht';
  scene.background = new THREE.Color(0x120f26);
  world.matrix.makeRotationX(-Math.PI / 2); world.visible = true; frameGroup.visible = true;
  camera.position.set(40, 300, 340); controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 20, 0); controls.enableDamping = true; controls.update();
  resize(); showStep(INIT);
}

// ---------- Modus: AR ----------
const det = new AR.Detector({ dictionaryName: 'ARUCO_MIP_36h12', maxHammingDistance: 3 });
const dc = document.createElement('canvas'), dctx = dc.getContext('2d', { willReadFrequently: true });
let lastSeen = 0, have = false;
const tgtP = new THREE.Vector3(), tgtQ = new THREE.Quaternion(), curP = new THREE.Vector3(), curQ = new THREE.Quaternion();

async function startAR() {
  $('msg').textContent = '';
  if (!navigator.mediaDevices?.getUserMedia) { $('msg').textContent = 'Kamera nicht verfügbar – Seite muss über https geöffnet werden.'; return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } } });
    video.srcObject = stream; await video.play();
  } catch (e) {
    $('msg').textContent = window.self !== window.top
      ? 'In dieser Vorschau ist die Kamera gesperrt. Öffne die App über ihre eigene https-Adresse – oder nutze die 3D-Ansicht.'
      : 'Kein Kamerazugriff: ' + (e.message || e.name) + '. Bitte Kamera-Erlaubnis für diese Seite geben.';
    return;
  }
  mode = 'ar'; video.style.display = 'block'; frameGroup.visible = false;
  $('start').classList.add('hidden'); $('panel').classList.remove('hidden'); $('top').classList.remove('hidden'); $('hint').classList.remove('hidden');
  resize(); showStep(INIT);
}

// Alle erkannten Markerecken gemeinsam -> eine Rahmen-Pose (Homographie + Gauss-Newton, siehe pose.js)
const FP = window.FRAMEPOSE;
const FIXED_F = q.get('f') ? parseFloat(q.get('f')) : null;
const fSamples = [];
const mkFilters = () => [[0, 1, 2].map(() => FP.OneEuro(1.0, 0.01)), [0, 1, 2, 3].map(() => FP.OneEuro(1.0, 1.5))];
let [fltP, fltQ] = mkFilters();
let prevQ = null;
function focal(w, h) {
  const L = Math.max(w, h);
  if (FIXED_F) return FIXED_F * L;
  if (fSamples.length < 8) return FOCAL * L;
  const s = [...fSamples].sort((a, b) => a - b); return s[s.length >> 1] * L;
}
function cornersOf(mk) {                  // Ecken des Markers in Rahmen-Koordinaten (mm): oben links, oben rechts, unten rechts, unten links
  const [cx, cy] = DATA.markers[mk.id], h = DATA.marker_size / 2;
  return [[cx - h, cy + h], [cx + h, cy + h], [cx + h, cy - h], [cx - h, cy - h]];
}
function track(now) {
  const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return;
  const s = DET_MAX / Math.max(vw, vh), w = Math.round(vw * s), h = Math.round(vh * s);
  if (dc.width !== w) { dc.width = w; dc.height = h; }
  dctx.drawImage(video, 0, 0, w, h);
  const found = det.detect(dctx.getImageData(0, 0, w, h)).filter((m) => DATA.markers[m.id] && m.hammingDistance <= 2);
  let f = focal(w, h);
  if (found.length) {
    const src = [], dst = [];
    for (const mk of found) { src.push(...cornersOf(mk)); dst.push(...mk.corners.map((c) => [c.x - w / 2, c.y - h / 2])); }
    if (found.length >= 2 && !FIXED_F) {                       // Brennweite laufend mitmessen
      const fe = FP.focalFromH(FP.homography(src, dst)), L = Math.max(w, h);
      if (fe && fe > 0.45 * L && fe < 1.6 * L) { fSamples.push(fe / L); if (fSamples.length > 60) fSamples.shift(); f = focal(w, h); }
    }
    const e = FP.estimate(src, dst, f);
    if (e && e.err < 4 && e.t[2] > 0) {
      const R = e.R, t = e.t;                                    // Kamera (x rechts, y unten, z vor) -> three.js (y oben, z zurück)
      const M = new THREE.Matrix4().set(
        R[0][0], R[0][1], R[0][2], t[0],
        -R[1][0], -R[1][1], -R[1][2], -t[1],
        -R[2][0], -R[2][1], -R[2][2], -t[2],
        0, 0, 0, 1);
      M.decompose(tgtP, tgtQ, new THREE.Vector3());
      if (prevQ && prevQ.dot(tgtQ) < 0) tgtQ.set(-tgtQ.x, -tgtQ.y, -tgtQ.z, -tgtQ.w);
      prevQ = tgtQ.clone();
      const jump = !have || now - lastSeen > 900;
      if (jump) [fltP, fltQ] = mkFilters();      // nach Verlust neu einrasten statt hinterherziehen
      curP.set(...[0, 1, 2].map((k) => fltP[k](tgtP.getComponent(k), now)));
      const qa = [tgtQ.x, tgtQ.y, tgtQ.z, tgtQ.w].map((v, k) => fltQ[k](v, now));
      curQ.set(qa[0], qa[1], qa[2], qa[3]).normalize();
      have = true; lastSeen = now;
    }
  }
  camera.fov = 2 * Math.atan(h / 2 / f) * 180 / Math.PI; camera.aspect = w / h; camera.updateProjectionMatrix();
  if (have) world.matrix.compose(curP, curQ, new THREE.Vector3(1, 1, 1));
  const visible = have && now - lastSeen < 900;
  world.visible = visible; $('hint').classList.toggle('hidden', visible);
  $('status').className = 'pill ' + (visible ? 'ok' : 'search');
  $('statusTx').textContent = visible ? (found.length >= 2 ? 'Rahmen erkannt' : 'Rahmen erkannt (1 Marker)') : 'Rahmen suchen …';
}

// ---------- Größe & Schleife ----------
function resize() {
  if (mode === 'ar' && video.videoWidth) {
    const s = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    renderer.setSize(Math.round(video.videoWidth * s), Math.round(video.videoHeight * s), false);
  } else {
    renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = 45; camera.updateProjectionMatrix();
  }
}
addEventListener('resize', resize); video.addEventListener('loadedmetadata', resize);
renderer.setAnimationLoop((now) => {
  if (mode === 'ar') track(now);
  if (controls) controls.update();
  animate(now); renderer.render(scene, camera);
});
$('btnAR').onclick = startAR; $('btn3D').onclick = start3D;
// ---------- Hauptmenü / Links ----------
function goHome() {
  if (video.srcObject) { video.srcObject.getTracks().forEach((t) => t.stop()); video.srcObject = null; }
  video.style.display = 'none';
  if (controls) { controls.dispose(); controls = null; }
  mode = null; have = false; world.visible = false; scene.background = null;
  ['panel', 'top', 'hint', 'links'].forEach((id) => $(id).classList.add('hidden'));
  $('start').classList.remove('hidden'); $('msg').textContent = '';
  resize();
}
$('home').onclick = goHome;
$('btnLinks').onclick = () => { $('start').classList.add('hidden'); $('links').classList.remove('hidden'); };
$('linksBack').onclick = () => { $('links').classList.add('hidden'); $('start').classList.remove('hidden'); };

if (q.get('mode') === '3d') start3D();
if (q.get('mode') === 'ar') startAR();
window.__app = { showStep, get step() { return step; } };
