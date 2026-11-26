# Reproduce the molecular examples in DSH

These prompts target the new release candidate. Keep the current DSH conversation visible; Mol* Viewer should open automatically. Inspect each tool result and poll pending commands before reporting success. Export figures directly from the viewer so screenshots contain no unrelated desktop content.

## PD-L1 / atezolizumab

Paste into DSH after preparing the example files, replacing EXAMPLE_DATA with their directory:

> Use the native Mol* Viewer tools to render antibody recognition of PD-L1 from PDB 5X8L. Read EXAMPLE_DATA/analysis.json and use the prepared antigen, heavy and light component CIF files. Keep their deposited coordinates: antigen author chain A, antibody heavy F, light K. Make an overview on white: PD-L1 steel blue, heavy plum, light muted gold. Highlight the interface using the actual heavy-atom contacts within 4.5 Angstrom in the manifest, with distinct antigen and paratope sticks.
>
> Make a second view with the full antigen molecular surface colored by electrostatic potential and the antibody as ribbons. Keep the surface soft and pale, using a wider symmetric scale and moderate opacity. Make important interacting residues fully visible as ball-and-stick, rather than making the entire structure opaque. If there is no coordinate-matched APBS DX map, use the labeled approximate protein side-chain preview and state that it is not an APBS calculation. Do not put a surface on the antibody.
>
> Make a close view of the recorded opposite-charge contacts: PD-L1 A Arg125 NE to heavy F Asp31 OD1, and A Arg113 NE to F Asp31 OD1. Show the real side chains, blue for the positive arginines and red for the negative aspartate, with thin distance annotations. The expected distances are approximately 2.976 and 3.276 Angstrom. Describe them as geometric salt-bridge candidates; do not infer binding energy from their distances or use uncomputed hydrogen bonds as evidence.
>
> Adjust the camera to keep the overview unclipped. Save the overview, full-antigen surface view, and contact close-up as PNG plus their evidence JSON. Save a portable rendering recipe with structure IDs replaced by role names and record camera target/direction/up/radius. Summarize the completed files and the coloring method.

## Another antigen–antibody complex

> Use Mol* Viewer to render recognition in the PDB or local structure I specify. First identify the antigen and antibody heavy/light chains from the deposited entity annotations and sequences. Tell me which biological complex you chose if several copies exist. Preserve native numbering and coordinates. Compute actual interchain heavy-atom contacts within 4.5 Angstrom; do not copy residue numbers from 5X8L.
>
> Produce three consistent white-background figures: an unclipped recognition overview with distinct antigen/heavy/light colors and interface sticks; a soft full-antigen electrostatic surface with antibody ribbons and highlighted contacting antibody residues; and a clear side-chain close-up of verified opposite-charge proximity candidates with exact atom distances. Use global antigen coloring, moderate opacity, and a wider symmetric color scale for soft red/white/blue. Do not surface the antibody or small-molecule ligands. Use a matching supplied APBS DX map when available, otherwise identify the actual approximate method.
>
> If no supported opposite-charge contact exists, report that and show a real contact pattern supported by the coordinates instead. Keep interpretations separate from measured geometry. Export viewer-only PNG files, evidence JSON, and a role-based reproducible recipe. Confirm successful tool acknowledgements before reporting completion.

## Ribosome / 3JAH

> Use Mol* Viewer and EXAMPLE_DATA/analysis.json to render the complete 3JAH termination complex. Load fullContext and the separately extracted eRF1, P-tRNA, E-tRNA and mRNA files in their original coordinate frame. The combined files should cover all 226454 deposited atoms without duplication. Do not remove the other ribosomal proteins, RNA, ABCE1 or nascent chain to make the picture simpler.
>
> Use a gray cartoon at opacity 0.10 for the full background, muted coral for eRF1 author chain ii at the A site, gold for P-site Val-tRNA author chain 2, teal for E-site Lys-tRNA author chain 3, and purple for mRNA author chain hh. This deposited eRF1 is an inactive AAQ mutant; do not call it wild type or invent an A-site tRNA.
>
> Export a complete ribosome overview plus an A/P/E close-up retaining translucent global context. Read examples/3jah-camera.json from the plugin repository and use its camera mode=view parameters. The approved angle has E-tRNA on the left, P-tRNA in the middle and A/eRF1 on the right, with mRNA below. Keep this orientation in both global and close views. Keep the background light enough that it does not obscure the colored molecules. Use the official Mol* clipping parameters and keep overview clipping disabled. Export viewer-only PNGs and evidence JSON, plus a portable recipe and legend.

## Local MD playback

> Load the topology and matching DCD or XTC paths I specify. They were exported together with identical atoms in identical order. Use molecular_trajectory to attach them. Start with low-quality backbone/cartoon, no surfaces, and play at 12 viewing frames per second. Let me pause, step, and scrub. Confirm that frame coordinates actually change and pause holds the chosen frame. Report atom/frame counts and model-update timing separately from GPU FPS.
>
> If the run exceeds the import bounds, prepare a separate solvent-free, strided subset with a matching topology using existing VMD or MD tooling; preserve the originals. Do not run a new simulation or invent motion. Explain the selection and source frame indices. Treat my local research trajectories as private unless I explicitly authorize publication.

## One-contact MD research view

> Focus the MD display on one scientifically relevant residue pair that I specify, using exact atom identities and their native chain/residue numbering. Show the two complete residues in contrasting colors and track a single dashed atom-to-atom distance while the trajectory plays. Keep their nearby molecular environment visible in neutral gray with moderate transparency and thin geometry. Use a frozen neighborhood selection across frames so atoms do not pop in and out. Frame with camera mode=view and keep focus/selection cleared so the general focus interaction network does not add extra contacts. Include the complete highlighted residues, not only CA/P trace atoms. Start at 12 viewing frames per second, keep surfaces off, and avoid adding a network of competing contact lines. Confirm that both the viewport label and Agent-readable distance follow frame changes, then pause on a requested frame and export it. Treat an atom distance as a geometric measurement; infer a hydrogen bond only after checking appropriate donor/acceptor identities and direction. Preserve local trajectory privacy.