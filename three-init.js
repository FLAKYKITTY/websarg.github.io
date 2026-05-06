/* three-init.js
   Initializes Three.js renderer, scene, camera, controls and light handle dragging.
   Exports: initThree(), animateOnce(), renderer, scene, camera, controls, fitSize
*/

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export let renderer, scene, camera, controls;

const canvas = document.getElementById('glcanvas');

let dpr = Math.max(1, window.devicePixelRatio || 1);

export function initThree(){
  renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true, alpha: true, antialias: true });
  renderer.setPixelRatio(dpr);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.setClearColor(0x000000, 0); // transparent
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
  camera.position.set(0, 0.8, 2.2);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  window.addEventListener('resize', fitSize);
  fitSize();
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(1, 2, 3);
  scene.add(dir);

  // draggable point light and visual handle
  window.__draggableLight = new THREE.PointLight(0xfff1d6, 1.2, 10);
  window.__draggableLight.position.set(0.6, 1.2, 1.0);
  window.__draggableLight.visible = false;
  scene.add(window.__draggableLight);

  const sphereGeo = new THREE.SphereGeometry(0.03, 12, 8);
  const sphereMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6 });
  window.__lightHandle = new THREE.Mesh(sphereGeo, sphereMat);
  window.__lightHandle.position.copy(window.__draggableLight.position);
  window.__lightHandle.visible = false;
  scene.add(window.__lightHandle);

  window.__lightDrag = { active: false, offset: new THREE.Vector3(), distance: 0 };

  // pointer drag helpers attached to the canvas
  const plane = new THREE.Plane();
  const ray = new THREE.Raycaster();

  function pointerToWorld(event, targetDistance) {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera({ x, y }, camera);
    const origin = ray.ray.origin;
    const dir = ray.ray.direction;
    const camPos = camera.position;
    const toOrigin = origin.clone().sub(camPos);
    const a = dir.dot(dir);
    const b = 2 * dir.dot(toOrigin);
    const c = toOrigin.dot(toOrigin) - (targetDistance * targetDistance);
    const disc = b * b - 4 * a * c;
    let t;
    if (disc >= 0) {
      const r1 = (-b - Math.sqrt(disc)) / (2 * a);
      const r2 = (-b + Math.sqrt(disc)) / (2 * a);
      t = Math.min(r1, r2);
      if (t < 0) t = Math.max(r1, r2);
      if (t < 0) t = null;
    } else {
      t = null;
    }
    if (t === null) {
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const planePoint = camera.position.clone().add(camDir.multiplyScalar(targetDistance));
      plane.setFromNormalAndCoplanarPoint(camDir, planePoint);
      const intersect = ray.ray.intersectPlane(plane, new THREE.Vector3());
      return intersect || null;
    } else {
      return origin.clone().add(dir.clone().multiplyScalar(t));
    }
  }

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (ev) => {
    if (!window.__draggableLight || !window.__lightHandle || !window.__lightHandle.visible) return;
    const rect = canvas.getBoundingClientRect();
    const projected = window.__lightHandle.position.clone().project(camera);
    const sx = (projected.x * 0.5 + 0.5) * rect.width + rect.left;
    const sy = (-projected.y * 0.5 + 0.5) * rect.height + rect.top;
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    const distSq = dx * dx + dy * dy;
    const threshold = 36;
    if (distSq <= threshold * (window.devicePixelRatio || 1)) {
      ev.preventDefault();
      window.__lightDrag.active = true;
      window.__lightDrag.distance = camera.position.distanceTo(window.__lightHandle.position);
      const worldPoint = pointerToWorld(ev, window.__lightDrag.distance);
      if (worldPoint) {
        window.__lightDrag.offset.copy(worldPoint).sub(window.__lightHandle.position);
      } else {
        window.__lightDrag.offset.set(0,0,0);
      }
    }
  });
  window.addEventListener('pointermove', (ev) => {
    if (!window.__lightDrag.active) return;
    ev.preventDefault();
    const worldPoint = pointerToWorld(ev, window.__lightDrag.distance);
    if (!worldPoint) return;
    const target = worldPoint.clone().sub(window.__lightDrag.offset);
    window.__lightHandle.position.copy(target);
    window.__draggableLight.position.copy(target);
  });
  window.addEventListener('pointerup', () => {
    if (window.__lightDrag.active) window.__lightDrag.active = false;
  });
}

export function fitSize(){
  dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  renderer.setPixelRatio(dpr);
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

// lightweight renderer tick
export function animateOnce(){
  if (controls && renderer && scene && camera) {
    controls.update();
    renderer.render(scene, camera);
  }
}