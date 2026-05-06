/* model-loader.js
   Handles model loading, centering/scaling, disposing, and framing.
   Exports: setupModelLoader(), frameModel(), getLoaded()
*/

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { scene, renderer, camera, controls } from './three-init.js';

let loaded = null;

export function setupModelLoader(){
  const fileInput = document.getElementById('file');
  fileInput.addEventListener('change', async (e)=>{
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    await loadModel(url, f.name);
    URL.revokeObjectURL(url);
  });
}

export async function loadModel(url, name){
  if (!renderer) return;
  if (loaded) {
    scene.remove(loaded);
    disposeHierarchy(loaded);
    loaded = null;
  }
  const ext = name.split('.').pop().toLowerCase();
  let obj = null;
  try {
    if (ext === 'glb' || ext === 'gltf') {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(url);
      obj = gltf.scene;
    } else if (ext === 'obj') {
      const loader = new OBJLoader();
      obj = await loader.loadAsync(url);
    } else {
      alert('Unsupported file type');
      return;
    }
  } catch (err) {
    console.error(err);
    alert('Failed to load model');
    return;
  }
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  const max = Math.max(size.x, size.y, size.z) || 1;
  const scale = 1.0 / max;
  obj.scale.setScalar(scale);
  box.setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  obj.position.sub(center);
  scene.add(obj);
  loaded = obj;
  // trigger a render
  controls.update();
  renderer.render(scene, camera);
}

export function disposeHierarchy(node){
  node.traverse(child=>{
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(m=>m.dispose());
      else child.material.dispose();
    }
  });
}

export function frameModel(){
  if (!loaded) return;
  const box = new THREE.Box3().setFromObject(loaded);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fitOffset = 1.2;
  const fov = camera.fov * (Math.PI / 180);
  let distance = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * fitOffset;
  const dir = new THREE.Vector3(0, 0, 1);
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();
  renderer.render(scene, camera);
}

export function getLoaded(){
  return loaded;
}