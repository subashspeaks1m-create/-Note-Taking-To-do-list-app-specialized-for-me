/**
 * Makes the Blender export web-ready: WebP textures (max 1024 px, the face kept
 * at full size), Draco geometry without stored tangents, and every third hair
 * strand kept (the hair shell underneath fills the gaps).
 *
 * Its packages aren't app dependencies; install them in a scratch folder first:
 *   npm i @gltf-transform/cli@4   (brings core, functions, extensions, draco3dgltf, sharp)
 *   node tools/optimize-model.mjs subash-wardrobe.glb src/assets/models/subash-wardrobe.glb 3 1024
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const [src, out, keepEvery = '1', maxTex = '1024'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const doc = await io.read(src);
// Three.js builds tangents in the shader when a mesh has none, so stored ones are dead weight.
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) prim.getAttribute('TANGENT') && prim.setAttribute('TANGENT', null);

// Thin the hair: each fibre primitive is many separate strands; keep every Nth strand.
const n = Number(keepEvery);
if (n > 1) {
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    if (!/fibres/.test(prim.getMaterial()?.getName() ?? '')) continue;
    const idx = prim.getIndices().getArray();
    const verts = prim.getAttribute('POSITION').getCount();
    // Union-find over triangles to find strands (connected components).
    const parent = new Int32Array(verts).map((_, i) => i);
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    for (let i = 0; i < idx.length; i += 3) {
      const a = find(idx[i]);
      parent[find(idx[i + 1])] = a;
      parent[find(idx[i + 2])] = a;
    }
    const ids = new Map(); let k = 0;
    const keep = [];
    for (let i = 0; i < idx.length; i += 3) {
      const r = find(idx[i]);
      if (!ids.has(r)) ids.set(r, k++);
      if (ids.get(r) % n === 0) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    const Arr = idx.constructor;
    prim.getIndices().setArray(new Arr(keep));
    console.log('strands', k, 'kept tris', keep.length / 3, 'of', idx.length / 3);
  }
}

await doc.transform(
  dedup(),
  prune({ keepExtras: true }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82, resize: [Number(maxTex), Number(maxTex)], pattern: /^(?!.*neutral-face).*/ }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, pattern: /neutral-face/ }),
  draco({ method: 'edgebreaker', quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeGeneric: 12 }),
);
await io.write(out, doc);
