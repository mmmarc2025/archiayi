import { bearing, haversine, wrap180, wrap360, EARTH_M } from "./geo";
import type { Place } from "./types";

export const CAMERA_HEIGHT = 1.55;
export const STATION_NEAR_M = 16;
export const STATION_FAR_M = 1000;
export const STATION_MODEL_LIMIT = 4;

/** Deck height for documented elevated stops. Added to the at-grade station. */
export const DECK_LIFT = 4.05;
export const SIGN_CENTER_Y = 5.15;
export const SIGN_H = 1.35;

export function stationCrownY(elevated: boolean): number {
  return (elevated ? DECK_LIFT : 0) + SIGN_CENTER_Y + SIGN_H / 2;
}

export function verticalFov(hFov: number, width: number, height: number): number {
  return (Math.max(hFov, 20) * height) / Math.max(width, 1);
}

/** Local east/north meters from the user, suitable for a few kilometres. */
export function eastNorth(
  lat: number,
  lon: number,
  userLat: number,
  userLon: number,
): { east: number; north: number } {
  const latRad = (((userLat + lat) / 2) * Math.PI) / 180;
  return {
    east: ((lon - userLon) * Math.PI) / 180 * EARTH_M * Math.cos(latRad),
    north: ((lat - userLat) * Math.PI) / 180 * EARTH_M,
  };
}

/** Forward bearing along the blue line at a station, degrees clockwise from north. */
export function routeBearingDeg(place: Place, places: Place[]): number {
  const line = place.line;
  const stations = places
    .filter((item) => item.kind === "station" && (line == null || item.line === line))
    .sort((a, b) => (a.chainageM ?? 0) - (b.chainageM ?? 0));
  const index = stations.findIndex((item) => item.id === place.id);
  if (index < 0) return 0;
  const prev = stations[index - 1];
  const next = stations[index + 1];
  if (prev && next) return bearing(prev.lat, prev.lon, next.lat, next.lon);
  if (next) return bearing(place.lat, place.lon, next.lat, next.lon);
  if (prev) return bearing(prev.lat, prev.lon, place.lat, place.lon);
  return 0;
}

/**
 * Yaw that points the station's local +Z along the route.
 * three.js Y rotation, radians. Local -Z then faces approaching riders.
 */
export function stationYawRad(forwardDeg: number): number {
  return Math.PI - (forwardDeg * Math.PI) / 180;
}

/** Local station offset (X across the platform, Z along the route) in east/north meters. */
export function routeOffsetMeters(
  forwardDeg: number,
  localX: number,
  localZ: number,
): { east: number; north: number } {
  const yaw = stationYawRad(forwardDeg);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const east = localX * c + localZ * s;
  const worldZ = -localX * s + localZ * c;
  return { east, north: -worldZ };
}

/**
 * World Y of the track bed so the station base lands on the same screen row
 * as the stretched AR route ribbon. Independent of pitch: both the ribbon and
 * the camera horizon move together.
 */
export function ribbonBaseY(distM: number, vFovDeg: number): number {
  const clamped = Math.min(520, Math.max(8, distM));
  const span = Math.log(520) - Math.log(8);
  const t = (Math.log(clamped) - Math.log(8)) / span;
  const depressionDeg = Math.max(vFovDeg, 20) * 0.34 * (1 - t);
  return CAMERA_HEIGHT - Math.max(distM, 0.8) * Math.tan((depressionDeg * Math.PI) / 180);
}

function maxScaleToFit(distM: number, crownY: number, vFovDeg: number): number {
  const clamped = Math.min(520, Math.max(8, distM));
  const span = Math.log(520) - Math.log(8);
  const t = (Math.log(clamped) - Math.log(8)) / span;
  const vFov = Math.max(vFovDeg, 20);
  const depressionDeg = vFov * 0.34 * (1 - t);
  // From the ribbon up into the sky, stopping short of the compass.
  const roomDeg = depressionDeg + 0.06 * vFov;
  const maxH = Math.max(distM, 1) * Math.tan((roomDeg * Math.PI) / 180);
  return maxH / Math.max(crownY, 0.5);
}

/** Life size up close; grow with distance so a far stop still reads, then fit the screen. */
export function stationScale(distM: number, crownY: number, vFovDeg: number): number {
  const needed = (Math.max(distM, 1) * Math.tan((8 * Math.PI) / 180)) / Math.max(crownY, 0.5);
  const cap = distM < 110 ? 2.2 : 3.6;
  const readable = Math.min(cap, Math.max(1, needed));
  const fit = Math.max(0.85, maxScaleToFit(distM, crownY, vFovDeg));
  return Math.min(readable, fit);
}

export interface StationModelPose {
  id: string;
  place: Place;
  dist: number;
  bearingDeg: number;
  scale: number;
  baseY: number;
  crownWorldY: number;
  showDetail: boolean;
  elevated: boolean;
}

export function stationModelPoses(
  places: Place[],
  userLat: number,
  userLon: number,
  vFovDeg: number,
): StationModelPose[] {
  const ranked: StationModelPose[] = [];
  for (const place of places) {
    if (place.kind !== "station") continue;
    const dist = haversine(userLat, userLon, place.lat, place.lon);
    if (dist < STATION_NEAR_M || dist > STATION_FAR_M) continue;
    const elevated = place.structure === "elevated";
    const crown = stationCrownY(elevated);
    const scale = stationScale(dist, crown, vFovDeg);
    const baseY = ribbonBaseY(dist, vFovDeg);
    ranked.push({
      id: place.id,
      place,
      dist,
      bearingDeg: routeBearingDeg(place, places),
      scale,
      baseY,
      crownWorldY: baseY + crown * scale,
      showDetail: dist < 280,
      elevated,
    });
  }
  ranked.sort((a, b) => a.dist - b.dist);
  return ranked.slice(0, STATION_MODEL_LIMIT);
}

export interface WorldProjection {
  x: number;
  y: number;
  dist: number;
  rel: number;
  horizon: number;
}

/** Project a point already expressed in east/north/up meters around the user. */
export function projectWorld(opts: {
  east: number;
  north: number;
  height: number;
  heading: number;
  pitch: number;
  width: number;
  heightPx: number;
  hFov: number;
  cameraHeight?: number;
}): WorldProjection {
  const dist = Math.hypot(opts.east, opts.north);
  const abs = wrap360((Math.atan2(opts.east, opts.north) * 180) / Math.PI);
  const rel = wrap180(abs - opts.heading);
  const hFov = Math.max(opts.hFov, 20);
  const vFov = (hFov * opts.heightPx) / Math.max(opts.width, 1);
  const x = opts.width * (0.5 + rel / hFov);
  const horizon = opts.heightPx * (0.5 + opts.pitch / vFov);
  const camH = opts.cameraHeight ?? CAMERA_HEIGHT;
  const elev = (Math.atan2(opts.height - camH, Math.max(dist, 0.8)) * 180) / Math.PI;
  const y = horizon - (elev / vFov) * opts.heightPx;
  return { x, y, dist, rel, horizon };
}
