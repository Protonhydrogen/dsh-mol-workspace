import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePotentialGrid, makeRegionTest, screenedPotential, potentialColor } from '../src/viewer/surface-potential.js';

const dx = `object 1 class gridpositions counts 2 2 2
origin -1 0 0
delta 2 0 0
delta 0 1 0
delta 0 0 1
object 2 class gridconnections counts 2 2 2
object 3 class array type double rank 0 items 8 data follows
0 1 10
11 100 101
110 111
attribute "dep" string "positions"`;

test('APBS OpenDX is sampled in world coordinates with z-fast ordering', () => {
  const grid = parsePotentialGrid(dx);
  assert.equal(grid.sample(-1, 1, 1), 11);
  assert.equal(grid.sample(1, 0, 0), 100);
  assert.equal(grid.sample(0, 0.5, 0.5), 55.5);
  assert.equal(grid.sample(1.1, 0, 0), undefined);
  assert.throws(() => parsePotentialGrid(dx.replace('110 111', '110')), /8 values/);
  assert.throws(() => parsePotentialGrid(dx.replace('delta 2 0 0', 'delta 2 1 0')), /axis-aligned/);
});

test('local masks have a spatial boundary and blue and red follow potential sign', () => {
  const local = makeRegionTest([[-0.2, 0, 0], [20, 0, 0]], 3);
  assert.equal(local(2.8, 0, 0), true);
  assert.equal(local(2.81, 0, 0), false);
  assert.equal(local(18, 0, 0), true);
  assert.equal(potentialColor(-5, 5), 0xc6263b);
  assert.equal(potentialColor(0, 5), 0xffffff);
  assert.equal(potentialColor(5, 5), 0x2455c3);
});

test('the approximate field uses signed distance-dependent contributions from all sources', () => {
  const value = screenedPotential([[0, 0, 0, 1], [8, 0, 0, -1]], 8);
  assert.ok(value(1, 0, 0) > value(2, 0, 0));
  assert.equal(value(4, 0, 0), 0);
  assert.ok(value(7, 0, 0) < 0);
  assert.ok(Number.isFinite(value(0, 0, 0)));
});
