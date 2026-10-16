import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createGestureClips } from "./animations.js";
import { addSpeechAnimation } from "./speech.js";
import { addExpressions } from "./expressions.js";
import { AutonomousCharacter } from "./autonomous.js";
import { NeuralNarrator } from "./neural-narration.js";
import { prepareScript } from "./speech-plan.js";
import "./style.css";

const status = document.querySelector("#status");
const stage = document.querySelector("#stage");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8f2fa);
scene.fog = new THREE.Fog(0xe8f2fa, 9, 24);
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 60);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.domElement.setAttribute("aria-label", "Karakter berbicara, berekspresi, dan berjalan secara otomatis");
document.querySelector("#stage").appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 2.7;
controls.maxPolarAngle = Math.PI * 0.49;
controls.enablePan = false;
scene.add(new THREE.HemisphereLight(0xffffff, 0xb5c2ad, 2.8));
const sun = new THREE.DirectionalLight(0xfff4e3, 3.1);
sun.position.set(-3, 6, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -3;
sun.shadow.camera.right = 3;
sun.shadow.camera.top = 3;
sun.shadow.camera.bottom = -3;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 15;
sun.shadow.normalBias = 0.025;
sun.shadow.bias = -0.0002;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xc9e3ff, 1.2);
fill.position.set(3, 2, -2);
scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0xf1f1e8, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.012;
floor.receiveShadow = true;
scene.add(floor);

let faceFocus = false;
const focusButton = document.querySelector("#focusButton");
function fitCamera() {
  if (character) character.faceFocus = faceFocus;
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  const horizontalFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
  const distance = faceFocus ? Math.max(1.25, 0.42 / Math.tan(horizontalFov / 2))
    : Math.max(4.3, 0.94 / Math.tan(horizontalFov / 2));
  controls.minDistance = faceFocus ? 0.85 : 2.7;
  const x = character?.model.position.x ?? 0;
  const z = character?.model.position.z ?? 0;
  camera.position.set(x, faceFocus ? 1.68 : 1.55, z + distance);
  controls.target.set(x, faceFocus ? 1.6 : 0.97, z);
  controls.maxDistance = Math.max(8, distance + 2);
  controls.update();
}
let character;
fitCamera();
focusButton.addEventListener("click", () => {
  faceFocus = !faceFocus;
  focusButton.setAttribute("aria-pressed", String(faceFocus));
  focusButton.textContent = faceFocus ? "Lihat seluruh tubuh" : "Fokus wajah";
  fitCamera();
});
const scriptInput = document.querySelector("#scriptInput");
const speakButton = document.querySelector("#speakButton");
const stopButton = document.querySelector("#stopButton");
const vowelButton = document.querySelector("#vowelButton");
const vowelCards = [...document.querySelectorAll("[data-vowel]")];
const highlightVowel = vowel => vowelCards.forEach(card => card.classList.toggle("active", card.dataset.vowel === vowel));
const rateInput = document.querySelector("#rateInput");
const speechStatus = document.querySelector("#speechStatus");
const sentenceDisplay = document.querySelector("#sentenceDisplay");
const progress = document.querySelector("#speechProgress");
const narrator = new NeuralNarrator({
  onState(state, detail) {
    const labels = { idle: "Siap membaca naskah", starting: "Menyiapkan suara Ardi…", pausing: "Jeda antarbagian…", speaking: `Membaca bagian ${(detail.index ?? 0) + 1} dari ${detail.total ?? 0}`, complete: "Pembacaan selesai", error: detail.message };
    speechStatus.textContent = labels[state];
    speechStatus.classList.toggle("error", state === "error");
    const busy = ["starting", "speaking", "pausing"].includes(state);
    stopButton.disabled = !busy;
    speakButton.textContent = busy ? "Baca Ulang" : "Mulai Bicara";
    if (state === "idle" || state === "error") {
      sentenceDisplay.textContent = state === "idle" ? "Pembacaan dihentikan. Anda dapat mengubah naskah lalu mulai lagi." : "";
      progress.value = 0;
    }
    if (state === "complete") progress.value = 1;
  },
  onSentence({ text, cue, index, total, vowel }) {
    character?.beginSentence(cue);
    sentenceDisplay.textContent = text;
    progress.value = index / total;
    highlightVowel(vowel);
  },
  onBoundary(event) {
    character?.speechBoundary(event);
    if (!Number.isFinite(event.charIndex)) return;
    const start = Math.max(0, Math.min(event.text.length, event.charIndex));
    const length = event.charLength || event.text.slice(start).match(/^\S+/)?.[0].length || 0;
    const mark = document.createElement("mark");
    mark.textContent = event.text.slice(start, start + length);
    sentenceDisplay.replaceChildren(document.createTextNode(event.text.slice(0, start)), mark, document.createTextNode(event.text.slice(start + length)));
  },
  onSilence() { character?.endSentence(); highlightVowel(null); },
});
function updateInput() {
  document.querySelector("#characterCount").textContent = `${scriptInput.value.length} / 5.000`;
  speakButton.disabled = !character || !narrator.supported || !scriptInput.value.trim();
  vowelButton.disabled = !character || !narrator.supported;
  document.querySelector("#partCount").textContent = scriptInput.value.trim() ? `${prepareScript(scriptInput.value).length} bagian` : "0 bagian";
}
scriptInput.addEventListener("input", updateInput);
rateInput.addEventListener("input", () => { document.querySelector("#rateValue").textContent = `${Number(rateInput.value).toFixed(2)}×`; });
speakButton.addEventListener("click", () => {
  if (!character) return;
  try { narrator.play(scriptInput.value, { rate: rateInput.value }); }
  catch (error) { speechStatus.textContent = error.message; speechStatus.classList.add("error"); }
});
stopButton.addEventListener("click", () => narrator.stop());
vowelButton.addEventListener("click", () => {
  if (!faceFocus) focusButton.click();
  try { narrator.play("a, i, u, e, o", { rate: rateInput.value }); }
  catch (error) { speechStatus.textContent = error.message; speechStatus.classList.add("error"); }
});
updateInput();
if (!narrator.supported) {
  speechStatus.textContent = "Browser ini belum mendukung suara. Buka halaman ini di Chrome atau Edge.";
  speechStatus.classList.add("error");
}
window.addEventListener("pagehide", () => narrator.stop(false));
document.addEventListener("visibilitychange", () => { if (document.hidden) narrator.stop(); });
new FBXLoader().load(`${import.meta.env.BASE_URL}models/hip-hop-dancing.fbx`, (model) => {
  try {
    model.scale.setScalar(0.01);
    const clips = createGestureClips(model);
    const mesh = addSpeechAnimation(model, clips);
    addExpressions(mesh);
    model.traverse((node) => {
      if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
    });
    character = new AutonomousCharacter(model, mesh, clips);
    character.faceFocus = faceFocus;
    character.setPresenterMode();
    scene.add(model);
    status.hidden = true;
    updateInput();
  } catch (error) { showError(error); }
}, (event) => {
  status.textContent = event.total > 0 ? `Menyiapkan karakter… ${Math.round(event.loaded / event.total * 100)}%` : "Menyiapkan karakter…";
}, showError);
function showError(error) {
  console.error("Gagal menyiapkan karakter:", error);
  status.hidden = false;
  status.textContent = "Karakter gagal dimuat. Muat ulang halaman untuk mencoba lagi.";
  status.classList.add("error");
}
const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop(() => {
  timer.update();
  const delta = Math.min(timer.getDelta(), 0.05);
  if (character) character.mouthPose = narrator.getMouthPose();
  character?.update(delta);
  if (character) {
    // Track the stroll gently so the mobile view can stay close to the face.
    const follow = 1 - Math.exp(-delta * 2.5);
    const dx = (character.model.position.x - controls.target.x) * follow;
    const dz = (character.model.position.z - controls.target.z) * follow;
    controls.target.x += dx;
    controls.target.z += dz;
    camera.position.x += dx;
    camera.position.z += dz;
  }
  controls.update();
  renderer.render(scene, camera);
});
window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  fitCamera();
});
