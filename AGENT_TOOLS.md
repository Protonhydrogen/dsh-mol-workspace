# Agent tools

Ten tools are registered independently. Every defineTool / ctx.tools.register call has its own try/catch, logging the tool name and original exception. A failed registration does not prevent later tools from registering.

| Tool | Purpose |
| --- | --- |
| molecular_load | Load local PDB/mmCIF or a four-character PDB ID; return the structure ID |
| molecular_get_state | Read structures, selections, styles, tags, layers, measurements, commands and connection state; optional flat structureId/representation/color parameters |
| molecular_select | Select exact residues, chains or atoms |
| molecular_focus | Focus a target and display detailed residues and its environment |
| molecular_highlight | Highlight a target; persistent=true creates a named overlay |
| molecular_style | Set structure style or a colored residue layer |
| molecular_control | Execute an action with JSON args through the acknowledged viewer command channel |
| molecular_surface | Create global or local surface coloring, with matching APBS OpenDX or a labeled approximate preview |
| molecular_trajectory | Attach matching DCD/XTC coordinates before creating study layers and measurements |
| molecular_get_command | Read the final status/result of a queued command |

Read state to obtain actual structure IDs and author/label numbering. Pending/running means incomplete. Keep the relevant conversation visible. Loading or visual commands request the native Mol* Viewer tab and wait up to 12 seconds for a connected renderer. A different active conversation is not forcibly navigated. A connection timeout is reported as VIEWER_NOT_CONNECTED.

## Precise targets and measurements

Targets use structureId plus chainId/start/end/atomName, or a structured selection. For example, molecular_control accepts:

```json
{"action":"select","args":{"structureId":"1","chainId":"A","start":19,"atomName":"O"}}
```

A distance uses actual atom endpoints:

```json
{"action":"createMeasurement","args":{"type":"distance","points":[{"structureId":"1","chainId":"A","start":19,"atomName":"N"},{"structureId":"1","chainId":"A","start":19,"atomName":"CA"}]}}
```

getInteractions returns chemically/geometrically inferred contact types, atom endpoints, distances and inference methods. It does not calculate binding energy.

Common actions include getStructureInfo/getResidues/getSequence/neighbors, select/focus/highlight/clearSelection, setDisplay/setVisibility, createTag/removeTag/createLayer/removeLayer, createMeasurement/styleMeasurement/removeMeasurement/clearMeasurements, camera/trajectory/align, previewImage/exportImage/exportStructure, hideSelection/undo/removeStructure. Chain metadata is compact; request sequences explicitly with getSequence.

setDisplay accepts structureId or layerId, representation(s), color, opacity and colorValue. setVisibility kind is structure, layer, tag or measurement. Camera mode=view accepts target, direction, up (three-vectors) and radius in Angstroms, without adding focus contacts. clearSelection removes automatic focus detail/contact overlays; persistent study layers remain.

## Surfaces

molecular_surface supports molecular, gaussian, van-der-waals and solvent-accessible surfaces. color=electrostatic uses red/white/blue for negative/zero/positive potential. dxPath samples a coordinate-matched, uncompressed, regular axis-aligned APBS OpenDX map, default range +/-5 kT/e. Without a DX map the tool labels a screened protein-side-chain approximation in reduced preview units. residues and radius color a local region of the full surface while leaving the surrounding surface neutral.

molecular_highlight with persistent=true, residues, colorValue and name creates a persistent ball-and-stick layer. Manage its returned ID using removeLayer or setVisibility.

The older electrostatic representation color theme computes approximate screened potential at atom centers, then colors the nearest surface vertices. It uses available PDBQT charges or a built-in residue charge model. It is distinct from the molecular_surface vertex-sampled field and is not a Poisson-Boltzmann solution. Neither method calculates binding energy. Solvent-accessible is implemented as a probe-expanded Gaussian surface; molecular-surface remains the solvent-excluded representation.

## MD and export

Attach coordinates with molecular_trajectory using structureId, path and atomOrderConfirmed=true. The topology must have identical atoms in identical order. Attachment replaces its model and clears that structure's old layers, tags and measurements; apply study styles afterwards. Import limits and preparation guidance are in [MD_TRAJECTORIES.md](docs/MD_TRAJECTORIES.md).

Control playback with trajectory mode=frame/step/play/pause; frame indices are zero-based. Keep surfaces off for lightweight playback. For a single-contact research view, use two colored complete residues, a neutral gray translucent neighborhood and one measured distance, with selection cleared and camera mode=view. Measurements and overlays track actual frame coordinates.

Export paths are relative to the workspace. For long video/image operations use wait=false and poll molecular_get_command; inspect the acknowledged output path. Video startFrame/endFrame are zero-based and inclusive. Export evidence can contain local paths: publish a portable scientific manifest instead of raw private sidecars.

Add to Chat inserts a visible native composer reference without auto-send or discarding the draft. For playing MD it pauses and awaits acknowledgement before capturing the frame; the reference shows one-based frame/count and retains its measured geometry. Later playback does not mutate the captured reference. The @ picker captures its acknowledged candidate state.
