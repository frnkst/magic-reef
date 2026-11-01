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
}

interface SceneState {
  scene: THREE.Scene;
  swimmers: Map<string, Swimmer>;
  pending: Set<string>;
  width: number;
  disposed: boolean;
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
      camera.left = -current.width / 2;
      camera.right = current.width / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      for (const swimmer of current.swimmers.values()) {
        const fit = Math.min(1, current.width * 0.42 / (swimmer.height * swimmer.fish.aspect));
        swimmer.mesh.scale.y = fit;
        swimmer.mesh.scale.x = Math.sign(swimmer.mesh.scale.x) * fit;
        const bound = Math.max(0.1, current.width / 2 - swimmer.height * swimmer.fish.aspect * fit / 2);
        swimmer.mesh.position.x = THREE.MathUtils.clamp(swimmer.mesh.position.x, -bound, bound);
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let elapsed = 0;
    let previousTime = performance.now();
    const animate = (time: number) => {
      const delta = Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      if (!document.hidden) elapsed += delta;
      for (const swimmer of current.swimmers.values()) {
        const { mesh, height, fish: drawing } = swimmer;
        const fit = Math.min(1, current.width * 0.42 / (height * drawing.aspect));
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
        mesh.scale.x = THREE.MathUtils.lerp(mesh.scale.x, orientation * fit, Math.min(1, delta * 4));
        mesh.scale.y = fit;
        mesh.position.y = swimmer.baseY + Math.sin(elapsed * 0.55 + swimmer.phase) * 0.2;
        mesh.rotation.z = Math.sin(elapsed * 0.75 + swimmer.phase) * (reducedMotion.matches ? 0 : 0.035);
        mesh.material.uniforms.time.value = reducedMotion.matches ? 0 : elapsed;
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
      renderer.dispose();
      renderer.domElement.remove();
      if (state.current === current) state.current = null;
    };
  }, [onError]);

  useEffect(() => {
    const current = state.current;
    if (!current) return;
    const wanted = new Set(fish.map((drawing) => drawing.id));
    for (const [id, swimmer] of current.swimmers) {
      if (!wanted.has(id)) {
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
        const height = 0.9 + (index % 4) * 0.15;
        const geometry = new THREE.PlaneGeometry(height * drawing.aspect, height, 24, 8);
        const material = new THREE.ShaderMaterial({
          uniforms: {
            drawing: { value: texture },
            time: { value: 0 },
            phase: { value: index * 1.73 },
            headRight: { value: drawing.facing === 'right' ? 1 : 0 },
          },
          vertexShader: `
            varying vec2 vUv;
            uniform float time;
            uniform float phase;
            uniform float headRight;
            void main() {
              vUv = uv;
              vec3 p = position;
              float tail = mix(uv.x, 1.0 - uv.x, headRight);
              p.y += sin(time * 4.0 + tail * 5.0 + phase) * 0.035 * tail * tail;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }
          `,
          fragmentShader: `
            varying vec2 vUv;
            uniform sampler2D drawing;
            void main() {
              vec4 color = texture2D(drawing, vUv);
              if (color.a < 0.05) discard;
              gl_FragColor = color;
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
        const fit = Math.min(1, current.width * 0.42 / (height * drawing.aspect));
        mesh.scale.set(direction * (drawing.facing === 'right' ? 1 : -1) * fit, fit, 1);
        mesh.position.set(((index * 0.382 + 0.22) % 1 - 0.5) * current.width * 0.7, baseY, (index % 5) * 0.1);
        current.scene.add(mesh);
        current.swimmers.set(drawing.id, {
          mesh, texture, fish: drawing, height, baseY, direction,
          speed: 0.32 + (index % 5) * 0.08,
          phase: index * 1.73,
        });
      }, undefined, () => {
        current.pending.delete(drawing.id);
        if (!current.disposed) onError(`The drawing “${drawing.name}” could not be displayed. Reload to try again.`);
      });
    }
  }, [fish, onError]);

  return (
    <div className="aquarium" role="img" aria-label={`An underwater aquarium with ${fish.length} swimming paper fish`}>
      <div className="water-light water-light-one" />
      <div className="water-light water-light-two" />
      <svg className="seabed" viewBox="0 0 1440 280" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 199Q170 170 380 221T850 218T1440 196V280H0Z" fill="#426660" opacity=".3" />
        <path d="M0 235Q270 189 550 237T1090 220T1440 242V280H0Z" fill="#789183" opacity=".24" />
        <g fill="none" strokeLinecap="round">
          <path d="M106 251Q76 188 103 108T93 20M111 250Q133 210 125 165T149 92M93 246Q66 212 64 179" stroke="#548578" strokeWidth="10" />
          <path d="M1290 258Q1324 199 1299 139T1320 47M1296 255Q1264 209 1277 158M1310 252Q1358 212 1346 179T1359 113" stroke="#578777" strokeWidth="12" />
          <path d="M195 258Q226 220 213 181M1216 261Q1203 230 1217 212" stroke="#8ca390" strokeWidth="7" />
        </g>
        <g fill="#8ba095" opacity=".5">
          <ellipse cx="75" cy="261" rx="57" ry="15" /><ellipse cx="1351" cy="268" rx="74" ry="18" />
          <ellipse cx="1153" cy="270" rx="33" ry="9" /><ellipse cx="306" cy="267" rx="20" ry="6" />
        </g>
      </svg>
      <div className="three-scene" ref={host} />
    </div>
  );
}
