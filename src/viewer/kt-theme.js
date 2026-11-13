/**
 * Custom Mol* colour theme: paints only lysine residues that carry a K-T MS2
 * score in their B-factor column, on a neutral background — so the coloured
 * patches belong to the *same* molecular surface as the rest of the antibody.
 */
import { ColorTheme } from 'molstar/lib/mol-theme/color';
import { Color } from 'molstar/lib/mol-util/color';
import { StructureProperties } from 'molstar/lib/mol-model/structure';

const STOPS = [
  [0.00, [127, 168, 208]],
  [0.25, [184, 208, 230]],
  [0.50, [255, 255, 255]],
  [0.75, [243, 192, 174]],
  [1.00, [219, 138, 128]],
];

const NEUTRAL = Color(0xf2f5f9);   // 柔和近白（恒定区 / 其它）
const VH_COLOR = Color(0xc9dcf2);  // VH：柔和天蓝
const VL_COLOR = Color(0xf2d9c6);  // VL：柔和暖沙
const VH_END = 119, VL_END = 111;  // pembrolizumab：VH 1-119，VL 1-111
const cache = new Map();

function ramp(t) {
  const k = Math.round(Math.min(Math.max(t, 0), 1) * 255) | 0;
  if (cache.has(k)) return cache.get(k);
  const u = k / 255;
  let rgb = STOPS[STOPS.length - 1][1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a, ca] = STOPS[i];
    const [b, cb] = STOPS[i + 1];
    if (u >= a && u <= b) {
      const f = b > a ? (u - a) / (b - a) : 0;
      rgb = [0, 1, 2].map((j) => Math.round(ca[j] + (cb[j] - ca[j]) * f));
      break;
    }
  }
  const col = Color((rgb[0] << 16) | (rgb[1] << 8) | rgb[2]);
  cache.set(k, col);
  return col;
}

function domainColor(location) {
  try {
    const asym = StructureProperties.chain.auth_asym_id(location);
    const seq = StructureProperties.residue.auth_seq_id(location);
    if (asym === 'B' || asym === 'G') return seq <= VH_END ? VH_COLOR : NEUTRAL;
    if (asym === 'A' || asym === 'F') return seq <= VL_END ? VL_COLOR : NEUTRAL;
  } catch {
    /* fall through to neutral */
  }
  return NEUTRAL;
}

export const KtMs2ThemeProvider = {
  name: 'kt-ms2',
  label: 'Lysine K-T MS2 response',
  category: ColorTheme.Category.Residue,
  getParams: () => ({}),
  isApplicable: () => true,
  factory: (ctx, props) => ({
    granularity: 'group',
    preferSmoothing: true,
    factory: KtMs2ThemeProvider.factory,
    props,
    color: (location) => {
      try {
        if (!location || !location.unit) return NEUTRAL;
        if (StructureProperties.residue.label_comp_id(location) !== 'LYS') return domainColor(location);
        const b = StructureProperties.atom.B_iso_or_equiv(location);
        if (!(b > 0.5)) return domainColor(location);
        return ramp((b - 25) / 75);
      } catch {
        return NEUTRAL;
      }
    },
    description: 'VH/VL domain tint; Lys patches coloured by K-T MS2 response (B-factor)',
  }),
};

export function registerKtTheme(plugin) {
  try {
    const reg = plugin?.representation?.structure?.themes?.colorThemeRegistry;
    if (!reg) return false;
    const existing = reg.get ? reg.get('kt-ms2') : null;
    if (existing && existing.name === 'kt-ms2') return true;
    reg.add(KtMs2ThemeProvider);
    return true;
  } catch {
    return false;
  }
}
