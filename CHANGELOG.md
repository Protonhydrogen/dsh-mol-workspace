# Changelog

Notable changes to this plugin. The project is pre-1.0: minor versions may
change behaviour, and the Agent tool surface is the most likely thing to move.

## Unreleased

- Install the clone's own runtime dependencies before the profile's: a `link:` install resolves through the clone's real path, so a missing `zod` made the host half fail to import and the sidebar show no panel, without any UI error.
- The profile installer now resolves the clone's declared runtime dependencies, prints the exact install command when one is missing, reports it in its JSON output and in `next`, and exits non-zero after `--write` in that case.
- Document the dependency step in README, README.zh-CN and the macOS guide.
- This documents the first real-Mac install; native acceptance itself stays pending the remaining checklist items.

## 0.6.0-rc.2 (portable-install candidate)

- Add the dsh-mol-workspace profile installer. It previews by default, preserves existing bundles and dependencies, creates a backup before changing a profile, and is idempotent.
- Add POSIX and Windows path tests and a single-process test command for restricted sandboxes; no DSH core changes.
- Add macOS installation guidance and an explicit real-Mac acceptance checklist. macOS native acceptance remains pending a real environment.
- Source and submission provenance now separates public molecular examples from the private, personal MD research workflow.

## 0.6.0-rc.1 (unpublished candidate)

- Add a separately registered molecular_trajectory tool for matching DCD/XTC coordinates, bounded allocation, stable molecular identity across frames and serialized playback.
- Add model-update statistics, responsive pause, source-hash restoration, missing-file recovery and MD state cleanup.
- Add official-coordinate PD-L1/atezolizumab and full-context 3JAH example preparation, portable camera framing and DSH prompts.
- Keep local research trajectories outside the public source and package. New example images await visual review.

## 0.5.0

- Added molecular_surface for four surface geometries and whole or local electrostatic coloring. It samples coordinate-matched APBS OpenDX at mesh vertices or creates a labeled side-chain preview.
- Added named persistent ball-and-stick overlays to molecular_highlight.
- Added peer compatibility with DSH 0.2.2-rc.5 and Cordis 4.1.0 alongside earlier supported peers.
- Rebuilt the client with portable module labels and bundled dependency notices. Added a public 3HS4 rendering to the README.

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
