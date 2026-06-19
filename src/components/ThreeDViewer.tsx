import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DesignDocument, RenderSettings } from '../types';
import { DEFAULT_RENDER_SETTINGS } from '../utils/designMigration';
import { buildThreeDesignScene, disposeThreeObject } from '../utils/threeScene';

export type ThreeDViewerHandle = {
  exportPng: () => void;
};

type ThreeDViewerProps = {
  design: DesignDocument;
};

const downloadDataUrl = (dataUrl: string, fileName: string) => {
  const link = document.createElement('a');
  link.download = fileName;
  link.href = dataUrl;
  link.click();
};

const resolveRenderSettings = (design: DesignDocument): RenderSettings => ({
  ...DEFAULT_RENDER_SETTINGS,
  ...design.renderSettings
});

const applyLighting = (
  ambientLight: THREE.HemisphereLight,
  sunLight: THREE.DirectionalLight,
  lightMode: RenderSettings['lightMode']
) => {
  if (lightMode === 'warm') {
    ambientLight.color.set('#fff3df');
    ambientLight.groundColor.set('#dbc7ae');
    ambientLight.intensity = 1.45;
    sunLight.color.set('#ffd7a0');
    sunLight.intensity = 2.0;
    sunLight.position.set(-4, 5.8, 5);
    return;
  }

  if (lightMode === 'studio') {
    ambientLight.color.set('#ffffff');
    ambientLight.groundColor.set('#d9dfdd');
    ambientLight.intensity = 2.1;
    sunLight.color.set('#ffffff');
    sunLight.intensity = 1.55;
    sunLight.position.set(3, 7, 4);
    return;
  }

  ambientLight.color.set('#ffffff');
  ambientLight.groundColor.set('#cad4cf');
  ambientLight.intensity = 1.8;
  sunLight.color.set('#ffffff');
  sunLight.intensity = 2.2;
  sunLight.position.set(5, 8, 6);
};

const applyCameraPreset = (
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  span: number,
  cameraPreset: RenderSettings['cameraPreset']
) => {
  if (cameraPreset === 'front') {
    camera.position.set(0, span * 0.58, span * 1.35);
  } else if (cameraPreset === 'corner') {
    camera.position.set(span * 0.95, span * 0.62, span * 0.95);
  } else {
    camera.position.set(span * 0.7, span * 0.68, span * 1.05);
  }

  camera.near = 0.05;
  camera.far = Math.max(span * 8, 60);
  camera.updateProjectionMatrix();
  controls.target.set(0, 0.9, 0);
  controls.update();
};

export default forwardRef<ThreeDViewerHandle, ThreeDViewerProps>(function ThreeDViewer({ design }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const designGroupRef = useRef<THREE.Group | null>(null);
  const ambientLightRef = useRef<THREE.HemisphereLight | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);

  useImperativeHandle(ref, () => ({
    exportPng: () => {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;

      if (!renderer || !scene || !camera) {
        return;
      }

      renderer.render(scene, camera);
      downloadDataUrl(renderer.domElement.toDataURL('image/png'), `${design.name || '全屋设计'}-3D效果图.png`);
    }
  }), [design.name]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eef2ef');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    camera.position.set(7, 6, 9);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'three-canvas';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.HemisphereLight('#ffffff', '#cad4cf', 1.8);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const sunLight = new THREE.DirectionalLight('#ffffff', 2.2);
    sunLight.position.set(5, 8, 6);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 50;
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.9, 0);
    controlsRef.current = controls;

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;

      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let animationFrame = 0;
    const renderFrame = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(renderFrame);
    };
    renderFrame();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      controls.dispose();

      if (designGroupRef.current) {
        disposeThreeObject(designGroupRef.current);
        scene.remove(designGroupRef.current);
      }

      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const ambientLight = ambientLightRef.current;
    const sunLight = sunLightRef.current;

    if (!scene || !camera || !controls || !ambientLight || !sunLight) {
      return;
    }

    if (designGroupRef.current) {
      disposeThreeObject(designGroupRef.current);
      scene.remove(designGroupRef.current);
    }

    const { group, widthMeters, depthMeters } = buildThreeDesignScene(design);
    designGroupRef.current = group;
    scene.add(group);

    const span = Math.max(widthMeters, depthMeters, 4);
    const settings = resolveRenderSettings(design);
    applyLighting(ambientLight, sunLight, settings.lightMode);
    applyCameraPreset(camera, controls, span, settings.cameraPreset);
  }, [design]);

  return <div className="three-viewer" ref={containerRef} />;
});
