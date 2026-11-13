import test from 'node:test';
import assert from 'node:assert/strict';
import {Structure} from 'molstar/lib/mol-model/structure';
import {StructureRepresentationRegistry} from 'molstar/lib/mol-repr/structure/registry';
import {InteractionsRepresentationProvider} from 'molstar/lib/mol-model-props/computed/representations/interactions';
import {InteractionTypeColorThemeProvider} from 'molstar/lib/mol-model-props/computed/themes/interaction-type';
import {UniformSizeThemeProvider} from 'molstar/lib/mol-theme/size/uniform';
import {createStructureRepresentationParams} from 'molstar/lib/mol-plugin-state/helpers/structure-representation-params';
import {focusInteractionStyle} from '../src/viewer/focus.js';
test('focus interaction representation resolves through the real Molstar registry',()=>{
 const registry=new StructureRepresentationRegistry();registry.add(InteractionsRepresentationProvider);
 const ctx={representation:{structure:{registry,themes:{colorThemeRegistry:{get:n=>n==='interaction-type'?InteractionTypeColorThemeProvider:{name:''}},sizeThemeRegistry:{get:n=>n==='uniform'?UniformSizeThemeProvider:{name:''}}}}}};
 const params=createStructureRepresentationParams(ctx,Structure.Empty,focusInteractionStyle);
 assert.equal(params.type.name,'interactions');assert.equal(params.colorTheme.name,'interaction-type');
 assert.ok(params.type.params.visuals.includes('intra-unit'));assert.equal(params.type.params.sizeFactor,.16);
});
