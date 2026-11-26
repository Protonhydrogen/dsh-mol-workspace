# Native DSH acceptance for 0.6.0-rc.1

Environment: DeepSeek Harness Desktop 0.2.2-rc.5. The local package retains its existing package name and Cordis instance ID; public and local JavaScript share the same implementation after package-ID substitution.

Observed in the real desktop application:

- An Agent loaded a structure from a closed sidebar and Mol* Viewer opened automatically.
- Matching real DCD coordinates attached: 176 atoms, 60 frames.
- Playback and pause completed. The Agent checked distances at two sampled frames against independent coordinate calculations, and the native Measurements panel independently showed the same current-frame value.
- Exact camera mode=view parameters produced the requested target/up/radius. The acceptance run supplied this pose explicitly.
- A mouse click on a rendered atom in Atom mode showed its exact atom name, chain/residue, model, element and Single atom granularity.
- The right-click menu exposed English Layer, Color theme, Focus selection, Representation, Tag, Send selection to chat and Selection mode entries.
- Dragging the sequence strip selected three residues. Both the atom reference and the three-residue reference appeared visibly in the native composer without auto-send.
- Clicking empty canvas cleared the focused target and returned the viewer to Overview.
- Adding a playing MD structure to chat first paused the trajectory, then inserted a visible reference with the captured one-based frame and total frame count. The displayed frame and composer label agreed.

The first Agent pass guessed unsupported component visibility and camera arguments. This led to explicit mode=view documentation, clear parameter errors, and a statement that MD coordinates should be attached before study layers and measurements are created.

A subsequent native Agent run independently loaded the three prepared 5X8L components, created the antigen electrostatic surface and two exact atom measurements (2.975590 and 3.275634 Angstrom), and exported a white-background PNG. It then loaded all five 3JAH components, retained all 226454 atoms with gray context opacity 0.10 and distinct eRF1/P-tRNA/E-tRNA/mRNA colors, and exported a second PNG. These were functional reproduction checks with explicit rendering instructions; the reviewed gallery uses the deterministic, explicitly framed recipe.

Public antibody and ribosome figures were rendered through the registered tool bridge from official PDB coordinates. Private research input coordinates, raw desktop screenshots, conversation history and raw evidence paths are excluded from the repository. Native acceptance reports describe tool/UI behavior, not biological conclusions.

The final public 3JAH global and site images were exported directly from the native DSH viewer at the user-approved orientation (E/P/A left to right), retaining context opacity 0.10. Portable camera parameters are in examples/3jah-camera.json. Raw export sidecars remain local.
