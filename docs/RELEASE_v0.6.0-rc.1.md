# Mol* Viewer 0.6.0-rc.1

A release candidate for bounded MD playback and reproducible research views.

- New separately registered molecular_trajectory tool attaches matching DCD/XTC coordinates to PDB/mmCIF topology.
- Playback commits one frame at a time and skips overdue display frames. Pause drains active work; source hashes protect saved-state restoration.
- Stable residue identities, moving selection layers, and tracked measurement endpoints follow MD frames. Distance values used by the Agent and image evidence are refreshed with the coordinates.
- Keep one key contact colored while retaining its local environment in translucent gray. Surfaces remain off during lightweight playback.
- Reproducible PD-L1/atezolizumab (5X8L) interface and soft full-antigen electrostatic preview.
- Complete 3JAH context, highlighting A-site eRF1(AAQ), P-site Val-tRNA and E-site Lys-tRNA.
- Scientific preparation scripts, DSH prompts, viewer-only PNG examples and portable source manifests.

The import bounds are 64 MiB, 100000 atoms, 1000 frames and 5000000 atom-frames. Larger trajectories should be stripped/strided with matching topology using VMD or existing MD tooling. This release does not run MD simulations.

Validation: complete local Node regression suite, native Mol* state-tree tests, and real-coordinate browser/tool-bridge playback and export checks. Native DSH installation requires a full restart; source-level and browser validation do not establish every DSH deployment configuration.

Antibody and ribosome figures use official PDB coordinates. Selected viewer-only MD images and video are shared with owner approval; raw research trajectories and export evidence containing machine paths remain excluded. Electrostatic examples use a labeled screened side-chain approximation rather than an APBS calculation; matching APBS OpenDX input remains supported.
