import test from 'node:test';
import assert from 'node:assert/strict';
import {parameterSchemaSpecToJsonSchema} from '@deepseek-ai/dsh-tools';
test('installed author DSL rejects all three historical required-array/false patterns',()=>{
 for(const value of [{required:[]},{x:{type:'string',required:false}},{x:{type:'object',additionalProperties:false,properties:{y:{type:'string'}},required:['y']}}])assert.throws(()=>parameterSchemaSpecToJsonSchema(value));
});
test('flat optional parameters and properly declared nested objects are supported',()=>{
 const flat=parameterSchemaSpecToJsonSchema({structureId:{type:'string',description:'id'},representation:{type:'string',description:'preset'},color:{type:'string',description:'theme'}});assert.equal(flat.required,undefined);
 const nested=parameterSchemaSpecToJsonSchema({set:{type:'object',additionalProperties:false,properties:{representation:{type:'string',required:true},color:{type:'string'}}}});assert.deepEqual(nested.properties.set.required,['representation']);assert.equal(nested.required,undefined);
 assert.throws(()=>parameterSchemaSpecToJsonSchema({set:{type:'object',properties:{}}}));
});
