export interface OrientedEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

export function compassHeading(alpha: number, beta: number, gamma: number): number {
  const degtorad = Math.PI / 180;
  const x = beta * degtorad;
  const y = gamma * degtorad;
  const z = alpha * degtorad;
  const cY = Math.cos(y);
  const cZ = Math.cos(z);
  const sX = Math.sin(x);
  const sY = Math.sin(y);
  const sZ = Math.sin(z);
  const vx = -cZ * sY - sZ * sX * cY;
  const vy = -sZ * sY + cZ * sX * cY;
  let heading = Math.atan(vx / vy);
  if (vy < 0) heading += Math.PI;
  else if (vx < 0) heading += 2 * Math.PI;
  return (heading * 180) / Math.PI;
}

export function headingFromEvent(event: OrientedEvent): number | null {
  if (typeof event.webkitCompassHeading === "number" && !Number.isNaN(event.webkitCompassHeading)) {
    return (event.webkitCompassHeading + 360) % 360;
  }
  if (typeof event.alpha !== "number") return null;
  if (event.absolute) {
    const angle = window.screen?.orientation?.angle ?? 0;
    return (360 - event.alpha + angle + 360) % 360;
  }
  if (typeof event.beta === "number" && typeof event.gamma === "number") {
    const heading = compassHeading(event.alpha, event.beta, event.gamma);
    return (heading + 360) % 360;
  }
  return null;
}

export function pitchFromEvent(event: DeviceOrientationEvent): number | null {
  if (typeof event.beta !== "number") return null;
  const angle = window.screen?.orientation?.angle ?? 0;
  if (angle === 90 || angle === -90 || angle === 270) {
    if (typeof event.gamma !== "number") return null;
    return Math.max(-50, Math.min(40, event.gamma));
  }
  const pitch = event.beta - 90;
  if (Math.abs(pitch) > 75) return null;
  return Math.max(-50, Math.min(40, pitch));
}

export function requestOrientationPermission(): Promise<"granted" | "denied" | "na"> {
  const doe = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<string>;
  };
  if (typeof doe.requestPermission !== "function") return Promise.resolve("na");
  return doe
    .requestPermission()
    .then((result) => (result === "granted" ? "granted" : "denied"))
    .catch(() => "denied" as const);
}
