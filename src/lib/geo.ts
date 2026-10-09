export const EARTH_M = 6_371_000;

export function wrap360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function wrap180(deg: number): number {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

export function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const φ1 = (aLat * Math.PI) / 180;
  const φ2 = (bLat * Math.PI) / 180;
  const dφ = ((bLat - aLat) * Math.PI) / 180;
  const dλ = ((bLon - aLon) * Math.PI) / 180;
  const h =
    Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const φ1 = (aLat * Math.PI) / 180;
  const φ2 = (bLat * Math.PI) / 180;
  const dλ = ((bLon - aLon) * Math.PI) / 180;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return wrap360((Math.atan2(y, x) * 180) / Math.PI);
}

export function destination(
  lat: number,
  lon: number,
  bearingDeg: number,
  distM: number,
): { lat: number; lon: number } {
  const δ = distM / EARTH_M;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );
  return {
    lat: (φ2 * 180) / Math.PI,
    lon: (((λ2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

export function smoothAngle(prev: number, next: number, alpha: number): number {
  return wrap360(prev + alpha * wrap180(next - prev));
}

export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return "—";
  if (m < 950) return `${Math.max(1, Math.round(m))} 公尺`;
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} 公里`;
}

export function directionPhrase(rel: number): string {
  const a = Math.abs(rel);
  if (a < 18) return "在前方";
  if (a > 162) return "在後方";
  const side = rel > 0 ? "右" : "左";
  if (a < 70) return `在${side}前方`;
  if (a < 115) return `在${side}側`;
  return `在${side}後方`;
}

export interface Sample {
  lat: number;
  lon: number;
}

export function sampleLine(coords: [number, number][], stepM: number): Sample[] {
  if (coords.length === 0) return [];
  const out: Sample[] = [{ lon: coords[0][0], lat: coords[0][1] }];
  let remain = stepM;
  for (let i = 1; i < coords.length; i++) {
    let lon1 = coords[i - 1][0];
    let lat1 = coords[i - 1][1];
    const lon2 = coords[i][0];
    const lat2 = coords[i][1];
    let seg = haversine(lat1, lon1, lat2, lon2);
    if (seg < 0.4) continue;
    while (seg >= remain) {
      const t = remain / seg;
      lon1 += (lon2 - lon1) * t;
      lat1 += (lat2 - lat1) * t;
      out.push({ lon: lon1, lat: lat1 });
      seg = haversine(lat1, lon1, lat2, lon2);
      remain = stepM;
    }
    remain -= seg;
  }
  const last = coords[coords.length - 1];
  const tail = out[out.length - 1];
  if (haversine(tail.lat, tail.lon, last[1], last[0]) > 4) {
    out.push({ lon: last[0], lat: last[1] });
  }
  return out;
}

export interface Projection {
  x: number;
  y: number;
  dist: number;
  rel: number;
  horizon: number;
}

export function projectPoint(opts: {
  userLat: number;
  userLon: number;
  lat: number;
  lon: number;
  heading: number;
  pitch: number;
  width: number;
  height: number;
  hFov: number;
  cameraHeight?: number;
  /** Ribbon stretches the ground so a route stays readable on a phone. */
  ground?: "physical" | "ribbon";
}): Projection {
  const dist = haversine(opts.userLat, opts.userLon, opts.lat, opts.lon);
  const rel = wrap180(bearing(opts.userLat, opts.userLon, opts.lat, opts.lon) - opts.heading);
  const hFov = Math.max(opts.hFov, 20);
  const vFov = (hFov * opts.height) / Math.max(opts.width, 1);
  const x = opts.width * (0.5 + rel / hFov);
  // Negative pitch looks down, so the horizon moves up the screen.
  const horizon = opts.height * (0.5 + opts.pitch / vFov);
  let y: number;
  if (opts.ground === "ribbon") {
    const clamped = Math.min(520, Math.max(8, dist));
    const t = (Math.log(clamped) - Math.log(8)) / (Math.log(520) - Math.log(8));
    y = horizon + opts.height * 0.34 * (1 - t);
  } else {
    const camH = opts.cameraHeight ?? 1.5;
    const depression = (Math.atan2(camH, Math.max(dist, 0.8)) * 180) / Math.PI;
    y = horizon + (depression / vFov) * opts.height;
  }
  return { x, y, dist, rel, horizon };
}

export function lookPhrase(
  userLat: number,
  userLon: number,
  lat: number,
  lon: number,
  heading: number,
): string {
  const projected = projectPoint({
    userLat,
    userLon,
    lat,
    lon,
    heading,
    pitch: 0,
    width: 100,
    height: 100,
    hFov: 60,
  });
  return `${formatDistance(projected.dist)} · ${directionPhrase(projected.rel)}`;
}

export function nearestOnSamples(
  samples: Sample[],
  lat: number,
  lon: number,
): number {
  let best = Infinity;
  for (const s of samples) {
    const d = haversine(lat, lon, s.lat, s.lon);
    if (d < best) best = d;
  }
  return best;
}
