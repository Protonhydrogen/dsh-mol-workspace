import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayerRecord } from '../src/viewer/operations.js';
import { representationParams } from '../src/viewer/representation-style.js';

/**
 * A layer is how a *local* patch gets its own surface or potential colouring, so
 * its record has to carry the surface/electrostatics options through to Mol*.
 * These fields were silently dropped once, which turned every "local" surface
 * request into a plain ball-and-stick layer.
 */

const selection = { structureId: '1', kind: 'residue', residues: [{ chainId: 'A', start: 10 }] };
const makeId = () => 'layer-fixed';

test('a layer record keeps probe radius and electrostatic options', () => {
  const record = buildLayerRecord(
    {
      name: 'Pocket surface',
      representation: 'solvent-accessible',
      color: 'electrostatic',
      probeRadius: 1.8,
      dielectric: 20,
      ionicStrength: 0.3,
      potentialRange: 25,
      smoothness: 2,
    },
    selection,
    makeId,
  );

  assert.equal(record.display.representation, 'solvent-accessible');
  assert.equal(record.display.color, 'electrostatic');
  assert.equal(record.display.probeRadius, 1.8);
  assert.equal(record.display.dielectric, 20);
  assert.equal(record.display.ionicStrength, 0.3);
  assert.equal(record.display.potentialRange, 25);
  assert.equal(record.display.smoothness, 2);
});

test('the alias becomes a real provider name with the probe radius attached', () => {
  const record = buildLayerRecord(
    { representation: 'solvent-accessible', color: 'electrostatic', probeRadius: 1.8 },
    selection,
    makeId,
  );
  const params = representationParams(record.display, {}, 'gaussian-surface');
  assert.equal(params.radiusOffset, 1.8);
  assert.equal(params.alpha, 1);
});

test('a plain layer carries no surface options it did not ask for', () => {
  const record = buildLayerRecord({ representation: 'ball-and-stick' }, selection, makeId);
  for (const key of ['probeRadius', 'dielectric', 'ionicStrength', 'potentialRange']) {
    assert.equal(record.display[key], undefined, `${key} should be absent`);
  }
  assert.equal(record.display.color, 'uniform');
});

test('a hex colour string maps to the layer colour, a theme name to the display', () => {
  const hex = buildLayerRecord({ color: '#ff8800' }, selection, makeId);
  assert.equal(hex.color, '#ff8800');
  assert.equal(hex.display.color, 'uniform');

  const themed = buildLayerRecord({ color: 'electrostatic' }, selection, makeId);
  assert.equal(themed.color, '#8b5cf6');
  assert.equal(themed.display.color, 'electrostatic');
});

test('tags get their own default name and id prefix', () => {
  const tag = buildLayerRecord({}, selection, () => 'tag-1');
  assert.equal(tag.id, 'tag-1');
  assert.equal(tag.name, 'Selection layer');
});
