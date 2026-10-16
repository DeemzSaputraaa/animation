import * as THREE from "three";

// Facial landmarks for the bundled Ch06 mesh, in its original centimeter units.
export function addExpressions(mesh) {
  const geometry = mesh.geometry;
  const source = geometry.attributes.position;
  const head = mesh.skeleton.bones.findIndex((bone) => /Head$/.test(bone.name));
  const smooth = THREE.MathUtils.smoothstep;
  const bell = (value, center, radius) => Math.exp(-(((value - center) / radius) ** 2));
  const skin = new Uint8Array(source.count);
  for (const group of geometry.groups) {
    // Ch06_body1 is the cap/accessories; never deform its brim with the brows.
    if (mesh.material[group.materialIndex].name === "Ch06_body1") continue;
    for (let i = group.start; i < group.start + group.count; i++) skin[geometry.index ? geometry.index.getX(i) : i] = 1;
  }
  // Separate eyeball surfaces in the bundled, non-indexed Ch06 geometry.
  // Only skin and eyelashes should move when the lids close.
  const eyeballs = [[65262, 67470], [67470, 69678]];
  for (const [start, end] of eyeballs) skin.fill(0, start, end);
  for (const mood of ["happy", "sad", "angry"]) {
    const target = source.clone();
    target.name = mood;
    for (let i = 0; i < source.count; i++) {
      if (!skin[i]) continue;
      let weight = 0;
      for (let j = 0; j < 4; j++) {
        if (geometry.attributes.skinIndex.getComponent(i, j) === head) weight += geometry.attributes.skinWeight.getComponent(i, j);
      }
      if (weight < 0.5) continue;
      const x = source.getX(i), y = source.getY(i), z = source.getZ(i);
      const mask = weight * smooth(z, 7, 11) * (1 - smooth(Math.abs(x), 5.3, 7));
      const corners = bell(Math.abs(x), 2.6, 1.25) * bell(y, 162.6, 1.35);
      const cheek = bell(Math.abs(x), 4, 1.65) * bell(y, 165.3, 1.8);
      const brow = bell(y, 170.9, 0.7) * bell(Math.abs(x), 2.6, 2)
        * smooth(y, 169.4, 170) * (1 - smooth(y, 172, 172.6));
      const inner = 1 - smooth(Math.abs(x), 1.2, 4);
      let dx = 0, dy = 0;
      if (mood === "happy") {
        dy = 0.8 * corners + 0.32 * cheek + 0.12 * brow;
        dx = Math.sign(x) * 0.25 * corners;
      } else if (mood === "sad") {
        dy = -0.48 * corners + brow * (0.72 * inner - 0.16);
      } else {
        dy = brow * (0.14 - 0.8 * inner) - 0.18 * corners;
        dx = -Math.sign(x) * 0.22 * brow * inner;
      }
      target.setXYZ(i, x + dx * mask, y + dy * mask, z);
    }
    geometry.morphAttributes.position.push(target);
    geometry.morphAttributes.normal.push(geometry.attributes.normal.clone());
  }
  const blink = source.clone();
  blink.name = "blink";
  for (let i = 0; i < source.count; i++) {
    if (!skin[i]) continue;
    const x = source.getX(i), y = source.getY(i), z = source.getZ(i);
    const eyeX = Math.abs(x);
    const width = smooth(eyeX, 1.5, 2.15) * (1 - smooth(eyeX, 4.5, 5.35));
    const height = smooth(y, 168.25, 168.9) * (1 - smooth(y, 170.65, 171.65));
    const weight = width * height * smooth(z, 8.6, 10.3);
    if (weight < 0.001) continue;
    const seam = 169.4 + 0.04 * (eyeX - 3.2);
    const closedY = THREE.MathUtils.lerp(y, seam, weight);
    const eyeSurface = 9.25 + Math.sqrt(Math.max(0, 1.5 ** 2 - (eyeX - 3.2075) ** 2 - (closedY - 169.8455) ** 2));
    blink.setXYZ(i, x, closedY, Math.max(z, eyeSurface + 0.12 * weight));
  }
  geometry.morphAttributes.position.push(blink);
  geometry.morphAttributes.normal.push(geometry.attributes.normal.clone());
  mesh.updateMorphTargets();
}

export function blinkEnvelope(time) {
  if (time < 0 || time >= 0.26) return 0;
  const close = THREE.MathUtils.smootherstep(time, 0, 0.085);
  const open = 1 - THREE.MathUtils.smootherstep(time, 0.115, 0.26);
  return close * open;
}
