import type { Point } from "./models";
export type Matrix3 = [number, number, number, number, number, number, number, number, number];
const solve = (a: number[][], b: number[]) => {
  for (let i = 0; i < 8; i += 1) { let pivot = i; for (let r = i + 1; r < 8; r += 1) if (Math.abs(a[r][i]) > Math.abs(a[pivot][i])) pivot = r;
    if (Math.abs(a[pivot][i]) < 1e-10) throw new Error("گوشه‌های Homography معتبر نیستند.");
    [a[i], a[pivot]] = [a[pivot], a[i]]; [b[i], b[pivot]] = [b[pivot], b[i]];
    const d = a[i][i]; for (let c = i; c < 8; c += 1) a[i][c] /= d; b[i] /= d;
    for (let r = 0; r < 8; r += 1) if (r !== i) { const f = a[r][i]; for (let c = i; c < 8; c += 1) a[r][c] -= f * a[i][c]; b[r] -= f * b[i]; }
  } return b;
};
export function computeHomography(source: Point[], destination: Point[]): Matrix3 {
  if (source.length !== 4 || destination.length !== 4) throw new Error("Homography به چهار گوشه نیاز دارد.");
  const a: number[][] = [], b: number[] = [];
  source.forEach((p, i) => { const q = destination[i]; a.push([p.x,p.y,1,0,0,0,-q.x*p.x,-q.x*p.y]); b.push(q.x); a.push([0,0,0,p.x,p.y,1,-q.y*p.x,-q.y*p.y]); b.push(q.y); });
  const h = solve(a, b); return [h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1];
}
export function applyHomography(point: Point, matrix: Matrix3): Point { const [a,b,c,d,e,f,g,h,i] = matrix; const w = g*point.x+h*point.y+i; return { x: (a*point.x+b*point.y+c)/w, y: (d*point.x+e*point.y+f)/w }; }
export function isValidQuadrilateral(corners: Point[]): boolean {
  if (corners.length !== 4) return false;
  const cross = (a: Point,b: Point,c: Point) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const signs = corners.map((p,i) => Math.sign(cross(p,corners[(i+1)%4],corners[(i+2)%4]))).filter(Boolean);
  return signs.length === 4 && signs.every((s) => s === signs[0]) && Math.abs(cross(corners[0],corners[1],corners[2])) > 1e-6;
}
export function invertHomography(m: Matrix3): Matrix3 {
  const [a,b,c,d,e,f,g,h,i] = m; const A=e*i-f*h,B=f*g-d*i,C=d*h-e*g,D=c*h-b*i,E=a*i-c*g,F=b*g-a*h,G=b*f-c*e,H=c*d-a*f,I=a*e-b*d; const det=a*A+b*B+c*C;
  if (Math.abs(det)<1e-10) throw new Error("Homography قابل معکوس‌سازی نیست."); return [A/det,D/det,G/det,B/det,E/det,H/det,C/det,F/det,I/det];
}
