# Changelog

Notable changes to this plugin. The project is pre-1.0: minor versions may
change behaviour, and the Agent tool surface is the most likely thing to move.

## 0.4.0

- Solvent-accessible surface: a Gaussian surface grown by the probe radius,
  selectable as its own representation, with probe radius and smoothness in the
  UI. The molecular (solvent-excluded) surface stays available alongside it.
- Electrostatic colour theme: screened Coulomb potential at atom centres, drawn
  blue for positive and red for negative. Charges come from a PDBQT file when
  the structure carries them; otherwise a built-in residue model is used.
- Electrostatics parameters: dielectric constant, ionic strength (Debye
  screening), and the potential range that maps to full colour saturation.
- Local patches: a selection layer can carry its own solvent surface or
  electrostatic colouring without touching the rest of the structure.

## 0.3.1

- Custom `kt-ms2` colour theme: paints only lysine residues carrying a K-T MS2
  marker, leaving the rest of the chain in the base theme.
- `molecular_style` Agent tool, for restyling a structure or painting a
  coloured overlay in one call.
- Selection references survive a composer round-trip: adding a residue to the
  chat inserts a visible reference and keeps the existing draft intact.
- Viewer wake-up: Agent load and visual commands request the sidebar for the
  current session and wait for the renderer, instead of failing when the panel
  is closed.
- Per-session state is restored from the user profile on the next launch rather
  than from a build directory.

## 0.3.0

- Multiple simultaneous representations per structure (Cartoon, Molecular
  Surface, and others together) with independent layers.
- Seven style presets: Default, Research, Cinematic, Cartoon, X-Ray, Craft,
  Origami, plus Reset to Mol* defaults.
- Six measurement types (distance, angle, dihedral, plane, orientation, label)
  computed from real atom coordinates, individually styleable and removable.
- Video capture with frame-range selection over WebM, 1080p/4K/custom, at
  24/30/60 fps.

## 0.2.4

- Command channel: visual writes are queued and only report success once the
  real canvas acknowledges them. Failures, timeouts, and cancellations return
  the underlying error.
- `molecular_get_command` for polling long-running exports.

## 0.2.3

- Structure alignment with RMSD and the rigid transform matrix.
- Selection export to mmCIF.

## 0.2.2

- Tags and layers, independent of the base representation.
- Undo for scene edits that never touches the source file.

## 0.2.1

- Focus shows real ball-and-stick detail with a 5 Å neighbourhood and
  geometry-inferred non-covalent contacts.

## 0.2.0

- First version with the shared Molecular Context Service: one authoritative
  state consumed by both the sidebar and the Agent tools.
- Load local PDB/mmCIF or a four-character PDB ID.
