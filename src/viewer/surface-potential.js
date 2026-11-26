import { failure } from '../shared/model.js';

const DX_ITEM_LIMIT = 4_000_000;
const number = token => Number(token?.replace(/[dD]/, 'e'));
const invalidGrid = message => failure('INVALID_ARGUMENT', 'OpenDX: ' + message);

export function parsePotentialGrid(text) {
  const lines = text.split(/\r?\n/);
  const countsLine = lines.find(line => /^\s*object\s+\S+\s+class\s+gridpositions\s+counts\s/i.test(line));
  const counts = countsLine?.trim().split(/\s+/).slice(-3).map(number);
  const total = counts?.reduce((product, count) => product * count, 1);
  if (!counts?.every(count => Number.isInteger(count) && count >= 2) || total > DX_ITEM_LIMIT) {
    throw invalidGrid('expected a regular grid with 2–4,000,000 total samples');
  }
  const origin = lines.find(line => /^\s*origin\s/i.test(line))?.trim().split(/\s+/).slice(1).map(number);
  const deltas = lines.filter(line => /^\s*delta\s/i.test(line)).map(line => line.trim().split(/\s+/).slice(1).map(number));
  if (origin?.length !== 3 || !origin.every(Number.isFinite) || deltas.length !== 3 ||
      !deltas.every((row, axis) => row.length === 3 && row.every((v, col) => Number.isFinite(v) && (axis === col ? v !== 0 : v === 0)))) {
    throw invalidGrid('expected a finite origin and three axis-aligned deltas');
  }
  const connections = lines.find(line => /^\s*object\s+\S+\s+class\s+gridconnections\s+counts\s/i.test(line));
  if (connections && connections.trim().split(/\s+/).slice(-3).some((v, i) => number(v) !== counts[i])) {
    throw invalidGrid('grid positions and connections disagree');
  }
  const header = /^\s*object\s+\S+\s+class\s+array\b.*?\brank\s+0\s+items\s+(\d+)\s+data\s+follows(?:\s+(.*))?$/i;
  const start = lines.findIndex(line => header.test(line));
  if (start < 0 || Number(header.exec(lines[start])[1]) !== total) throw invalidGrid('expected a scalar array with ' + total + ' values');
  const values = new Float64Array(total);
  let index = 0;
  function addValues(line) {
    for (const token of line.trim().split(/\s+/)) {
      if (!token) continue;
      const value = number(token);
      if (!Number.isFinite(value) || index >= total) throw invalidGrid('expected exactly ' + total + ' values');
      values[index++] = value;
    }
  }
  addValues(header.exec(lines[start])[2] ?? '');
  for (let line = start + 1; line < lines.length; line++) {
    if (/^\s*(attribute|object|component)\b/i.test(lines[line])) break;
    if (!/^\s*#/.test(lines[line])) addValues(lines[line]);
  }
  if (index !== total) throw invalidGrid('expected exactly ' + total + ' values; found ' + index);
  const [nx, ny, nz] = counts;
  const [ox, oy, oz] = origin;
  const [dx, dy, dz] = deltas.map((row, i) => row[i]);
  const mix = (a, b, f) => a * (1 - f) + b * f;
  const at = (x, y, z) => values[(x * ny + y) * nz + z];
  function sample(x, y, z) {
    const a = (x - ox) / dx, b = (y - oy) / dy, c = (z - oz) / dz;
    if (!(a >= 0 && a <= nx - 1 && b >= 0 && b <= ny - 1 && c >= 0 && c <= nz - 1)) return undefined;
    const i = Math.min(nx - 2, Math.floor(a)), j = Math.min(ny - 2, Math.floor(b)), k = Math.min(nz - 2, Math.floor(c));
    const plane = p => mix(mix(at(p, j, k), at(p, j, k + 1), c - k), mix(at(p, j + 1, k), at(p, j + 1, k + 1), c - k), b - j);
    return mix(plane(i), plane(i + 1), a - i);
  }
  return { counts, sample };
}

function pointIndex(points, size) {
  const cells = new Map();
  for (const point of points) {
    const key = point.slice(0, 3).map(v => Math.floor(v / size)).join(',');
    const bucket = cells.get(key);
    if (bucket) bucket.push(point);
    else cells.set(key, [point]);
  }
  return (x, y, z, visit) => {
    const i = Math.floor(x / size), j = Math.floor(y / size), k = Math.floor(z / size);
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) for (let c = k - 1; c <= k + 1; c++) {
      const bucket = cells.get(a + ',' + b + ',' + c);
      if (bucket) for (const point of bucket) {
        const distance2 = (x - point[0]) ** 2 + (y - point[1]) ** 2 + (z - point[2]) ** 2;
        if (distance2 <= size * size && visit(point, distance2)) return true;
      }
    }
    return false;
  };
}

export function makeRegionTest(points, radius) {
  const nearby = pointIndex(points, radius);
  const yes = () => true;
  return (x, y, z) => nearby(x, y, z, yes);
}

// Homogeneous screened Coulomb potential, charge/r in reduced units. The
// cutoff is 5 screening lengths and the near-field distance floor is 1 Å.
export function screenedPotential(points, screeningLength) {
  const nearby = pointIndex(points, 5 * screeningLength);
  return (x, y, z) => {
    let sum = 0;
    nearby(x, y, z, (point, distance2) => {
      const r = Math.max(1, Math.sqrt(distance2));
      sum += point[3] * Math.exp(-r / screeningLength) / r;
      return false;
    });
    return sum;
  };
}

export function potentialColor(value, limit) {
  const amount = Math.min(1, Math.abs(value) / limit);
  const end = value < 0 ? 0xc6263b : 0x2455c3;
  const mix = shift => Math.round(255 + (((end >> shift) & 255) - 255) * amount);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}
