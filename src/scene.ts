import { Box3, Group, InstancedMesh, Matrix4, Mesh, Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import cameraConfig from '../public/assets/camera.json';
export { cameraConfig };
const repeatFamilies=['Pile_Coin_','Back_Hill_Pine_','Valley_Tree_','Village_House_'];
export function optimizeCourt(source: Object3D) {
  const scene=source.clone(true), buckets=new Map<string,Mesh[]>();
  scene.updateMatrixWorld(true);
  let before=0;
  scene.traverse(o=>{
    if(!(o instanceof Mesh))return;
    before++;
    // Architectural faces need hard normals: smooth imported normals bend light across
    // triangulated arch openings. Keep projected actor shadows on the floor only.
    let architectural=false;for(let parent:Object3D|null=o;parent;parent=parent.parent){if(/court_wall/i.test(parent.name))architectural=true;}
    o.receiveShadow=!o.name.startsWith('Distant')&&!architectural;
    if(architectural){
      o.geometry=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
      o.geometry.computeVertexNormals();
      // Blender's baked bump/normal texture produces discontinuities across the
      // arch UV seams. Keep physical lighting but drop the faulty normal detail.
      const hardMaterial=(source:any)=>{const m=source.clone();m.normalMap=null;m.bumpMap=null;m.flatShading=false;m.roughness=.9;m.metalness=0;return m;};
      const positions=o.geometry.attributes.position,normals=o.geometry.attributes.normal,uv=o.geometry.attributes.uv;
      if(uv)for(let i=0;i<positions.count;i++){if(Math.abs(normals.getX(i))>.05){const v=new Vector3().fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld);uv.setXY(i,-v.z/10,1-v.y/10);normals.setXYZ(i,Math.sign(normals.getX(i)),0,0);}}
      o.material=Array.isArray(o.material)?o.material.map(hardMaterial):hardMaterial(o.material);
    }
    o.castShadow=/Gummy|Throne|Crown|Royal_Stair/.test(o.name);
    let p:Object3D|null=o,repeat=false;
    while(p){if(repeatFamilies.some(prefix=>p!.name.startsWith(prefix)))repeat=true;p=p.parent;}
    if(!repeat||Array.isArray(o.material))return;
    const key=o.geometry.uuid+o.material.uuid;
    const a=buckets.get(key)??[];a.push(o);buckets.set(key,a);
  });
  let instancedObjects=0;
  for(const objects of buckets.values()){
    if(objects.length<2)continue;
    const first=objects[0], batch=new InstancedMesh(first.geometry,first.material,objects.length);batch.name='Shared_'+first.name;batch.castShadow=objects.some(o=>o.name.startsWith('Pile'));batch.receiveShadow=true;
    objects.forEach((o,i)=>{batch.setMatrixAt(i,o.matrixWorld);o.removeFromParent();});batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();scene.add(batch);instancedObjects+=objects.length;
  }
  let after=0;scene.traverse(o=>{if(o instanceof Mesh)after++;});
  return {scene,stats:{meshesBefore:before,drawGroupsAfter:after,instancedObjects}};
}
export function landingCamera(width:number,height:number){
  const camera=new PerspectiveCamera(cameraConfig.fov,width/height,.1,1600);
  const aspect=width/height,ax=aspect<.85?.25:cameraConfig.focusScreen[0],ay=cameraConfig.focusScreen[1];
  const original=new Vector3().fromArray(cameraConfig.position), target=new Vector3().fromArray(cameraConfig.target),direction=target.sub(original).normalize(),focus=new Vector3().fromArray(cameraConfig.focus);
  const baseDistance=focus.clone().sub(original).dot(direction);
  for(let distance=baseDistance;distance<500;distance*=1.025){
    camera.position.copy(original).addScaledVector(direction,baseDistance-distance);camera.lookAt(camera.position.clone().add(direction));camera.clearViewOffset();camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    const projected=focus.clone().project(camera);camera.setViewOffset(width,height,(projected.x-(2*ax-1))*width/2,-(projected.y-(1-2*ay))*height/2,width,height);camera.updateProjectionMatrix();
    let fits=true;
    for(const b of cameraConfig.safeBounds)for(const x of [b.min[0],b.max[0]])for(const y of [b.min[1],b.max[1]])for(const z of [b.min[2],b.max[2]]){const p=new Vector3(x,y,z).project(camera),u=(p.x+1)/2,v=(1-p.y)/2;if(u<.02||u>.98||v<.035||v>.945)fits=false;}
    if(fits)return camera;
  }
  return camera;
}
export function introCameraPose(end:PerspectiveCamera){
  // Frame the three highest snowy summits with margin, including on portrait screens.
  const target=new Vector3(365,95,-110), direction=new Vector3(1,-.045,0).normalize();
  const camera=new PerspectiveCamera(37,end.aspect,.1,1600);
  const peaks=[new Vector3(317,97,-202),new Vector3(429,122,-25),new Vector3(329,104,-114)];
  let distance=290;
  for(;distance<1050;distance+=10){camera.position.copy(target).addScaledVector(direction,-distance);camera.lookAt(target);camera.updateMatrixWorld(true);if(peaks.every(v=>{const p=v.clone().project(camera);return Math.abs(p.x)<.77&&p.y>-.25&&p.y<.55;}))break;}
  return {position:camera.position.clone(),rotation:camera.quaternion.clone(),fov:37};
}
export const DESCENT_MS=2000;
export const REDUCED_MS=180;
export function smoothProgress(t:number){const p=Math.max(0,Math.min(1,t));return p<.5?16*p*p*p*p*p:1-Math.pow(-2*p+2,5)/2;}


