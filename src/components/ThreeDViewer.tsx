import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DesignDocument } from '../types';
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

export default forwardRef<ThreeDViewerHandle, ThreeDViewerProps>(function ThreeDViewer({ design }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const designGroupRef = useRef<THREE.Group | null>(null);

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

    const sunLight = new THREE.DirectionalLight('#ffffff', 2.2);
    sunLight.position.set(5, 8, 6);
    sunLight.castShadow = true;
    scene.add(sunLight);

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

    if (!scene || !camera || !controls) {
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
    camera.position.set(span * 0.7, span * 0.68, span * 1.05);
    camera.near = 0.05;
    camera.far = Math.max(span * 8, 60);
    camera.updateProjectionMatrix();
    controls.target.set(0, 0.9, 0);
    controls.update();
  }, [design]);

  return <div className="three-viewer" ref={containerRef} />;
});
