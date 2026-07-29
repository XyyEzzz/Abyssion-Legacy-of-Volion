'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore, enemyTargets } from '@/lib/store';

const SPEED = 5;
const SPRINT_MULT = 1.8;
const JUMP_FORCE = 6.0;
const ROTATION_SPEED = 10;

export const playerRigidBodyRef = { current: null as RapierRigidBody | null };

export default function Player() {
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const playerMeshRef = useRef<THREE.Group>(null);
  const swordGroupRef = useRef<THREE.Group>(null);
  const colliderRef = useRef<any>(null);
  
  const [, getKeys] = useKeyboardControls();
  const { camera } = useThree();
  const { rapier, world } = useRapier();
  const setPlayerPosition = useGameStore(state => state.setPlayerPosition);

  // Jump state refs
  const isGroundedRef = useRef(true);
  const hasJumpedInAirRef = useRef(false);
  const prevJumpInputRef = useRef(false);

  // Dodge state refs
  const prevDodgeInputRef = useRef(false);
  const isDodgingRef = useRef(false);
  const dodgeTimerRef = useRef(0);
  const dodgeCooldownRef = useRef(0);
  const dodgeDirRef = useRef(new THREE.Vector3());

  // Attack state refs
  const prevAttackInputRef = useRef(false);
  const attackTimerRef = useRef(0);
  const attackComboStageRef = useRef(0);
  const hasDealtDamageRef = useRef(false);

  // Camera state refs
  const currentCameraPos = useRef(new THREE.Vector3(0, 5, 10)).current;
  const currentLookAt = useRef(new THREE.Vector3(0, 0, 0)).current;
  const localShakeRef = useRef(0);
  const lastShakeReqIdRef = useRef(0);
  const hitStopTimerRef = useRef(0);
  const lastHitStopReqIdRef = useRef(0);

  // Respawn state ref
  const prevDeathOverlayRef = useRef(false);

  useFrame((state, delta) => {
    if (!rigidBodyRef.current || !playerMeshRef.current) return;
    playerRigidBodyRef.current = rigidBodyRef.current;

    // Tick Passive Regeneration (Health/Stamina) and Combat Recovery
    useGameStore.getState().tickRegenerationAndCombat(delta);

    // Sync rigid body position only on explicit respawn
    const deathOverlay = useGameStore.getState().ui.deathOverlay;
    if (prevDeathOverlayRef.current && !deathOverlay) {
      const cp = useGameStore.getState().player.checkpointPos;
      rigidBodyRef.current.setTranslation({ x: cp[0], y: cp[1], z: cp[2] }, true);
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    prevDeathOverlayRef.current = deathOverlay;

    // Check camera shake and hit stop requests
    const { cameraShakeRequest, hitStopMsRequest } = useGameStore.getState();
    if (cameraShakeRequest && cameraShakeRequest.id !== lastShakeReqIdRef.current) {
      lastShakeReqIdRef.current = cameraShakeRequest.id;
      localShakeRef.current = Math.max(localShakeRef.current, cameraShakeRequest.intensity);
    }
    if (hitStopMsRequest && hitStopMsRequest.id !== lastHitStopReqIdRef.current) {
      lastHitStopReqIdRef.current = hitStopMsRequest.id;
      hitStopTimerRef.current = hitStopMsRequest.durationMs / 1000;
    }

    let effectiveDelta = delta;
    if (hitStopTimerRef.current > 0) {
      hitStopTimerRef.current -= delta;
      effectiveDelta = 0; // Freeze attack animation frame progress during hit stop
    }

    const { forward, backward, left, right, jump: keyJump, sprint, attack: keyAttack, dodge: keyDodge } = getKeys();
    const { joystick, jump: storeJump, attack: storeAttack, dodge: storeDodge, cameraAngle } = useGameStore.getState().inputs;
    
    const jumpInput = keyJump || storeJump;
    const dodgeInput = keyDodge || storeDodge;
    const attackInput = keyAttack || storeAttack;

    const velocity = rigidBodyRef.current.linvel();
    const translation = rigidBodyRef.current.translation();
    
    // -------------------------------------------------------------
    // 1. GROUND CHECK & JUMP LOGIC
    // -------------------------------------------------------------
    // Dynamically query player collider dimensions & world position
    let halfHeight = 0.5;
    let radius = 0.5;
    let colliderOffsetY = 1.0;

    const playerCollider = colliderRef.current ? ((colliderRef.current as any).raw || colliderRef.current) : undefined;
    const playerBody = rigidBodyRef.current ? ((rigidBodyRef.current as any).raw || rigidBodyRef.current) : undefined;

    if (playerCollider) {
      if (typeof playerCollider.halfHeight === 'function') {
        halfHeight = playerCollider.halfHeight();
      } else if (typeof playerCollider.halfHeight === 'number') {
        halfHeight = playerCollider.halfHeight;
      }

      if (typeof playerCollider.radius === 'function') {
        radius = playerCollider.radius();
      } else if (typeof playerCollider.radius === 'number') {
        radius = playerCollider.radius;
      }

      if (typeof playerCollider.translation === 'function') {
        const cTrans = playerCollider.translation();
        if (cTrans && typeof cTrans.y === 'number') {
          colliderOffsetY = cTrans.y - translation.y;
        }
      }
    }

    // Dynamic bottom Y of capsule collider in world coordinates
    const colliderBottomY = translation.y + colliderOffsetY - (halfHeight + radius);

    // Ray origin starts slightly inside the collider bottom (skin width = 0.1m)
    const skinWidth = 0.1;
    const rayOriginY = colliderBottomY + skinWidth;
    const maxCastDistance = skinWidth + 0.15; // Cast 0.15m below collider bottom

    // Multi-point raycast (center + 4 cardinal points around capsule base)
    const rayOffsets = [
      { x: 0, z: 0 },
      { x: radius * 0.5, z: 0 },
      { x: -radius * 0.5, z: 0 },
      { x: 0, z: radius * 0.5 },
      { x: 0, z: -radius * 0.5 },
    ];

    const rayDir = new THREE.Vector3(0, -1, 0);
    let groundedByRay = false;

    for (const offset of rayOffsets) {
      const rayOrigin = new THREE.Vector3(translation.x + offset.x, rayOriginY, translation.z + offset.z);
      const ray = new rapier.Ray(rayOrigin, rayDir);
      const hit = world.castRay(ray, maxCastDistance, true, undefined, undefined, playerCollider, playerBody);

      if (hit !== null && hit.timeOfImpact <= maxCastDistance) {
        groundedByRay = true;
        break;
      }
    }

    const isGrounded = groundedByRay && Math.abs(velocity.y) < 2.5;

    if (isGrounded) {
      isGroundedRef.current = true;
      hasJumpedInAirRef.current = false;
    } else {
      isGroundedRef.current = false;
    }

    // Initialize target velocities from current linear velocity
    let targetVx = velocity.x;
    let targetVy = velocity.y;
    let targetVz = velocity.z;

    // Edge-triggered Jump
    const jumpJustPressed = jumpInput && !prevJumpInputRef.current;
    prevJumpInputRef.current = jumpInput;

    if (jumpJustPressed && isGroundedRef.current && !hasJumpedInAirRef.current && !isDodgingRef.current) {
      targetVy = JUMP_FORCE;
      hasJumpedInAirRef.current = true;
      isGroundedRef.current = false;
    }

    // -------------------------------------------------------------
    // 2. DODGE LOGIC
    // -------------------------------------------------------------
    if (dodgeCooldownRef.current > 0) {
      dodgeCooldownRef.current -= delta;
    }

    const dodgeJustPressed = dodgeInput && !prevDodgeInputRef.current;
    prevDodgeInputRef.current = dodgeInput;

    if (dodgeJustPressed && !isDodgingRef.current && dodgeCooldownRef.current <= 0) {
      const dodgeSuccess = useGameStore.getState().triggerPlayerDodge();
      if (dodgeSuccess) {
        isDodgingRef.current = true;
        dodgeTimerRef.current = 0.35;
        dodgeCooldownRef.current = 0.6; // Cooldown before next roll

        // Movement direction
        const moveDir = new THREE.Vector3(0, 0, 0);
        if (forward) moveDir.z -= 1;
        if (backward) moveDir.z += 1;
        if (left) moveDir.x -= 1;
        if (right) moveDir.x += 1;
        if (joystick.x !== 0 || joystick.y !== 0) {
          moveDir.x = joystick.x;
          moveDir.z = joystick.y;
        }
        
        if (moveDir.lengthSq() > 0.01) {
          moveDir.normalize();
          const finalX = moveDir.x * Math.cos(cameraAngle) + moveDir.z * Math.sin(cameraAngle);
          const finalZ = -moveDir.x * Math.sin(cameraAngle) + moveDir.z * Math.cos(cameraAngle);
          dodgeDirRef.current.set(finalX, 0, finalZ).normalize();
        } else {
          const rotY = playerMeshRef.current.rotation.y;
          dodgeDirRef.current.set(Math.sin(rotY), 0, Math.cos(rotY)).normalize();
        }
      }
    }

    // Handle Active Dodge Roll
    if (isDodgingRef.current) {
      dodgeTimerRef.current -= delta;
      const currentSpeed = sprint ? SPEED * SPRINT_MULT : SPEED;
      const dodgeSpeed = currentSpeed * 2.4;

      targetVx = dodgeDirRef.current.x * dodgeSpeed;
      targetVz = dodgeDirRef.current.z * dodgeSpeed;

      // Roll animation (360 pitch rotation)
      if (playerMeshRef.current) {
        const progress = 1 - Math.max(0, dodgeTimerRef.current / 0.35);
        playerMeshRef.current.rotation.x = progress * Math.PI * 2;
      }

      if (dodgeTimerRef.current <= 0) {
        isDodgingRef.current = false;
        if (playerMeshRef.current) {
          playerMeshRef.current.rotation.x = 0;
        }
      }
    }

    // -------------------------------------------------------------
    // 3. ATTACK LOGIC & COMBOS
    // -------------------------------------------------------------
    const attackJustPressed = attackInput && !prevAttackInputRef.current;
    prevAttackInputRef.current = attackInput;

    if (attackJustPressed && !isDodgingRef.current) {
      const comboStage = useGameStore.getState().triggerPlayerAttack();
      if (comboStage > 0) {
        attackComboStageRef.current = comboStage;
        attackTimerRef.current = 0.35;
        hasDealtDamageRef.current = false;
        if (comboStage === 3) {
          useGameStore.getState().triggerCameraShake(0.35);
        }
      }
    }

    // Handle Active Attack Swing & Hit Detection
    if (attackTimerRef.current > 0) {
      attackTimerRef.current -= effectiveDelta;
      const progress = 1 - Math.max(0, attackTimerRef.current / 0.35);

      // Animate Sword per combo stage
      if (swordGroupRef.current) {
        const stage = attackComboStageRef.current;
        if (stage === 1) {
          // Horizontal right to left slash
          swordGroupRef.current.rotation.set(0.2, -Math.PI / 2 + progress * Math.PI, -0.4);
        } else if (stage === 2) {
          // Diagonal left to right slash
          swordGroupRef.current.rotation.set(-0.5 + progress * 1.2, Math.PI / 2 - progress * Math.PI, 0.6);
        } else {
          // Stage 3: Heavy overhead chop
          swordGroupRef.current.rotation.set(-Math.PI / 1.1 + progress * Math.PI * 1.5, 0, 0);
        }
      }

      // Hit detection frame (~ midpoint of animation)
      if (!hasDealtDamageRef.current && progress >= 0.25 && progress <= 0.7) {
        hasDealtDamageRef.current = true;
        const playerPos = new THREE.Vector3(translation.x, translation.y, translation.z);
        const rotY = playerMeshRef.current.rotation.y;
        const facingDir = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)).normalize();

        const stage = attackComboStageRef.current;
        const damage = stage === 1 ? 15 : stage === 2 ? 25 : 45;

        // Query enemy targets
        enemyTargets.forEach((target) => {
          const enemyPos = target.getPosition();
          const dist = playerPos.distanceTo(enemyPos);
          if (dist <= 3.2) {
            const toEnemy = enemyPos.clone().sub(playerPos);
            toEnemy.y = 0;
            if (toEnemy.lengthSq() > 0.001) {
              toEnemy.normalize();
              const dot = facingDir.dot(toEnemy);
              if (dot > 0.0 || dist < 1.4) {
                target.takeDamage(damage, playerPos, stage);
                useGameStore.getState().triggerHitStop(50);
                useGameStore.getState().triggerCameraShake(stage === 3 ? 0.6 : 0.3);
                useGameStore.getState().addHitSpark(enemyPos.x, enemyPos.y + 1.2, enemyPos.z, stage === 3 ? '#f59e0b' : '#facc15');
              }
            }
          }
        });
      }

      if (attackTimerRef.current <= 0) {
        if (swordGroupRef.current) {
          swordGroupRef.current.rotation.set(0, 0, 0);
        }
      }
    } else {
      if (swordGroupRef.current) {
        swordGroupRef.current.rotation.set(0, 0, 0);
      }
    }

    // -------------------------------------------------------------
    // 4. NORMAL MOVEMENT (WHEN NOT DODGING)
    // -------------------------------------------------------------
    if (!isDodgingRef.current) {
      const moveDir = new THREE.Vector3(0, 0, 0);
      if (forward) moveDir.z -= 1;
      if (backward) moveDir.z += 1;
      if (left) moveDir.x -= 1;
      if (right) moveDir.x += 1;
      if (joystick.x !== 0 || joystick.y !== 0) {
        moveDir.x = joystick.x;
        moveDir.z = joystick.y;
      }

      if (moveDir.lengthSq() > 0.01) {
        moveDir.normalize();
        
        // Handle Sprint stamina consumption
        const storeState = useGameStore.getState();
        const canSprint = sprint && storeState.player.stamina > 2;
        if (canSprint) {
          storeState.setPlayerStamina(storeState.player.stamina - 15 * delta);
          storeState.recordStaminaUse();
        }

        const slowFactor = storeState.player.slowFactor ?? 1.0;
        const currentSpeed = (canSprint ? SPEED * SPRINT_MULT : SPEED) * slowFactor;
        
        // Attack slows movement slightly
        const speedMult = attackTimerRef.current > 0 ? 0.3 : 1.0;
        
        const desiredVx = (moveDir.x * Math.cos(cameraAngle) + moveDir.z * Math.sin(cameraAngle)) * currentSpeed * speedMult;
        const desiredVz = (-moveDir.x * Math.sin(cameraAngle) + moveDir.z * Math.cos(cameraAngle)) * currentSpeed * speedMult;

        // Smoothly accelerate towards desired walking velocity while preserving external impulses (knockback)
        const accel = Math.min(1, delta * 20);
        targetVx = THREE.MathUtils.lerp(velocity.x, desiredVx, accel);
        targetVz = THREE.MathUtils.lerp(velocity.z, desiredVz, accel);

        // Shortest-angle rotation towards movement direction
        const targetRotation = Math.atan2(desiredVx, desiredVz);
        const currentRotation = playerMeshRef.current.rotation.y;
        let diff = targetRotation - currentRotation;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        
        playerMeshRef.current.rotation.y = currentRotation + diff * Math.min(1, delta * ROTATION_SPEED);
      } else {
        // Damping towards 0 when no input, preserving residual knockback decay
        const damp = Math.min(1, delta * 15);
        targetVx = THREE.MathUtils.lerp(velocity.x, 0, damp);
        targetVz = THREE.MathUtils.lerp(velocity.z, 0, damp);
      }
    }

    // -------------------------------------------------------------
    // APPLY COMBINED VELOCITY (ONCE PER FRAME)
    // -------------------------------------------------------------
    rigidBodyRef.current.setLinvel({ x: targetVx, y: targetVy, z: targetVz }, true);

    // -------------------------------------------------------------
    // 5. CAMERA ORBIT & FOLLOW & STORE POSITION SYNC
    // -------------------------------------------------------------
    const targetPos = new THREE.Vector3(translation.x, translation.y, translation.z);
    const distance = 6;
    const height = 3;
    const orbitOffset = new THREE.Vector3(
      Math.sin(cameraAngle) * distance,
      height,
      Math.cos(cameraAngle) * distance
    );
    
    const idealCameraPos = targetPos.clone().add(orbitOffset);

    // Apply temporary camera shake impulse offset if active
    if (localShakeRef.current > 0.001) {
      const shake = localShakeRef.current;
      idealCameraPos.x += (Math.random() - 0.5) * shake;
      idealCameraPos.y += (Math.random() - 0.5) * shake;
      idealCameraPos.z += (Math.random() - 0.5) * shake;
      localShakeRef.current = THREE.MathUtils.lerp(localShakeRef.current, 0, delta * 15);
    } else {
      localShakeRef.current = 0;
    }

    currentCameraPos.lerp(idealCameraPos, delta * 10);
    camera.position.copy(currentCameraPos);

    currentLookAt.lerp(targetPos, delta * 15);
    camera.lookAt(currentLookAt);

    // Physics body is the single source of truth: store follows physics body
    const posTuple: [number, number, number] = [translation.x, translation.y, translation.z];
    setPlayerPosition(posTuple);
    useGameStore.getState().checkLocationObjectives(posTuple);
  });

  return (
    <RigidBody
      ref={rigidBodyRef}
      colliders={false}
      mass={1}
      type="dynamic"
      position={[0, 1, 0]}
      enabledRotations={[false, false, false]}
    >
      <CapsuleCollider ref={colliderRef} args={[0.5, 0.5]} position={[0, 1, 0]} />
      <group ref={playerMeshRef}>
        <mesh position={[0, 1, 0]} castShadow>
          <capsuleGeometry args={[0.5, 1, 4, 16]} />
          <meshStandardMaterial color="#3b82f6" />
        </mesh>
        
        {/* Visor */}
        <mesh position={[0, 1.5, 0.4]} castShadow>
          <boxGeometry args={[0.6, 0.2, 0.3]} />
          <meshStandardMaterial color="#1e3a8a" />
        </mesh>

        {/* Sword Group */}
        <group ref={swordGroupRef} position={[0.5, 1.1, 0.2]}>
          {/* Blade */}
          <mesh position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[0.08, 1.1, 0.15]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.8} roughness={0.2} />
          </mesh>
          {/* Guard */}
          <mesh position={[0, 0, 0]} castShadow>
            <boxGeometry args={[0.35, 0.08, 0.15]} />
            <meshStandardMaterial color="#eab308" />
          </mesh>
          {/* Handle */}
          <mesh position={[0, -0.2, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 0.3]} />
            <meshStandardMaterial color="#78350f" />
          </mesh>
        </group>
      </group>
    </RigidBody>
  );
}
