'use client';
import { Component, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useProgress } from '@react-three/drei';
import { PCFShadowMap } from 'three';
import { Avatar } from './Avatar';
import { useAvatarStore } from '../stores/avatarStore';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

class ModelBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  componentDidCatch(error: Error) { useAvatarStore.getState().setModelError(`Karakter gagal dimuat: ${error.message}`); }
  render() { return this.state.error ? null : this.props.children; }
}
function CameraControls() {
  const focusFace = useAvatarStore(s => s.focusFace);
  const { camera } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  useEffect(() => {
    camera.position.set(0, focusFace ? 1.64 : 1.45, focusFace ? 1.35 : 4.3);
    controls.current?.target.set(0, focusFace ? 1.59 : .98, 0); controls.current?.update();
  }, [focusFace, camera]);
  return <OrbitControls ref={controls} enablePan={false} minDistance={.9} maxDistance={6} minPolarAngle={.8} maxPolarAngle={1.65} minAzimuthAngle={-.75} maxAzimuthAngle={.75} />;
}
export default function AvatarScene() {
  const character = useAvatarStore(s => s.character);
  const { progress } = useProgress();
  const ready = useAvatarStore(s => s.modelReady), error = useAvatarStore(s => s.modelError);
  return <><Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} camera={{ position: [0, 1.45, 4.3], fov: 36 }} gl={{ antialias: true }} fallback={<p className="model-message error">Browser ini belum mendukung WebGL.</p>}>
    <color attach="background" args={['#edf2ef']} />
    <hemisphereLight args={['#ffffff', '#b8c6ba', 2.5]} />
    <directionalLight position={[-3, 5, 4]} intensity={3} castShadow shadow-mapSize={[1024, 1024]} shadow-normalBias={.025} />
    <directionalLight position={[3, 2, -2]} intensity={1.4} color="#d8e7ff" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.015, 0]} receiveShadow><planeGeometry args={[100, 100]} /><meshStandardMaterial color="#e5ebe5" roughness={1} /></mesh>
    <ModelBoundary key={character}><Suspense fallback={null}><Avatar character={character} /></Suspense></ModelBoundary>
    <CameraControls />
  </Canvas>{(!ready || error) && <div className="scene-overlay"><div className={`model-message ${error ? 'error' : ''}`}>{error || `Menyiapkan karakter… ${Math.round(progress)}%`}</div></div>}</>;
}
