/**
 * Builds public/models/coach.glb from the Mixamo character "Bryce": no animation clips (the coach is
 * posed procedurally at runtime), textures → 1024px WebP, meshopt-compressed geometry.
 *
 * Source: https://huggingface.co/datasets/Leeoo/mixamo-rigs-clips (char/Bryce.glb)
 * Usage:  npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
 *         node scripts/build-coach.mjs <path/to/Bryce.glb>
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/models/coach.glb');
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(process.argv[2]);
for (const a of doc.getRoot().listAnimations()) a.dispose();
// Bone names differ per download ("mixamorig7:Hips"): normalise so the runtime can find them.
for (const n of doc.getRoot().listNodes()) n.setName(n.getName().replace(/^mixamorig\d*:?/, ''));
await doc.transform(dedup(), weld(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
doc.createExtension(EXTMeshoptCompression).setRequired(true);
mkdirSync(dirname(out), { recursive: true });
await io.write(out, doc);
console.log(`coach.glb: ${(statSync(out).size / 1024).toFixed(0)} kB`);
