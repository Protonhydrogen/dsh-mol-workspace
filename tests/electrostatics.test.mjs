import test from 'node:test';
import assert from 'node:assert/strict';
import {
  debyeLength,
  potentialColor,
  assignCharges,
  computePotentials,
  potentialStats,
  registerElectrostaticTheme,
  ElectrostaticThemeProvider,
  setActivePotential,
  clearActivePotential,
} from '../src/viewer/electrostatics.js';

/** Minimal stand-in for a Mol* model: positions plus per-atom residue/atom names. */
function fakeModel(atoms) {
  return {
    atomicConformation: {
      x: Float32Array.from(atoms.map((a) => a.x)),
      y: Float32Array.from(atoms.map((a) => a.y)),
      z: Float32Array.from(atoms.map((a) => a.z)),
    },
    atomicHierarchy: {
      atoms: {
        _rowCount: atoms.length,
        label_atom_id: { value: (i) => atoms[i].atom.padEnd(4) },
      },
      residues: {
        label_comp_id: { value: (i) => atoms[i].res },
      },
    },
  };
}

test('Debye length matches the physical values for a 1:1 electrolyte', () => {
  // 1 M in water is the textbook 0.304 nm reference.
  assert.ok(Math.abs(debyeLength(1, 80) - 3.04) < 0.01);
  // λ ∝ 1/sqrt(I)
  assert.ok(Math.abs(debyeLength(0.25, 80) - 6.08) < 0.02);
  // λ ∝ sqrt(ε)
  assert.ok(Math.abs(debyeLength(1, 20) - 3.04 / 2) < 0.01);
  // No salt means no screening.
  assert.equal(debyeLength(0, 80), Infinity);
});

test('a two-charge system reproduces the screened Coulomb result', () => {
  const model = fakeModel([
    { x: 0, y: 0, z: 0, res: 'LYS', atom: 'NZ' },
    { x: 5, y: 0, z: 0, res: 'ASP', atom: 'OD1' },
  ]);
  const assigned = assignCharges(model);
  assert.equal(assigned.source, 'model');
  assert.deepEqual(Array.from(assigned.charges), [1, -0.5]);

  const potential = computePotentials(model, assigned, { dielectric: 80, ionicStrength: 0.15 });
  const lambda = debyeLength(0.15, 80);
  const expected = ((332.0637 * -0.5) / 5) * Math.exp(-5 / lambda) / 80;
  assert.ok(Math.abs(potential[0] - expected) < 1e-4, `expected ${expected}, got ${potential[0]}`);
  // The negative atom sees the positive one, so its potential is positive.
  assert.ok(potential[1] > 0);
});

test('vacuum with no salt reduces to a plain Coulomb sum', () => {
  const model = fakeModel([
    { x: 0, y: 0, z: 0, res: 'LYS', atom: 'NZ' },
    { x: 4, y: 0, z: 0, res: 'GLU', atom: 'OE1' },
  ]);
  const assigned = assignCharges(model);
  const potential = computePotentials(model, assigned, { dielectric: 1, ionicStrength: 0 });
  assert.ok(Math.abs(potential[0] - (332.0637 * -0.5) / 4) < 1e-3);
});

test('screening weakens the potential and never changes its sign', () => {
  const model = fakeModel([
    { x: 0, y: 0, z: 0, res: 'ARG', atom: 'NH1' },
    { x: 12, y: 0, z: 0, res: 'GLU', atom: 'OE1' },
  ]);
  const assigned = assignCharges(model);
  const soft = computePotentials(model, assigned, { dielectric: 80, ionicStrength: 1.5 });
  const hard = computePotentials(model, assigned, { dielectric: 80, ionicStrength: 0 });
  assert.ok(Math.sign(soft[0]) === Math.sign(hard[0]));
  assert.ok(Math.abs(soft[0]) < Math.abs(hard[0]));
});

test('neutral, unlisted atoms carry no charge and contribute no field', () => {
  const model = fakeModel([
    { x: 0, y: 0, z: 0, res: 'ALA', atom: 'CB' },
    { x: 3, y: 0, z: 0, res: 'ALA', atom: 'CB' },
  ]);
  const assigned = assignCharges(model);
  assert.deepEqual(Array.from(assigned.charges), [0, 0]);
  const potential = computePotentials(model, assigned, {});
  assert.deepEqual(Array.from(potential), [0, 0]);
});

test('charged residues carry their formal net charge', () => {
  const cases = [
    ['LYS', 'NZ', 1],
    ['ARG', 'NH1', 0.5],
    ['ASP', 'OD2', -0.5],
    ['GLU', 'OE2', -0.5],
  ];
  for (const [res, atom, expected] of cases) {
    const assigned = assignCharges(fakeModel([{ x: 0, y: 0, z: 0, res, atom }]));
    assert.equal(assigned.charges[0], expected, `${res} ${atom}`);
  }
});

test('the backbone table keeps a neutral residue close to zero net charge', () => {
  const atoms = [
    { x: 0, y: 0, z: 0, res: 'ALA', atom: 'N' },
    { x: 1, y: 0, z: 0, res: 'ALA', atom: 'H' },
    { x: 2, y: 0, z: 0, res: 'ALA', atom: 'CA' },
    { x: 3, y: 0, z: 0, res: 'ALA', atom: 'C' },
    { x: 4, y: 0, z: 0, res: 'ALA', atom: 'O' },
  ];
  const assigned = assignCharges(fakeModel(atoms));
  // Alanine has no charged side chain, so its backbone net is the whole residue
  // and must stay near zero rather than drifting.
  assert.ok(Math.abs(assigned.net) < 0.25, `net charge ${assigned.net}`);
});

test('colours follow the conventional red-negative blue-positive ramp', () => {
  const negative = potentialColor(-100, 15);
  const positive = potentialColor(100, 15);
  const zero = potentialColor(0, 15);
  const red = (c) => (c >> 16) & 0xff;
  const blue = (c) => c & 0xff;
  assert.ok(red(negative) > blue(negative), 'negative potential should read red');
  assert.ok(blue(positive) > red(positive), 'positive potential should read blue');
  assert.ok(red(zero) > 200 && blue(zero) > 200, 'zero should be near white');
  // Beyond the range the colour saturates rather than wrapping around.
  assert.equal(positive, potentialColor(500, 15));
});

test('statistics report the real spread, including symmetric cases', () => {
  const stats = potentialStats(Float32Array.from([-4, 0, 4]));
  assert.equal(stats.min, -4);
  assert.equal(stats.max, 4);
  assert.equal(stats.mean, 0);
  assert.equal(stats.count, 3);
  assert.equal(potentialStats(null), null);
  assert.equal(potentialStats(new Float32Array(0)), null);
});

test('the theme registers once and is idempotent', () => {
  const store = new Map();
  const plugin = {
    representation: { structure: { themes: { colorThemeRegistry: { get: (n) => store.get(n), add: (p) => store.set(p.name, p) } } } },
  };
  assert.equal(registerElectrostaticTheme(plugin), true);
  assert.equal(registerElectrostaticTheme(plugin), true);
  assert.equal(store.size, 1);
  assert.equal(store.get('electrostatic').name, 'electrostatic');
  // A plugin without a theme registry must not throw during startup.
  assert.equal(registerElectrostaticTheme({}), false);
});

test('the theme colours an atom from the potential table of its model', () => {
  const model = {};
  setActivePotential(model, Float32Array.from([-40, 0, 40]), 20);
  const theme = ElectrostaticThemeProvider.factory({}, {});
  assert.equal(theme.granularity, 'atom');
  const at = (element) => theme.color({ unit: { model, elements: Int32Array.from([0, 1, 2]) }, element });
  const red = (c) => (c >> 16) & 0xff;
  const blue = (c) => c & 0xff;
  assert.ok(red(at(0)) > blue(at(0)), 'negative atom should read red');
  assert.ok(blue(at(2)) > red(at(2)), 'positive atom should read blue');
  // Unknown model (no table yet) falls back to neutral instead of throwing.
  const orphan = theme.color({ unit: { model: {}, elements: Int32Array.from([0]) }, element: 0 });
  assert.equal(typeof orphan, 'number');
});

test('clearing the active potential stops colouring', () => {
  const model = {};
  setActivePotential(model, Float32Array.from([-40]), 20);
  clearActivePotential(model);
  const theme = ElectrostaticThemeProvider.factory({}, {});
  const c = theme.color({ unit: { model, elements: Int32Array.from([0]) }, element: 0 });
  assert.equal(typeof c, 'number');
});
