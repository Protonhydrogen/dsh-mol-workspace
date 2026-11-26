import test from 'node:test';
import assert from 'node:assert/strict';
import {videoEncoding} from '../src/viewer/video-codecs.js';
test('MP4 is only selected when the actual recorder reports an encoder',()=>{const saved=globalThis.MediaRecorder;try{globalThis.MediaRecorder={isTypeSupported:t=>t==='video/webm'};assert.equal(videoEncoding().format,'webm');assert.throws(()=>videoEncoding('mp4'),e=>e.code==='UNSUPPORTED_CAPABILITY');globalThis.MediaRecorder={isTypeSupported:t=>t==='video/mp4'};assert.deepEqual(videoEncoding('mp4'),{mime:'video/mp4',format:'mp4',container:'video/mp4'});}finally{if(saved===undefined)delete globalThis.MediaRecorder;else globalThis.MediaRecorder=saved;}});
