/* ui.js
   Wires miscellaneous UI controls (fit, sliders, downloads, light toggle).
*/

import { frameModel } from './model-loader.js';

export function setupUI(){
  const layersInput = document.getElementById('layers');
  const layersVal = document.getElementById('layersVal');
  const paddingInput = document.getElementById('padding');
  const paddingVal = document.getElementById('paddingVal');
  document.getElementById('fit').addEventListener('click', ()=>{ frameModel(); });
  layersInput.addEventListener('input', ()=>{ layersVal.textContent = layersInput.value; });
  paddingInput.addEventListener('input', ()=>{ paddingVal.textContent = paddingInput.value; });

  const lightToggle = document.getElementById('lightToggle');
  if (lightToggle) {
    lightToggle.addEventListener('click', () => {
      if (!window.__draggableLight || !window.__lightHandle) return;
      const next = !window.__draggableLight.visible;
      window.__draggableLight.visible = next;
      window.__lightHandle.visible = next;
      lightToggle.style.background = next ? '#fff6e6' : '';
    });
  }

  // Download all (uses global window.__layerBlobs set by generator)
  document.getElementById('downloadAll').addEventListener('click', async () => {
    const blobs = window.__layerBlobs || [];
    if (!blobs.length) { alert('No layers ready'); return; }
    try {
      const mod = await import('jszip');
      const JSZipLib = mod.default || mod;
      const zip = new JSZipLib();
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i].blob;
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
      console.error('ZIP error', err);
      alert('Failed to create ZIP');
    }
  });

  // Download project
  document.getElementById('downloadProject').addEventListener('click', async () => {
    try {
      const files = ['index.html', 'app.js', 'style.css'];
      const mod = await import('jszip');
      const JSZipLib = mod.default || mod;
      const zip = new JSZipLib();
      await Promise.all(files.map(async (path) => {
        try {
          const res = await fetch(path, {cache: 'no-store'});
          if (!res.ok) throw new Error(`Failed to fetch ${path}`);
          const text = await res.text();
          zip.file(path, text);
        } catch (err) {
          console.warn('Could not add', path, err);
        }
      }));
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'project.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      console.error('Project ZIP error', err);
      alert('Failed to create project ZIP');
    }
  });
}