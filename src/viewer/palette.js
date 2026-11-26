// One palette for every layer of the scene: the ribbon, the 5 Å context and the
// focused residue must agree about which colour a chain is. Mol* otherwise falls
// back to its own chain colours for carbon atoms, which is why a focused side
// chain used to render green against a periwinkle backbone.
export const CHAIN_PALETTE = [0x9aa6f2, 0x64c9c0, 0xe2bd7d, 0x9ed3b4, 0xd9a6cb, 0x8fb8e8];
export const FOCUS_CARBON = 0xf1c27d;
export const CONTEXT_CARBON = 0x8b93a8;
export const NEUTRAL_CARBON = 0xa9b3c8;
export const CHAIN_COLOR_PARAMS = { palette: { name: 'colors', params: { list: { kind: 'set', colors: CHAIN_PALETTE } } } };
export function carbonColor(value) {
  return { carbonColor: { name: 'uniform', params: { value } } };
}
// Mol* tints the selected residue with its own green by default: the fill comes
// from RendererParams.selectColor and the rim from MarkingParams.selectEdgeColor,
// both lime. Keep both in the same warm accent as the focused detail.
export const MARKER_PROPS = {
  colorMarker: true,
  selectColor: 0xf0c070,
  selectStrength: 0.3,
  highlightColor: 0x9fd8e8,
  highlightStrength: 0.25,
};
export const MARKING_PROPS = {
  selectEdgeColor: 0xf0c070,
  selectEdgeStrength: 0.6,
  highlightEdgeColor: 0x9fd8e8,
  highlightEdgeStrength: 0.5,
};
