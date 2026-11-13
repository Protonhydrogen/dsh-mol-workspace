/**
 * Electrostatic potential for the viewer.
 *
 * Mol* draws surfaces but does not compute electrostatics, so this module
 * supplies the part it lacks: atomic charges, screened Coulomb sums, and a
 * colour theme that maps the resulting potential onto atoms — and therefore
 * onto whatever surface mesh is built around them.
 *
 * Two charge sources, in order of preference:
 *
 *   1. Partial charges already parsed by Mol* — a PDBQT file carries Gasteiger
 *      charges, and those are used verbatim when present.
 *   2. The built-in residue model below. It is a *qualitative* model: backbone
 *      charges follow the Amber convention, and charged side chains carry their
 *      formal charge on the functional-group atoms. It reproduces where the
 *      positive and negative regions are, which is what a potential map is read
 *      for. It is not a force-field calculation and is not a quantitative energy.
 *
 * The potential is a screened Coulomb sum over neighbouring charges:
 *
 *     V(i) = k · Σ_j≠i  q_j / (ε · r_ij) · exp(−r_ij / λ_D)
 *
 * with a Debye length derived from ionic strength and dielectric constant.
 * Only atom centres are evaluated; a surface mesh inherits the colour of its
 * nearest atom. The value shown on a surface is therefore the potential at atom
 * centres, not one solved on the surface itself — the UI states this.
 */
import { ColorTheme } from 'molstar/lib/mol-theme/color';
import { Color } from 'molstar/lib/mol-util/color';
import { AtomPartialCharge } from 'molstar/lib/mol-model-formats/structure/property/partial-charge.js';

/** Coulomb constant in (kcal/mol)·Å/e², so potentials read in kcal/mol/e. */
const COULOMB = 332.0637;

/** Backbone charges, Amber convention, for the neutral residue. */
const BACKBONE = {
  N: -0.4157,
  H: 0.2719,
  CA: -0.0249,
  HA: 0.1036,
  C: 0.5973,
  O: -0.5679,
  OXT: -0.5679,
  H1: 0.2719,
  H2: 0.2719,
  H3: 0.2719,
};

/**
 * Side-chain charges on functional-group atoms. Net residue charge is correct
 * for the charged residues; polar-but-neutral residues get a local dipole
 * only. Unlisted atoms contribute nothing, which keeps the sum dominated by
 * the groups that actually carry a long-range field.
 */
const SIDECHAIN = {
  ASP: { OD1: -0.5, OD2: -0.5 },
  GLU: { OE1: -0.5, OE2: -0.5 },
  LYS: { NZ: 1.0 },
  ARG: { NH1: 0.5, NH2: 0.5, NE: 0.2 },
  HIS: { ND1: 0.5, NE2: 0.5 },
  SER: { OG: -0.4, HG: 0.4 },
  THR: { OG1: -0.4, HG1: 0.4 },
  TYR: { OH: -0.4, HH: 0.4 },
  CYS: { SG: -0.3, HG: 0.3 },
  ASN: { OD1: -0.5, ND2: 0.5 },
  GLN: { OE1: -0.5, NE2: 0.5 },
  TRP: { NE1: -0.3, HE1: 0.3 },
};

const NEUTRAL = Color(0xdfe4ea);

/** Blue for positive, near-white at zero, red for negative — the conventional map. */
const STOPS = [
  [-1.0, [214, 96, 92]],
  [-0.5, [238, 176, 170]],
  [0.0, [246, 247, 249]],
  [0.5, [168, 196, 228]],
  [1.0, [70, 108, 176]],
];

const colorCache = new Map();

function ramp(t) {
  const clamped = Math.min(Math.max(t, -1), 1);
  const key = Math.round(clamped * 500);
  const hit = colorCache.get(key);
  if (hit !== undefined) return hit;
  let rgb = STOPS[STOPS.length - 1][1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a, ca] = STOPS[i];
    const [b, cb] = STOPS[i + 1];
    if (clamped >= a && clamped <= b) {
      const f = b > a ? (clamped - a) / (b - a) : 0;
      rgb = [0, 1, 2].map((j) => Math.round(ca[j] + (cb[j] - ca[j]) * f));
      break;
    }
  }
  const color = Color((rgb[0] << 16) | (rgb[1] << 8) | rgb[2]);
  colorCache.set(key, color);
  return color;
}

/** Map a potential value to a colour. `range` is the value at full saturation. */
export function potentialColor(value, range = 15) {
  if (!Number.isFinite(value)) return NEUTRAL;
  return ramp(value / Math.max(1e-6, Math.abs(range)));
}

/**
 * Debye length in Angstrom.
 *
 * A 1:1 electrolyte at 1 M in water has λ ≈ 0.304 nm = 3.04 Å. Since λ ∝ 1/κ
 * and κ² ∝ 1/ε, the length scales as sqrt(ε) relative to that reference.
 */
export function debyeLength(ionicStrength, dielectric) {
  const I = Math.max(0, Number(ionicStrength) || 0);
  if (I <= 0) return Infinity;
  return (3.04 / Math.sqrt(I)) * Math.sqrt(Math.max(1, dielectric) / 80);
}

/** True when the structure already carries Mol* partial charges (e.g. PDBQT). */
export function hasParsedCharges(structure) {
  try {
    return !!AtomPartialCharge.Provider.get(structure.models[0]);
  } catch {
    return false;
  }
}

/**
 * Per-atom charges for one model, indexed by atom index.
 * Returns { charges: Float32Array, source: 'parsed'|'model', net, charged }.
 */
export function assignCharges(model) {
  const atoms = model.atomicHierarchy.atoms;
  const residues = model.atomicHierarchy.residues;
  const count = atoms._rowCount;
  const charges = new Float32Array(count);

  let parsed = null;
  try {
    const prop = AtomPartialCharge.Provider.get(model);
    if (prop?.data) parsed = prop.data;
  } catch {
    parsed = null;
  }

  let net = 0;
  let charged = 0;
  for (let i = 0; i < count; i++) {
    let q = 0;
    if (parsed) {
      q = parsed.value(i) || 0;
    } else {
      const comp = residues.label_comp_id.value(i);
      const atomName = atoms.label_atom_id.value(i).trim();
      const side = SIDECHAIN[comp];
      if (side && side[atomName] !== undefined) q = side[atomName];
      else if (BACKBONE[atomName] !== undefined) q = BACKBONE[atomName];
    }
    charges[i] = q;
    net += q;
    if (q !== 0) charged++;
  }
  return { charges, source: parsed ? 'parsed' : 'model', net, charged, count };
}

/**
 * Screened Coulomb potential at every atom centre.
 *
 * O(N²) over atoms. A 1000-residue chain is roughly 8000 atoms → 64M pair
 * evaluations, about a second in JS. The result is cached per structure and
 * parameter set, so the cost is paid on change, not per frame.
 */
export function computePotentials(model, assigned, options = {}) {
  const dielectric = Math.max(1, Number(options.dielectric) || 80);
  const lambda = debyeLength(options.ionicStrength ?? 0.15, dielectric);
  const cutoff = Math.max(5, Number(options.cutoff) || 40);

  const conf = model.atomicConformation;
  const n = assigned.count;
  const q = assigned.charges;

  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const pz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = conf.x[i];
    py[i] = conf.y[i];
    pz[i] = conf.z[i];
  }

  const out = new Float32Array(n);
  const cutoff2 = cutoff * cutoff;
  const invDielectric = 1 / dielectric;

  for (let i = 0; i < n; i++) {
    const xi = px[i];
    const yi = py[i];
    const zi = pz[i];
    let sum = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const qj = q[j];
      if (qj === 0) continue;
      const dx = xi - px[j];
      const dy = yi - py[j];
      const dz = zi - pz[j];
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 > cutoff2 || r2 < 1e-6) continue;
      const r = Math.sqrt(r2);
      const screening = lambda === Infinity ? 1 : Math.exp(-r / lambda);
      sum += (qj / r) * screening;
    }
    out[i] = COULOMB * sum * invDielectric;
  }
  return out;
}

/** Potential tables keyed by model; the theme reads them synchronously per atom. */
const potentialByModel = new WeakMap();
let activeRange = 15;

export function setActivePotential(model, potential, range) {
  if (potential) potentialByModel.set(model, potential);
  else potentialByModel.delete(model);
  if (Number.isFinite(range)) activeRange = range;
}

export function clearActivePotential(model) {
  if (model) potentialByModel.delete(model);
}

export function activeRangeValue() {
  return activeRange;
}

/** Min / max / mean of a potential table, so the UI can report the real range. */
export function potentialStats(potential) {
  if (!potential || !potential.length) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < potential.length; i++) {
    const v = potential[i];
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    count++;
  }
  if (!count) return null;
  return { min, max, mean: sum / count, count };
}

export const ElectrostaticThemeProvider = {
  name: 'electrostatic',
  label: 'Electrostatic potential',
  category: ColorTheme.Category.Atom,
  getParams: () => ({}),
  isApplicable: () => true,
  factory: (ctx, props) => ({
    granularity: 'atom',
    preferSmoothing: false,
    factory: ElectrostaticThemeProvider.factory,
    props,
    color: (location) => {
      try {
        if (!location?.unit) return NEUTRAL;
        const model = location.unit.model;
        const table = potentialByModel.get(model);
        if (!table) return NEUTRAL;
        const atomIdx = location.unit.elements[location.element];
        return potentialColor(table[atomIdx], activeRange);
      } catch {
        return NEUTRAL;
      }
    },
    description:
      'Screened Coulomb potential at atom centres (kcal/mol/e). Qualitative unless the charges come from a PDBQT file.',
  }),
};

export function registerElectrostaticTheme(plugin) {
  try {
    const reg = plugin?.representation?.structure?.themes?.colorThemeRegistry;
    if (!reg) return false;
    const existing = reg.get ? reg.get('electrostatic') : null;
    if (existing && existing.name === 'electrostatic') return true;
    reg.add(ElectrostaticThemeProvider);
    return true;
  } catch {
    return false;
  }
}
