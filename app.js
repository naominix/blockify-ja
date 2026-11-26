import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const state = {
  file: null, fileName: '', positions: null, solid: true,
  voxels: null, dims: [0,0,0], layer: 0, layerView: false,
  block: window.BLOCKS.find(b => b.id === 'gray_wool'),
  scene: null, camera: null, renderer: null, controls: null, mesh: null,
  exportMode: 'python',
};

// ---------- file loading ----------
const dz = $('dropzone'), fi = $('file-input');
dz.addEventListener('click', () => fi.click());
dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fi.click(); });
['dragover','dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('dragover'); }));
['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('dragover'); }));
dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) setFile(f); });
fi.addEventListener('change', () => { if (fi.files[0]) setFile(fi.files[0]); });

async function setFile(file) {
  state.file = file; state.fileName = file.name;
  $('dz-text').textContent = file.name;
  $('status').textContent = 'モデルを読み込んでいます...';
  try {
    state.positions = await loadPositions(file);
    $('voxelize').disabled = false;
    $('status').textContent = `読み込み完了： ${file.name}（三角形 ${state.positions.length/9} 個）。「ボクセル化する」を押してください。`;
  } catch (err) {
    $('status').textContent = '読み込みに失敗しました： ' + (err.message || err);
  }
}

async function loadPositions(file) {
  const url = URL.createObjectURL(file);
  const ext = file.name.split('.').pop().toLowerCase();
  let root = null;
  if (ext === 'stl') root = new THREE.Mesh(await new STLLoader().loadAsync(url));
  else if (ext === 'obj') root = await new OBJLoader().loadAsync(url);
  else if (ext === 'glb' || ext === 'gltf') root = (await new GLTFLoader().loadAsync(url)).scene;
  else throw new Error('対応形式は STL / OBJ / GLB / glTF です');
  root.updateMatrixWorld(true);
  const pos = [];
  root.traverse(obj => {
    if (!obj.isMesh) return;
    const geo = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry;
    const p = geo.attributes.position;
    const m = obj.matrixWorld;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); pos.push(v.x, v.y, v.z); }
  });
  URL.revokeObjectURL(url);
  if (!pos.length) throw new Error('メッシュが見つかりませんでした');
  return new Float32Array(pos);
}

// ---------- controls ----------
$('grid-size').addEventListener('input', e => { $('grid-label').textContent = `（${e.target.value}³）`; });
$('mode-toggle').addEventListener('click', () => {
  state.solid = !state.solid;
  $('mode-toggle').textContent = state.solid ? '中身あり（SOLID）' : '中空（HOLLOW）';
  $('mode-toggle').classList.toggle('on', !state.solid);
});
$('voxelize').addEventListener('click', voxelize);

function voxelize() {
  if (!state.positions) return;
  $('voxelize').disabled = true; $('progress').hidden = false; $('progress').value = 0;
  $('status').textContent = 'ボクセル化しています（Web Worker + WebAssembly）...';
  const worker = new Worker('voxel-worker.js');
  worker.onmessage = (ev) => {
    const d = ev.data;
    if (d.type === 'progress') $('progress').value = d.value;
    if (d.type === 'error') { $('status').textContent = 'ボクセル化に失敗しました： ' + d.message; $('voxelize').disabled = false; worker.terminate(); }
    if (d.type === 'done') {
      worker.terminate();
      state.voxels = d.voxels; state.dims = d.dims; state.layer = 0;
      $('progress').hidden = true; $('voxelize').disabled = false;
      $('status').textContent = `完了： ${d.voxels.length/3} ブロック ／ ${d.dims[0]} × ${d.dims[1]} × ${d.dims[2]}${d.usedWasm ? '（WASM使用）' : '（JSフォールバック）'}`;
      $('result').hidden = false;
      renderAll();
    }
  };
  const copy = new Float32Array(state.positions);
  worker.postMessage({ positions: copy, gridSize: Number($('grid-size').value), solid: state.solid, wasmUrl: new URL('wasm/floodfill.wasm', location.href).href }, [copy.buffer]);
}

// ---------- 3D preview ----------
function initPreview() {
  if (state.renderer) return;
  const el = $('preview');
  state.scene = new THREE.Scene(); state.scene.background = new THREE.Color(0xaee3f5);
  state.camera = new THREE.PerspectiveCamera(45, el.clientWidth/el.clientHeight, 0.1, 2000);
  state.renderer = new THREE.WebGLRenderer({ antialias: true });
  state.renderer.setSize(el.clientWidth, el.clientHeight);
  el.appendChild(state.renderer.domElement);
  state.controls = new OrbitControls(state.camera, state.renderer.domElement);
  state.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(50, 80, 30); state.scene.add(dl);
  const grid = new THREE.GridHelper(200, 40, 0x888888, 0xcccccc); state.scene.add(grid);
  (function loop(){ requestAnimationFrame(loop); state.controls.update(); state.renderer.render(state.scene, state.camera); })();
}
function renderPreview() {
  initPreview();
  if (state.mesh) { state.scene.remove(state.mesh); state.mesh.dispose(); }
  const [gx, gy, gz] = state.dims;
  const list = [];
  for (let i = 0; i < state.voxels.length; i += 3) {
    if (state.layerView && state.voxels[i+1] !== state.layer) continue;
    list.push(i);
  }
  const geo = new THREE.BoxGeometry(0.96, 0.96, 0.96);
  const mat = new THREE.MeshLambertMaterial({ color: state.block.color });
  const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const m4 = new THREE.Matrix4(), edges = [];
  list.forEach((vi, n) => {
    m4.setPosition(state.voxels[vi]-gx/2+0.5, state.voxels[vi+1]+0.5, state.voxels[vi+2]-gz/2+0.5);
    inst.setMatrixAt(n, m4);
  });
  inst.count = list.length;
  state.mesh = inst; state.scene.add(inst);
  const r = Math.max(gx, gy, gz);
  state.camera.position.set(r*1.1, r*0.9, r*1.1);
  state.controls.target.set(0, gy/2, 0);
  applyZoom();
}
function applyZoom() { if (state.camera) { const z = Number($('zoom').value); state.camera.position.sub(state.controls.target).setLength(Math.max(state.dims)*1.9/Math.max(0.5,z)).add(state.controls.target); } }
$('zoom').addEventListener('input', applyZoom);
$('view-toggle').addEventListener('click', () => {
  state.layerView = !state.layerView;
  $('view-toggle').textContent = state.layerView ? 'レイヤーを表示中' : '全体を表示中';
  renderPreview();
});

// ---------- blueprint ----------
function layerVoxels(y) {
  const set = new Set();
  for (let i = 0; i < state.voxels.length; i += 3) if (state.voxels[i+1] === y) set.add(state.voxels[i+2] + ',' + state.voxels[i]);
  return set;
}
function renderBlueprint() {
  const [gx, gy, gz] = state.dims;
  const cv = $('blueprint'), ctx = cv.getContext('2d');
  const cell = Math.max(4, Math.floor(Math.min(cv.width/gx, cv.height/gz)));
  cv.width = gx*cell; cv.height = gz*cell;
  const set = layerVoxels(state.layer);
  ctx.fillStyle = '#444'; ctx.fillRect(0,0,cv.width,cv.height);
  ctx.fillStyle = state.block.color;
  for (let z = 0; z < gz; z++) for (let x = 0; x < gx; x++) if (set.has(z+','+x)) ctx.fillRect(x*cell+0.5, z*cell+0.5, cell-1, cell-1);
  cv.title = state.block.ja;
  $('layer-badge').textContent = 'L' + (state.layer+1);
  $('layer-title').textContent = 'レイヤー ' + (state.layer+1);
  $('layer-count').textContent = (state.layer+1) + ' / ' + gy;
  $('prev-layer').disabled = state.layer <= 0;
  $('next-layer').disabled = state.layer >= gy-1;
}
$('blueprint').addEventListener('mousemove', e => {
  const cv = $('blueprint'), r = cv.getBoundingClientRect();
  const [gx, , gz] = state.dims;
  const x = Math.floor((e.clientX-r.left)/r.width*gx), z = Math.floor((e.clientY-r.top)/r.height*gz);
  cv.title = layerVoxels(state.layer).has(z+','+x) ? `${state.block.ja}（${state.block.en}） X:${x} Z:${z}` : '';
});
$('prev-layer').addEventListener('click', () => { state.layer--; renderBlueprint(); if (state.layerView) renderPreview(); });
$('next-layer').addEventListener('click', () => { state.layer++; renderBlueprint(); if (state.layerView) renderPreview(); });
$('print-btn').addEventListener('click', () => window.print());

// ---------- inventory / material ----------
function renderInventory() {
  $('inventory').innerHTML = '';
  const row = document.createElement('div'); row.className = 'inv-row';
  row.innerHTML = `<span class="swatch" style="background:${state.block.color}"></span><strong>${state.block.ja}</strong><span>${state.block.en}</span><span>× ${state.voxels.length/3}</span>`;
  const btn = document.createElement('button'); btn.type='button'; btn.textContent = '✏ 素材を変更'; btn.title = 'ブロックを変更';
  btn.addEventListener('click', () => { $('material-modal').hidden = false; renderMaterialList(''); });
  row.appendChild(btn); $('inventory').appendChild(row);
}
function renderMaterialList(q) {
  const list = $('material-list'); list.innerHTML = '';
  const query = q.trim().toLowerCase();
  window.BLOCKS.filter(b => !query || b.en.toLowerCase().includes(query) || b.ja.includes(q) || b.id.includes(query)).forEach(b => {
    const btn = document.createElement('button'); btn.type='button';
    btn.innerHTML = `<span class="swatch" style="background:${b.color}"></span><span>${b.ja}<br><small>${b.en.toUpperCase()}</small></span>`;
    btn.addEventListener('click', () => { state.block = b; $('material-modal').hidden = true; renderAll(); });
    list.appendChild(btn);
  });
}
$('material-search').addEventListener('input', e => renderMaterialList(e.target.value));
document.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', () => { b.closest('.modal').hidden = true; }));

function renderAll() { renderPreview(); renderBlueprint(); renderInventory(); }

// ---------- export ----------
function pythonScript() {
  const id = state.block.id, v = state.voxels;
  const chunks = [];
  // original互換: 各ボクセルを X,Y,Z,blockIdx の数値列としてチャンク化（可読性のためCSV形式で出力）
  const lines = [];
  for (let i = 0; i < v.length; i += 3) lines.push(`${v[i]},${v[i+1]},${v[i+2]},0`);
  return `# Blockify Generated Script (Robust v5 - Fixed Offset) - 日本語版
# ファイル: ${state.fileName}
palette = ["${id}"]
data = """${lines.join(';')}"""
off_x, off_z = 16, 16
def build_model():
    anchor = positions.add(player.position(), pos(0, 0, 10))
    for entry in data.split(";"):
        if not entry: continue
        x, y, z, b = entry.split(",")
        blocks.place(blocks.block_by_name(palette[int(b)]), positions.add(anchor, pos(int(x), int(y), int(z))))
player.on_chat("build", build_model)
player.say("Data loaded! Type 'build' in chat.")
# データ読み込み完了。チャットで build と打つと建築します。`;
}
function mcCommands() {
  const id = state.block.id, v = state.voxels, out = [];
  for (let i = 0; i < v.length; i += 3) out.push(`setblock ~${v[i]} ~${v[i+1]} ~${v[i+2]} ${id}`);
  return out.join('\n');
}
function refreshExport() { $('export-text').value = state.exportMode === 'python' ? pythonScript() : mcCommands(); }
function openExport(mode) { state.exportMode = mode; $('tab-python').classList.toggle('active', mode==='python'); $('tab-commands').classList.toggle('active', mode==='commands'); $('export-modal').hidden = false; refreshExport(); }
$('open-export').addEventListener('click', () => openExport('python'));
$('open-export2').addEventListener('click', () => openExport('commands'));
$('tab-python').addEventListener('click', () => openExport('python'));
$('tab-commands').addEventListener('click', () => openExport('commands'));
$('copy-export').addEventListener('click', async () => { await navigator.clipboard.writeText($('export-text').value); $('copy-export').textContent = 'コピーしました'; setTimeout(()=>$('copy-export').textContent='クリップボードにコピー', 1500); });

$('download-json').addEventListener('click', () => {
  const data = { file: state.fileName, dims: state.dims, block: state.block.id, count: state.voxels.length/3, voxels: Array.from(state.voxels) };
  download(new Blob([JSON.stringify(data)], {type:'application/json'}), state.fileName.replace(/\.[^.]+$/,'') + '_voxels.json');
});
$('download-pdf').addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const base = state.fileName.replace(/\.[^.]+$/,'');
  doc.setFontSize(16); doc.text(`BLOCKIFY BLUEPRINT: ${state.fileName.toUpperCase()}`, 10, 15);
  doc.text(`TOTAL LAYERS: ${state.dims[1]}`, 10, 25);
  doc.text('MATERIALS REQUIRED:', 10, 35);
  doc.text(`- ${state.block.en}: ${state.voxels.length/3}`, 14, 45);
  // 各レイヤーの設計図ページ
  const [gx, gy, gz] = state.dims;
  const cell = Math.min(170/gx, 240/gz);
  for (let y = 0; y < gy; y++) {
    doc.addPage(); doc.setFontSize(14); doc.text(`LAYER ${y+1} / ${gy}`, 10, 15);
    const set = layerVoxels(y);
    const rgb = [parseInt(state.block.color.slice(1,3),16), parseInt(state.block.color.slice(3,5),16), parseInt(state.block.color.slice(5,7),16)];
    for (let z = 0; z < gz; z++) for (let x = 0; x < gx; x++) {
      if (set.has(z+','+x)) doc.setFillColor(...rgb); else doc.setFillColor(70,70,70);
      doc.rect(10+x*cell, 20+z*cell, Math.max(0.6,cell-0.2), Math.max(0.6,cell-0.2), 'F');
    }
  }
  doc.save(base + '_blueprint.pdf');
});
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 2000); }
