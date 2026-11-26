import {open} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {failure} from '../shared/model.js';
export async function readTrajectoryFile(path,cwd){
 if(typeof path!=='string'||!path.trim()||!/^.*\.(dcd|xtc)$/i.test(path))throw failure('INVALID_ARGUMENT','Use a local .dcd or .xtc trajectory');
 const full=resolve(cwd||'.',path),handle=await open(full,'r');
 try{
  const stat=await handle.stat();
  if(!stat.isFile()||stat.size>64*1024*1024)throw failure('INVALID_ARGUMENT','Trajectory must be a regular file up to 64 MiB. Subset and stride larger files.');
  const bytes=Buffer.alloc(stat.size);let offset=0;
  while(offset<bytes.length){const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);if(!bytesRead)throw failure('INVALID_ARGUMENT','Trajectory changed during reading');offset+=bytesRead;}
  return {data:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex'),format:full.toLowerCase().endsWith('.dcd')?'dcd':'xtc',title:basename(full),byteLength:bytes.length};
 }finally{await handle.close();}
}
