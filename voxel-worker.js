// ボクセル化ワーカー: 三角形→表面ボクセル化 + WASM外側フラッドフィルで中身判定
// WASMが使えない環境ではJS実装に自動フォールバックする

function triBoxOverlap(cx, cy, cz, verts) {
  // Akenine-Möller triangle-box overlap test, box half size = 0.5, center (cx,cy,cz)
  const v = verts.map(p => [p[0]-cx, p[1]-cy, p[2]-cz]);
  const e = [
    [v[1][0]-v[0][0], v[1][1]-v[0][1], v[1][2]-v[0][2]],
    [v[2][0]-v[1][0], v[2][1]-v[1][1], v[2][2]-v[1][2]],
    [v[0][0]-v[2][0], v[0][1]-v[2][1], v[0][2]-v[2][2]],
  ];
  const fex = Math.abs(e[0][0]), fey = Math.abs(e[0][1]), fez = Math.abs(e[0][2]);
  // cross(e0, axis) tests (9 tests) - compact implementation
  function axisTest(a, b, fa, fb, p0, p2, q0, q2) {
    const min = Math.min(a*p0 + b*q0, a*p2 + b*q2), max = Math.max(a*p0 + b*q0, a*p2 + b*q2);
    const rad = fa + fb;
    return !(min > rad || max < -rad);
  }
  // e0 x X/Y/Z etc. Use standard set:
  // AXISTEST_X01, Y02, Z12, X2, Y1, Z0 patterns expanded manually per edge
  const tests = [
    // edge 0
    () => axisTest(e[0][2], -e[0][1], fez, fey, v[0][1], v[2][1], v[0][2], v[2][2]),
    () => axisTest(-e[0][2], e[0][0], fez, fex, v[0][0], v[2][0], v[0][2], v[2][2]),
    () => axisTest(e[0][1], -e[0][0], fey, fex, v[1][0], v[2][0], v[1][1], v[2][1]),
    // edge 1
    () => axisTest(e[1][2], -e[1][1], Math.abs(e[1][2]), Math.abs(e[1][1]), v[0][1], v[2][1], v[0][2], v[2][2]),
    () => axisTest(-e[1][2], e[1][0], Math.abs(e[1][2]), Math.abs(e[1][0]), v[0][0], v[2][0], v[0][2], v[2][2]),
    () => axisTest(e[1][1], -e[1][0], Math.abs(e[1][1]), Math.abs(e[1][0]), v[0][0], v[1][0], v[0][1], v[1][1]),
    // edge 2
    () => axisTest(e[2][2], -e[2][1], Math.abs(e[2][2]), Math.abs(e[2][1]), v[0][1], v[1][1], v[0][2], v[1][2]),
    () => axisTest(-e[2][2], e[2][0], Math.abs(e[2][2]), Math.abs(e[2][0]), v[0][0], v[1][0], v[0][2], v[1][2]),
    () => axisTest(e[2][1], -e[2][0], Math.abs(e[2][1]), Math.abs(e[2][0]), v[1][0], v[2][0], v[1][1], v[2][1]),
  ];
  for (const t of tests) if (!t()) return false;
  // box axes: min/max per axis within [-0.5,0.5]
  for (let a = 0; a < 3; a++) {
    const mn = Math.min(v[0][a], v[1][a], v[2][a]), mx = Math.max(v[0][a], v[1][a], v[2][a]);
    if (mn > 0.5 || mx < -0.5) return false;
  }
  // triangle plane vs box
  const n = [
    e[0][1]*e[1][2] - e[0][2]*e[1][1],
    e[0][2]*e[1][0] - e[0][0]*e[1][2],
    e[0][0]*e[1][1] - e[0][1]*e[1][0],
  ];
  const s = -(n[0]*v[0][0] + n[1]*v[0][1] + n[2]*v[0][2]);
  const r = 0.5 * (Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]));
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
    const gx = Math.max(1, Math.round(sx*scale)), gy = Math.max(1, Math.round(sy*scale)), gz = Math.max(1, Math.round(sz*scale));
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
