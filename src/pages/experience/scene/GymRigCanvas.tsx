import { Suspense, useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import type { DirectionalLight } from 'three';
import { GymRig } from './GymRig';
import { t, easeInOutCubic, bell } from './easing';
import type { DeviceTier } from '../hooks/useReducedMotionPref';

interface GymRigCanvasProps {
  progressRef: MutableRefObject<number>;
  tier: DeviceTier;
}

const CAM_START = 0.2;
const CAM_END = 0.86;
const IMPACT_CENTER = 0.78; // matches the outer-plate arrival in GymRig
const IMPACT_WIDTH = 0.06;

/**
 * A real camera move (orbit + dolly-back + slight rise), not a locked-off
 * shot — the object growing from a dumbbell into a barbell reads as staged
 * and cinematic rather than a UI element resizing in place.
 */
function CameraRig({ progressRef }: { progressRef: MutableRefObject<number> }) {
  useFrame((state) => {
    const ease = easeInOutCubic(t(progressRef.current, CAM_START, CAM_END));
    const azimuth = THREE.MathUtils.lerp(0, 0.62, ease); // radians
    const radius = THREE.MathUtils.lerp(4.2, 6.6, ease);
    const height = THREE.MathUtils.lerp(0, 0.55, ease);
    state.camera.position.set(Math.sin(azimuth) * radius, height, Math.cos(azimuth) * radius);
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

/** Brief key-light flash timed to the outer plates snapping into place — sells the "impact". */
function ImpactLight({
  progressRef,
  baseIntensity,
  castShadow,
}: {
  progressRef: MutableRefObject<number>;
  baseIntensity: number;
  castShadow: boolean;
}) {
  const ref = useRef<DirectionalLight>(null);
  useFrame(() => {
    const pulse = bell(progressRef.current, IMPACT_CENTER, IMPACT_WIDTH);
    if (ref.current) ref.current.intensity = baseIntensity + pulse * 2.4;
  });
  return <directionalLight ref={ref} position={[3, 4, 3]} intensity={baseIntensity} color="#FFB627" castShadow={castShadow} />;
}

/**
 * Lighting rig + camera + the `GymRig` object itself. Kept as its own
 * component so `HeroProblemStory` can mount/unmount it via an
 * IntersectionObserver gate (see that file) — the single biggest performance
 * lever here is simply not paying for a WebGL context while the story is
 * off-screen, rather than trying to throttle an already-mounted one.
 */
export function GymRigCanvas({ progressRef, tier }: GymRigCanvasProps) {
  const dpr = useMemo<[number, number]>(() => {
    if (tier === 'mobile') return [1, 1];
    if (tier === 'tablet') return [1, 1.25];
    return [1, 1.5];
  }, [tier]);

  return (
    <Canvas
      dpr={dpr}
      shadows={tier !== 'mobile'}
      gl={{ antialias: tier === 'desktop', alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 4.2], fov: 38 }}
    >
      <color attach="background" args={['#0B0C0F']} />
      <ambientLight intensity={0.55} />
      <ImpactLight progressRef={progressRef} baseIntensity={2.6} castShadow={tier !== 'mobile'} />
      <directionalLight position={[-3, 1, 2]} intensity={1.1} color="#FF8A3D" />
      <directionalLight position={[0, -2, -3]} intensity={0.4} color="#5A6472" />
      <Suspense fallback={null}>
        <GymRig progressRef={progressRef} enableParallax={tier !== 'mobile'} />
        {tier === 'desktop' && <ContactShadows position={[0, -1.15, 0]} opacity={0.4} blur={2.4} far={2.2} />}
      </Suspense>
      <CameraRig progressRef={progressRef} />
    </Canvas>
  );
}
