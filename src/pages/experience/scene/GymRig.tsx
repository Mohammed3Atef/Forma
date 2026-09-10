import { useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { t, easeOutBack, easeOutElastic } from './easing';

/**
 * The one physical object the whole Hero → Problem story is built around. A
 * dumbbell that reconfigures into a barbell as `progressRef` advances from
 * 0 → 1 — see `docs/EXPERIENCE_STORYBOARD.md` §3.
 *
 * Built from reusable primitive "parts" (bar, inner plates, outer plates,
 * collars) that are choreographed with real animation principles — eased
 * "snap into place" arrivals (back-ease overshoot), outer plates flying in
 * from off-frame while tumbling, a brief light-impact pulse on arrival — not
 * a linear slide from A to B. Driven entirely by a mutable ref read inside
 * `useFrame`, not React props/state, so a scroll tick never causes a React
 * re-render here.
 */
interface GymRigProps {
  progressRef: MutableRefObject<number>;
  enableParallax?: boolean;
}

// -- choreography timing (fraction of the whole Hero->Problem scroll range) --
const BAR_START = 0.26;
const BAR_END = 0.56;
const INNER_START = 0.26;
const INNER_END = 0.58;
const OUTER_START = 0.52;
const OUTER_END = 0.8;
const COLLAR_START = 0.74;
const COLLAR_END = 0.86;

const INNER_OFFSET_REST = 0.62; // dumbbell
const INNER_OFFSET_FINAL = 2.7; // barbell
const OUTER_OFFSET_FINAL = INNER_OFFSET_FINAL + 0.22;
const OUTER_OFFSET_OFFSTAGE = 9; // outer plates start well outside the frame
const OUTER_TUMBLE_SPINS = 2.5; // full rotations during the fly-in

const METAL_COLOR = '#3A414D';
const RIM_COLOR = '#E5520F'; // brand — plates read as the "branded weight plate"
const GOLD_COLOR = '#FFB627';

export function GymRig({ progressRef, enableParallax = true }: GymRigProps) {
  const groupRef = useRef<THREE.Group>(null);
  const barRef = useRef<THREE.Mesh>(null);
  const plateInnerL = useRef<THREE.Mesh>(null);
  const plateInnerR = useRef<THREE.Mesh>(null);
  // Outer plates are wrapped in their own group so a tumble rotation (applied
  // to the group) composes cleanly with the plate mesh's own fixed base
  // orientation (applied to the mesh) — see the storyboard's §3 note on why a
  // plain radially-symmetric mesh needs this to show a visible spin at all.
  const plateOuterTumbleL = useRef<THREE.Group>(null);
  const plateOuterTumbleR = useRef<THREE.Group>(null);
  const collarL = useRef<THREE.Mesh>(null);
  const collarR = useRef<THREE.Mesh>(null);

  const spin = useRef(0);
  const tilt = useRef({ x: 0, y: 0 });

  const barGeo = useMemo(() => new THREE.CylinderGeometry(0.09, 0.09, 1, 24), []);
  const plateGeo = useMemo(() => new THREE.CylinderGeometry(0.42, 0.42, 0.16, 32), []);
  const outerPlateGeo = useMemo(() => new THREE.CylinderGeometry(0.5, 0.5, 0.12, 32), []);
  const collarGeo = useMemo(() => new THREE.TorusGeometry(0.44, 0.025, 12, 32), []);

  const metalMat = useMemo(() => new THREE.MeshStandardMaterial({ color: METAL_COLOR, metalness: 0.35, roughness: 0.45 }), []);
  const rimMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: RIM_COLOR,
        metalness: 0.3,
        roughness: 0.4,
        emissive: new THREE.Color(RIM_COLOR),
        emissiveIntensity: 0.12,
      }),
    [],
  );
  const collarMat = useMemo(() => new THREE.MeshStandardMaterial({ color: GOLD_COLOR, metalness: 0.45, roughness: 0.32 }), []);

  useFrame((state, delta) => {
    const progress = progressRef.current;
    const { lerp } = THREE.MathUtils;

    // --- bar: telescopes out with a springy overshoot-then-settle ---------
    const barEase = easeOutBack(t(progress, BAR_START, BAR_END));
    const barLength = lerp(1.1, 6.4, barEase);
    if (barRef.current) barRef.current.scale.y = barLength;

    // --- inner plates: slide out to the barbell position, same snap feel --
    const innerEase = easeOutBack(t(progress, INNER_START, INNER_END));
    const innerOffset = lerp(INNER_OFFSET_REST, INNER_OFFSET_FINAL, innerEase);
    if (plateInnerL.current) plateInnerL.current.position.x = -innerOffset;
    if (plateInnerR.current) plateInnerR.current.position.x = innerOffset;

    // --- outer plates: fly in from off-frame, tumbling, with an elastic ---
    // ------ "impact" arrival (bounce past the final position, then settle) --
    const outerLocalT = t(progress, OUTER_START, OUTER_END);
    const outerEase = easeOutElastic(outerLocalT);
    const outerOffset = lerp(OUTER_OFFSET_OFFSTAGE, OUTER_OFFSET_FINAL, outerEase);
    const outerScale = outerLocalT <= 0 ? 0 : easeOutBack(outerLocalT);
    const outerTumble = (1 - outerEase) * OUTER_TUMBLE_SPINS * Math.PI * 2;
    if (plateOuterTumbleL.current) {
      plateOuterTumbleL.current.position.x = -outerOffset;
      plateOuterTumbleL.current.rotation.y = outerTumble;
      plateOuterTumbleL.current.scale.setScalar(Math.max(outerScale, 0));
    }
    if (plateOuterTumbleR.current) {
      plateOuterTumbleR.current.position.x = outerOffset;
      plateOuterTumbleR.current.rotation.y = -outerTumble;
      plateOuterTumbleR.current.scale.setScalar(Math.max(outerScale, 0));
    }

    // --- collars: pop in with the same snap-into-place read ----------------
    const collarEase = easeOutBack(t(progress, COLLAR_START, COLLAR_END));
    if (collarL.current) {
      collarL.current.position.x = -innerOffset + 0.1;
      collarL.current.scale.setScalar(Math.max(collarEase, 0));
    }
    if (collarR.current) {
      collarR.current.position.x = innerOffset - 0.1;
      collarR.current.scale.setScalar(Math.max(collarEase, 0));
    }

    // --- idle spin, settling as the object resolves into a barbell --------
    const spinSpeed = lerp(0.05, 0.012, t(progress, 0.25, BAR_END));
    spin.current += spinSpeed * delta;

    // --- subtle mouse-parallax tilt -----------------------------------------
    if (enableParallax) {
      const targetX = state.pointer.y * 0.12;
      const targetY = state.pointer.x * 0.12;
      tilt.current.x = lerp(tilt.current.x, targetX, 0.06);
      tilt.current.y = lerp(tilt.current.y, targetY, 0.06);
    }

    if (groupRef.current) {
      groupRef.current.rotation.y = spin.current + tilt.current.y;
      groupRef.current.rotation.x = tilt.current.x;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={barRef} geometry={barGeo} material={metalMat} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow />
      <mesh ref={plateInnerL} geometry={plateGeo} material={rimMat} rotation={[0, 0, Math.PI / 2]} castShadow />
      <mesh ref={plateInnerR} geometry={plateGeo} material={rimMat} rotation={[0, 0, Math.PI / 2]} castShadow />
      <group ref={plateOuterTumbleL}>
        <mesh geometry={outerPlateGeo} material={metalMat} rotation={[0, 0, Math.PI / 2]} castShadow />
      </group>
      <group ref={plateOuterTumbleR}>
        <mesh geometry={outerPlateGeo} material={metalMat} rotation={[0, 0, Math.PI / 2]} castShadow />
      </group>
      <mesh ref={collarL} geometry={collarGeo} material={collarMat} rotation={[0, Math.PI / 2, 0]} />
      <mesh ref={collarR} geometry={collarGeo} material={collarMat} rotation={[0, Math.PI / 2, 0]} />
    </group>
  );
}
