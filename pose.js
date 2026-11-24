// Rahmen-Pose aus ALLEN erkannten Markerecken gemeinsam (Homographie + Gauss-Newton),
// automatische Brennweitenschätzung und One-Euro-Filter.  Keine Abhängigkeiten.
(function (root) {
  'use strict';
  // ---------- kleine Lineare Algebra ----------
  function solve(A, b) { // Gauss mit Pivot, A n×n
    const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      const d = M[c][c]; if (Math.abs(d) < 1e-12) return null;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[n] / r[i]);
  }
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => Math.hypot(a[0], a[1], a[2]);
  function rodrigues(w) {
    const th = norm(w); if (th < 1e-12) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const k = w.map((x) => x / th), c = Math.cos(th), s = Math.sin(th), v = 1 - c;
    return [[c + k[0] * k[0] * v, k[0] * k[1] * v - k[2] * s, k[0] * k[2] * v + k[1] * s],
            [k[1] * k[0] * v + k[2] * s, c + k[1] * k[1] * v, k[1] * k[2] * v - k[0] * s],
            [k[2] * k[0] * v - k[1] * s, k[2] * k[1] * v + k[0] * s, c + k[2] * k[2] * v]];
  }
  const mul3 = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  function orthonormal(R) { // polare Zerlegung iterativ
    for (let it = 0; it < 8; it++) {
      const c0 = [R[0][0], R[1][0], R[2][0]], c1 = [R[0][1], R[1][1], R[2][1]], c2 = [R[0][2], R[1][2], R[2][2]];
      const inv = [cross(c1, c2), cross(c2, c0), cross(c0, c1)]; // Zeilen = Spalten von R^-T * det
      const det = c0[0] * inv[0][0] + c0[1] * inv[0][1] + c0[2] * inv[0][2];
      R = R.map((r, i) => r.map((x, j) => 0.5 * (x + inv[j][i] / det)));
    }
    return R;
  }
  // ---------- Homographie (DLT, normalisiert) ----------
  function homography(src, dst) {
    const nrm = (P) => {
      const n = P.length, mx = P.reduce((s, p) => s + p[0], 0) / n, my = P.reduce((s, p) => s + p[1], 0) / n;
      const d = P.reduce((s, p) => s + Math.hypot(p[0] - mx, p[1] - my), 0) / n || 1, k = Math.SQRT2 / d;
      return { T: [[k, 0, -k * mx], [0, k, -k * my], [0, 0, 1]], P: P.map((p) => [k * (p[0] - mx), k * (p[1] - my)]) };
    };
    const a = nrm(src), b = nrm(dst);
    // h33 = 1, Normalgleichungen 8×8
    const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0)), Atb = new Array(8).fill(0);
    for (let i = 0; i < src.length; i++) {
      const [x, y] = a.P[i], [u, v] = b.P[i];
      const rows = [[x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]];
      for (const r of rows) for (let j = 0; j < 8; j++) { Atb[j] += r[j] * r[8]; for (let k = 0; k < 8; k++) AtA[j][k] += r[j] * r[k]; }
    }
    const h = solve(AtA, Atb); if (!h) return null;
    const Hn = [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
    const Tbi = [[1 / b.T[0][0], 0, -b.T[0][2] / b.T[0][0]], [0, 1 / b.T[1][1], -b.T[1][2] / b.T[1][1]], [0, 0, 1]];
    return mul3(mul3(Tbi, Hn), a.T);
  }
  // Brennweite aus einer Homographie (Hauptpunkt in der Bildmitte, quadratische Pixel)
  function focalFromH(H) {
    const s = 1 / Math.hypot(H[2][0], H[2][1], H[2][2]) || 1;
    const h = H.map((r) => r.map((x) => x * s));
    const a1 = h[0][0] * h[0][1] + h[1][0] * h[1][1], c1 = h[2][0] * h[2][1];
    const a2 = h[0][0] ** 2 + h[1][0] ** 2 - h[0][1] ** 2 - h[1][1] ** 2, c2 = h[2][0] ** 2 - h[2][1] ** 2;
    const den = c1 * c1 + c2 * c2; if (den < 1e-14) return null;
    const f2 = -(a1 * c1 + a2 * c2) / den; return f2 > 0 ? Math.sqrt(f2) : null;
  }
  // ---------- Pose ----------
  function project(R, t, f, X) {
    const xc = R[0][0] * X[0] + R[0][1] * X[1] + t[0], yc = R[1][0] * X[0] + R[1][1] * X[1] + t[1], zc = R[2][0] * X[0] + R[2][1] * X[1] + t[2];
    return [f * xc / zc, f * yc / zc];
  }
  function rms(R, t, f, src, dst) {
    let e = 0; for (let i = 0; i < src.length; i++) { const p = project(R, t, f, src[i]); e += (p[0] - dst[i][0]) ** 2 + (p[1] - dst[i][1]) ** 2; }
    return Math.sqrt(e / src.length);
  }
  // src: Punkte auf dem Rahmen [x,y] in mm; dst: Bildpunkte [u,v] in px relativ zur Bildmitte (v nach unten)
  function estimate(src, dst, f) {
    const H = homography(src, dst); if (!H) return null;
    const Ki = (c) => [c[0] / f, c[1] / f, c[2]];
    const b1 = Ki([H[0][0], H[1][0], H[2][0]]), b2 = Ki([H[0][1], H[1][1], H[2][1]]), b3 = Ki([H[0][2], H[1][2], H[2][2]]);
    let lam = 2 / (norm(b1) + norm(b2)); if (b3[2] * lam < 0) lam = -lam;
    const r1 = b1.map((x) => x * lam), r2 = b2.map((x) => x * lam), r3 = cross(r1, r2);
    let R = orthonormal([[r1[0], r2[0], r3[0]], [r1[1], r2[1], r3[1]], [r1[2], r2[2], r3[2]]]);
    let t = b3.map((x) => x * lam);
    // Gauss-Newton auf den Rückprojektionsfehler (6 Parameter)
    for (let it = 0; it < 6; it++) {
      const res = [], J = [];
      const f0 = (dR, dt) => { const Rn = mul3(rodrigues(dR), R), tn = [t[0] + dt[0], t[1] + dt[1], t[2] + dt[2]]; return src.map((X) => project(Rn, tn, f, X)); };
      const p0 = f0([0, 0, 0], [0, 0, 0]);
      for (let i = 0; i < src.length; i++) res.push(dst[i][0] - p0[i][0], dst[i][1] - p0[i][1]);
      const eps = [1e-4, 1e-4, 1e-4, 1e-2, 1e-2, 1e-2];
      for (let k = 0; k < 6; k++) {
        const d = [0, 0, 0, 0, 0, 0]; d[k] = eps[k];
        const p1 = f0(d.slice(0, 3), d.slice(3)); const col = [];
        for (let i = 0; i < src.length; i++) col.push((p1[i][0] - p0[i][0]) / eps[k], (p1[i][1] - p0[i][1]) / eps[k]);
        J.push(col);
      }
      const JtJ = J.map((a) => J.map((b) => a.reduce((s, x, i) => s + x * b[i], 0)));
      JtJ.forEach((r, i) => (r[i] *= 1.0001));
      const Jtr = J.map((a) => a.reduce((s, x, i) => s + x * res[i], 0));
      const d = solve(JtJ, Jtr); if (!d) break;
      R = mul3(rodrigues(d.slice(0, 3)), R); t = [t[0] + d[3], t[1] + d[4], t[2] + d[5]];
      if (Math.hypot(...d) < 1e-6) break;
    }
    return { R, t, H, err: rms(R, t, f, src, dst) };
  }
  // ---------- One-Euro-Filter ----------
  function OneEuro(minCut = 1.0, beta = 0.02, dCut = 1.0) {
    let x = null, dx = 0, tPrev = null;
    const a = (cut, dt) => 1 / (1 + 1 / (2 * Math.PI * cut * dt));
    return function (v, tMs) {
      if (x === null) { x = v; tPrev = tMs; return v; }
      const dt = Math.max((tMs - tPrev) / 1000, 1e-3); tPrev = tMs;
      const d = (v - x) / dt; dx += a(dCut, dt) * (d - dx);
      const cut = minCut + beta * Math.abs(dx); x += a(cut, dt) * (v - x); return x;
    };
  }
  root.FRAMEPOSE = { estimate, focalFromH, homography, OneEuro, project };
  if (typeof module !== 'undefined') module.exports = root.FRAMEPOSE;
})(typeof window !== 'undefined' ? window : globalThis);
