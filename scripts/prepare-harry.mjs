import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const sourcePath = 'legacy/public/models/ready-player-me-harry-potter/source/harry.glb';
const outputPath = 'frontend/public/models/harry.glb';
function unpack(bytes) {
  const length = bytes.readUInt32LE(12);
  return { json: JSON.parse(bytes.toString('utf8', 20, 20 + length)), binary: bytes.subarray(28 + length) };
}
function pack(json, binary) {
  const text = Buffer.from(JSON.stringify(json));
  const jsonChunk = Buffer.alloc(Math.ceil(text.length / 4) * 4, 0x20);
  text.copy(jsonChunk);
  const binChunk = Buffer.alloc(Math.ceil(binary.length / 4) * 4);
  binary.copy(binChunk);
  const header = Buffer.alloc(20);
  header.write('glTF'); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonChunk.length + binChunk.length, 8);
  header.writeUInt32LE(jsonChunk.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonChunk, binHeader, binChunk]);
}
const [harryBytes, presenterBytes] = await Promise.all([
  readFile(sourcePath), readFile('frontend/public/models/character.glb'),
]);
const { json: target, binary: targetBinary } = unpack(harryBytes);
const { json: source, binary: sourceBinary } = unpack(presenterBytes);
const chunks = [targetBinary];
let byteLength = targetBinary.length;
function appendAccessor(index, transform) {
  const accessor = source.accessors[index];
  const view = source.bufferViews[accessor.bufferView];
  if (accessor.componentType !== 5126 || accessor.sparse || view.byteStride) throw new Error('Unsupported animation accessor');
  const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
  if (!size) throw new Error(`Unsupported animation type: ${accessor.type}`);
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const data = Buffer.from(sourceBinary.subarray(start, start + accessor.count * size * 4));
  if (transform) for (let i = 0; i < accessor.count; i++) {
    const values = Array.from({ length: size }, (_, axis) => data.readFloatLE((i * size + axis) * 4));
    transform(values).forEach((value, axis) => data.writeFloatLE(value, (i * size + axis) * 4));
  }
  const bufferView = target.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.length }) - 1;
  chunks.push(data); byteLength += data.length;
  const copy = { ...accessor, bufferView, byteOffset: 0 };
  if (transform) { delete copy.min; delete copy.max; }
  return target.accessors.push(copy) - 1;
}
const targetHips = target.nodes.find(node => node.name === 'Hips').translation;
const sourceHips = source.nodes.find(node => node.name?.endsWith('Hips')).translation;
// Both assets use Mixamo's Y-along-bone axes and the same bone hierarchy.
// Copy local rotations, keep Harry's bone lengths, and convert only root
// displacement from centimeters to meters around Harry's original hips.
const scale = targetHips[1] / sourceHips[1];
target.animations = source.animations.map(animation => {
  const samplers = [], channels = [];
  for (const channel of animation.channels) {
    const name = source.nodes[channel.target.node].name.replace(/^mixamorig\d*/, '');
    const node = target.nodes.findIndex(node => node.name === name);
    if (node < 0) throw new Error(`Harry is missing bone ${name}`);
    const path = channel.target.path;
    if (path !== 'rotation' && !(name === 'Hips' && path === 'translation')) throw new Error(`Unexpected track ${name}.${path}`);
    const sampler = animation.samplers[channel.sampler];
    channels.push({ target: { node, path }, sampler: samplers.length });
    samplers.push({ ...sampler, input: appendAccessor(sampler.input), output: appendAccessor(sampler.output,
      path === 'translation' ? values => values.map((value, axis) => targetHips[axis] + (value - sourceHips[axis]) * scale) : undefined) });
  }
  return { name: animation.name, channels, samplers };
});
target.buffers = [{ byteLength }];
let binary = Buffer.concat(chunks);
// Ground the neutral animated pose; different leg proportions otherwise
// leave the feet slightly above or below the studio floor.
const loader = new GLTFLoader();
loader.register(parser => { parser.loadTexture = async () => new THREE.Texture(); return { name: 'geometry-only' }; });
const packed = pack(target, binary);
const gltf = await loader.parseAsync(packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength), '');
const mixer = new THREE.AnimationMixer(gltf.scene);
mixer.clipAction(gltf.animations.find(clip => clip.name === 'idle_neutral')).play(); mixer.update(0);
gltf.scene.updateMatrixWorld(true);
const floor = new THREE.Box3().setFromObject(gltf.scene, true).min.y;
for (const animation of target.animations) for (const channel of animation.channels) {
  if (channel.target.path !== 'translation') continue;
  const accessor = target.accessors[animation.samplers[channel.sampler].output];
  const offset = target.bufferViews[accessor.bufferView].byteOffset;
  for (let i = 0; i < accessor.count; i++) {
    const address = offset + (i * 3 + 1) * 4;
    binary.writeFloatLE(binary.readFloatLE(address) - floor, address);
  }
}
const result = pack(target, binary);
await writeFile(outputPath, result);
const report = { source: sourcePath, bytes: result.length, clips: target.animations.map(clip => clip.name),
  morphs: target.meshes.find(mesh => mesh.name === 'Wolf3D_Head').extras.targetNames,
  groundCorrection: -floor, animationSource: 'character.glb', rootTranslationScale: scale };
await writeFile('frontend/public/models/harry.manifest.json', JSON.stringify(report, null, 2));
console.log(`Prepared ${outputPath}: ${(result.length / 1e6).toFixed(2)} MB, ${report.clips.length} clips, ${report.morphs.length} native facial targets.`);
