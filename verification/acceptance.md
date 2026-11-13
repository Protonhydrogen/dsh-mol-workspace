# Mol* Viewer v0.3.1 acceptance — 2026-10-16

DSH Desktop was restarted and the installed bundle was compared against the final build. No DSH Core files were modified. Codex integration is deferred by user request.

## Latest native DSH checks

| Check | Result and evidence |
|---|---|
| Closed sidebar opens for Agent load | PASS, new independent conversation, v0.3.0; `dsh-auto-open-v030.png` |
| Closed sidebar opens for existing-structure focus | PASS after v0.3.1 restart; focus structure 1 SER3 without loading again, succeeded with 6 atoms; subsequent TOP7 load/focus and connected renderer confirmed; `dsh-auto-open-v031.png` |
| Focus geometry and neighboring residues | PASS, TOP7 A19 bonded details, predicted interaction geometry and less transparent surroundings; `dsh-focus-v031.png` |
| Blank canvas returns Overview | PASS, one empty canvas click removed local detail and restored the complete visible protein; `dsh-overview-v031.png` |
| Official clipping controls | PASS, native View panel shows clipping 0, far plane, minimum near 1, fog 15; `dsh-clipping-v031.png`. Actual changed Canvas3D values are covered by the render test. |
| English sidebar and controls | PASS, Mol* Viewer title, Style, Capture, Graphics, sequence, menu; `dsh-style-v031.png`, `dsh-menu-v031.png` |
| Style template applies | PASS, X-Ray produced simultaneous cartoon and molecular surface; all seven templates also checked against actual render objects |
| Image/Video controls | PASS; `dsh-image-v031.png`, `dsh-video-v031.png` |
| Sequence selection and native composer reference | PASS, TYR A19 selected and visible citation inserted without sending; `dsh-composer-v031.png` |

Earlier native regression evidence remains: exact atom O A19 (`dsh-exact-atom.png`), eight-residue sequence drag (`dsh-sequence-composer-reference.png`), DSH theme following (`dsh-dark-theme.png`), Agent N–CA distance 1.475828832083274 Å (`dsh-agent-distance.png`). The dark theme was restored to the user's light setting after that check.

## Automated and real-render verification

- Final 39 source JavaScript files and installed client bundle pass `node --check`.
- 53 source checks pass, 0 fail (reproduce with `npm test`). This includes the actual installed DSH defineTool compiler and output validator, isolated registration failure, renderer lease/wake/cancellation, exact atomic identity, composer insertion, focus interactions, template reset and official clipping.
- Ten integration checks and five extended render checks pass (reproduce with `npm run test:live`). Measurements use actual Mol* transforms; PNG/JPEG/CIF containers and dimensions, trajectory frame coordinates, fitting and WebM are inspected.
- Latest targeted actual Canvas3D checks: five leaf cases pass, plus their parent (6 reported passes), 0 fail, 1 conditional MP4 case skipped. These verify simultaneous representations, alpha 0.85 neighbor geometry and interaction render objects, actual clipping values, Overview cleanup and all seven templates with stale zero-size reset.
- Additional final recording check produced a real 56,420-byte WebM with EBML header and 1280×720 dimensions.

## Implementation notes and limits

The root plugin listens for per-session wake requests even while the viewer tab is unmounted. Visual operations wait for a connected renderer and its actual command acknowledgement. Another active conversation is never forcibly navigated. A genuine failure/timeout remains visible.

Mol* `cameraClipping` radius 0 means the whole scene; the control maps to `sceneRadius * (100 - value) / 100`. Pending focus resets are committed before applying clipping, then camera transitions are finished. View also exposes far clipping, minimum near plane and official fog intensity.

Focus interactions are Mol* chemical/geometric predictions, not binding energies or experimental findings. Neighbors are whole residues within 5 Å, opacity 0.85, while the exact selected atom identity is retained.

The design follows the supplied Levinthal layout and feature categories. It does not claim identical proprietary rendering or every upstream Harness feature. MP4 is shown only after a real encoding probe; on the current DSH browser the encoder produced no usable frames, so it is explicitly unavailable. WebM works. The plugin supplies native DSH Agent tools; Codex adaptation has not been started.

Schema rules and exact installed validator locations are in `schema-rules.md`.

## 2026-11-04 — palette unification and overview pull-back motion

Reported: the focused residue read as green against a periwinkle ribbon, and returning to overview from a focused residue cut instead of moving.

Cause: three colour sources were in play. The ribbon used the plugin's chain palette; ball-and-stick carbons used Mol* `element-symbol`, whose `carbonColor` defaults to `chain-id`, i.e. Mol*'s own palette (green for chain A); the selection marker used Mol* defaults `RendererParams.selectColor` and `MarkingParams.selectEdgeColor` (both lime). Measured on a 702×906 harness render of 1QYS focused at A:21: 2887 lime pixels before, 0 after.

Change: `src/viewer/palette.js` is now the single source — chain palette `#9aa6f2 #64c9c0 #e2bd7d #9ed3b4 #d9a6cb #8fb8e8`, focused-detail carbon `#f1c27d`, 5 Å context carbon `#8b93a8`, neutral `element-symbol` carbon `#a9b3c8`, plus `MARKER_PROPS` / `MARKING_PROPS` for the selection fill and rim. `representationColorParams`, `focus.js` and the canvas setup all read it.

Motion: `overview()` no longer sets the camera with duration 0 and no longer deletes the local detail first. The camera pulls back over 640 ms, the detail stays on screen during the move and is removed when the transition ends; `focus()` now uses 420 ms. A frame captured 159 ms into the gesture still shows the gold residue, and the frame after the move does not.

Verified on the local harness (Chrome + swiftshader, 1QYS): before/after renders in `Default\molecular-palette-before-after.png`, transition frames in `Codex_install\scratch\mw-run\frame-*.png`. The DSH window itself needs a restart to pick up the new `client.js`.
