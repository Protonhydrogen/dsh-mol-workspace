import {validateJsonSchemaValue} from '@deepseek-ai/dsh-tools';
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerMolecularTools} from '../src/host/molecular-tools2.js';
import {MolecularContextService,MOLECULAR_TYPERT} from '../src/host/service-v3.js';
import {REMOTE_METHODS} from '../src/shared/remote-manifest.js';
const collect=(fail,service={})=>{const tools=[];registerMolecularTools({tools:{get:()=>{},register:t=>{if(t.name===fail)throw new Error('intentional registration failure');tools.push(t);}},systemPrompt:{section(){}}},service);return tools;};
test('all nine tools compile with the installed DSH defineTool implementation',()=>{assert.equal(collect().length,9);});
test('one registration failure does not prevent subsequent tools',()=>{const names=collect('molecular_get_state').map(t=>t.name);assert.equal(names.length,8);assert.ok(names.includes('molecular_get_command'));});
test('host and client RPC method lists match the real service',()=>{for(const m of Object.keys(REMOTE_METHODS)){assert.equal(typeof MolecularContextService.prototype[m],'function');assert.ok(MOLECULAR_TYPERT.invocations.some(x=>x.method===m));}});

test('molecular_load result passes the real ToolRuntime output validator',async()=>{const tool=collect(null,{load:async()=>({structureId:'1',title:'fixture.pdb',format:'pdb',byteLength:123,display:{visible:true},source:{path:'fixture.pdb'}})}).find(t=>t.name==='molecular_load');const value=await tool.execute({path:'fixture.pdb'},{agent:{session:{id:'s'}}});assert.deepEqual(validateJsonSchemaValue(tool.output.schema,value,'value'),[]);});