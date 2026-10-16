import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const VERSION_CODE = 2;
const UPDATE_URL = 'https://raw.githubusercontent.com/jjjjjjjjjjjjjjae-hub/al-Strike/main/update.json';
const MODEL_URL = './models/ALMAS_Animations_1_2_LIGHT.glb';
const $ = (selector) => document.querySelector(selector);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const screens = ['splash', 'loading', 'lobby'];
const loadingTitle = $('#loading-title');
const loadingStatus = $('#loading-status');
const loadingActions = $('#loading-actions');
const overlay = $('#overlay');
const panelTitle = $('#panel-title');
const panelContent = $('#panel-content');
const stage = $('#character-stage');
const canvas = $('#character-canvas');

const defaults = { graphics: 'high', sound: true, animation: true, sensitivity: 50 };
let settings = { ...defaults };
try { settings = { ...defaults, ...JSON.parse(localStorage.getItem('alStrikeSettings') || '{}') }; } catch (_) {}

let renderer;
let scene;
let camera;
let mixer;
let clock;
let characterPivot;
let running = false;
let pointerStart = null;

function showScreen(id) {
  for (const name of screens) document.getElementById(name).classList.toggle('is-active', name === id);
}

function setProgress(value, status) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  $('#progress-fill').style.width = `${safe}%`;
  $('#progress-value').textContent = `${safe}%`;
  $('.progress-track').setAttribute('aria-valuenow', String(safe));
  if (status) loadingStatus.textContent = status;
}

function showLoadingChoices(buttons) {
  loadingActions.replaceChildren();
  for (const { label, action, secondary } of buttons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (secondary) button.classList.add('secondary');
    button.addEventListener('click', action);
    loadingActions.append(button);
  }
  loadingActions.hidden = buttons.length === 0;
}

async function checkForUpdates() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`${UPDATE_URL}?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Number.isInteger(data.versionCode)) throw new Error('Invalid version manifest');
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function safeGitHubUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com' ? url.href : null;
  } catch (_) { return null; }
}

async function begin(skipUpdate = false) {
  showScreen('loading');
  loadingTitle.textContent = 'Ойын дайындалуда';
  showLoadingChoices([]);
  setProgress(8, 'Жаңарту тексерілуде…');

  if (!skipUpdate) {
    try {
      const manifest = await checkForUpdates();
      if (manifest.versionCode > VERSION_CODE) {
        const downloadUrl = safeGitHubUrl(manifest.downloadUrl);
        loadingTitle.textContent = 'Жаңарту бар';
        setProgress(20, `Жаңа нұсқа: ${manifest.versionName || manifest.versionCode}`);
        showLoadingChoices([
          { label: 'Жаңартуды жүктеу', action: () => { if (downloadUrl) window.location.href = downloadUrl; } },
          { label: 'Қайталау', action: () => begin() , secondary: true }
        ]);
        return;
      }
    } catch (_) {
      loadingTitle.textContent = 'Жаңартуды тексеру мүмкін болмады';
      setProgress(12, 'Интернет байланысын тексеріп, қайталап көр.');
      showLoadingChoices([
        { label: 'Қайталау', action: () => begin() },
        { label: 'Офлайн кіру', action: () => begin(true), secondary: true }
      ]);
      return;
    }
  }

  setProgress(25, 'Кейіпкер жүктелуде…');
  try {
    const gltf = await loadModel();
    setProgress(96, 'Лобби ашылуда…');
    setupScene(gltf);
    await delay(250);
    setProgress(100, 'Дайын');
    showScreen('lobby');
    resizeScene();
    startRenderLoop();
  } catch (error) {
    console.error('Character load failed', error);
    loadingTitle.textContent = 'Кейіпкер жүктелмеді';
    setProgress(25, 'Қайта жүктеп көр.');
    showLoadingChoices([{ label: 'Қайталау', action: () => begin(true) }]);
  }
}

function loadModel() {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(MODEL_URL, resolve, (event) => {
      if (event.lengthComputable && event.total > 0) {
        setProgress(25 + (event.loaded / event.total) * 66, 'Кейіпкер жүктелуде…');
      }
    }, reject);
  });
}

function setupScene(gltf) {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 1.75, 7.4);
  camera.lookAt(0, 1.8, 0);
  scene.add(new THREE.HemisphereLight(0xd8edff, 0x253741, 2.4));
  const key = new THREE.DirectionalLight(0xe9f4ff, 3.0);
  key.position.set(-2.5, 5.5, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9ee7f4, 2.6);
  rim.position.set(3, 3.5, -3.5);
  scene.add(rim);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.2, 64),
    new THREE.MeshBasicMaterial({ color: 0x01050a, transparent: true, opacity: 0.38, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.55, 0.64, 1);
  shadow.position.y = 0.02;
  scene.add(shadow);

  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('Invalid model bounds');
  const center = bounds.getCenter(new THREE.Vector3());
  const centered = new THREE.Group();
  gltf.scene.position.set(-center.x, -bounds.min.y, -center.z);
  centered.add(gltf.scene);
  characterPivot = new THREE.Group();
  characterPivot.add(centered);
  characterPivot.scale.setScalar(3.55 / size.y);
  characterPivot.rotation.y = -0.15;
  scene.add(characterPivot);

  const idleClip = gltf.animations.find((clip) => clip.name === 'Idle_#1_Original') || gltf.animations[0];
  if (!idleClip) throw new Error('Animation #1 is missing');
  mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(idleClip).setLoop(THREE.LoopRepeat).play();
  mixer.timeScale = settings.animation ? 1 : 0;
  clock = new THREE.Clock();
  applyGraphics();
}

function applyGraphics() {
  if (!renderer) return;
  const ratio = { low: 1, medium: 1.4, high: 2 }[settings.graphics] || 1.4;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratio));
  resizeScene();
  if (mixer) mixer.timeScale = settings.animation ? 1 : 0;
}

function resizeScene() {
  if (!renderer || !camera) return;
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function startRenderLoop() {
  if (running) return;
  running = true;
  const frame = () => {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    mixer?.update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function saveSettings() {
  localStorage.setItem('alStrikeSettings', JSON.stringify(settings));
  applyGraphics();
  closePanel();
}

function playClick() {
  if (!settings.sound) return;
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(520, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(350, context.currentTime + 0.055);
    gain.gain.setValueAtTime(0.025, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.06);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.06);
    setTimeout(() => context.close(), 120);
  } catch (_) {}
}

function openPanel(name) {
  playClick();
  const content = {
    play: {
      title: 'Режим таңдау',
      html: '<div class="mode-list"><button class="mode-option" type="button"><span><strong>Командалық шайқас</strong><small>5v5 тактикалық раундтар</small></span><span>ЖАҚЫНДА</span></button><button class="mode-option" type="button"><span><strong>Жаттығу</strong><small>Көздеу мен басқаруды үйрену</small></span><span>ЖАҚЫНДА</span></button></div>'
    },
    inventory: { title: 'Қару-жарақ', html: '<p class="panel-copy">Қару-жарақ жинағы келесі нұсқада ашылады.</p>' },
    friends: { title: 'Достар', html: '<p class="panel-copy">Достар тізімі мен топ құру келесі нұсқада қосылады.</p>' },
    profile: { title: 'Профиль', html: '<p class="panel-copy">Ойыншы профилі келесі нұсқада қосылады.</p>' },
    settings: {
      title: 'Баптаулар',
      html: `<div class="settings-row"><label for="graphics">Графика сапасы<small>Кейіпкер көрінісінің анықтығы</small></label><select id="graphics"><option value="low">Төмен</option><option value="medium">Орташа</option><option value="high">Жоғары</option></select></div>
        <div class="settings-row"><label for="sound">Дыбыс<small>Мәзір батырмаларының дыбысы</small></label><input id="sound" type="checkbox"></div>
        <div class="settings-row"><label for="animation">Анимация<small>Кейіпкер қозғалысын ойнату</small></label><input id="animation" type="checkbox"></div>
        <div class="settings-row"><label for="sensitivity">Сезімталдық<small>Кейіпкерді айналдыру жылдамдығы</small></label><input id="sensitivity" type="range" min="10" max="100"></div>
        <div class="settings-row"><label>Тіл<small>Ойын интерфейсі</small></label><strong>Қазақша</strong></div>
        <div class="settings-foot"><button id="save-settings" class="panel-action" type="button">Сақтау</button></div>`
    }
  }[name];
  if (!content) return;
  panelTitle.textContent = content.title;
  panelContent.innerHTML = content.html;
  overlay.hidden = false;
  if (name === 'settings') {
    $('#graphics').value = settings.graphics;
    $('#sound').checked = settings.sound;
    $('#animation').checked = settings.animation;
    $('#sensitivity').value = settings.sensitivity;
    $('#save-settings').addEventListener('click', () => {
      settings.graphics = $('#graphics').value;
      settings.sound = $('#sound').checked;
      settings.animation = $('#animation').checked;
      settings.sensitivity = Number($('#sensitivity').value);
      saveSettings();
    });
  }
}

function closePanel() { overlay.hidden = true; }

document.querySelectorAll('[data-panel]').forEach((button) => button.addEventListener('click', () => openPanel(button.dataset.panel)));
$('#close-panel').addEventListener('click', closePanel);
overlay.addEventListener('click', (event) => { if (event.target === overlay) closePanel(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePanel(); });

stage.addEventListener('pointerdown', (event) => {
  if (!characterPivot) return;
  pointerStart = event.clientX;
  stage.setPointerCapture(event.pointerId);
});
stage.addEventListener('pointermove', (event) => {
  if (pointerStart === null || !characterPivot) return;
  const delta = event.clientX - pointerStart;
  characterPivot.rotation.y += delta * (settings.sensitivity / 50) * 0.006;
  pointerStart = event.clientX;
});
stage.addEventListener('pointerup', () => { pointerStart = null; });
stage.addEventListener('pointercancel', () => { pointerStart = null; });
window.addEventListener('resize', resizeScene);

await delay(1100);
begin();
