/**
 * Prepare reproducible molecular examples from official RCSB coordinates.
 * No scientific data or dependencies are written into the repository.
 *
 * node examples/prepare-examples.mjs --out <external-data-dir> --molstar-root <toolchain-dir>
 * MOLSTAR_ROOT may replace --molstar-root. The toolchain must already contain
 * node_modules/molstar (the same dependency used to build the viewer).
 */
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const argv = process.argv.slice(2);
function option(name) { const i = argv.indexOf(name); return i < 0 ? undefined : argv[i + 1]; }
if (argv.includes('--help')) {
  console.log('Usage: node examples/prepare-examples.mjs --out <external-data-dir> [--molstar-root <existing-toolchain>]');
  process.exit(0);
}
const outArg = option('--out') || process.env.DSH_MOL_EXAMPLE_DIR;
if (!outArg) throw new Error('Set --out or DSH_MOL_EXAMPLE_DIR to an external data directory.');
const out = resolve(outArg);
const depRoot = option('--molstar-root') || process.env.MOLSTAR_ROOT;
const require = createRequire(depRoot ? join(resolve(depRoot), 'package.json') : import.meta.url);
const { CIF } = require('molstar/lib/commonjs/mol-io/reader/cif.js');
await mkdir(out, { recursive: true });
const manifest = JSON.parse(await readFile(new URL('./data-manifest.json', import.meta.url), 'utf8'));

async function source(id) {
  const file = join(out, `${id}.cif`);
  let data;
  try { data = await readFile(file); if (data.length < 1000) data = undefined; } catch { /* first run */ }
  if (!data) {
    const response = await fetch(`https://files.rcsb.org/download/${id}.cif.gz`, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`${id}: RCSB returned HTTP ${response.status}`);
    data = gunzipSync(Buffer.from(await response.arrayBuffer()));
    // Cache only a completed download, so an interrupted fetch is never reused.
    await writeFile(file, data);
  }
  const parsed = await CIF.parseText(data.toString('utf8')).run();
  if (parsed.isError) throw new Error(`${id}: ${parsed.message}`);
  const frame = parsed.result.blocks[0];
  const category = frame.categories.atom_site;
  if (!category) throw new Error(`${id}: missing atom_site category`);
  const values = (field, i) => { const k = field.valueKind(i); return k === 1 ? '.' : k === 2 ? '?' : field.str(i); };
  const atoms = Array.from({ length: category.rowCount }, (_, i) => Object.fromEntries(category.fieldNames.map(k => [k, values(category.getField(k), i)])));
  const entity = frame.categories.entity;
  const entityNames = Object.fromEntries(Array.from({ length: entity.rowCount }, (_, i) => [entity.getField('id').str(i), entity.getField('pdbx_description').str(i)]));
  return { id, frame, atoms, entityNames, sha256: createHash('sha256').update(data).digest('hex') };
}
const xyz = a => ['Cartn_x', 'Cartn_y', 'Cartn_z'].map(k => Number(a[k]));
const center = aa => [0, 1, 2].map(i => Number((aa.reduce((s, a) => s + xyz(a)[i], 0) / aa.length).toFixed(4)));
const subtract = (a, b) => a.map((v, i) => Number((v - b[i]).toFixed(4)));
const residueKey = a => `${a.auth_asym_id}:${a.auth_seq_id}:${a.pdbx_PDB_ins_code}`;
const residue = a => ({ chain: a.auth_asym_id, residue: Number(a.auth_seq_id), insCode: ['.', '?'].includes(a.pdbx_PDB_ins_code) ? '' : a.pdbx_PDB_ins_code, resName: a.auth_comp_id });
const atomIdentity = a => ({ ...residue(a), atom: a.auth_atom_id, xyz: xyz(a) });
const uniqueResidues = aa => [...new Map(aa.map(a => [residueKey(a), residue(a)])).values()];
function quoted(v) {
  v = String(v);
  if (!v) return "''";
  if (/[\r\n]/.test(v)) return `\n;${v}\n;\n`;
  if (!/\s|['"]/.test(v) && !/^[#_$;\[\]]/.test(v)) return v;
  if (!v.includes("'")) return `'${v}'`;
  if (!v.includes('"')) return `"${v}"`;
  return `\n;${v}\n;\n`;
}
async function exportCif(s, filename, atoms) {
  if (!atoms.length) throw new Error(`${filename}: empty selection`);
  const keep = ['entity', 'entity_poly', 'entity_poly_seq', 'struct_asym', 'chem_comp'];
  let text = `data_${filename.replace(/[^a-z0-9]/gi, '_')}\n#\n`;
  for (const name of keep) {
    const cat = s.frame.categories[name];
    if (!cat) continue;
    text += `loop_\n${cat.fieldNames.map(k => `_${name}.${k}`).join('\n')}\n`;
    for (let i = 0; i < cat.rowCount; i++) text += cat.fieldNames.map(k => { const f = cat.getField(k), kind = f.valueKind(i); return kind === 1 ? '.' : kind === 2 ? '?' : quoted(f.str(i)); }).join(' ') + '\n';
    text += '#\n';
  }
  const fields = s.frame.categories.atom_site.fieldNames;
  text += `loop_\n${fields.map(k => `_atom_site.${k}`).join('\n')}\n`;
  text += atoms.map(a => fields.map(k => quoted(a[k])).join(' ')).join('\n') + '\n#\n';
  await writeFile(join(out, filename), text);
  return filename;
}
function closestResiduePairs(left, right, cutoff) {
  const best = new Map();
  for (const a of left) for (const b of right) {
    const p = xyz(a), q = xyz(b), d2 = p.reduce((s, v, i) => s + (v - q[i]) ** 2, 0);
    if (d2 > cutoff ** 2) continue;
    const key = `${residueKey(a)}|${residueKey(b)}`, distanceAngstrom = Number(Math.sqrt(d2).toFixed(4));
    if (!best.has(key) || best.get(key).distanceAngstrom > distanceAngstrom) best.set(key, { antigen: atomIdentity(a), antibody: atomIdentity(b), distanceAngstrom });
  }
  return [...best.values()].sort((a, b) => a.distanceAngstrom - b.distanceAngstrom);
}
function assertChain(s, label, auth, description) {
  const aa = s.atoms.filter(a => a.label_asym_id === label && a.pdbx_PDB_model_num === '1');
  if (!aa.length || aa.some(a => a.auth_asym_id !== auth) || s.entityNames[aa[0].label_entity_id] !== description) throw new Error(`${s.id}: chain ${label}/${auth} metadata did not match ${description}`);
  return aa;
}
const report = { schemaVersion: 1, sources: manifest.sources, method: 'Exact deposited coordinate subsets; no fitting, rotation, mutation, protonation or coordinate synthesis.' };
{
  const s = await source('5X8L');
  const antigen = assertChain(s, 'A', 'A', 'Programmed cell death 1 ligand 1');
  const heavy = assertChain(s, 'C', 'F', 'atezolizumab heavy chain');
  const light = assertChain(s, 'B', 'K', 'atezolizumab light chain');
  const antibody = [...heavy, ...light], nonH = aa => aa.filter(a => !['H', 'D'].includes(a.type_symbol));
  const contacts = closestResiduePairs(nonH(antigen), nonH(antibody), 4.5);
  const negatives = { ASP: ['OD1', 'OD2'], GLU: ['OE1', 'OE2'] }, positives = { ARG: ['NE', 'NH1', 'NH2'], LYS: ['NZ'] };
  const selectCharge = (aa, rules) => aa.filter(a => rules[a.auth_comp_id]?.includes(a.auth_atom_id));
  const chargedPairs = [...closestResiduePairs(selectCharge(antigen, negatives), selectCharge(antibody, positives), 4), ...closestResiduePairs(selectCharge(antigen, positives), selectCharge(antibody, negatives), 4)].sort((a, b) => a.distanceAngstrom - b.distanceAngstrom);
  const selected = (aa, side) => aa.filter(a => contacts.some(p => p[side].chain === a.auth_asym_id && p[side].residue === Number(a.auth_seq_id) && p[side].insCode === residue(a).insCode));
  const agInterface = selected(antigen, 'antigen'), abInterface = selected(antibody, 'antibody');
  const files = {};
  for (const [key, filename, aa] of [['antigen','5X8L-antigen.cif',antigen],['heavy','5X8L-heavy.cif',heavy],['light','5X8L-light.cif',light],['antibody','5X8L-antibody.cif',antibody],['complex','5X8L-complex.cif',[...antigen,...antibody]],['interface','5X8L-interface.cif',[...agInterface,...abInterface]]]) files[key] = await exportCif(s, filename, aa);
  report.antibody = { pdbId: s.id, sourceSha256: s.sha256, files, chains: { antigen: 'A', heavy: 'F', light: 'K' }, labelChains: { antigen: 'A', heavy: 'C', light: 'B' }, antigenInterface: uniqueResidues(agInterface), heavyInterface: uniqueResidues(abInterface.filter(a => a.auth_asym_id === 'F')), lightInterface: uniqueResidues(abInterface.filter(a => a.auth_asym_id === 'K')), contacts, chargedPairs, antigenCenter: center(antigen), antibodyCenter: center(antibody), interfaceCenter: center([...agInterface,...abInterface]), antigenToAntibody: subtract(center(antibody),center(antigen)), caution: manifest.antibody.caution };
}
{
  const s = await source('3JAH');
  const components = { pTrna: assertChain(s, 'TA', '2', 'tRNA(Val)'), eTrna: assertChain(s, 'UA', '3', 'tRNA(Lys)'), erf1: assertChain(s, 'HC', 'ii', 'eRF1'), abce1: assertChain(s, 'IC', 'jj', 'ABCE1'), mrna: assertChain(s, 'GC', 'hh', 'mRNA'), nascent: assertChain(s, 'SA', '1', 'peptide') };
  const excluded = new Set(['erf1', 'pTrna', 'eTrna', 'mrna'].flatMap(k => components[k].map(a => a.label_asym_id)));
  const full = s.atoms.filter(a => !excluded.has(a.label_asym_id));
  const backboneNames = new Set(['N','CA','C','O','P',"O5'","C5'","C4'","O4'","C3'","O3'","C2'","O2'","C1'"]);
  const files = {}, centers = {}, names = { pTrna: '3JAH-tRNA-P-Val.cif', eTrna: '3JAH-tRNA-E-Lys.cif', erf1: '3JAH-eRF1-A.cif', abce1: '3JAH-ABCE1.cif', mrna: '3JAH-mRNA.cif', nascent: '3JAH-nascent-chain.cif' };
  for (const [key, aa] of Object.entries(components)) { files[key] = await exportCif(s, names[key], aa); centers[key] = center(aa); }
  files.context = await exportCif(s, '3JAH-ribosome-backbone.cif', full.filter(a => backboneNames.has(a.label_atom_id)));
  files.trace = await exportCif(s, '3JAH-ribosome-trace.cif', full.filter(a => ['CA','P'].includes(a.label_atom_id)));
  files.fullContext = await exportCif(s, '3JAH-context-all-atoms.cif', full);
  files.activeSite = await exportCif(s, '3JAH-active-site-full.cif', Object.values(components).flat());
  centers.ribosome = center(full); centers.activeSite = center([...components.erf1,...components.pTrna,...components.eTrna]);
  report.ribosome = { pdbId: s.id, sourceSha256: s.sha256, files, centers, contextAtomCount: full.length, contextLabelChainCount: new Set(full.map(a => a.label_asym_id)).size, contextAuthChainCount: new Set(full.map(a => a.auth_asym_id)).size, contextAtomRecordCount: full.filter(a => a.group_PDB === 'ATOM').length, contextHetatmRecordCount: full.filter(a => a.group_PDB === 'HETATM').length, chains: { pTrna: '2', eTrna: '3', erf1: 'ii', abce1: 'jj', mrna: 'hh', nascent: '1' }, labelChains: { pTrna: 'TA', eTrna: 'UA', erf1: 'HC', abce1: 'IC', mrna: 'GC', nascent: 'SA' }, siteEvidence: manifest.ribosome.siteEvidence, contextNote: manifest.ribosome.contextNote, siteAxisEtoA: subtract(centers.erf1,centers.eTrna) };
}
await writeFile(join(out, 'analysis.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Prepared ${Object.keys(report.antibody.files).length + Object.keys(report.ribosome.files).length} native-coordinate files and analysis.json in ${out}`);
