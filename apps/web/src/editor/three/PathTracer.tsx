import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { useEditor } from '../store';
import { PHOTO_SAMPLES, usePhotoRender } from './photoRender';

/**
 * Procedural equirectangular sky (linear HDR values): bright horizon, blue zenith, warm ground
 * bounce. The path tracer importance-samples it as the light coming in through the windows.
 */
function createSkyTexture(night: boolean): THREE.DataTexture {
  const w = 256;
  const h = 128;
  const data = new Float32Array(w * h * 4);
  const zenith = night ? [0.01, 0.015, 0.03] : [0.32, 0.5, 0.95];
  const horizon = night ? [0.02, 0.025, 0.04] : [1.15, 1.2, 1.3];
  const ground = night ? [0.005, 0.005, 0.006] : [0.42, 0.38, 0.33];
  for (let y = 0; y < h; y++) {
    // v = 0 at the top row (zenith), 1 at the bottom (nadir)
    const elev = 1 - (y + 0.5) / (h / 2);
    for (let x = 0; x < w; x++) {
      let c: number[];
      if (elev >= 0) {
        const t = Math.pow(elev, 0.45);
        c = horizon.map((v, i) => v + (zenith[i] - v) * t);
      } else {
        const t = Math.min(1, -elev * 4);
        c = horizon.map((v, i) => v + (ground[i] - v) * t);
      }
      const o = (y * w + x) * 4;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.flipY = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Photoreal render: physically based path tracing of the current scene on the GPU
 * (global illumination, soft shadows, glass, reflections). Mounted only while a render is
 * active; its priority-1 frame callback takes over drawing from the regular renderer, and
 * the accumulated image stays on the canvas once the target sample count is reached.
 */
export function PathTracer() {
  const { gl, scene, camera } = useThree();
  const run = usePhotoRender((s) => s.run);
  const quality = usePhotoRender((s) => s.quality);
  const tracer = useRef<WebGLPathTracer | null>(null);
  const reported = useRef(-1);

  const night = useEditor((s) => s.project.settings.timeOfDay === 'night');

  useEffect(() => {
    let pt: WebGLPathTracer | null = null;
    // The real-time studio environment is a GPU-only PMREM texture; the tracer needs pixel data
    const prevEnv = scene.environment;
    const prevIntensity = scene.environmentIntensity;
    const sky = createSkyTexture(night);
    scene.environment = sky;
    scene.environmentIntensity = 1;
    try {
      pt = new WebGLPathTracer(gl);
      pt.renderDelay = 0;
      pt.fadeDuration = 0;
      pt.minSamples = 1;
      pt.bounces = 6;
      pt.transmissiveBounces = 8;
      pt.filterGlossyFactor = 0.5;
      // Trace at CSS-pixel resolution and in tiles so the UI stays responsive on weaker GPUs
      pt.renderScale = 1 / Math.max(1, gl.getPixelRatio());
      pt.tiles.set(3, 3);
      pt.setScene(scene, camera);
      tracer.current = pt;
      reported.current = -1;
    } catch (e) {
      console.error(e instanceof Error ? e.stack : e);
      usePhotoRender.getState().fail('Видеокарта не поддерживает фото-рендер в браузере');
    }
    return () => {
      tracer.current = null;
      pt?.dispose();
      scene.environment = prevEnv;
      scene.environmentIntensity = prevIntensity;
      sky.dispose();
    };
  }, [gl, scene, camera, run, night]);

  useFrame(() => {
    const pt = tracer.current;
    if (!pt) return;
    const target = PHOTO_SAMPLES[quality];
    if (pt.samples < target) pt.renderSample();
    const n = Math.min(target, Math.floor(pt.samples));
    if (n !== reported.current) {
      reported.current = n;
      usePhotoRender.getState().setSamples(n);
    }
  }, 1);

  return null;
}
