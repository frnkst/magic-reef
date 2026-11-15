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
  targetY: number;
  courseRemaining: number;
  turnFraction: number;
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

function sizeVariation(drawing: Fish) {
  let hash = 2166136261;
  for (const character of drawing.id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return 0.75 + (hash % 1001) / 1000 * 0.5;
}

function drawingHeight(drawing: Fish) {
  const size = drawing.size ?? 'medium';
  const heights = drawing.kind === 'plant' ? { small: 1.6, medium: 2.5, large: 4 }
    : drawing.kind === 'submarine' ? { small: 1.2, medium: 1.9, large: 3.3 }
      : { small: 1.3, medium: 2, large: 3.5 };
  return heights[size] * sizeVariation(drawing);
}

function drawingFit(drawing: Fish, height: number, width: number) {
  const fraction = { small: 0.35, medium: 0.5, large: 0.75 }[drawing.size ?? 'medium'];
  return Math.min(1, width * fraction * sizeVariation(drawing) / (height * drawing.aspect));
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
        float caustics(vec2 p, float t) {
          vec2 bend = vec2(sin(p.y * 1.2 + t * 0.32), sin(p.x * 0.9 - t * 0.27));
          p += bend * 0.65;
          float lattice = abs(sin(p.x + t * 0.12) * sin(p.y - t * 0.16));
          return pow(1.0 - lattice, 14.0);
        }
        void main() {
          vec2 uv = (vUv - 0.5) * cover + 0.5;
          float sides = 1.0 - smoothstep(0.25, 0.42, uv.x) + smoothstep(0.58, 0.75, uv.x);
          float coral = sides * (1.0 - smoothstep(0.54, 0.76, uv.y)) * smoothstep(0.02, 0.32, uv.y);
          coral *= smoothstep(0.0, 0.03, uv.x) * (1.0 - smoothstep(0.97, 1.0, uv.x));
          float sway = sin(time * 0.45 + uv.y * 5.0 + step(0.5, uv.x) * 2.0);
          float flutter = sin(time * 0.8 - uv.y * 13.0 + uv.x * 9.0);
          vec2 reefUv = uv + vec2(sway * 0.007 + flutter * 0.0015, flutter * 0.0012) * coral * motion;
          vec4 color = texture2D(reef, clamp(reefUv, 0.0, 1.0));
          float sandWidth = mix(0.34, 0.08, smoothstep(0.0, 0.35, uv.y));
          float sand = (1.0 - smoothstep(0.26, 0.40, uv.y))
            * (1.0 - smoothstep(sandWidth * 0.65, sandWidth, abs(uv.x - 0.5)));
          if (sand > 0.0 && motion > 0.0) {
            vec2 floorUv = vec2((uv.x - 0.5) * 1.5, 0.65) / (uv.y + 0.16) * 4.0;
            float light = caustics(floorUv, time) * 0.65
              + caustics(mat2(0.8, -0.6, 0.6, 0.8) * floorUv * 1.6 + 4.0, -time * 0.7) * 0.35;
            float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
            color.rgb += vec3(1.0, 0.96, 0.79) * (light * 0.16 - 0.025)
              * sand * smoothstep(0.10, 0.45, brightness) * motion;
          }
          gl_FragColor = color;
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
        } else if (swimmer.fish.movement === 'walk') {
          swimmer.mesh.position.y = -4.55 + swimmer.height * fit / 2;
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
    const hookMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = -viewPosition.xyz;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec3 n = normalize(vNormal);
          vec3 view = normalize(vView);
          vec3 reflected = reflect(-view, n);
          float sky = smoothstep(-0.45, 0.75, reflected.y);
          vec3 steel = mix(vec3(0.055, 0.12, 0.15), vec3(0.55, 0.72, 0.77), sky);
          float glint = pow(max(dot(n, normalize(vec3(-0.45, 0.8, 1.0) + view)), 0.0), 85.0);
          float strip = pow(max(0.0, 1.0 - abs(reflected.x * 0.65 + reflected.y * 0.4 - 0.25)), 28.0);
          float rim = pow(1.0 - max(dot(n, view), 0.0), 3.0);
          gl_FragColor = vec4(steel + vec3(0.75, 0.88, 0.9) * (glint * 0.8 + strip * 0.45 + rim * 0.2), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const wormTime = { value: 0 };
    const wormMotion = { value: 1 };
    const wormMaterial = new THREE.ShaderMaterial({
      uniforms: { time: wormTime, motion: wormMotion },
      vertexShader: `
        uniform float time;
        uniform float motion;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vUv = uv;
          vec3 p = position;
          float freeEnd = smoothstep(0.0, 0.36, abs(uv.x - 0.48));
          float wave = time * 1.9 - uv.x * 7.5;
          p.x += sin(wave) * 0.045 * freeEnd * motion;
          p.y += cos(wave * 0.83) * 0.025 * freeEnd * motion;
          p.z += sin(wave + 1.4) * 0.018 * freeEnd * motion;
          vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = -viewPosition.xyz;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec3 n = normalize(vNormal);
          vec3 view = normalize(vView);
          vec3 light = normalize(vec3(-0.5, 0.85, 1.2));
          float diffuse = max(dot(n, light), 0.0);
          float groove = pow(0.5 + 0.5 * cos(vUv.x * 52.0 * 6.283185), 14.0);
          float collar = smoothstep(0.31, 0.33, vUv.x) * (1.0 - smoothstep(0.42, 0.44, vUv.x));
          float mottling = sin(vUv.x * 73.0 + sin(vUv.y * 31.0)) * sin(vUv.y * 19.0) * 0.025;
          vec3 skin = mix(vec3(0.57, 0.23, 0.19), vec3(0.76, 0.37, 0.29), collar);
          skin += mottling - groove * (0.075 - collar * 0.04);
          float sheen = pow(max(dot(n, normalize(light + view)), 0.0), 38.0);
          vec3 color = skin * (0.48 + diffuse * 0.65) + vec3(1.0, 0.77, 0.65) * sheen * 0.22;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const hookCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.49, 0), new THREE.Vector3(-0.025, -0.13, 0),
      new THREE.Vector3(0.035, -0.36, 0), new THREE.Vector3(0.22, -0.44, 0),
      new THREE.Vector3(0.41, -0.34, 0), new THREE.Vector3(0.44, -0.10, 0),
      new THREE.Vector3(0.40, 0.09, 0),
    ]);
    const hookGeometry = new THREE.TubeGeometry(hookCurve, 64, 0.023, 20, false);
    const hookVertices = hookGeometry.attributes.position;
    for (let i = 0; i < hookVertices.count; i++) {
      const t = hookGeometry.attributes.uv.getX(i);
      const center = hookCurve.getPointAt(t);
      const taper = 1 - THREE.MathUtils.smoothstep(t, 0.84, 1);
      hookVertices.setXYZ(i,
        center.x + (hookVertices.getX(i) - center.x) * taper,
        center.y + (hookVertices.getY(i) - center.y) * taper,
        center.z + (hookVertices.getZ(i) - center.z) * taper,
      );
    }
    hookGeometry.computeVertexNormals();
    fishingRig.add(new THREE.Mesh(hookGeometry, hookMaterial));
    const eyeGeometry = new THREE.TorusGeometry(0.05, 0.018, 10, 24);
    const eye = new THREE.Mesh(eyeGeometry, hookMaterial);
    eye.position.set(0, 0.55, 0);
    fishingRig.add(eye);
    const barbGeometry = new THREE.ConeGeometry(0.018, 0.085, 10);
    const barb = new THREE.Mesh(barbGeometry, hookMaterial);
    barb.position.set(0.405, -0.035, 0);
    barb.rotation.z = 2.7;
    fishingRig.add(barb);
    const wormCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.02, -0.50, 0.06), new THREE.Vector3(-0.065, -0.36, 0.055),
      new THREE.Vector3(0.01, -0.16, 0.045), new THREE.Vector3(0.21, -0.16, 0.06),
      new THREE.Vector3(0.36, -0.27, 0.075), new THREE.Vector3(0.46, -0.14, 0.055),
      new THREE.Vector3(0.55, -0.22, 0.06), new THREE.Vector3(0.58, -0.45, 0.065),
      new THREE.Vector3(0.51, -0.62, 0.07),
    ]);
    const wormGeometry = new THREE.TubeGeometry(wormCurve, 256, 0.06, 20, false);
    const wormVertices = wormGeometry.attributes.position;
    for (let i = 0; i < wormVertices.count; i++) {
      const t = wormGeometry.attributes.uv.getX(i);
      const center = wormCurve.getPointAt(t);
      const taper = Math.pow(Math.sin(Math.PI * t), 0.32);
      const collar = 1 + THREE.MathUtils.smoothstep(t, 0.31, 0.33)
        * (1 - THREE.MathUtils.smoothstep(t, 0.42, 0.44)) * 0.12;
      const radius = taper * collar * (1 - 0.035 * Math.cos(t * 52 * Math.PI * 2));
      wormVertices.setXYZ(i,
        center.x + (wormVertices.getX(i) - center.x) * radius,
        center.y + (wormVertices.getY(i) - center.y) * radius,
        center.z + (wormVertices.getZ(i) - center.z) * radius,
      );
    }
    wormGeometry.computeVertexNormals();
    for (const geometry of [hookGeometry, wormGeometry]) {
      const normals = geometry.attributes.normal;
      const sides = geometry.parameters.radialSegments;
      for (let ring = 0; ring <= geometry.parameters.tubularSegments; ring++) {
        const first = ring * (sides + 1);
        const last = first + sides;
        const normal = new THREE.Vector3().fromBufferAttribute(normals, first)
          .add(new THREE.Vector3().fromBufferAttribute(normals, last)).normalize();
        normals.setXYZ(first, normal.x, normal.y, normal.z);
        normals.setXYZ(last, normal.x, normal.y, normal.z);
      }
    }
    wormGeometry.computeBoundingSphere();
    if (wormGeometry.boundingSphere) wormGeometry.boundingSphere.radius += 0.06;
    const worm = new THREE.Mesh(wormGeometry, wormMaterial);
    worm.name = 'fishing-worm';
    fishingRig.add(worm);
    const lineGeometry = new THREE.PlaneGeometry(0.012, 1);
    const lineMaterial = new THREE.MeshBasicMaterial({
      color: '#cee5e1', transparent: true, opacity: 0.42, depthWrite: false,
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
              (swimmer.fish.kind ?? 'fish') === 'fish' && swimmer.fish.movement !== 'walk' && swimmer.eatenAt === null && swimmer.fish.id !== targetId);
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
        wormTime.value = elapsed;
        wormMotion.value = reducedMotion.matches ? 0 : 1;
      }
      for (const swimmer of current.swimmers.values()) {
        const { mesh, height, fish: drawing } = swimmer;
        const kind = drawing.kind ?? 'fish';
        const fit = drawingFit(drawing, height, current.width);
        mesh.material.uniforms.motion.value = reducedMotion.matches ? 0 : 1;
        if (kind === 'plant') {
          const position = plantPosition(drawing.id, current.width, height, drawing.aspect, fit);
          mesh.position.set(position.x, position.y, -0.5);
          mesh.scale.set(fit, fit, 1);
          mesh.rotation.z = 0;
          mesh.material.uniforms.time.value = 0;
          continue;
        }
        if (drawing.movement === 'walk') {
          const walking = (elapsed + swimmer.phase) % 7 < 5;
          const bound = Math.max(0.1, current.width / 2 - height * drawing.aspect * fit / 2 - 0.12);
          if (walking) mesh.position.x += delta * swimmer.speed * swimmer.direction * (reducedMotion.matches ? 0.3 : 1);
          if (mesh.position.x >= bound) { mesh.position.x = bound; swimmer.direction = -1; }
          else if (mesh.position.x <= -bound) { mesh.position.x = -bound; swimmer.direction = 1; }
          mesh.position.y = -4.55 + height * fit / 2;
          mesh.position.z = -0.2;
          mesh.scale.set(fit, fit, 1);
          mesh.rotation.z = 0;
          mesh.material.uniforms.time.value = walking && !reducedMotion.matches ? elapsed : 0;
          mesh.material.uniforms.opacity.value = 1;
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
        const motion = reducedMotion.matches ? 0.3 : 1;
        const speed = Math.min(swimmer.speed, bound / 5) * (1 + Math.sin(elapsed * 0.18 + swimmer.phase) * 0.12);
        const turning = THREE.MathUtils.clamp(Math.abs(mesh.scale.x) / fit, 0.35, 1);
        mesh.position.x += delta * speed * swimmer.direction * motion * turning;
        mesh.position.x = THREE.MathUtils.clamp(mesh.position.x, -bound, bound);
        const turnAt = bound * swimmer.turnFraction;
        if (mesh.position.x * swimmer.direction >= turnAt) {
          swimmer.direction *= -1;
          swimmer.turnFraction = Math.random() < 0.4 ? 0.45 + Math.random() * 0.4 : 1;
        }
        const orientation = swimmer.direction * (drawing.facing === 'right' ? 1 : -1);
        const normalScale = swimmer.eatenAt === null
          ? THREE.MathUtils.damp(mesh.scale.x, orientation * fit, 4, delta)
          : orientation * fit;
        mesh.scale.x = normalScale * appearance;
        mesh.scale.y = fit * appearance;
        mesh.material.uniforms.opacity.value = appearance;
        const verticalLimit = Math.max(0.1, 4.35 - height * fit / 2);
        swimmer.courseRemaining -= delta * motion;
        if (swimmer.courseRemaining <= 0) {
          swimmer.targetY = THREE.MathUtils.clamp(
            swimmer.baseY + (Math.random() * 2 - 1) * (kind === 'submarine' ? 0.4 : 0.9),
            -verticalLimit, verticalLimit,
          );
          swimmer.courseRemaining = 18 + Math.random() * 22;
        }
        swimmer.baseY = THREE.MathUtils.damp(
          swimmer.baseY, THREE.MathUtils.clamp(swimmer.targetY, -verticalLimit, verticalLimit), 0.08, delta * motion,
        );
        const wave = reducedMotion.matches ? 0 : Math.sin(elapsed * (0.16 + swimmer.phase * 0.015) + swimmer.phase)
          * (kind === 'submarine' ? 0.08 : 0.28);
        const previousY = mesh.position.y;
        mesh.position.y = THREE.MathUtils.damp(
          previousY, THREE.MathUtils.clamp(swimmer.baseY + wave, -verticalLimit, verticalLimit), 0.8, delta * motion,
        );
        mesh.position.y = THREE.MathUtils.clamp(mesh.position.y, -verticalLimit, verticalLimit);
        const pitch = reducedMotion.matches ? 0 : THREE.MathUtils.clamp(
          Math.atan2(mesh.position.y - previousY, Math.max(delta * speed * motion, 0.001)) * swimmer.direction,
          kind === 'submarine' ? -0.035 : -0.12, kind === 'submarine' ? 0.035 : 0.12,
        );
        mesh.rotation.z = THREE.MathUtils.damp(mesh.rotation.z, pitch, 2, delta);
        mesh.material.uniforms.time.value = reducedMotion.matches ? 0 : elapsed;
        mesh.position.z = swimmer.phase / (Math.PI * 2) * 0.4;
      }
      if (shark.visible) {
        const sharkFit = Math.min(1, current.width * 0.55 / 3.6) * 1.5;
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
          const candidates = [...current.swimmers.values()].filter((swimmer) => (swimmer.fish.kind ?? 'fish') === 'fish' && swimmer.fish.movement !== 'walk' && swimmer.eatenAt === null && swimmer.fish.id !== fishingTargetId);
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
      eyeGeometry.dispose();
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
      if (!wanted.has(id) || (wanted.get(id)?.size ?? 'medium') !== (swimmer.fish.size ?? 'medium')
        || (wanted.get(id)?.movement ?? 'swim') !== (swimmer.fish.movement ?? 'swim')) {
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
        const phase = Math.random() * Math.PI * 2;
        const kind = drawing.kind ?? 'fish';
        const height = drawingHeight(drawing);
        const geometry = new THREE.PlaneGeometry(height * drawing.aspect, height, 24, 8);
        const material = new THREE.ShaderMaterial({
          uniforms: {
            drawing: { value: texture },
            time: { value: 0 },
            phase: { value: phase },
            motion: { value: 0 },
            bodySize: { value: new THREE.Vector2(height * drawing.aspect, height) },
            headRight: { value: drawing.facing === 'right' ? 1 : 0 },
            opacity: { value: 1 },
            wiggle: { value: kind === 'fish' && drawing.movement !== 'walk' ? 1 : 0 },
            walking: { value: drawing.movement === 'walk' ? 1 : 0 },
          },
          vertexShader: `
            varying vec2 vUv;
            uniform float time;
            uniform float phase;
            uniform float motion;
            uniform vec2 bodySize;
            uniform float headRight;
            uniform float wiggle;
            uniform float walking;
            void main() {
              vUv = uv;
              vec3 p = position;
              float tail = mix(uv.x, 1.0 - uv.x, headRight);
              float stroke = time * (2.8 + phase * 0.12) + phase - tail * 3.5;
              float bend = smoothstep(0.18, 1.0, tail) * tail;
              p.y += sin(stroke) * bodySize.y * 0.07 * bend * wiggle * motion;
              p.x += (1.0 - cos(stroke)) * bodySize.x * 0.025 * bend * tail
                * (headRight * 2.0 - 1.0) * wiggle * motion;
              float legs = 1.0 - smoothstep(0.0, 0.55, uv.y);
              p.x += sin(time * 9.0 + uv.x * 12.0 + phase) * legs * 0.045 * walking * step(0.001, time) * motion;
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
        const direction = Math.random() < 0.5 ? -1 : 1;
        const fit = drawingFit(drawing, height, current.width);
        const verticalLimit = Math.max(0.1, 4.35 - height * fit / 2);
        const baseY = (Math.random() * 2 - 1) * verticalLimit * 0.8;
        mesh.scale.set(direction * (drawing.facing === 'right' ? 1 : -1) * fit, fit, 1);
        const bound = Math.max(0.1, current.width / 2 - height * drawing.aspect * fit / 2 - 0.12);
        mesh.position.set((Math.random() * 2 - 1) * bound * 0.7, baseY, phase / (Math.PI * 2) * 0.4);
        if (kind === 'plant') {
          const position = plantPosition(drawing.id, current.width, height, drawing.aspect, fit);
          mesh.position.set(position.x, position.y, -0.5);
          mesh.scale.set(fit, fit, 1);
        } else if (drawing.movement === 'walk') {
          mesh.position.y = -4.55 + height * fit / 2;
          mesh.position.z = -0.2;
          mesh.scale.set(fit, fit, 1);
        }
        current.scene.add(mesh);
        current.swimmers.set(drawing.id, {
          mesh, texture, fish: drawing, height, baseY, direction,
          targetY: baseY,
          courseRemaining: 18 + Math.random() * 22,
          turnFraction: 1,
          speed: kind === 'plant' ? 0 : kind === 'submarine' ? 0.32 + Math.random() * 0.12 : 0.32 + Math.random() * 0.32,
          phase,
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
