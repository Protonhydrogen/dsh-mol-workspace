# DSH Molecular Workspace

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4b6bfb.svg)](https://github.com/deepseek-ai)

A native 3D molecular viewer for the [DeepSeek Harness](https://github.com/deepseek-ai) right sidebar, built on [Mol*](https://github.com/molstar/molstar). The sidebar and the Agent share one Molecular Context Service, so a selection you make with the mouse is the same object the Agent manipulates, and a command the Agent issues lands on the canvas you are looking at.

[中文说明](README.zh-CN.md)

![Native DSH conversation and Mol* Viewer](verification/dsh-ribosome-demo.png)

A real DSH conversation styles the loaded 3JAH ribosome with a natural-language request: 60S in soft blue, 40S in pale peach, and highlighted eRF1/tRNAs. The workspace breadcrumb is hidden for privacy. No camera coordinates are supplied in the visible request.

## What it does

Load a local PDB or mmCIF file, or a four-character PDB ID, and inspect it in the sidebar without leaving the conversation. Select residues, chains, or single atoms; focus on a binding site; measure real geometry; take a publication-ready image; or hand the current selection to the Agent as a reference in your next message.

The plugin is deliberately honest about what it does not know: contacts shown around a focused residue are geometry-inferred proximity, not interaction energies, and no figure it produces is an experimental conclusion.

## Reproducible examples

![PD-L1 recognition by atezolizumab](verification/pdl1-recognition.png)

[PD-L1 / atezolizumab Fab (PDB 5X8L)](https://www.rcsb.org/structure/5X8L): antigen in steel blue, heavy chain in plum, light chain in gold, and the measured interface as sticks.

See [PD-L1 / antibody and full-ribosome preparation](examples/README.md), [DSH prompts](examples/DSH_PROMPTS.md), and [MD trajectory import](docs/MD_TRAJECTORIES.md). The scientific manifests and viewer-only PNGs contain no desktop tasks or local paths. Local research trajectories are excluded from the public package.

![Soft full-antigen electrostatic preview](verification/pdl1-electrostatic-soft.png)

The antigen carries a full, softly colored molecular surface. This example uses a screened protein-side-chain preview in reduced units; a matching supplied APBS OpenDX map can be used instead.

![A, P and E sites in the full 3JAH context](verification/3jah-sites.png)

[3JAH](https://www.rcsb.org/structure/3JAH): A-site eRF1(AAQ) in coral, P-site Val-tRNA in gold, E-site Lys-tRNA in teal, and mRNA in purple. All remaining deposited atoms stay loaded in a translucent gray context. See the [global overview](verification/3jah-global.png) and [scientific manifest](verification/examples.json).

## Features

**Structure handling**
- Load local PDB/mmCIF files or a PDB ID; multiple structures at once, each with its own representations, tags, and layers.
- Cartoon, Molecular Surface, ball-and-stick, spacefill, and others can be shown on the same structure simultaneously.
- Seven style presets — Default, Research, Cinematic, Cartoon, X-Ray, Craft, Origami — with real geometry, material, and renderer parameters, plus a Reset that rebuilds from Mol* defaults.

**Selection and inspection**
- Left-click to select and focus. Granularity switch between residue, atom, and chain; atom mode preserves model, auth/label numbering, atom name, altLoc, and unit/operator.
- Focus shows true ball-and-stick detail for the target, complete residues within 5 Å, and Mol*-inferred non-covalent contacts.
- Sequence strip with drag and shift-extend selection; click empty canvas to return to Overview.
- Undo for scene edits. Removing residues hides them from the view without modifying the source file.

**Surface and electrostatics**
- The molecular_surface Agent tool draws molecular, Gaussian, van der Waals, and solvent-accessible surfaces. It colors the full surface or a patch with a coordinate-matched APBS OpenDX map or a labeled side-chain preview.
- A named persistent highlight keeps a ligand or residue visible through selection changes.
- Solvent-accessible surface: a Gaussian surface grown by the solvent probe radius (1.4 Å for water), selectable as its own representation, with the probe radius and smoothness adjustable. The molecular (solvent-excluded) surface remains available beside it.
- Electrostatic potential: the screened Coulomb potential at atom centres, painted blue for positive and red for negative. Charges are taken from a PDBQT file when the structure carries them; otherwise a built-in residue model supplies backbone Amber charges and formal side-chain charges.
- Dielectric constant, ionic strength (Debye screening), and the potential range that maps to full colour saturation are adjustable.
- Local patches: any selection can carry its own solvent surface or electrostatic colouring as a layer, leaving the rest of the structure untouched.

**Measurements and annotations**
- Distance, angle, dihedral, plane, orientation axes, and free labels, all computed from actual atom coordinates. Each one can be restyled, hidden, or removed independently.
- Named tags and coloured layers that survive representation changes.

**Output**
- PNG/JPEG up to 8K, including transparent PNG.
- Selection export to mmCIF.
- WebM video with frame-range selection, 1080p/4K/custom sizes, 24/30/60 fps. MP4 is probed first and marked unavailable when the environment cannot produce valid frames.
- Native bounded DCD/XTC import with matching PDB/mmCIF topology; serial playback with overdue-frame skipping, pause, seek and frame-range export. Multi-model files remain supported.
- Rigid alignment between two structures with RMSD and the transform matrix.
- Every export writes an `evidence` JSON next to the file it produced.

**Conversation integration**
- "Add to chat" and "Send selection to chat" insert a visible residue reference into the native composer without discarding your draft, and without auto-sending.
- Type `@` in the composer to search molecular references.

**Agent tools** — see [AGENT_TOOLS.md](AGENT_TOOLS.md). Ten tools (`molecular_load`, `molecular_get_state`, `molecular_select`, `molecular_focus`, `molecular_highlight`, `molecular_style`, `molecular_control`, `molecular_get_command`, `molecular_surface`, and `molecular_trajectory`) operate on the same state the sidebar shows. If the viewer is closed, Agent commands request it for the current session and wait for the renderer to connect rather than reporting a fake success.

**Appearance** — follows the DSH theme; an explicitly chosen export background still wins for exports.

## MD: one contact in context

**MD provenance and responsibilities.** A professional molecular dynamics engine generates the trajectory using a force field and numerical time integration; this demo uses Q6/Qdyn simulation output. Our research setup connects **VMD through MCP** for externally controlled structure/trajectory inspection and preparation. In this recorded example, a separate Python export script performed the fixed-neighborhood extraction and uniform frame sampling. **DSH and Mol* load, style, measure, and play the prepared coordinates; they do not generate the dynamics or run VMD during this recording.** VMD MCP is configured separately in the Agent host, not bundled with this viewer. See [the MD workflow](docs/MD_TRAJECTORIES.md#simulation-vmd-mcp-and-display).

The two static frames highlight complete residues and track one atom-to-atom distance. The nearby environment remains visible in translucent gray. The workflow GIF below uses the newer group_01 simulation.

| Frame 1 · 4.89 Å | Frame 34 · 3.79 Å |
|---|---|
| ![MD contact at frame 1](verification/md-contact-frame-1.png) | ![MD contact at frame 34](verification/md-contact-frame-34.png) |

![Natural-language request loading and playing group MD in DSH](verification/dsh-md-workflow.gif)

Continuous native DSH recording of the visible execution: request, file checks, topology loading, trajectory attachment, styling, measurement, framing, and playback. The full sequence is shown at 10× elapsed time (about 14 seconds per loop), with progress notes and step results retained and no cuts between execution steps. This 150 ps run is displayed as 150 uniformly sampled frames. Across all source frames, NZ–O4 close-contact occupancy is 98.40%; directional hydrogen-bond occupancy is 32.47% (distance ≤3.5 Å and best D–H–A angle ≥135°).

The dashed annotation measures geometric distance. Only the rendered media are shared; source topology, trajectory and path-bearing evidence remain private.


## Requirements

- DeepSeek Harness with the right-hand sidebar (`dsh-client-ui-sidebar-right`).
- The host API the plugin declares in `peerDependencies` (`@deepseek-ai/cordis`, `dsh-tools`, `dsh-typert-protocol`, `dsh-llm`).
- Node.js 20 or newer for building. Running the plugin needs no build, because `client.js` ships in this repository.

## Install

The plugin is installed as a local package in a DSH profile. A profile lives under `~/.dsh/profiles/<name>/`.

1. Clone this repository somewhere stable:

   ```bash
   git clone https://github.com/Protonhydrogen/dsh-mol-workspace.git
   ```

2. Add it to the profile's `package.json` as a linked dependency and register the bundle:

   ```json
   {
     "dependencies": {
       "dsh-mol-workspace": "link:/absolute/path/to/dsh-mol-workspace"
     },
     "dsh": {
       "profile": {
         "bundles": [
           "dsh-mol-workspace"
         ]
       }
     }
   }
   ```

   The dependency key, the bundle entry, and the `name` in this repository's `package.json` must all stay identical: `cordis.patch.yml` inserts that id and the client module id inside `client.js` matches it.

3. Install the profile dependencies and restart DeepSeek Harness:

   ```bash
   cd ~/.dsh/profiles/<name>
   pnpm install
   ```

   The host half is ESM and is cached, so a full restart of DSH is required for changes to take effect.

4. Open the right sidebar and pick **Mol* Viewer**.

The sidebar state is stored per session under `~/.dsh/storages/molecular-workspace`, or wherever `DSH_MOLECULAR_STATE_DIR` points.

## Build from source

The shipped `client.js` is a single-file bundle with Mol* compiled in, so you only need this if you change `src/`.

```bash
npm install          # molstar + esbuild, as devDependencies
npm run build        # rewrites client.js
```

`build.mjs` resolves its toolchain through `tests/paths.mjs`, which honours `MOLSTAR_ROOT` when you keep dependencies outside the repository:

```bash
MOLSTAR_ROOT=/path/to/a/dir/with/molstar/and/esbuild npm run build
```

The build normalizes generated module labels so the shipped bundle excludes the build machine’s directory names.

## Tests

Unit tests run in plain Node and cover state, geometry, remote manifest, tool registration, and export helpers:

```bash
npm test
```

Live tests drive the real Mol* renderer in a browser and need a page to drive:

```bash
node tests/build.mjs
node --experimental-loader ./tests/resolve-loader.mjs tests/browser-server.mjs
# open http://127.0.0.1:43130/ in a browser, then:
npm run test:live
# Dedicated surface and site tool checks:
npm run test:surface
```

`tests/paths.mjs` locates `molstar` and the `@deepseek-ai/*` packages from the repository itself, the local DSH profile, or `MOLSTAR_ROOT` / `DSH_ROOT`. It fails with an explanatory message rather than a stack trace when one is missing. The test server binds `127.0.0.1` only.

Checked-in fixtures: `fixtures/1qys.cif` (PDB entry 1QYS) and `fixtures/test-structure.pdb` (a three-residue alanine/serine/glycine peptide).

## Project layout

```
index.js              host entry: service, typert registration, tools
src/host/             Molecular Context Service, persistence, projections
src/client/           sidebar UI, composer references, viewer wake-up
src/viewer/           Mol* engine adapter, selection, styles, exports
src/shared/           contracts shared by host and client
tests/                unit and live tests, browser harness
verification/         acceptance notes and rendered screenshots
cordis.patch.yml      bundle insertion for the DSH profile
```

## Limitations

- Contacts around a focus are geometric inference, not interaction energies or binding affinities.
- MP4 export depends on an encoder being present; when it is not, the option is disabled and WebM remains available.
- The composer only supports `@` and `/` triggers. This plugin does not modify DSH core to add `#`.
- Electrostatic potentials are screened Coulomb sums at atom centres. Unless the input is a PDBQT file carrying Gasteiger charges, the charge model is qualitative: it places the positive and negative regions correctly, but it is neither a force-field calculation nor a Poisson–Boltzmann solution.
- A surface mesh inherits the colour of its nearest atom, so the potential drawn on a surface is the value at atom centres rather than one solved on the surface itself.
- Solvent-accessible surfaces are Gaussian approximations grown by the probe radius, not a Connolly rolling-probe construction.
- Pre-1.0: the Agent tool surface may change between minor versions.

## License

See [third-party notices](THIRD_PARTY_NOTICES.txt) for libraries bundled in the client.

[MIT](LICENSE). Built on [Mol*](https://github.com/molstar/molstar) (MIT), [zod](https://github.com/colinhacks/zod) (MIT), and [React](https://react.dev) (MIT).
