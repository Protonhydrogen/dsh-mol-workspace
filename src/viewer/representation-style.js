import { CHAIN_COLOR_PARAMS, NEUTRAL_CARBON, carbonColor } from './palette.js';

/**
 * Map a plugin-level representation name to the Mol* representation type.
 *
 * `solvent-accessible` is not a Mol* type: it is a gaussian surface grown by
 * the solvent probe radius, which is the standard way to draw an SAS without a
 * second isosurface implementation.
 */
export const presetRepresentation = (name) =>
  ({
    auto: 'cartoon',
    'polymer-cartoon': 'cartoon',
    'atomic-detail': 'ball-and-stick',
    'polymer-and-ligand': 'ball-and-stick',
    illustrative: 'spacefill',
    'solvent-accessible': 'gaussian-surface',
  })[name] ?? name ?? 'cartoon';

/** Default probe radius in Angstrom: water is 1.4 Å. */
export const DEFAULT_PROBE_RADIUS = 1.4;

export function selectedRepresentations(display) {
  return (display.representations ?? [presetRepresentation(display.representation)]).map(presetRepresentation);
}

export function representationColorParams(display) {
  if (display.color === 'chain-id') return CHAIN_COLOR_PARAMS;
  if (display.color === 'element-symbol') return carbonColor(NEUTRAL_CARBON);
  if (display.color === 'electrostatic') return {};
  return display.colorValue ? { value: Number.parseInt(display.colorValue.slice(1), 16) } : {};
}

export function representationParams(display, previous = {}, type) {
  const params = {
    ...previous,
    alpha: display.opacity ?? 1,
    quality: display.quality ?? 'auto',
    emissive: display.emissive ?? 0,
    material: {
      ...previous.material,
      metalness: display.metalness ?? 0,
      roughness: display.roughness ?? 0.4,
      bumpiness: display.bumpiness ?? 0,
    },
  };
  for (const key of [
    'sizeFactor',
    'flatShaded',
    'bumpFrequency',
    'bumpAmplitude',
    'ignoreHydrogens',
    'tubularHelices',
    'aspectRatio',
    'arrowFactor',
  ]) {
    if (display[key] != null) params[key] = display[key];
  }

  // Surface geometry: the probe radius is what turns a molecular surface into a
  // solvent-accessible one, so it is carried on the representation params.
  if (type === 'gaussian-surface') {
    if (display.probeRadius != null) params.radiusOffset = display.probeRadius;
    else if (display.representation === 'solvent-accessible') params.radiusOffset = DEFAULT_PROBE_RADIUS;
    if (display.smoothness != null) params.smoothness = display.smoothness;
  } else if (type === 'molecular-surface') {
    if (display.probeRadius != null) params.sizeFactor = display.sizeFactor ?? 1;
    if (display.smoothness != null) params.bumpFrequency = display.smoothness;
  }

  return params;
}
