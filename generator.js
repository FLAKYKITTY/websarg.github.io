/* generator.js
   Contains generateLayers logic moved out of the main file.
   Exports: setupGenerator() which wires the Generate button to the worker function.
*/

import * as THREE from 'three';
import { scene, renderer, camera } from './three-init.js';
import { getLoaded } from './model-loader.js';

export function setupGenerator(){
  document.getElementById('generate').addEventListener('click', generateLayers);
  // wire the ZIP button already in original code to use window.__layerBlobs
}

async function generateLayers(){
  const loaded = getLoaded();
  const canvas = document.getElementById('glcanvas');
  const preview = document.getElementById('overlayPreview');
  if (!loaded) { alert('Load a model first'); return; }
  // ensure a render before slicing
  renderer.render(scene, camera);
  const layersInput = document.getElementById('layers');
  const paddingInput = document.getElementById('padding');
  const layers = Number(layersInput.value);
  const padding = Number(paddingInput.value);
  const rect = canvas.getBoundingClientRect();

  const box = new THREE.Box3().setFromObject(loaded);
  const size = box.getSize(new THREE.Vector3());
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z)
  ];

  let minDepth = Infinity, maxDepth = -Infinity;
  const invMat = camera.matrixWorldInverse;
  const tmpV = new THREE.Vector3();
  corners.forEach(c => {
    tmpV.copy(c).applyMatrix4(invMat);
    const depth = -tmpV.z;
    minDepth = Math.min(minDepth, depth);
    maxDepth = Math.max(maxDepth, depth);
  });
  if (!isFinite(minDepth) || !isFinite(maxDepth)) { minDepth = 0; maxDepth = 1; }

  const results = [];
  const tmpCanvas = document.createElement('canvas');
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  tmpCanvas.width = Math.max(1, Math.round(rect.width * dpr));
  tmpCanvas.height = Math.max(1, Math.round(rect.height * dpr));
  const tmpCtx = tmpCanvas.getContext('2d');

  renderer.localClippingEnabled = true;
  const viewDir = new THREE.Vector3();
  camera.getWorldDirection(viewDir);

  for (let i = 0; i < layers; i++){
    const t0 = i / layers;
    const t1 = (i + 1) / layers;
    const nearDepth = THREE.MathUtils.lerp(minDepth, maxDepth, t0);
    const farDepth = THREE.MathUtils.lerp(minDepth, maxDepth, t1);
    const planeNearPos = camera.position.clone().add(viewDir.clone().multiplyScalar(nearDepth));
    const planeFarPos = camera.position.clone().add(viewDir.clone().multiplyScalar(farDepth));
    const planeNear = new THREE.Plane().setFromNormalAndCoplanarPoint(viewDir.clone(), planeNearPos);
    const planeFar = new THREE.Plane().setFromNormalAndCoplanarPoint(viewDir.clone().negate(), planeFarPos);
    renderer.clippingPlanes = [planeNear, planeFar];
    renderer.render(scene, camera);
    tmpCtx.clearRect(0,0,tmpCanvas.width, tmpCanvas.height);
    tmpCtx.drawImage(canvas, 0, 0, tmpCanvas.width, tmpCanvas.height);
    const padded = document.createElement('canvas');
    const pad = Math.round(padding * dpr);
    padded.width = tmpCanvas.width + pad * 2;
    padded.height = tmpCanvas.height + pad * 2;
    const pctx = padded.getContext('2d');
    pctx.clearRect(0,0,padded.width,padded.height);
    pctx.drawImage(tmpCanvas, pad, pad);
    const blob = await new Promise(res=>padded.toBlob(res,'image/png'));
    results.push({blob, index:i});
  }

  renderer.clippingPlanes = [];
  // build preview overlay and thumbnails
  preview.innerHTML = '';
  preview.style.pointerEvents = 'none';
  const thumbsContainer = document.getElementById('thumbnails');
  if (thumbsContainer) thumbsContainer.innerHTML = '';
  for (let i = 0; i < results.length; i++){
    const url = URL.createObjectURL(results[i].blob);
    const img = document.createElement('img');
    img.src = url;
    img.style.position = 'absolute';
    img.style.left = '0';
    img.style.top = '0';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.mixBlendMode = 'normal';
    img.style.opacity = 1;
    img.dataset.layerIndex = String(i);
    preview.appendChild(img);

    if (thumbsContainer) {
      const btn = document.createElement('button');
      btn.className = 'thumb-toggle';
      btn.title = `Toggle layer ${i}`;
      const timg = document.createElement('img');
      timg.src = url;
      timg.alt = `Layer ${i}`;
      timg.dataset.layerIndex = String(i);
      btn.appendChild(timg);
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const idx = Number(timg.dataset.layerIndex);
        const previewImg = preview.querySelector(`img[data-layer-index="${idx}"]`);
        if (!previewImg) return;
        const hidden = previewImg.style.opacity === '0' || previewImg.classList.contains('dimmed');
        if (hidden) {
          previewImg.style.opacity = '1';
          timg.classList.remove('dimmed');
        } else {
          previewImg.style.opacity = '0';
          timg.classList.add('dimmed');
        }
      });
      btn.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        const a = document.createElement('a');
        a.href = url;
        a.download = `layer_${String(i).padStart(2,'0')}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
      thumbsContainer.appendChild(btn);
    }
  }

  window.__layerBlobs = results;

  // auto ZIP (best-effort)
  (async () => {
    try {
      const mod = await import('jszip');
      const JSZipLib = mod.default || mod;
      const zip = new JSZipLib();
      for (let i = 0; i < results.length; i++) {
        const b = results[i].blob;
        zip.file(`layer_${String(i).padStart(2,'0')}.png`, b);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'layers.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      console.error('Auto-ZIP error', err);
    }
  })();
}