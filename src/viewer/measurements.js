import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { PrincipalAxes } from 'molstar/lib/mol-math/linear-algebra/matrix/principal-axes';
import { failure } from '../shared/model.js';
const invalid=message=>{throw failure('INVALID_ARGUMENT',message);};
export function measurementGeometry(type,points) {
  if(!Array.isArray(points)||points.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v))))invalid('Measurement requires finite 3D positions');
  const exact={distance:2,angle:3,dihedral:4,label:1};
  if(exact[type]&&points.length!==exact[type])invalid(`${type} requires ${exact[type]} ordered points`);
  if(type==='distance')return {value:Vec3.distance(points[0],points[1]),unit:'Å'};
  if(type==='label')return {value:null,unit:''};
  if(type==='angle'||type==='dihedral'){
    for(let i=1;i<points.length;i++)if(Vec3.distance(points[i-1],points[i])<1e-8)invalid('Repeated points do not define an angle');
    if(type==='dihedral')for(let i=0;i<2;i++)if(Vec3.magnitude(Vec3.cross(Vec3(),Vec3.sub(Vec3(),points[i+1],points[i]),Vec3.sub(Vec3(),points[i+2],points[i+1])))<1e-8)invalid('Collinear points do not define a dihedral');
    const value=(type==='angle'?Vec3.angle(Vec3.sub(Vec3(),points[0],points[1]),Vec3.sub(Vec3(),points[2],points[1])):Vec3.dihedralAngle(...points))*180/Math.PI;
    if(!Number.isFinite(value))invalid('Undefined measurement geometry');
    return {value,unit:'°'};
  }
  if(type!=='plane'&&type!=='orientation')invalid(`Unknown measurement type: ${type}`);
  if(points.length<3)invalid(`${type} requires at least three positions`);
  const a=points[0];let b=points.find(p=>Vec3.distance(a,p)>1e-8);
  if(!b||!points.some(p=>Vec3.magnitude(Vec3.cross(Vec3(),Vec3.sub(Vec3(),b,a),Vec3.sub(Vec3(),p,a)))>1e-8))invalid('Collinear positions do not define a plane or orientation');
  const axes=PrincipalAxes.ofPositions(Float32Array.from(points.flat())).momentsAxes;
  // Principal-axis magnitudes include variance; a perfect plane has dirC=0.
  const origin=Array.from(axes.origin),normal=Array.from(Vec3.normalize(Vec3(),Vec3.cross(Vec3(),axes.dirA,axes.dirB)));
  const rms=Math.sqrt(points.reduce((sum,p)=>sum+Vec3.dot(Vec3.sub(Vec3(),p,origin),normal)**2,0)/points.length);
  return {value:null,unit:'',geometry:{origin,normal,rms,axes:[Array.from(Vec3.normalize(Vec3(),axes.dirA)),Array.from(Vec3.normalize(Vec3(),axes.dirB)),normal]}};
}
