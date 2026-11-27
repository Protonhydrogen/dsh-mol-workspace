# MD trajectory playback

Load a PDB or mmCIF topology, select it in the sidebar, then attach its DCD or XTC coordinate file. Topology and trajectory must contain the same atoms in the same order. A matching atom count is necessary but does not prove the atom order; use files exported together from the same simulation system.

The viewer uses Mol* native coordinate parsers and model trajectories. Coordinates remain in their original frames; import does not run a simulation, interpolate frames, align the trajectory, remove periodic jumps, or infer missing atoms. XTC coordinates are converted from nanometers to Angstroms by Mol*. Frame numbers are zero-based internally and can be shown as one-based labels in the sidebar. Playback FPS controls viewing speed and is independent of the simulation time step.

## Simulation, VMD MCP, and display

These are separate stages with separate responsibilities:

| Stage | Responsible component | Output |
|---|---|---|
| Physical simulation | Dedicated MD software, for example GROMACS, AMBER, or NAMD | Coordinates generated using the simulation's force field, integrator, and configured physical conditions |
| Inspection and preparation | VMD exposed to the Agent through a separately configured MCP server, or a documented external export script | Checked atom identities/order, matching viewing topology and trajectory, optional periodic-boundary correction and uniform frame sampling |
| Interactive display | DSH Agent tools and this Mol* viewer | Loading, representations, colors, measurements, camera control, and playback of existing coordinates |

Our research environment has VMD connected through MCP. The MCP bridge lets an Agent control VMD tools and Tcl operations without driving its GUI. It is an external integration configured in the Agent host; installing this plugin does not install VMD, enable a VMD MCP server, or make one available automatically in DSH. An Agent should discover the configured tools and verify the connection before reporting that VMD was used.

The public group_01 workflow GIF uses an externally computed molecular dynamics trajectory. A separate Python export script selected a fixed 7 Å initial neighborhood, retained complete heavy-atom residues and the donor hydrogens, and exported 150 uniformly sampled coordinate frames spanning 1–150 ps. It did not change coordinates or filter frames by hydrogen-bond formation. DSH then loaded the prepared topology and DCD, styled the key residues and gray environment, measured NZ–O4 distance, and started playback. This particular recording contains no VMD invocation; earlier VMD MCP validation belongs to the broader research workflow, not to these displayed steps.

The GIF is a continuous 10× recording of the visible Agent execution, rather than a simulation-time calibration. The original run has 98.40% NZ–O4 close-contact occupancy and 32.47% directional hydrogen-bond occupancy across all source frames (distance ≤3.5 Å and best D–H–A angle ≥135°). A displayed distance line alone does not establish a hydrogen bond.

## Bounds and preparation

The sidebar accepts DCD/XTC files up to 64 MiB, 100,000 atoms, 1,000 frames, and 5,000,000 atom-frames. All limits apply together. The last limit bounds decoded xyz coordinate storage to about 60 MB; total process memory also includes the input file, models, and rendering data. Headers and record boundaries are checked before native coordinate allocation. Every decoded frame must match the topology count and contain finite coordinates.

For larger runs, prepare a viewing subset with VMD or the simulation package: select protein/nucleic atoms (or a backbone trace), remove solvent if it is not needed, and save every tenth or twentieth frame. Export the topology from that exact atom selection and export coordinates in the same order. Keep the original trajectory for quantitative analysis. If periodic boundaries split molecules, unwrap/reimage before export. Use a small subset to confirm identities and geometry first.

DCD support is scoped to complete, little-endian CORD files with explicit frame counts and 32-bit xyz coordinate records. Fixed-atom and big-endian DCD variants require conversion. XTC uses the standard 1995 frame format, including compressed coordinates. Unsupported topology formats, remote MD downloads, streaming arbitrary-size files, and running simulations are outside this import path.

## Playback behavior

Attach coordinates before adding study overlays. Attachment replaces the model and clears old structure-specific layers, tags, measurements, hidden selections and scene undo records. It starts a lightweight cartoon and avoids biological assembly expansion. Add the colored contact residues, gray neighborhood and distance measurement after attachment. Use cartoon, backbone, line, or point representations for responsive playback. Surfaces and expensive per-frame overlays should remain off during playback.

The animation controller commits at most one frame at a time. When rendering is slower than the requested playback speed, it skips overdue display frames and proceeds to the current wall-clock frame. Pause waits for an active commit to finish. This keeps interaction work from accumulating in a frame queue. The camera stays under the user's control.

The controller exposes completed frame commits, skipped display frames, elapsed time, update rate, and mean commit duration through `playback.stats`. These are model-update measurements, not GPU display FPS. Report actual observed measurements when comparing machines or representations.

## Agent prompt example

> Load the PDB/mmCIF topology I specify and attach its matching DCD/XTC trajectory in the native molecular sidebar. Both files were exported from the same atoms in the same order. Start with a light backbone/cartoon view, hide solvent, and play at 12 viewing frames per second. Let me pause, scrub, and step through frames. Report the imported atom and frame counts, and distinguish any viewing subset from the full simulation. If the file exceeds the sidebar limits, prepare a separate strided subset and matching topology while preserving the originals. Do not start a simulation.

## Developer integration

`attachMdTrajectory(engine, { structureId, data: Uint8Array, format, title, atomOrderConfirmed: true })` must run through the engine's display queue after topology loading. It validates before swapping the structure. It retains the original topology model as a dependency, replaces prior MD trees, and returns trajectory metadata. The caller must persist an authorized source descriptor for reload and clear stale selection, layer, focus, and measurement state for the replaced structure. Apply the light display settings to the workspace record as well, so a later state synchronization does not recreate an old surface.

`createFramePlayback({ setFrame, onFrame, onError })` returns `play`, `pause`, `dispose`, `playing`, `pending`, and `stats`. Pause the controller before seeking, replacing a trajectory, or exporting a frame range. Use `playing` when determining whether a locally owned viewer should follow persisted frame state. Dispose it together with the engine.

Native parser and state-tree regression checks are in `tests/md-trajectory.test.mjs`. Their generated protocol fixtures are explicitly synthetic; they validate parsing and scheduling, not physical dynamics. A real simulation preview must preserve provenance and label any atom selection or frame stride.

## Captured references

Add to Chat pauses a playing target trajectory and waits for the viewer's pause acknowledgement before inserting the reference. The structured payload retains the acknowledged zero-based frame, frame count and measured geometry; the visible label uses one-based frame/count numbering. Later playback does not change that captured reference. The @ picker captures the acknowledged state when its candidate is generated. Sequences remain available through getSequence; ordinary state metadata contains compact chain summaries.