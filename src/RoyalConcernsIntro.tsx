import { Suspense, Component, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { AgXToneMapping, Color, Fog, PerspectiveCamera, PMREMGenerator, RectAreaLight, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DESCENT_MS, REDUCED_MS, introCameraPose, landingCamera, optimizeCourt, smoothProgress } from './scene';
import './styles.css';
RectAreaLightUniformsLib.init();
const roomLights=[{position:[-4,22,4],target:[-1.85,13.93,-4.61],width:12,intensity:4.1},{position:[-3.45,22.63,12.95],target:[-3.25,12.63,12.93],width:39.18,intensity:1.1},{position:[-7,18,-6],target:[-3.19,9.84,-10.35],width:10,intensity:3.2},{position:[12,14,-10],target:[4.84,7.44,-12.39],width:9,intensity:2.5}];
function BlenderRoomLights(){const lights=useMemo(()=>roomLights.map(spec=>{const light=new RectAreaLight('#fff5e5',spec.intensity,spec.width,spec.width);light.position.fromArray(spec.position);light.lookAt(new Vector3().fromArray(spec.target));return light;}),[]);return <>{lights.map((light,i)=><primitive key={i} object={light}/>)}</>;}
type Phase='menu'|'descending'|'court';
type Props={sceneUrl?:string;onArrive?:()=>void;showReplay?:boolean};
function useReducedMotion(){
  const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  return reduced;
}
class SceneBoundary extends Component<{children:ReactNode;onError:(e:Error)=>void},{error:Error|null}>{
  state:{error:Error|null}={error:null};static getDerivedStateFromError(error:Error){return {error};}
  componentDidCatch(error:Error){this.props.onError(error);}render(){return this.state.error?null:this.props.children;}
}
function CourtScene({url,progress,onReady}:{url:string;progress:MutableRefObject<number>;onReady:()=>void}){
  const gltf=useLoader(GLTFLoader,url);const {scene,stats}=useMemo(()=>optimizeCourt(gltf.scene),[gltf.scene]);const {gl,scene:world,camera,size}=useThree();
  const end=useMemo(()=>landingCamera(size.width,size.height),[size.width,size.height]);const start=useMemo(()=>introCameraPose(end),[end]);
  useEffect(()=>{
    let active=true;gl.shadowMap.autoUpdate=false;gl.shadowMap.needsUpdate=true;world.background=new Color('#9fc5d8');world.fog=new Fog('#9fc5d8',300,1100);
    const environment=new RoomEnvironment(), generator=new PMREMGenerator(gl), lighting=generator.fromScene(environment,.04);world.environment=lighting.texture;world.environmentIntensity=.5;environment.dispose();generator.dispose();
    const ready=async()=>{try{await gl.compileAsync(world,camera);}catch{gl.compile(world,camera);}if(active){window.dispatchEvent(new CustomEvent('royal-scene-ready',{detail:stats}));onReady();}};
    void ready();return()=>{active=false;if(world.environment===lighting.texture)world.environment=null;lighting.dispose();};
  },[gl,world,camera,onReady,stats]);
  useFrame(()=>{
    const c=camera as PerspectiveCamera,p=smoothProgress(progress.current);
    c.position.lerpVectors(start.position,end.position,p);c.quaternion.slerpQuaternions(start.rotation,end.quaternion,p);c.fov=start.fov+(end.fov-start.fov)*p;c.aspect=size.width/size.height;
    if(end.view)c.setViewOffset(size.width,size.height,end.view.offsetX*p,end.view.offsetY*p,size.width,size.height);
    c.near=.1;c.far=1600;c.updateProjectionMatrix();
  });
  return <>
    <primitive object={scene} dispose={null}/>
    <ambientLight intensity={.2}/>
    <hemisphereLight args={['#bfd8ee','#5e5140',.35]}/>
    <BlenderRoomLights/>
    <directionalLight position={[62.14,53.8,15.93]} target-position={[0,6,0]} intensity={1.8} color="#fff1d8" castShadow shadow-mapSize={[size.width<600?1024:2048,size.width<600?1024:2048]} shadow-camera-left={-37} shadow-camera-right={37} shadow-camera-top={35} shadow-camera-bottom={-25} shadow-camera-near={1} shadow-camera-far={160} shadow-normalBias={.08} shadow-bias={-.00005}/>
    {[25.225,10.925,-3.375].map(z=><pointLight key={z} position={[7.1,13.4,z]} color="#ffad5d" intensity={38} distance={10} decay={2}/>)}
  </>;
}
function CloudBank({filterId,className}:{filterId:string;className:string}){
  return <div className={className} aria-hidden="true"><svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice"><image href="./assets/cloud-bank.webp" width="1600" height="900" preserveAspectRatio="xMidYMax slice" filter={`url(#${filterId})`}/></svg></div>;
}
const startPath='M43 105C17 106 5 85 17 66C12 47 29 31 48 34C47 14 70 4 88 15C102-3 130 2 140 20C163 4 190 16 191 36C213 28 237 43 233 64C258 79 242 106 219 106Z';
export function RoyalConcernsIntro({sceneUrl='./assets/royal-court.glb',onArrive,showReplay=false}:Props){
  const [phase,setPhase]=useState<Phase>('menu'),[ready,setReady]=useState(false),[error,setError]=useState<string|null>(null),[attempt,setAttempt]=useState(0),[headingVisible,setHeadingVisible]=useState(true);
  const reduced=useReducedMotion(),root=useRef<HTMLElement>(null),progress=useRef(0),phaseRef=useRef<Phase>('menu'),raf=useRef(0),started=useRef(0),duration=useRef(DESCENT_MS),motionBlur=useRef<SVGFEGaussianBlurElement>(null),heading=useRef<HTMLHeadingElement>(null),callback=useRef(onArrive),hideTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  callback.current=onArrive;const filterId='cloud-blur-'+useId().replace(/:/g,'');
  const onReady=useCallback(()=>setReady(true),[]);
  const updateVisuals=useCallback((p:number)=>{
    const node=root.current;if(!node)return;p=smoothProgress(p);const speed=Math.sin(Math.PI*p);node.style.setProperty('--cloud-front-y',`${-p*140}vh`);node.style.setProperty('--cloud-back-y',`${-p*112}vh`);node.style.setProperty('--sweep-y',`${110-p*240}vh`);node.style.setProperty('--sweep-opacity',String(Math.max(0,speed)));node.style.setProperty('--fade-progress',String(p));
    motionBlur.current?.setAttribute('stdDeviation',`0 ${reduced?0:speed*25}`);
  },[reduced]);
  const arrive=useCallback(()=>{
    if(phaseRef.current==='court')return;cancelAnimationFrame(raf.current);progress.current=1;updateVisuals(1);phaseRef.current='court';setPhase('court');setHeadingVisible(true);
    window.dispatchEvent(new CustomEvent('royal-intro-state',{detail:{phase:'court',elapsed:performance.now()-started.current,reducedMotion:reduced}}));callback.current?.();
    clearTimeout(hideTimer.current);hideTimer.current=setTimeout(()=>setHeadingVisible(false),3200);
  },[updateVisuals,reduced]);
  const start=useCallback(()=>{
    if(!ready||error||phaseRef.current!=='menu')return;phaseRef.current='descending';setPhase('descending');duration.current=reduced?REDUCED_MS:DESCENT_MS;started.current=performance.now();
    if(reduced)progress.current=1;
    window.dispatchEvent(new CustomEvent('royal-intro-state',{detail:{phase:'descending',elapsed:0,reducedMotion:reduced}}));
    const tick=(now:number)=>{const t=Math.min(1,(now-started.current)/duration.current);if(!reduced)progress.current=t;updateVisuals(t);if(t>=1)arrive();else raf.current=requestAnimationFrame(tick);};raf.current=requestAnimationFrame(tick);
  },[ready,error,reduced,updateVisuals,arrive]);
  useEffect(()=>{if(phase==='court')heading.current?.focus({preventScroll:true});},[phase]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&phaseRef.current==='descending')arrive();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[arrive]);
  useEffect(()=>{if(reduced&&phaseRef.current==='descending')arrive();},[reduced,arrive]);
  useEffect(()=>()=>{cancelAnimationFrame(raf.current);clearTimeout(hideTimer.current);},[]);
  const replay=()=>{cancelAnimationFrame(raf.current);clearTimeout(hideTimer.current);phaseRef.current='menu';progress.current=0;updateVisuals(0);setPhase('menu');setHeadingVisible(true);};
  const retry=()=>{useLoader.clear(GLTFLoader,sceneUrl);setError(null);setReady(false);setAttempt(a=>a+1);};
  return <main ref={root} className={`royal-intro ${reduced?'reduced-motion':''}`} data-phase={phase} data-ready={ready} aria-label="Royal Concerns">
    <div className="world" aria-hidden="true">
      <Canvas shadows dpr={[1,1.5]} camera={{position:[-60,80,35],fov:50,near:.1,far:1600}} gl={{antialias:true,powerPreference:'high-performance'}} onCreated={({gl})=>{gl.toneMapping=AgXToneMapping;gl.toneMappingExposure=1.05;}} fallback={<div className="webgl-fallback">This scene needs WebGL. Try opening it in a current browser.</div>}>
        <SceneBoundary key={attempt} onError={e=>setError(e.message)}><Suspense fallback={null}><CourtScene url={sceneUrl} progress={progress} onReady={onReady}/></Suspense></SceneBoundary>
      </Canvas>
    </div>
    <svg width="0" height="0" className="filter-defs" aria-hidden="true"><defs><filter id={filterId} x="-50%" y="-150%" width="200%" height="400%" colorInterpolationFilters="sRGB"><feGaussianBlur ref={motionBlur} stdDeviation="0 0"/></filter></defs></svg>
    {phase!=='court'&&<>
      <div className="menu-sky-tint" aria-hidden="true"/>
      <CloudBank filterId={filterId} className="cloud-bank cloud-bank-back"/>
      <CloudBank filterId={filterId} className="cloud-bank cloud-bank-front"/>
      <div className="menu-content">
        <h1 className="game-title"><span>Royal</span><span>Concerns</span></h1>
        <div className="start-area">
          <button className="start-cloud" onClick={start} disabled={!ready||!!error} aria-label="Start" aria-describedby={!ready?'loading-status':undefined}>
            <svg viewBox="0 0 260 120" aria-hidden="true"><path d={startPath}/></svg><span>Start</span>
          </button>
          {!ready&&!error&&<p id="loading-status" className="loading" role="status">Preparing the court…</p>}
          {error&&<div className="load-error" role="alert"><p>The court couldn’t load.</p><button onClick={retry}>Try again</button></div>}
        </div>
      </div>
      <div className="cloud-sweep" aria-hidden="true"><CloudBank filterId={filterId} className="cloud-bank cloud-bank-sweep"/></div>
      <div className="reduced-veil" aria-hidden="true"/>
    </>}
    {phase==='court'&&<div className={`arrival ${headingVisible?'':'arrival-leaving'}`}>
      <h2 ref={heading} tabIndex={-1}><span>Hilltop Courtroom</span><span>Day 1</span></h2>
    </div>}
    {showReplay&&phase==='court'&&<button className="replay" onClick={replay}>Replay intro</button>}
  </main>;
}
