import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import { join } from 'node:path';
import { FIXTURES, OUT_DIR as root } from './paths.mjs';
const port = process.env.DSH_MOL_PORT || 43130;
const site = [{ authAsymId: 'A', authSeqId: 19 }];
async function api(method, ...args) {
  const response = await fetch('http://127.0.0.1:' + port + '/api/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  });
  const result = await response.json();
  if (!result.ok) throw Object.assign(new Error(result.error.message), result.error);
  return result.value;
}
const run = async (name, args) => (await api('callTool', 'molecular_' + name, args)).result;
const control = (action, args) => run('control', { action, args });

function syntheticGrid(origin, step) {
  return [
    'object 1 class gridpositions counts 2 2 2', 'origin ' + origin.join(' '),
    'delta ' + step + ' 0 0', 'delta 0 ' + step + ' 0', 'delta 0 0 ' + step,
    'object 2 class gridconnections counts 2 2 2',
    'object 3 class array type double rank 0 items 8 data follows',
    '-25 -25 -25 -25', '25 25 25 25', 'attribute "dep" string "positions"',
  ].join('\n');
}

test('real DSH tool definitions drive the live Mol* surface, selection and state', async t => {
  const fixture = join(FIXTURES, '1qys.cif');
  const { structureId } = await api('callTool', 'molecular_load', { path: fixture });
  const info = () => control('getStructureInfo', { structureId });
  const mesh = async name => (await info()).renderedRepresentations.find(item => item.component === name && item.renderObjectCount > 0 && item.status === 'ok');

  await t.test('all four surface geometries produce a mesh', async () => {
    for (const surface of ['molecular', 'gaussian', 'van-der-waals', 'solvent-accessible']) {
      const { layerId } = await run('surface', { structureId, surface, name: surface, color: 'uniform' });
      assert.ok(await mesh(surface), surface);
      await control('removeLayer', { id: layerId });
    }
  });
  await t.test('the local preview colors a subset of full-surface vertices', async () => {
    const whole = await run('surface', { structureId, color: 'electrostatic', name: 'Global preview' });
    assert.equal(whole.field.method, 'screened-protein-side-chains');
    const local = await run('surface', { structureId, color: 'electrostatic', name: 'Local preview', residues: site, radius: 6 });
    assert.ok(local.sampledSurfaceVertices > 0 && local.sampledSurfaceVertices < whole.sampledSurfaceVertices);
    assert.ok(await mesh('Local preview'));
    assert.deepEqual(local.scale, whole.scale);
    await control('removeLayer', { id: whole.layerId });
    await control('removeLayer', { id: local.layerId });
  });
  await t.test('only a matching OpenDX grid is painted and its units are reported', async () => {
    const suffix = randomUUID();
    const far = root + '/misaligned-' + suffix + '.dx';
    const dxPath = root + '/synthetic-aligned-' + suffix + '.dx';
    await writeFile(far, syntheticGrid([1000, 1000, 1000], 20));
    await writeFile(dxPath, syntheticGrid([-60, -60, -60], 120));
    await assert.rejects(api('getPotentialGrid', dxPath), /not requested/);
    await assert.rejects(run('surface', { structureId, dxPath: far, name: 'Missing grid coverage' }), /does not cover/);
    assert.equal(await mesh('Missing grid coverage'), undefined);
    const mapped = await run('surface', { structureId, dxPath, name: 'Mapped electrostatic potential' });
    assert.equal(mapped.field.method, 'opendx-trilinear');
    assert.equal(mapped.scale.positive, 5);
    assert.equal(mapped.sampledSurfaceVertices, mapped.regionSurfaceVertices);
    assert.match(mapped.field.sha256, /^[0-9a-f]{64}$/);
    assert.ok(await mesh('Mapped electrostatic potential'));
    await control('removeLayer', { id: mapped.layerId });
  });
  await t.test('named highlights validate every residue and survive clearing selection', async () => {
    await assert.rejects(run('highlight', { structureId, residues: [...site, { authAsymId: 'A', authSeqId: 9999 }], persistent: true }), /does not exist/);
    const layer = await run('highlight', { structureId, residues: site, persistent: true, colorValue: '#ffc044', name: 'TYR A19 site' });
    assert.equal(layer.color, '#ffc044');
    await control('clearSelection', { structureId });
    assert.ok(await mesh('TYR A19 site'));
  });
  await run('surface', { structureId, surface: 'molecular', color: 'electrostatic', name: 'TYR A19 electrostatic preview', residues: site, radius: 8, opacity: 0.72, limit: 0.13 });
  const figure = await control('exportImage', {structureId, width: 850, height: 750, format: 'png', background: 'black'});
  assert.equal((await readFile(figure.path)).toString('hex', 0, 8), '89504e470d0a1a0a');
  console.log('Rendered image: ' + figure.path);
});
