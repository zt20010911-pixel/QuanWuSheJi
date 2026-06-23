import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DesignDocument, RenderSettings } from '../types';
import { DEFAULT_RENDER_SETTINGS } from '../utils/designMigration';
import { buildThreeDesignScene, disposeThreeObject, RENDER_ENVIRONMENT_PRESETS } from '../utils/threeScene';

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

const applyEnvironment = (
  scene: THREE.Scene,
  ambientLight: THREE.HemisphereLight,
  sunLight: THREE.DirectionalLight,
  settings: RenderSettings
) => {
  const preset = RENDER_ENVIRONMENT_PRESETS[settings.environmentMode];

  scene.background = new THREE.Color(preset.background);
  scene.fog = new THREE.Fog(preset.fog, 18, 60);
  ambientLight.color.set(preset.ambientSky);
  ambientLight.groundColor.set(preset.ambientGround);
  ambientLight.intensity = preset.ambientIntensity;
  sunLight.color.set(preset.sunColor);
  sunLight.intensity = preset.sunIntensity;
  sunLight.position.set(...preset.sunPosition);

  if (settings.lightMode === 'warm') {
    ambientLight.color.set('#fff3df');
    ambientLight.groundColor.set('#dbc7ae');
    ambientLight.intensity += 0.18;
    sunLight.color.set('#ffd39a');
    sunLight.intensity += 0.18;
  }

  if (settings.lightMode === 'studio') {
    ambientLight.color.set('#ffffff');
    ambientLight.groundColor.set('#d9dfdd');
    ambientLight.intensity += 0.32;
    sunLight.color.set('#ffffff');
    sunLight.intensity = Math.max(1.45, sunLight.intensity - 0.25);
  }
};

const applyCameraPreset = (
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  span: number,
  cameraPreset: RenderSettings['cameraPreset']
) => {
  if (cameraPreset === 'front') {
    camera.position.set(0, span * 0.5, span * 1.36);
    controls.target.set(0, 0.95, 0);
  } else if (cameraPreset === 'corner') {
    camera.position.set(span * 0.95, span * 0.62, span * 0.95);
    controls.target.set(0, 0.95, 0);
  } else if (cameraPreset === 'top') {
    camera.position.set(0, span * 1.42, 0.001);
    controls.target.set(0, 0, 0);
  } else if (cameraPreset === 'walkthrough') {
    camera.position.set(span * 0.12, 1.65, span * 0.42);
    controls.target.set(0, 1.25, 0);
  } else {
    camera.position.set(span * 0.7, span * 0.68, span * 1.05);
    controls.target.set(0, 0.9, 0);
  }

  camera.near = 0.05;
  camera.far = Math.max(span * 8, 80);
  camera.updateProjectionMatrix();
  controls.maxDistance = Math.max(span * 2.6, 10);
  controls.minDistance = 1.2;
  controls.update();
};

const applyShadowCamera = (sunLight: THREE.DirectionalLight, span: number) => {
  const shadowCamera = sunLight.shadow.camera as THREE.OrthographicCamera;
  const half = Math.max(span * 0.95, 6);

  shadowCamera.left = -half;
  shadowCamera.right = half;
  shadowCamera.top = half;
  shadowCamera.bottom = -half;
  shadowCamera.near = 0.5;
  shadowCamera.far = Math.max(span * 3.5, 36);
  shadowCamera.updateProjectionMatrix();
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

  useImperativeHandle(
    ref,
    () => ({
      exportPng: () => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;

        if (!renderer || !scene || !camera) {
          return;
        }

        const settings = resolveRenderSettings(design);
        const size = new THREE.Vector2();
        const originalPixelRatio = renderer.getPixelRatio();
        renderer.getSize(size);
        renderer.setPixelRatio(settings.exportPixelRatio);
        renderer.setSize(size.x, size.y, false);
        renderer.render(scene, camera);
        downloadDataUrl(renderer.domElement.toDataURL('image/png'), `${design.name || '全屋设计'}-3D效果图.png`);
        renderer.setPixelRatio(originalPixelRatio);
        renderer.setSize(size.x, size.y, false);
        renderer.render(scene, camera);
      }
    }),
    [design]
  );

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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
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
    sunLight.shadow.bias = -0.00015;
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
    applyEnvironment(scene, ambientLight, sunLight, settings);
    applyShadowCamera(sunLight, span);
    applyCameraPreset(camera, controls, span, settings.cameraPreset);
  }, [design]);

  return <div className="three-viewer" ref={containerRef} />;
});
