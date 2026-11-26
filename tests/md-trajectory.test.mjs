import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePDB } from 'molstar/lib/mol-io/reader/pdb/parser';
import { trajectoryFromPDB } from 'molstar/lib/mol-model-formats/structure/pdb';
import { Model, StructureElement } from 'molstar/lib/mol-model/structure';
import { Task } from 'molstar/lib/mol-task';
import { extractResidues, buildResidueLoci } from '../src/viewer/selection.js';
import { inspectMdTrajectory, parseMdCoordinates, createFramePlayback, MD_LIMITS, stabilizeMdModelIdentity, decodeTrajectoryBase64 } from '../src/viewer/md-trajectory.js';

// Synthetic protocol fixtures, not a physical MD simulation.
export function syntheticDcd(atoms = 3, frames = 4) {
  const bytes = new Uint8Array(196 + frames * (atoms * 12 + 24)), v = new DataView(bytes.buffer);
  v.setInt32(0, 84, true); bytes.set(new TextEncoder().encode('CORD'), 4);
  v.setInt32(8, frames, true); v.setInt32(16, 1, true); v.setFloat32(44, 0.001, true); v.setInt32(88, 84, true);
  v.setInt32(92, 84, true); v.setInt32(96, 1, true); bytes.set(new TextEncoder().encode('SYNTHETIC motion fixture; not a molecular dynamics simulation'), 100); v.setInt32(180, 84, true);
  v.setInt32(184, 4, true); v.setInt32(188, atoms, true); v.setInt32(192, 4, true);
  let offset = 196;
  for (let f = 0; f < frames; f++) for (let axis = 0; axis < 3; axis++) {
    v.setInt32(offset, atoms * 4, true); offset += 4;
    for (let a = 0; a < atoms; a++) v.setFloat32(offset + a * 4, a + axis * 10 + f * (axis + 1) * 0.25, true);
    offset += atoms * 4; v.setInt32(offset, atoms * 4, true); offset += 4;
  }
  return bytes;
}
function syntheticXtc(atoms = 3, frames = 4) {
  const bytes = new Uint8Array(frames * (56 + atoms * 12)), v = new DataView(bytes.buffer);
  let offset = 0;
  for (let f = 0; f < frames; f++) {
    v.setInt32(offset, 1995); v.setInt32(offset + 4, atoms); v.setInt32(offset + 8, f); v.setFloat32(offset + 12, f * 0.1);
    for (let i = 0; i < 9; i++) v.setFloat32(offset + 16 + i * 4, i % 4 === 0 ? 3 : 0);
    v.setInt32(offset + 52, atoms); offset += 56;
    for (let a = 0; a < atoms; a++) for (let axis = 0; axis < 3; axis++) { v.setFloat32(offset, (a + f + axis) / 10); offset += 4; }
  }
  return bytes;
}

test('native DCD parser reads all synthetic frames, exact subarrays, and preserves input', async () => {
  const source = syntheticDcd(), backing = new Uint8Array(source.length + 13); backing.set(source, 7);
  const subarray = backing.subarray(7, 7 + source.length), before = subarray.slice();
  const { coordinates, info } = await parseMdCoordinates(subarray, 'DCD', 3);
  assert.equal(info.frameCount, 4); assert.equal(info.atomCount, 3);
  assert.deepEqual(Array.from(coordinates.frames[3].x), [0.75, 1.75, 2.75]);
  assert.equal(coordinates.frames[3].z[2], 24.25); assert.deepEqual(subarray, before);
});
test('native XTC parser converts nanometers to Angstroms', async () => {
  const { coordinates, info } = await parseMdCoordinates(syntheticXtc(), 'xtc', 3);
  assert.equal(info.frameCount, 4);
  assert.ok(Math.abs(coordinates.frames[2].x[1] - 3) < 1e-5);
  assert.ok(Math.abs(coordinates.frames[2].z[1] - 5) < 1e-5);
});
test('native model trajectory uses topology source atom order and moving coordinates', async () => {
  const pdb = await parsePDB(readFileSync('fixtures/test-structure.pdb', 'utf8'), 'MD-test').run();
  const original = (await trajectoryFromPDB(pdb.result).run()).representative;
  const count = original.atomicHierarchy.atoms._rowCount;
  const { coordinates } = await parseMdCoordinates(syntheticDcd(count), 'dcd', count);
  const trajectory = Model.trajectoryFromModelAndCoordinates(original, coordinates);
  assert.equal(trajectory.frameCount, 4);
  const first = trajectory.getFrameAtIndex(0), last = trajectory.getFrameAtIndex(3);
  assert.equal(first.atomicHierarchy, original.atomicHierarchy);
  assert.equal(last.atomicConformation.x[0] - first.atomicConformation.x[0], 0.75);
});
test('preflight rejects topology mismatch, truncation, false frame count and huge allocation headers', async () => {
  await assert.rejects(parseMdCoordinates(syntheticDcd(), 'dcd', 4), /Topology has 4 atoms/);
  const dcd = syntheticDcd(); assert.throws(() => inspectMdTrajectory(dcd.subarray(0, dcd.length - 1), 'dcd'), /DCD/);
  const forged = syntheticDcd(); new DataView(forged.buffer).setInt32(8, 0x7fffffff, true);
  assert.throws(() => inspectMdTrajectory(forged, 'dcd'), /sidebar limits/);
  const xtc = syntheticXtc(); new DataView(xtc.buffer).setInt32(4, 0x7fffffff); new DataView(xtc.buffer).setInt32(52, 0x7fffffff);
  assert.throws(() => inspectMdTrajectory(xtc, 'xtc'), /sidebar limits/);
  assert.throws(() => inspectMdTrajectory(syntheticDcd(), 'dcd', { ...MD_LIMITS, maxBytes: 100 }), /MiB/);
});
test('nonfinite coordinates and unsupported DCD variants fail clearly', async () => {
  const nan = syntheticDcd(); new DataView(nan.buffer).setFloat32(200, NaN, true);
  await assert.rejects(parseMdCoordinates(nan, 'dcd'), /Nonfinite/);
  const fixed = syntheticDcd(); new DataView(fixed.buffer).setInt32(40, 1, true);
  assert.throws(() => inspectMdTrajectory(fixed, 'dcd'), /fixed-atom/);
  const big = syntheticDcd(); new DataView(big.buffer).setInt32(0, 84);
  assert.throws(() => inspectMdTrajectory(big, 'dcd'), /Big-endian/);
  const magic = syntheticXtc(); new DataView(magic.buffer).setInt32(0, 1);
  assert.throws(() => inspectMdTrajectory(magic, 'xtc'), /magic/);
});
test('compressed XTC preflight bounds decoded allocation and compressed record size', () => {
  const bytes = new Uint8Array(96), v = new DataView(bytes.buffer);
  v.setInt32(0, 1995); v.setInt32(4, 10); v.setInt32(52, 10); v.setFloat32(56, 1000);
  v.setInt32(84, 9); v.setInt32(88, 4);
  assert.equal(inspectMdTrajectory(bytes, 'xtc').atomCount, 10);
  v.setInt32(88, 0x7fffffff); assert.throws(() => inspectMdTrajectory(bytes, 'xtc'), /packed/);
  v.setInt32(88, 4); v.setInt32(84, 73); assert.throws(() => inspectMdTrajectory(bytes, 'xtc'), /compression/);
});
function clockHarness(setFrame, callbacks = {}) {
  let time = 0, nextId = 0; const pending = new Map();
  const controller = createFramePlayback({ setFrame, ...callbacks, now: () => time, request: callback => { pending.set(++nextId, callback); return nextId; }, cancel: id => pending.delete(id) });
  return { controller, pending, async tick(ms) { time = ms; const batch = [...pending.values()]; pending.clear(); for (const cb of batch) cb(); await Promise.resolve(); await Promise.resolve(); }, async settle() { await controller.pending; await Promise.resolve(); } };
}
test('playback drops overdue frames and serializes commits; pause drains in-flight work', async () => {
  const frames = []; let release;
  const h = clockHarness(frame => { frames.push(frame); return new Promise(resolve => { release = () => resolve({ frame }); }); });
  h.controller.play({ frameCount: 100, fps: 10 }); await h.tick(100); assert.deepEqual(frames, [1]);
  await h.tick(200); await h.tick(300); await h.tick(450); assert.deepEqual(frames, [1]);
  release(); await h.settle(); await h.tick(500); assert.deepEqual(frames, [1, 5]);
  let paused = false; const draining = h.controller.pause().then(() => { paused = true; });
  assert.equal(h.controller.playing, false); assert.equal(h.pending.size, 0); assert.equal(paused, false);
  release(); await draining; assert.equal(paused, true);
});
test('playback clamps non-loop endpoint and reports errors without scheduling more work', async () => {
  const frames = [], seen = []; const h = clockHarness(async frame => { frames.push(frame); return frame; }, { onFrame: result => seen.push(result) });
  h.controller.play({ frameCount: 4, fps: 10, loop: false }); await h.tick(1200); await h.settle();
  assert.deepEqual(frames, [3]); assert.deepEqual(seen, [3]); assert.equal(h.controller.playing, false); assert.equal(h.pending.size, 0);
  assert.equal(h.controller.stats.completedFrames, 1); assert.equal(h.controller.stats.skippedFrames, 2);
  const errors = []; const bad = clockHarness(async () => { throw new Error('GPU update failed'); }, { onError: error => errors.push(error.message) });
  bad.controller.play({ frameCount: 4, fps: 10 }); await bad.tick(100); await bad.settle();
  assert.deepEqual(errors, ['GPU update failed']); assert.equal(bad.controller.playing, false); assert.equal(bad.pending.size, 0);
});

test('native state attachment replaces MD tree without losing topology or the prior trajectory on validation failure', async () => {
  const { PluginContext } = await import('molstar/lib/mol-plugin/context');
  const { DefaultPluginSpec } = await import('molstar/lib/mol-plugin/spec');
  const { attachMdTrajectory } = await import('../src/viewer/md-trajectory.js');
  const plugin = new PluginContext(DefaultPluginSpec()); await plugin.init();
  try {
    const raw = await plugin.builders.data.rawData({ data: readFileSync('fixtures/test-structure.pdb', 'utf8'), label: 'topology' });
    const topology = await plugin.builders.structure.parseTrajectory(raw, 'pdb');
    const model = await plugin.builders.structure.createModel(topology);
    const structure = await plugin.builders.structure.createStructure(model, { name: 'model', params: {} });
    const e = { plugin, structures: new Map([['1', structure.obj.data]]), trajectories: new Map([['1', { ref: topology.ref, frameCount: 1, frame: 0 }]]),
      models: new Map([['1', model.ref]]), structureRefs: new Map([['1', structure.ref]]), residues: new Map(), displayCache: new Map(),
      structureNode() { return { cell: plugin.state.data.cells.get(this.structureRefs.get('1')) }; } };
    const count = model.obj.data.atomicHierarchy.atoms._rowCount;
    const first = await attachMdTrajectory(e, { structureId: '1', data: syntheticDcd(count), format: 'dcd', atomOrderConfirmed: true });
    assert.equal(first.frameCount, 4); assert.equal(first.baseModelRef, model.ref);
    assert.ok(plugin.state.data.cells.has(model.ref)); assert.equal(plugin.state.data.cells.has(structure.ref), false);
    const current = e.structures.get('1'), cells = plugin.state.data.cells.size;
    await assert.rejects(attachMdTrajectory(e, { structureId: '1', data: syntheticDcd(count + 1), format: 'dcd', atomOrderConfirmed: true }), /Topology has/);
    assert.equal(e.structures.get('1'), current); assert.equal(plugin.state.data.cells.size, cells);
    const second = await attachMdTrajectory(e, { structureId: '1', data: syntheticDcd(count, 6), format: 'dcd', atomOrderConfirmed: true });
    assert.equal(second.frameCount, 6); assert.equal(second.baseModelRef, model.ref);
    assert.ok(plugin.state.data.cells.has(model.ref)); assert.equal(plugin.state.data.cells.has(first.ref), false); assert.equal(plugin.state.data.cells.has(first.rawRef), false);
    const modelRef = e.models.get('1');
    await plugin.state.data.build().to(modelRef).update(old => ({ ...old, modelIndex: 1 })).commit();
    const frame1 = plugin.state.data.cells.get(e.structureRefs.get('1')).obj.data;
    const selected = { kind: 'residue', residues: [extractResidues(frame1)[0]] };
    await plugin.state.data.build().to(modelRef).update(old => ({ ...old, modelIndex: 5 })).commit();
    const changed = plugin.state.data.cells.get(e.structureRefs.get('1')).obj.data;
    assert.equal(changed.models[0].atomicConformation.x[0], 1.25);
    assert.equal(changed.models[0].modelNum, model.obj.data.modelNum);
    assert.equal(StructureElement.Loci.size(buildResidueLoci(changed, selected)), StructureElement.Loci.size(buildResidueLoci(frame1, selected)));
    assert.ok(StructureElement.Loci.size(buildResidueLoci(changed, selected)) > 0);
    assert.equal(Model.TrajectoryInfo.get(changed.models[0]).index, 5);
  } finally { plugin.dispose(); }
});

test('native compressed XTC decoder reads a valid synthetic bitstream above the nine-atom threshold', async () => {
  // Ten integer coordinates per frame, no small-coordinate runs. Each x value
  // occupies four bits followed by a zero run flag; y/z are constant zero.
  const atoms = 10, frameBytes = 100, bytes = new Uint8Array(frameBytes * 2), v = new DataView(bytes.buffer);
  for (let frame = 0; frame < 2; frame++) {
    const base = frame * frameBytes;
    v.setInt32(base, 1995); v.setInt32(base + 4, atoms); v.setInt32(base + 8, frame); v.setFloat32(base + 12, frame);
    for (let axis = 0; axis < 9; axis++) v.setFloat32(base + 16 + axis * 4, axis % 4 === 0 ? 3 : 0);
    v.setInt32(base + 52, atoms); v.setFloat32(base + 56, 1000);
    v.setInt32(base + 60, frame * 1000); v.setInt32(base + 72, frame * 1000 + 9);
    v.setInt32(base + 84, 9); v.setInt32(base + 88, 7);
    let bit = 0;
    for (let atom = 0; atom < atoms; atom++) {
      for (let shift = 3; shift >= 0; shift--) {
        if ((atom >> shift) & 1) bytes[base + 92 + (bit >> 3)] |= 1 << (7 - (bit % 8));
        bit++;
      }
      bit++; // no small-coordinate run
    }
  }
  const { info, coordinates } = await parseMdCoordinates(bytes, 'xtc', 10);
  assert.equal(info.frameCount, 2);
  assert.ok(Math.abs(coordinates.frames[0].x[9] - 0.09) < 1e-6);
  assert.ok(Math.abs(coordinates.frames[1].x[0] - 10) < 1e-5);
  assert.ok(Math.abs(coordinates.frames[1].x[9] - 10.09) < 1e-5);
});



test('stable MD identity covers lazy Task frames while preserving trajectory frame metadata', async () => {
  const representative = { modelNum: 0 }, frames = [{ modelNum: 1 }, { modelNum: 2 }];
  for (let index = 0; index < frames.length; index++) { frames[index]._dynamicPropertyData = {}; Model.TrajectoryInfo.set(frames[index], { index, size: 2 }); }
  const trajectory = { representative, getFrameAtIndex: index => Task.create('lazy frame', async () => frames[index]) };
  stabilizeMdModelIdentity(trajectory, 42);
  assert.equal(representative.modelNum, 42);
  const first = await trajectory.getFrameAtIndex(0).run(), second = await trajectory.getFrameAtIndex(1).run();
  assert.equal(first.modelNum, 42); assert.equal(second.modelNum, 42);
  assert.equal(Model.TrajectoryInfo.get(first).index, 0); assert.equal(Model.TrajectoryInfo.get(second).index, 1);
});
test('base64 fallback decodes bounded chunks and yields without per-character iterable allocation', async () => {
  const original = Buffer.from(Array.from({ length: 31 }, (_, index) => index * 7));
  let yields = 0;
  const decoded = await decodeTrajectoryBase64(original.toString('base64'), { preferNative: false, chunkBytes: 6, yieldToMain: async () => { yields++; } });
  assert.deepEqual(decoded, new Uint8Array(original)); assert.equal(yields, 5);
  for (const text of ['#AAA', 'AAA', '', 'AA==AAAA']) await assert.rejects(decodeTrajectoryBase64(text, { preferNative: false, chunkBytes: 3 }), /base64/);
  await assert.rejects(decodeTrajectoryBase64(original.toString('base64'), { maxBytes: 30 }), /exceeds/);
});
test('base64 uses native typed-array decoding when available', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(Uint8Array, 'fromBase64'); let called = 0;
  Object.defineProperty(Uint8Array, 'fromBase64', { configurable: true, value: text => { called++; return new Uint8Array(Buffer.from(text, 'base64')); } });
  try {
    const decoded = await decodeTrajectoryBase64('AAH/');
    assert.deepEqual(Array.from(decoded), [0, 1, 255]); assert.equal(called, 1);
  } finally {
    if (descriptor) Object.defineProperty(Uint8Array, 'fromBase64', descriptor); else delete Uint8Array.fromBase64;
  }
});
