// ボクセル化ワーカー: 三角形→表面ボクセル化 + WASM外側フラッドフィルで中身判定
// WASMが使えない環境ではJS実装に自動フォールバックする

function triBoxOverlap(cx, cy, cz, verts) {
  // Akenine-Möller triangle-box overlap test (tribox3.c の標準形に忠実に実装)
  // box half size = 0.5, center (cx,cy,cz)
  const v = verts.map(p => [p[0]-cx, p[1]-cy, p[2]-cz]);
  const [v0, v1, v2] = v;
  const e = [
    [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]],
    [v2[0]-v1[0], v2[1]-v1[1], v2[2]-v1[2]],
    [v0[0]-v2[0], v0[1]-v2[1], v0[2]-v2[2]],
  ];
  const fe = e.map(ed => [Math.abs(ed[0]), Math.abs(ed[1]), Math.abs(ed[2])]);
  const H = 0.5;
  function axis(pA, pB, rad) {
    const min = Math.min(pA, pB), max = Math.max(pA, pB);
    return !(min > rad || max < -rad);
  }
  const [e0, e1, e2] = e, [f0, f1, f2] = fe;
  // edge 0: X01, Y02, Z12
  if (!axis(e0[2]*v0[1] - e0[1]*v0[2], e0[2]*v2[1] - e0[1]*v2[2], f0[2]*H + f0[1]*H)) return false;
  if (!axis(-e0[2]*v0[0] + e0[0]*v0[2], -e0[2]*v2[0] + e0[0]*v2[2], f0[2]*H + f0[0]*H)) return false;
  if (!axis(e0[1]*v1[0] - e0[0]*v1[1], e0[1]*v2[0] - e0[0]*v2[1], f0[1]*H + f0[0]*H)) return false;
  // edge 1: X01, Y02, Z0
  if (!axis(e1[2]*v0[1] - e1[1]*v0[2], e1[2]*v2[1] - e1[1]*v2[2], f1[2]*H + f1[1]*H)) return false;
  if (!axis(-e1[2]*v0[0] + e1[0]*v0[2], -e1[2]*v2[0] + e1[0]*v2[2], f1[2]*H + f1[0]*H)) return false;
  if (!axis(e1[1]*v0[0] - e1[0]*v0[1], e1[1]*v1[0] - e1[0]*v1[1], f1[1]*H + f1[0]*H)) return false;
  // edge 2: X2, Y1, Z12
  if (!axis(e2[2]*v0[1] - e2[1]*v0[2], e2[2]*v1[1] - e2[1]*v1[2], f2[2]*H + f2[1]*H)) return false;
  if (!axis(-e2[2]*v0[0] + e2[0]*v0[2], -e2[2]*v1[0] + e2[0]*v1[2], f2[2]*H + f2[0]*H)) return false;
  if (!axis(e2[1]*v1[0] - e2[0]*v1[1], e2[1]*v2[0] - e2[0]*v2[1], f2[1]*H + f2[0]*H)) return false;
  // box axes
  for (let a = 0; a < 3; a++) {
    const mn = Math.min(v0[a], v1[a], v2[a]), mx = Math.max(v0[a], v1[a], v2[a]);
    if (mn > H || mx < -H) return false;
  }
  // triangle plane vs box: |n·v0| <= H*(|nx|+|ny|+|nz|)
  const n = [
    e0[1]*e1[2] - e0[2]*e1[1],
    e0[2]*e1[0] - e0[0]*e1[2],
    e0[0]*e1[1] - e0[1]*e1[0],
  ];
  const s = n[0]*v0[0] + n[1]*v0[1] + n[2]*v0[2];
  const r = H * (Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]));
  return Math.abs(s) <= r;
}

function jsFloodOutside(grid, gx, gy, gz) {
  const plane = gx * gz;
  const q = new Int32Array(grid.length); let head = 0, tail = 0;
  if (grid[0] !== 0) return;
  grid[0] = 2; q[tail++] = 0;
  while (head < tail) {
    const idx = q[head++];
    const y = Math.floor(idx / plane), rem = idx % plane, z = Math.floor(rem / gx), x = rem % gx;
    const nb = [];
    if (x > 0) nb.push(idx-1); if (x < gx-1) nb.push(idx+1);
    if (z > 0) nb.push(idx-gx); if (z < gz-1) nb.push(idx+gx);
    if (y > 0) nb.push(idx-plane); if (y < gy-1) nb.push(idx+plane);
    for (const n of nb) if (grid[n] === 0) { grid[n] = 2; q[tail++] = n; }
  }
}

const WASM_B64 = "AGFzbQEAAAABCQFgBH9/f38BfwMCAQAFAwEAAQcaAgZtZW1vcnkCAA1mbG9vZF9vdXRzaWRlAAAK4AMB3QMBC38gACACbCEMIAwgAWwhBEEALQAABEBBAA8LQQBBAjoAACADQQA2AgBBACEFQQEhBkEBIQ0CQANAIAUgBk8NASADIAVBBGxqKAIAIQcgBUEBaiEFIAcgDG4hCSAHIAxwIQsgCyAAbiEKIAsgAHAhCCAIQQBLBEAgB0EBayEOIA4tAABFBEAgDkECOgAAIAMgBkEEbGogDjYCACAGQQFqIQYgDUEBaiENCwsgCCAAQQFrSQRAIAdBAWohDiAOLQAARQRAIA5BAjoAACADIAZBBGxqIA42AgAgBkEBaiEGIA1BAWohDQsLIApBAEsEQCAHIABrIQ4gDi0AAEUEQCAOQQI6AAAgAyAGQQRsaiAONgIAIAZBAWohBiANQQFqIQ0LCyAKIAJBAWtJBEAgByAAaiEOIA4tAABFBEAgDkECOgAAIAMgBkEEbGogDjYCACAGQQFqIQYgDUEBaiENCwsgCUEASwRAIAcgDGshDiAOLQAARQRAIA5BAjoAACADIAZBBGxqIA42AgAgBkEBaiEGIA1BAWohDQsLIAkgAUEBa0kEQCAHIAxqIQ4gDi0AAEUEQCAOQQI6AAAgAyAGQQRsaiAONgIAIAZBAWohBiANQQFqIQ0LCwwACwsgDQs=";
async function wasmFloodOutside(grid, gx, gy, gz, wasmUrl) {
  // WASMはBase64埋め込み（GitHub Pages／テキストpush対応）。外部ファイル取得は不要
  const bin = Uint8Array.from(atob(WASM_B64), c => c.charCodeAt(0));
  const { instance } = await WebAssembly.instantiate(bin.buffer, {});
  const { memory, flood_outside } = instance.exports;
  const total = grid.length, qoff = total + 16, needed = qoff + total * 4;
  const pages = Math.ceil(needed / 65536), cur = memory.buffer.byteLength / 65536;
  if (pages > cur) memory.grow(pages - cur);
  new Uint8Array(memory.buffer, 0, total).set(grid);
  flood_outside(gx, gy, gz, qoff);
  grid.set(new Uint8Array(memory.buffer, 0, total));
  return true;
}

self.onmessage = async (ev) => {
  const { positions, gridSize, solid, wasmUrl } = ev.data;
  try {
    const triCount = positions.length / 9;
    let minX=1e9,minY=1e9,minZ=1e9,maxX=-1e9,maxY=-1e9,maxZ=-1e9;
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i]<minX)minX=positions[i]; if (positions[i]>maxX)maxX=positions[i];
      if (positions[i+1]<minY)minY=positions[i+1]; if (positions[i+1]>maxY)maxY=positions[i+1];
      if (positions[i+2]<minZ)minZ=positions[i+2]; if (positions[i+2]>maxZ)maxZ=positions[i+2];
    }
    const sx = maxX-minX || 1, sy = maxY-minY || 1, sz = maxZ-minZ || 1;
    const scale = gridSize / Math.max(sx, sy, sz);
    // 切り上げでないと、最大面側の薄い層がグリッド外に落ちて壁に穴が開く（roundは不可）
    const gx = Math.max(1, Math.ceil(sx*scale - 1e-9)), gy = Math.max(1, Math.ceil(sy*scale - 1e-9)), gz = Math.max(1, Math.ceil(sz*scale - 1e-9));
    const px = gx+2, py = gy+2, pz = gz+2;
    const grid = new Uint8Array(px*py*pz);
    const pIdx = (x,y,z) => ((y+1)*pz + (z+1))*px + (x+1);
    // surface voxelization: world -> voxel coords: (p-min)*scale - 0.5 (voxel centers at integers)
    for (let t = 0; t < triCount; t++) {
      const verts = [];
      for (let k = 0; k < 3; k++) {
        const o = t*9 + k*3;
        verts.push([(positions[o]-minX)*scale - 0.5, (positions[o+1]-minY)*scale - 0.5, (positions[o+2]-minZ)*scale - 0.5]);
      }
      const mnx = Math.max(0, Math.floor(Math.min(verts[0][0],verts[1][0],verts[2][0]))), mxx = Math.min(gx-1, Math.ceil(Math.max(verts[0][0],verts[1][0],verts[2][0])));
      const mny = Math.max(0, Math.floor(Math.min(verts[0][1],verts[1][1],verts[2][1]))), mxy = Math.min(gy-1, Math.ceil(Math.max(verts[0][1],verts[1][1],verts[2][1])));
      const mnz = Math.max(0, Math.floor(Math.min(verts[0][2],verts[1][2],verts[2][2]))), mxz = Math.min(gz-1, Math.ceil(Math.max(verts[0][2],verts[1][2],verts[2][2])));
      for (let y = mny; y <= mxy; y++) for (let z = mnz; z <= mxz; z++) for (let x = mnx; x <= mxx; x++) {
        if (triBoxOverlap(x, y, z, verts)) grid[pIdx(x,y,z)] = 1;
      }
      if (t % 2000 === 0) self.postMessage({ type: 'progress', value: Math.round(t/triCount*80) });
    }
    let usedWasm = false;
    if (solid) {
      self.postMessage({ type: 'progress', value: 85 });
      try { await wasmFloodOutside(grid, px, py, pz, wasmUrl); usedWasm = true; }
      catch (e) { jsFloodOutside(grid, px, py, pz); }
      // interior (still 0 in padded grid, excluding padding) becomes solid
      for (let y = 0; y < gy; y++) for (let z = 0; z < gz; z++) for (let x = 0; x < gx; x++) {
        const i = pIdx(x,y,z); if (grid[i] === 0) grid[i] = 1;
      }
    }
    const voxels = [];
    for (let y = 0; y < gy; y++) for (let z = 0; z < gz; z++) for (let x = 0; x < gx; x++) {
      if (grid[pIdx(x,y,z)] === 1) voxels.push(x, y, z);
    }
    self.postMessage({ type: 'progress', value: 100 });
    self.postMessage({ type: 'done', voxels: new Int32Array(voxels), dims: [gx, gy, gz], usedWasm, triCount });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
