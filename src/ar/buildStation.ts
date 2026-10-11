import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Material,
  type MeshBasicMaterial as MeshBasicMaterialType,
} from "three";
import { DECK_LIFT, SIGN_CENTER_Y, SIGN_H } from "../lib/spatial";

const boxGeo = new BoxGeometry(1, 1, 1);
const pillarGeo = new CylinderGeometry(1, 1, 1, 8);
const signGeo = new PlaneGeometry(1, 1);

const concrete = new MeshLambertMaterial({ color: 0xd9d2c4 });
const deck = new MeshLambertMaterial({ color: 0xc8c1b4 });
const roofMat = new MeshLambertMaterial({ color: 0xf3f6fb });
const fascia = new MeshLambertMaterial({ color: 0x1f5fbf });
const pillarMat = new MeshLambertMaterial({ color: 0x3c4a57 });
const safety = new MeshLambertMaterial({ color: 0xe2b340 });
const railMat = new MeshLambertMaterial({ color: 0x6d675e });
const bedMat = new MeshLambertMaterial({ color: 0x3f3b36 });
const tramBody = new MeshLambertMaterial({ color: 0xf7f8fb });
const tramNose = new MeshLambertMaterial({ color: 0x1f5fbf });
const glass = new MeshLambertMaterial({ color: 0x6aa3c4 });
const persimmon = new MeshLambertMaterial({ color: 0xd4533a });
const lamp = new MeshBasicMaterial({ color: 0xfff3c4 });
const shadowMat = new MeshLambertMaterial({
  color: 0x14181c,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
});

export interface StationSpec {
  id: string;
  name: string;
  code: string;
  elevated: boolean;
}

function addBox(
  parent: Group,
  material: Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): Mesh {
  const mesh = new Mesh(boxGeo, material);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function paintSign(canvas: HTMLCanvasElement, title: string, code: string, compact: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#172026";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#1f5fbf";
  ctx.fillRect(0, 0, w, compact ? 18 : 36);
  ctx.fillStyle = "#d4533a";
  ctx.fillRect(0, h - (compact ? 14 : 26), w, compact ? 14 : 26);
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#9fd0ff";
  ctx.font = compact ? "600 42px 'Noto Sans TC', sans-serif" : "600 64px 'Noto Sans TC', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(code || "輕軌", 28, h * 0.56);
  ctx.fillStyle = "#f6f1e7";
  ctx.font = compact ? "700 72px 'Noto Sans TC', sans-serif" : "700 116px 'Noto Sans TC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, w * 0.58, h * 0.54);
}

function signMaterial(title: string, code: string, compact: boolean): MeshBasicMaterial {
  const canvas = document.createElement("canvas");
  canvas.width = compact ? 512 : 1024;
  canvas.height = compact ? 160 : 280;
  paintSign(canvas, title, code, compact);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  const material = new MeshBasicMaterial({ map: texture });
  material.userData.repaint = () => {
    paintSign(canvas, title, code, compact);
    texture.needsUpdate = true;
  };
  return material;
}

function addSign(
  parent: Group,
  material: Material,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
) {
  const mesh = new Mesh(signGeo, material);
  mesh.scale.set(w, h, 1);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  parent.add(mesh);
}

/**
 * Procedural light-rail stop in meters. Origin is track-bed center.
 * Local +Z runs along the route; local -Z faces an approaching rider.
 * Local +X is the side platform.
 */
export function createStation(spec: StationSpec): Group {
  const root = new Group();
  root.name = spec.id;
  const lift = spec.elevated ? DECK_LIFT : 0;
  const mass = new Group();
  mass.name = "mass";
  const detail = new Group();
  detail.name = "detail";
  root.add(mass, detail);

  const shadow = new Mesh(signGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(spec.elevated ? 16 : 12, 34, 1);
  shadow.position.set(1.6, 0.03, 0);
  mass.add(shadow);

  if (spec.elevated) {
    for (const z of [-8, 0, 8]) {
      addBox(mass, pillarMat, 0.85, lift - 0.2, 1.05, 1.7, (lift - 0.2) / 2, z);
    }
    addBox(mass, deck, 8.4, 0.42, 32, 1.7, lift - 0.21, 0);
    addBox(mass, fascia, 0.18, 0.7, 31.2, 1.7 - 4.2, lift + 0.2, 0);
    addBox(mass, fascia, 0.18, 0.7, 31.2, 1.7 + 4.2, lift + 0.2, 0);
  }

  const platformX = 3.2;
  addBox(mass, concrete, 3.6, 0.9, 28, platformX, lift + 0.45, 0);
  addBox(mass, safety, 0.22, 0.08, 27.2, platformX - 1.7, lift + 0.94, 0);
  addBox(mass, roofMat, 4.6, 0.22, 26, platformX, lift + 4.2, 0);
  addBox(mass, fascia, 4.9, 0.16, 26.5, platformX, lift + 4.05, 0);

  for (const z of [-10, -5, 0, 5, 10]) {
    const pillar = new Mesh(pillarGeo, pillarMat);
    pillar.scale.set(0.13, 3.15, 0.13);
    pillar.position.set(platformX, lift + 0.9 + 1.575, z);
    mass.add(pillar);
  }

  const board = signMaterial(spec.name, spec.code, false);
  const tramBoard = signMaterial(spec.name, spec.code, true);
  root.userData.materials = [board, tramBoard];

  for (const x of [-1.5, 5.5]) {
    addBox(mass, pillarMat, 0.22, 5.5, 0.22, x, lift + 2.75, -14.2);
    addBox(mass, pillarMat, 0.22, 5.5, 0.22, x, lift + 2.75, 14.2);
  }
  addSign(mass, board, 8.4, SIGN_H, 2, lift + SIGN_CENTER_Y, -14.45, Math.PI);
  addSign(mass, board, 8.4, SIGN_H, 2, lift + SIGN_CENTER_Y, 14.45, 0);
  addSign(detail, board, 6.4, 1.05, platformX + 1.95, lift + 2.7, 0, Math.PI / 2);

  addBox(detail, bedMat, 2.7, 0.08, 32, 0, lift + 0.04, 0);
  addBox(detail, railMat, 0.08, 0.1, 32, -0.72, lift + 0.12, 0);
  addBox(detail, railMat, 0.08, 0.1, 32, 0.72, lift + 0.12, 0);

  const tramY = lift + 1.72;
  addBox(detail, tramBody, 2.55, 3.05, 13.2, 0, tramY, 1.2);
  addBox(detail, tramNose, 2.62, 0.28, 13.4, 0, lift + 1.15, 1.2);
  addBox(detail, persimmon, 2.62, 0.12, 13.4, 0, lift + 2.55, 1.2);
  addBox(detail, glass, 2.15, 0.85, 0.08, 0, lift + 2.25, -5.45);
  addBox(detail, glass, 0.08, 0.8, 8.4, 1.3, lift + 2.2, 1.2);
  addBox(detail, glass, 0.08, 0.8, 8.4, -1.3, lift + 2.2, 1.2);
  addBox(detail, lamp, 0.28, 0.22, 0.08, -0.7, lift + 1.05, -5.48);
  addBox(detail, lamp, 0.28, 0.22, 0.08, 0.7, lift + 1.05, -5.48);
  addBox(detail, persimmon, 0.22, 0.16, 0.08, -0.7, lift + 1.05, 7.85);
  addBox(detail, persimmon, 0.22, 0.16, 0.08, 0.7, lift + 1.05, 7.85);
  addSign(detail, tramBoard, 1.7, 0.42, 0, lift + 2.85, -5.5, Math.PI);
  addBox(detail, pillarMat, 0.08, 0.45, 0.7, 0, lift + 3.5, 0.4);
  addBox(detail, pillarMat, 1.3, 0.06, 0.06, 0, lift + 3.72, 0.4);

  return root;
}

export function repaintStationSigns(root: Group) {
  const materials = root.userData.materials as MeshBasicMaterialType[] | undefined;
  materials?.forEach((material) => {
    const repaint = material.userData.repaint as (() => void) | undefined;
    repaint?.();
  });
}

export function disposeStation(root: Group) {
  const materials = root.userData.materials as MeshBasicMaterialType[] | undefined;
  materials?.forEach((material) => {
    material.map?.dispose();
    material.dispose();
  });
}
