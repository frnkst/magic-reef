import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Fish } from '../lib/reef';

interface Swimmer {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  texture: THREE.Texture;
  fish: Fish;
  speed: number;
  direction: number;
  phase: number;
  baseY: number;
  height: number;
  eatenAt: number | null;
}

interface SceneState {
  scene: THREE.Scene;
  swimmers: Map<string, Swimmer>;
  pending: Set<string>;
  width: number;
  disposed: boolean;
}

function drawingHeight(drawing: Fish) {
  const size = drawing.size ?? 'medium';
  const heights = drawing.kind === 'plant' ? { small: 1.6, medium: 2.5, large: 4 }
    : drawing.kind === 'submarine' ? { small: 1.2, medium: 1.9, large: 3.3 }
      : { small: 1.3, medium: 2, large: 3.5 };
  return heights[size];
}

function drawingFit(drawing: Fish, height: number, width: number) {
  const fraction = { small: 0.35, medium: 0.5, large: 0.75 }[drawing.size ?? 'medium'];
  return Math.min(1, width * fraction / (height * drawing.aspect));
}

function plantPosition(id: string, width: number, height: number, aspect: number, fit: number) {
  let hash = 0;
  for (const character of id) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  const bound = Math.max(0, width / 2 - height * aspect * fit / 2 - 0.15);
  return { x: ((hash % 1000) / 999 - 0.5) * bound * 1.7, y: -4.55 + height * fit / 2 };
}

export function Aquarium({ fish, onError }: { fish: Fish[]; onError: (message: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef<SceneState | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      onError('The aquarium needs WebGL. Try a newer browser or enable hardware acceleration.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 100);
    camera.position.z = 20;
    const current: SceneState = {
      scene, swimmers: new Map(), pending: new Set(), width: 16, disposed: false,
    };
    state.current = current;
    const backgroundGeometry = new THREE.PlaneGeometry(1, 1);
    const backgroundMaterial = new THREE.ShaderMaterial({
      uniforms: {
        reef: { value: null },
        time: { value: 0 },
        motion: { value: 1 },
        cover: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D reef;
        uniform vec2 cover;
        uniform float time;
        uniform float motion;
        void main() {
          vec2 uv = (vUv - 0.5) * cover + 0.5;
          float sides = 1.0 - smoothstep(0.25, 0.42, uv.x) + smoothstep(0.58, 0.75, uv.x);
          float coral = sides * (1.0 - smoothstep(0.54, 0.76, uv.y)) * smoothstep(0.02, 0.20, uv.y);
          float sway = sin(time * 0.65 + uv.y * 4.0 + step(0.5, uv.x) * 2.0);
          uv.x += sway * coral * 0.0025 * motion;
          gl_FragColor = texture2D(reef, uv);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      depthWrite: false,
    });
    const background = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
    background.position.z = -4;
    background.visible = false;
    scene.add(background);
    let backgroundTexture: THREE.Texture | null = null;
    let backgroundAspect = 1529 / 1029;
    const fitBackground = () => {
      background.scale.set(current.width, 10, 1);
      const aspect = current.width / 10;
      backgroundMaterial.uniforms.cover.value.set(
        Math.min(1, aspect / backgroundAspect), Math.min(1, backgroundAspect / aspect),
      );
    };
    new THREE.TextureLoader().load('/reef-background.jpg', (texture) => {
      if (current.disposed) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      backgroundTexture = texture;
      const image = texture.image as HTMLImageElement;
      backgroundAspect = image.width / image.height;
      backgroundMaterial.uniforms.reef.value = texture;
      fitBackground();
      background.visible = true;
    }, undefined, () => {
      if (!current.disposed) onError('The animated reef background could not be loaded. Reload to try again.');
    });
    const lostContext = (event: Event) => {
      event.preventDefault();
      onError('The aquarium’s graphics connection was interrupted. Reload the page to resume.');
    };
    renderer.domElement.addEventListener('webglcontextlost', lostContext);

    const bubbleGeometry = new THREE.RingGeometry(0.035, 0.043, 16);
    const bubbleMaterial = new THREE.MeshBasicMaterial({
      color: '#bae6d9', transparent: true, opacity: 0.2, depthWrite: false,
    });
    const bubbles = Array.from({ length: 22 }, (_, index) => {
      const bubble = new THREE.Mesh(bubbleGeometry, bubbleMaterial);
      const fraction = (index * 0.61803398875) % 1;
      const baseY = (index * 1.77) % 12 - 6;
      bubble.position.set(0, baseY, -2);
      bubble.scale.setScalar(0.6 + (index % 4) * 0.4);
      scene.add(bubble);
      return { bubble, fraction, baseY, speed: 0.12 + (index % 3) * 0.045 };
    });
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      current.width = 10 * width / height;
      fitBackground();
      camera.left = -current.width / 2;
      camera.right = current.width / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      for (const swimmer of current.swimmers.values()) {
        const fit = drawingFit(swimmer.fish, swimmer.height, current.width);
        swimmer.mesh.scale.y = fit;
        swimmer.mesh.scale.x = Math.sign(swimmer.mesh.scale.x) * fit;
        const bound = Math.max(0.1, current.width / 2 - swimmer.height * swimmer.fish.aspect * fit / 2);
        swimmer.mesh.position.x = THREE.MathUtils.clamp(swimmer.mesh.position.x, -bound, bound);
        if (swimmer.fish.kind === 'plant') {
          const position = plantPosition(swimmer.fish.id, current.width, swimmer.height, swimmer.fish.aspect, fit);
          swimmer.mesh.position.set(position.x, position.y, -0.5);
        }
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sharkGeometry = new THREE.PlaneGeometry(3.6, 1.8, 32, 8);
    const sharkSwimTime = { value: 0 };
    const sharkSwimMotion = { value: 1 };
    const sharkMaterial = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    sharkMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.sharkSwimTime = sharkSwimTime;
      shader.uniforms.sharkSwimMotion = sharkSwimMotion;
      shader.vertexShader = `uniform float sharkSwimTime;
        uniform float sharkSwimMotion;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float tail = 1.0 - uv.x;
        transformed.y += sin(sharkSwimTime * 3.8 + tail * 5.0) * tail * tail * 0.12 * sharkSwimMotion;
        transformed.x += sin(sharkSwimTime * 3.8 + tail * 5.0 + 1.0) * tail * tail * 0.018 * sharkSwimMotion;
      `);
    };
    sharkMaterial.customProgramCacheKey = () => 'magic-reef-shark-swimming';
    const shark = new THREE.Mesh(sharkGeometry, sharkMaterial);
    shark.position.set(0, 1.4, 1);
    shark.visible = false;
    scene.add(shark);
    let sharkTexture: THREE.Texture | null = null;
    let sharkBlinkTexture: THREE.CanvasTexture | null = null;
    new THREE.TextureLoader().load('/shark.svg', (texture) => {
      if (current.disposed) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      sharkTexture = texture;
      sharkMaterial.map = texture;
      sharkMaterial.needsUpdate = true;
      shark.visible = true;
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 400;
      const context = canvas.getContext('2d');
      if (!context) {
        onError('The shark blink could not be prepared. Reload the aquarium to try again.');
        return;
      }
      // Copy the artwork and cover its eye with a skin-colored, closed eyelid.
      context.drawImage(texture.image as HTMLImageElement, 0, 0, 800, 400);
      const skin = context.getImageData(646, 158, 1, 1).data;
      context.fillStyle = `rgb(${skin[0]}, ${skin[1]}, ${skin[2]})`;
      context.beginPath();
      context.arc(646, 184, 25, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#285565';
      context.lineWidth = 5;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(630, 183);
      context.quadraticCurveTo(646, 191, 662, 183);
      context.stroke();
      sharkBlinkTexture = new THREE.CanvasTexture(canvas);
      sharkBlinkTexture.colorSpace = THREE.SRGBColorSpace;
    }, undefined, () => {
      if (!current.disposed) onError('The shark artwork could not be loaded. Reload the aquarium to try again.');
    });
    let targetId: string | null = null;
    let huntStartedAt = 0;
    let nextHuntAt = 180;
    let sharkDirection = 1;
    let chompAt = -10;
    let nextBlinkAt = 4 + Math.random() * 5;
    let blinkUntil = 0;
    const fishingRig = new THREE.Group();
    fishingRig.name = 'fishing-rig';
    fishingRig.visible = false;
    fishingRig.position.z = 1.5;
    scene.add(fishingRig);
    const hookMaterial = new THREE.MeshBasicMaterial({ color: '#c9ddd9', depthWrite: false });
    const wormMaterial = new THREE.MeshBasicMaterial({ color: '#ed9e88', depthWrite: false });
    const hookCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(0, -0.15, 0),
      new THREE.Vector3(0.16, -0.4, 0), new THREE.Vector3(0.4, -0.35, 0),
      new THREE.Vector3(0.43, 0.05, 0),
    ]);
    const hookGeometry = new THREE.TubeGeometry(hookCurve, 32, 0.025, 6, false);
    fishingRig.add(new THREE.Mesh(hookGeometry, hookMaterial));
    const barbGeometry = new THREE.ConeGeometry(0.05, 0.15, 6);
    const barb = new THREE.Mesh(barbGeometry, hookMaterial);
    barb.position.set(0.41, 0.02, 0);
    barb.rotation.z = 0.3;
    fishingRig.add(barb);
    const wormCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.1, -0.22, 0.05), new THREE.Vector3(0.1, -0.1, 0.05),
      new THREE.Vector3(0.32, -0.25, 0.05), new THREE.Vector3(0.5, -0.16, 0.05),
      new THREE.Vector3(0.6, -0.4, 0.05),
    ]);
    const wormGeometry = new THREE.TubeGeometry(wormCurve, 32, 0.06, 8, false);
    const worm = new THREE.Mesh(wormGeometry, wormMaterial);
    worm.name = 'fishing-worm';
    fishingRig.add(worm);
    const lineGeometry = new THREE.PlaneGeometry(0.012, 1);
    const lineMaterial = new THREE.MeshBasicMaterial({
      color: '#e9f1db', transparent: true, opacity: 0.65, depthWrite: false,
    });
    const fishingLine = new THREE.Mesh(lineGeometry, lineMaterial);
    fishingLine.name = 'fishing-line';
    fishingLine.position.z = 1.4;
    fishingLine.visible = false;
    scene.add(fishingLine);
    let fishingPhase: 'idle' | 'lowering' | 'waiting' | 'lifting' = 'idle';
    let fishingTargetId: string | null = null;
    let nextFishingAt = 25 + Math.random() * 25;
    let fishingPhaseAt = 0;
    let fishingX = 0;
    let fishingDepth = 0;
    let fishingLiftFrom = 0;
    let fishingWillCatch = false;
    const finishFishing = () => {
      const caught = fishingTargetId ? current.swimmers.get(fishingTargetId) : undefined;
      if (caught && fishingPhase === 'lifting') {
        caught.eatenAt = elapsed - 0.5;
        caught.mesh.visible = false;
      }
      fishingPhase = 'idle';
      fishingTargetId = null;
      fishingRig.visible = false;
      fishingLine.visible = false;
      nextFishingAt = elapsed + 30 + Math.random() * 45;
    };
    const mouth = new THREE.Vector3();
    let elapsed = 0;
    let previousTime = performance.now();
    const animate = (time: number) => {
      const delta = document.hidden ? 0 : Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      if (!document.hidden) elapsed += delta;
      backgroundMaterial.uniforms.time.value = elapsed;
      backgroundMaterial.uniforms.motion.value = reducedMotion.matches ? 0 : 1;
      sharkSwimTime.value = elapsed;
      sharkSwimMotion.value = reducedMotion.matches ? 0 : 1;
      if (fishingPhase === 'idle' && elapsed >= nextFishingAt) {
        fishingPhase = 'lowering';
        fishingPhaseAt = elapsed;
        fishingX = (Math.random() - 0.5) * current.width * 0.65;
        fishingDepth = -0.8 + Math.random() * 2.4;
        fishingWillCatch = Math.random() < 0.65;
        fishingRig.visible = true;
        fishingLine.visible = true;
        worm.visible = true;
      }
      if (fishingPhase !== 'idle') {
        const travelTime = reducedMotion.matches ? 6 : 3;
        const progress = Math.min(1, (elapsed - fishingPhaseAt) / travelTime);
        const eased = progress * progress * (3 - 2 * progress);
        const bound = Math.max(0, current.width / 2 - 0.7);
        fishingRig.position.x = THREE.MathUtils.clamp(fishingX, -bound, bound);
        if (fishingPhase === 'lowering') {
          fishingRig.position.y = THREE.MathUtils.lerp(6, fishingDepth, eased);
          if (progress === 1) {
            fishingPhase = 'waiting';
            fishingPhaseAt = elapsed;
          }
        } else if (fishingPhase === 'waiting') {
          fishingRig.position.y = fishingDepth;
          if (fishingWillCatch && !fishingTargetId && elapsed - fishingPhaseAt > 2) {
            const candidates = [...current.swimmers.values()].filter((swimmer) =>
              (swimmer.fish.kind ?? 'fish') === 'fish' && swimmer.eatenAt === null && swimmer.fish.id !== targetId);
            const choice = candidates[Math.floor(Math.random() * candidates.length)];
            if (choice) fishingTargetId = choice.fish.id;
          }
          if (fishingTargetId && !current.swimmers.has(fishingTargetId)) fishingTargetId = null;
          if (elapsed - fishingPhaseAt > 16) {
            fishingTargetId = null;
            fishingPhase = 'lifting';
            fishingPhaseAt = elapsed;
            fishingLiftFrom = fishingRig.position.y;
          }
        } else {
          fishingRig.position.y = THREE.MathUtils.lerp(fishingLiftFrom, 6.5, eased);
          if (progress === 1) finishFishing();
        }
        const lineLength = Math.max(0.01, 7 - fishingRig.position.y - 0.6);
        fishingLine.scale.y = lineLength;
        fishingLine.position.set(fishingRig.position.x, 7 - lineLength / 2, 1.4);
        worm.rotation.z = reducedMotion.matches ? 0 : Math.sin(elapsed * 3) * 0.08;
      }
      for (const swimmer of current.swimmers.values()) {
        const { mesh, height, fish: drawing } = swimmer;
        const kind = drawing.kind ?? 'fish';
        const fit = drawingFit(drawing, height, current.width);
        if (kind === 'plant') {
          const position = plantPosition(drawing.id, current.width, height, drawing.aspect, fit);
          mesh.position.set(position.x, position.y, -0.5);
          mesh.scale.set(fit, fit, 1);
          mesh.rotation.z = 0;
          mesh.material.uniforms.time.value = 0;
          continue;
        }
        let appearance = 1;
        if (swimmer.eatenAt !== null) {
          const sinceGulp = elapsed - swimmer.eatenAt;
          if (sinceGulp < 0.5) {
            appearance = 1 - sinceGulp / 0.5;
          } else if (sinceGulp < 15.5) {
            mesh.visible = false;
            continue;
          } else {
            if (!mesh.visible) {
              mesh.visible = true;
              mesh.position.x = -Math.sign(shark.position.x || 1) * current.width * 0.3;
            }
            appearance = Math.min(1, (sinceGulp - 15.5) / 0.8);
            if (appearance === 1) swimmer.eatenAt = null;
          }
        }
        if (swimmer.fish.id === fishingTargetId && fishingPhase !== 'idle') {
          const baitX = fishingRig.position.x + 0.3;
          const baitY = fishingRig.position.y - 0.2;
          const direction = Math.sign(baitX - mesh.position.x) || swimmer.direction;
          const headOffset = height * drawing.aspect * fit * 0.38;
          if (fishingPhase === 'waiting') {
            const dx = baitX - direction * headOffset - mesh.position.x;
            const dy = baitY - mesh.position.y;
            const distance = Math.hypot(dx, dy);
            const step = Math.min(distance, delta * (reducedMotion.matches ? 1 : 1.8));
            if (distance > 0) {
              mesh.position.x += dx / distance * step;
              mesh.position.y += dy / distance * step;
            }
            if (distance < 0.15) {
              fishingPhase = 'lifting';
              fishingPhaseAt = elapsed;
              fishingLiftFrom = fishingRig.position.y;
              worm.visible = false;
            }
            swimmer.direction = direction;
          }
          if (fishingPhase === 'lifting') {
            mesh.position.set(baitX - swimmer.direction * headOffset, baitY, 1.6);
          }
          mesh.scale.set(swimmer.direction * (drawing.facing === 'right' ? 1 : -1) * fit, fit, 1);
          mesh.rotation.z = 0;
          mesh.material.uniforms.opacity.value = 1;
          mesh.material.uniforms.time.value = reducedMotion.matches ? 0 : elapsed;
          continue;
        }
        const bound = Math.max(0.1, current.width / 2 - height * drawing.aspect * fit / 2 - 0.12);
        mesh.position.x += delta * swimmer.speed * swimmer.direction * (reducedMotion.matches ? 0.3 : 1);
        if (mesh.position.x > bound) {
          mesh.position.x = bound;
          swimmer.direction = -1;
        } else if (mesh.position.x < -bound) {
          mesh.position.x = -bound;
          swimmer.direction = 1;
        }
        const orientation = swimmer.direction * (drawing.facing === 'right' ? 1 : -1);
        const normalScale = swimmer.eatenAt === null
          ? THREE.MathUtils.lerp(mesh.scale.x, orientation * fit, Math.min(1, delta * 4))
          : orientation * fit;
        mesh.scale.x = normalScale * appearance;
        mesh.scale.y = fit * appearance;
        mesh.material.uniforms.opacity.value = appearance;
        mesh.position.y = swimmer.baseY + Math.sin(elapsed * (kind === 'submarine' ? 0.3 : 0.55) + swimmer.phase) * (kind === 'submarine' ? 0.1 : 0.2);
        mesh.rotation.z = Math.sin(elapsed * 0.75 + swimmer.phase) * (reducedMotion.matches ? 0 : kind === 'submarine' ? 0.012 : 0.035);
        mesh.material.uniforms.time.value = reducedMotion.matches ? 0 : elapsed;
        mesh.position.z = (swimmer.phase / 1.73 % 5) * 0.1;
      }
      if (shark.visible) {
        const sharkFit = Math.min(1, current.width * 0.55 / 3.6);
        const horizontalRadius = Math.max(0.1, current.width / 2 - 1.8 * sharkFit - 0.1);
        const orbit = elapsed * (reducedMotion.matches ? 0.05 : 0.13);
        const destination = new THREE.Vector2(Math.cos(orbit) * horizontalRadius, Math.sin(orbit) * 2.4);
        let target = targetId ? current.swimmers.get(targetId) : undefined;
        if (targetId && (!target || target.eatenAt !== null || elapsed - huntStartedAt > 18)) {
          targetId = null;
          target = undefined;
          nextHuntAt = elapsed + 5;
        }
        if (!targetId && elapsed >= nextHuntAt) {
          const candidates = [...current.swimmers.values()].filter((swimmer) => (swimmer.fish.kind ?? 'fish') === 'fish' && swimmer.eatenAt === null && swimmer.fish.id !== fishingTargetId);
          const choice = candidates[Math.floor(Math.random() * candidates.length)];
          if (choice) {
            target = choice;
            targetId = choice.fish.id;
            huntStartedAt = elapsed;
          } else {
            nextHuntAt = elapsed + 5;
          }
        }
        if (target) {
          sharkDirection = Math.sign(target.mesh.position.x - shark.position.x) || sharkDirection;
          const alignedX = target.mesh.position.x - sharkDirection * 1.16 * sharkFit;
          // Wait for nearby fish to reach the mouth rather than backing into them.
          destination.set(
            sharkDirection * (alignedX - shark.position.x) > 0 ? alignedX : shark.position.x,
            target.mesh.position.y + 0.2 * sharkFit,
          );
          destination.x = THREE.MathUtils.clamp(destination.x, -horizontalRadius, horizontalRadius);
        }
        const dx = destination.x - shark.position.x;
        const dy = destination.y - shark.position.y;
        if (dx !== 0) sharkDirection = Math.sign(dx);
        const distance = Math.hypot(dx, dy);
        const speed = target ? (reducedMotion.matches ? 1.8 : 3.4) : (reducedMotion.matches ? 0.4 : 1.2);
        const step = Math.min(distance, speed * delta);
        if (distance > 0) {
          shark.position.x += dx / distance * step;
          shark.position.y += dy / distance * step;
        }
        const chomp = Math.max(0, 1 - (elapsed - chompAt) / 0.6);
        const stretch = reducedMotion.matches ? 1 : 1 + Math.sin(chomp * Math.PI) * 0.08;
        shark.scale.x = sharkDirection * sharkFit * stretch;
        shark.scale.y = sharkFit;
        const pitch = reducedMotion.matches ? 0 : THREE.MathUtils.clamp(Math.atan2(dy, Math.abs(dx) + 0.5) * sharkDirection, -0.25, 0.25);
        shark.rotation.z = pitch;
        if (elapsed >= nextBlinkAt) {
          blinkUntil = elapsed + 0.18;
          nextBlinkAt = blinkUntil + 4 + Math.random() * 7;
        }
        sharkMaterial.map = elapsed < blinkUntil && sharkBlinkTexture ? sharkBlinkTexture : sharkTexture;
        shark.updateMatrixWorld();
        mouth.set(1.16, -0.2, 0);
        shark.localToWorld(mouth);
        if (target && Math.abs(shark.scale.x) > sharkFit * 0.8
          && Math.hypot(mouth.x - target.mesh.position.x, mouth.y - target.mesh.position.y) < 0.6 * sharkFit + target.height * 0.2) {
          target.eatenAt = elapsed;
          chompAt = elapsed;
          targetId = null;
          nextHuntAt = elapsed + 180;
        }
      }
      for (const { bubble, fraction, baseY, speed } of bubbles) {
        bubble.position.x = (fraction - 0.5) * current.width + Math.sin(elapsed + baseY) * 0.05;
        bubble.position.y = ((baseY + 6 + elapsed * speed) % 12) - 6;
      }
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(animate);
    return () => {
      current.disposed = true;
      observer.disconnect();
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener('webglcontextlost', lostContext);
      for (const swimmer of current.swimmers.values()) {
        swimmer.mesh.geometry.dispose();
        swimmer.mesh.material.dispose();
        swimmer.texture.dispose();
      }
      bubbleGeometry.dispose();
      bubbleMaterial.dispose();
      backgroundGeometry.dispose();
      backgroundMaterial.dispose();
      backgroundTexture?.dispose();
      sharkGeometry.dispose();
      sharkMaterial.dispose();
      sharkTexture?.dispose();
      sharkBlinkTexture?.dispose();
      hookGeometry.dispose();
      barbGeometry.dispose();
      wormGeometry.dispose();
      lineGeometry.dispose();
      hookMaterial.dispose();
      wormMaterial.dispose();
      lineMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      if (state.current === current) state.current = null;
    };
  }, [onError]);

  useEffect(() => {
    const current = state.current;
    if (!current) return;
    const wanted = new Map(fish.map((drawing) => [drawing.id, drawing]));
    for (const [id, swimmer] of current.swimmers) {
      if (!wanted.has(id) || (wanted.get(id)?.size ?? 'medium') !== (swimmer.fish.size ?? 'medium')) {
        current.scene.remove(swimmer.mesh);
        swimmer.mesh.geometry.dispose();
        swimmer.mesh.material.dispose();
        swimmer.texture.dispose();
        current.swimmers.delete(id);
      }
    }
    for (const drawing of fish) {
      if (current.swimmers.has(drawing.id) || current.pending.has(drawing.id)) continue;
      current.pending.add(drawing.id);
      new THREE.TextureLoader().load(drawing.image, (texture) => {
        current.pending.delete(drawing.id);
        if (current.disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        const index = current.swimmers.size;
        const kind = drawing.kind ?? 'fish';
        const height = drawingHeight(drawing);
        const geometry = new THREE.PlaneGeometry(height * drawing.aspect, height, 24, 8);
        const material = new THREE.ShaderMaterial({
          uniforms: {
            drawing: { value: texture },
            time: { value: 0 },
            phase: { value: index * 1.73 },
            headRight: { value: drawing.facing === 'right' ? 1 : 0 },
            opacity: { value: 1 },
            wiggle: { value: kind === 'fish' ? 1 : 0 },
          },
          vertexShader: `
            varying vec2 vUv;
            uniform float time;
            uniform float phase;
            uniform float headRight;
            uniform float wiggle;
            void main() {
              vUv = uv;
              vec3 p = position;
              float tail = mix(uv.x, 1.0 - uv.x, headRight);
              p.y += sin(time * 4.0 + tail * 5.0 + phase) * 0.035 * tail * tail * wiggle;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }
          `,
          fragmentShader: `
            varying vec2 vUv;
            uniform sampler2D drawing;
            uniform float opacity;
            void main() {
              vec4 color = texture2D(drawing, vUv);
              if (color.a < 0.05) discard;
              gl_FragColor = vec4(color.rgb, color.a * opacity);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }
          `,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        const direction = index % 2 === 0 ? -1 : 1;
        const baseY = 2.8 - ((index * 1.91) % 5.4);
        const fit = drawingFit(drawing, height, current.width);
        mesh.scale.set(direction * (drawing.facing === 'right' ? 1 : -1) * fit, fit, 1);
        mesh.position.set(((index * 0.382 + 0.22) % 1 - 0.5) * current.width * 0.7, baseY, (index % 5) * 0.1);
        if (kind === 'plant') {
          const position = plantPosition(drawing.id, current.width, height, drawing.aspect, fit);
          mesh.position.set(position.x, position.y, -0.5);
          mesh.scale.set(fit, fit, 1);
        }
        current.scene.add(mesh);
        current.swimmers.set(drawing.id, {
          mesh, texture, fish: drawing, height, baseY, direction,
          speed: kind === 'plant' ? 0 : kind === 'submarine' ? 0.4 : 0.32 + (index % 5) * 0.08,
          phase: index * 1.73,
          eatenAt: null,
        });
      }, undefined, () => {
        current.pending.delete(drawing.id);
        if (!current.disposed) onError(`The drawing “${drawing.name}” could not be displayed. Reload to try again.`);
      });
    }
  }, [fish, onError]);

  return (
    <div className="aquarium" role="img" aria-label={`An underwater aquarium with ${fish.length} paper drawings, cruising submarines, stationary plants, a playful circling shark, and an occasional fishing hook with a worm. Gulped and caught fish return after a 15-second break.`}>
      <img className="reef-background" src="/reef-background.jpg" alt="" onError={() => {
        onError('The reef background could not be loaded. Reload the aquarium to try again.');
      }} />
      <div className="three-scene" ref={host} />
    </div>
  );
}
