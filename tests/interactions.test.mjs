import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CIF} from 'molstar/lib/mol-io/reader/cif';
import {trajectoryFromMmCIF} from 'molstar/lib/mol-model-formats/structure/mmcif';
import {Structure} from 'molstar/lib/mol-model/structure';
import {MolEngine} from '../src/viewer/engine.js';
import {extractResidues} from '../src/viewer/selection.js';
const record={data:readFileSync('fixtures/1qys.cif','utf8')};
test('TOP7 potential contacts are computed from Molstar geometry with exact atomic endpoints',async()=>{assert.ok(record);const parsed=await CIF.parseText(record.data).run();assert.equal(parsed.isError,false);const tr=await trajectoryFromMmCIF(parsed.result.blocks[0]).run();const structure=Structure.ofModel(tr.representative),e=new MolEngine();e.structures.set('top7',structure);e.residues.set('top7',extractResidues(structure));const result=await e.execute({action:'getInteractions',args:{structureId:'top7',chainId:'A'}},{activeStructureId:'top7'});assert.ok(result.value.contactCount>0);assert.ok(result.value.contacts.some(c=>c.type==='Hydrogen Bond'));for(const c of result.value.contacts){assert.ok(c.distance>0&&Number.isFinite(c.distance));assert.ok(c.a.atoms.every(a=>a.authAsymId==='A'&&a.authAtomId));}console.log('TOP7 contacts:',result.value.contactCount,'types:',[...new Set(result.value.contacts.map(c=>c.type))].join(', '));});

