'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { AnimationController } from '../animation/AnimationController';
import { IdleController } from '../animation/IdleController';
import { GestureController } from '../animation/GestureController';
import { LipSyncController } from '../animation/LipSyncController';
import { FaceController } from '../animation/FaceController';
import { LookController } from '../animation/LookController';
import { BodyMotionController } from '../animation/BodyMotionController';
import { smooth } from '../animation/timeline';
import { prepareCountClips } from '../animation/countClips';
import { getAudio, useAvatarStore } from '../stores/avatarStore';
import { CHARACTERS, type CharacterId } from '../characters';

export function Avatar({ character }: { character: CharacterId }) {
  const gltf = useGLTF(CHARACTERS[character].url);
  const model = useMemo(() => clone(gltf.scene), [gltf.scene]);
  const engine = useMemo(() => {
    model.traverse(node => { if ((node as THREE.Mesh).isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    const animation = new AnimationController(model, prepareCountClips(model, gltf.animations));
    const lips = new LipSyncController(model);
    const relaxed = character === 'harry';
    return { animation, lips, idle: new IdleController(animation, relaxed ? 1.2 : .4), gesture: new GestureController(animation, relaxed), face: new FaceController(lips), look: new LookController(model, lips), body: relaxed ? new BodyMotionController(model) : null };
  }, [model, gltf.animations, character]);
  const idleTime = useRef(0);
  const wasPerformance = useRef(false);
  const recovery = useRef(1);
  const saved = useRef(new Map<THREE.Object3D, THREE.Quaternion>());
  useEffect(() => { engine.animation.activate(); useAvatarStore.getState().setModelReady(true); return () => { engine.animation.dispose(); }; }, [engine]);
  useFrame((state, delta) => {
    const store = useAvatarStore.getState();
    const performing = !!store.timeline && ['playing', 'paused'].includes(store.state);
    const audio = getAudio();
    if (!performing) idleTime.current += Math.min(delta, .05);
    const time = performing && audio ? audio.currentTime : idleTime.current;
    if (wasPerformance.current && !performing) {
      recovery.current = 0; saved.current.clear();
      model.traverse(node => { if ((node as THREE.Bone).isBone) saved.current.set(node, node.quaternion.clone()); });
    }
    wasPerformance.current = performing;
    engine.animation.reset(); engine.idle.update(time);
    const timeline = performing ? store.timeline : null;
    if (timeline) { engine.gesture.update(timeline.gestures, time); engine.gesture.update(timeline.head, time); }
    engine.animation.evaluate();
    engine.body?.update(time, timeline?.gestures);
    engine.look.update(time, state.camera, timeline?.emotion.find(e => e.start <= time && e.end > time)?.energy);
    const weights = engine.lips.update(timeline?.visemes ?? [], time);
    engine.face.update(timeline?.emotion ?? [], time,
      Math.max(weights.U ?? 0, weights.O ?? 0, weights.WQ ?? 0),
      Math.max(weights.MBP ?? 0, weights.FV ?? 0), timeline?.words, timeline?.sentences,
      { expression: store.expression, intensity: store.expressionIntensity, speaking: performing });
    if (!performing && recovery.current < 1) {
      recovery.current = Math.min(1, recovery.current + delta / (character === 'harry' ? .65 : .35));
      const blend = character === 'harry' ? smooth(recovery.current) : recovery.current;
      for (const [bone, quaternion] of saved.current) bone.quaternion.slerpQuaternions(quaternion, bone.quaternion.clone(), blend);
    }
  });
  return <primitive object={model} dispose={null} />;
}
