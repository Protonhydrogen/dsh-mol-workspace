# Reproducible scientific examples

Run with Node 20+ and an existing Mol* installation:

```sh
node examples/prepare-examples.mjs --out /external/example-data --molstar-root /external/molstar-toolchain
```

The toolchain directory contains `node_modules/molstar`; `MOLSTAR_ROOT` can replace the second argument. `DSH_MOL_EXAMPLE_DIR` can replace `--out`. The script creates no environment and installs no packages. Downloads, extracted coordinates and `analysis.json` are saved only in the specified external directory. Source coordinates are fetched from the official RCSB download service; completed source downloads are reused. Generated manifest file entries are portable basenames relative to the output directory.

## PD-L1 / atezolizumab (5X8L)

The example selects the first deposited biological complex: PD-L1 auth A / label A, atezolizumab heavy auth F / label C, light auth K / label B. This is a Fab complex rather than a complete IgG. Its experimental resolution is 3.10 Å. See the [RCSB entry](https://www.rcsb.org/structure/5X8L) and [primary publication](https://doi.org/10.1038/s41598-017-06002-8).

For an interface view, show the antigen molecular surface and antibody ribbons; show the antigen-contacting antibody residues as sticks. The heavy and light chains have distinct colors. The interface criterion is any interchain heavy-atom distance of at most 4.5 Å. Exact author residue IDs appear in `analysis.json`, together with antigen, antibody and interface centers.

The coordinates contain two opposite-charge proximity candidates: PD-L1 Arg125 NE–heavy Asp31 OD1 (2.976 Å), and PD-L1 Arg113 NE–heavy Asp31 OD1 (3.276 Å). Both use native author numbering. Displaying Asp31 alongside the actual antigen arginines gives a specific, inspectable charge pairing. Hydrogen positions, side-chain protonation and interaction energies were not calculated. Label a screened-Coulomb or residue-charge surface according to that implementation; call it APBS only if a Poisson–Boltzmann calculation actually produced it.

## Terminating ribosome (3JAH)

This is the mammalian UAG termination complex, with a 3.45 Å cryo-EM model. The [RCSB entry](https://www.rcsb.org/structure/3JAH) establishes polymer identities; the [primary paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC4591471/), Fig. 1 and Extended Data Fig. 1, establishes site assignments and the substrate stalled after Sec61β Val68.

| Role | Molecule | Author chain | Label chain |
| --- | --- | --- | --- |
| E site | tRNA(Lys) | 3 | UA |
| P site | tRNA(Val) | 2 | TA |
| A site | eRF1(AAQ) | ii | HC |
| GTPase center | ABCE1 | jj | IC |
| Message | UAG-containing mRNA | hh | GC |
| Nascent peptide | Sec61β fragment | 1 | SA |

The P-site assignment follows the programmed terminal valine and the primary paper's identification of the peptidyl tRNA. The native coordinates provide an additional geometric check: the Val tRNA A76 O3′ is 2.687 Å from the nascent Val68 carbonyl C, whereas Lys tRNA A75 O3′ is 48.248 Å from that atom. These are coordinate distances, not assigned covalent bond lengths.

eRF1 is the inactive AAQ mutant used to trap the complex, with two substitutions in the catalytic GGQ motif. It occupies the A site; the entry does not contain an A-site tRNA.

Use the full component files for colored E/P tRNAs and eRF1. For the global transparent view, load `3JAH-context-all-atoms.cif` through the `ribosome.files.fullContext` key. It contains all 219,708 remaining atoms (219,435 ATOM plus 273 HETATM), 290 label chains and 84 author chains. It excludes only the separately rendered eRF1, P/E tRNAs and mRNA (6,746 atoms), so the combined structures account for every one of the original 226,454 atoms. ABCE1, nascent peptide, RACK1, ADP, magnesium, zinc and iron-sulfur clusters remain in this context. Use transparent cartoons for its polymers; any ligand representation can use the retained native ligand coordinates. No chains or coordinates are removed from the combined scene.

The optional reduced context files provide faster alternatives: `3JAH-ribosome-backbone.cif` retains protein and RNA backbone atoms; `3JAH-ribosome-trace.cif` is a smaller CA/P-only alternative. Both are explicitly reduced context. Full native ribosome coordinates are also exported. All components retain the deposited coordinate frame and native author/label identities, so no alignment is needed and no sites are placed by hand.

`analysis.json` includes component centers and the E-to-A center vector for framing. Each source's SHA-256 is recorded for reproducibility. `data-manifest.json` documents sources, chain identities and selection criteria without machine-specific paths.

## Render through the real tool bridge

The deterministic figure script drives the same registered Agent tools used by DSH. For automated browser verification, build and start the loopback test harness (see tests/browser-server.mjs), open its page, then run:

```sh
node examples/render-reviewed.mjs /external/example-data antibody
node examples/render-reviewed.mjs /external/example-data ribosome
```

These commands reset the isolated harness scene. They use the official coordinates, recorded chain identities and computed contact geometry. The loopback endpoint defaults to port 43140; DSH_MOL_API can override it. The scripts do not connect to a different DSH conversation. For direct DSH use, paste the prompts in DSH_PROMPTS.md.

The ribosome camera is rotated 180 degrees in the image plane so the colored factors appear A/P/E from left to right. Full context remains loaded; opacity and framing differ between the global overview and close-up.

For local MD benchmarking, provide your own matching files:

```sh
node examples/render-md-preview.mjs /external/output /external/topology.pdb /external/trajectory.dcd
```

The benchmark checks native frame movement and pause, records a short WebM and reports model-update timing rather than claiming GPU FPS. Personal research data and their raw evidence stay outside the public repository. Viewer PNG exports contain no desktop UI. Raw export evidence JSON may contain local source paths; publish only a purpose-built portable scientific manifest rather than copying those sidecars.