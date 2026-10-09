import { useEffect, useRef, useState } from "react";
import { formatDistance, nearestOnSamples, projectPoint, wrap180 } from "../lib/geo";
import type { Fix, Place, RouteModel } from "../lib/types";

interface ArPaneProps {
  routes: RouteModel[];
  places: Place[];
  fix: Fix | null;
  stream: MediaStream | null;
  heading: number;
  pitch: number;
  hFov: number;
  showConcepts: boolean;
  onLook: (dHeading: number, dPitch: number) => void;
}

interface HudState {
  heading: number;
  here: string | null;
  lineDist: number | null;
}

const COMPASS = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345];

function compassLabel(deg: number): string {
  if (deg === 0) return "北";
  if (deg === 90) return "東";
  if (deg === 180) return "南";
  if (deg === 270) return "西";
  return String(deg);
}

export function ArPane({
  routes,
  places,
  fix,
  stream,
  heading,
  pitch,
  hFov,
  showConcepts,
  onLook,
}: ArPaneProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const viewRef = useRef({ routes, places, fix, heading, pitch, hFov, showConcepts });
  useEffect(() => {
    viewRef.current = { routes, places, fix, heading, pitch, hFov, showConcepts };
  });
  const [hud, setHud] = useState<HudState>({ heading, here: null, lineDist: null });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      sizeRef.current = { w, h, dpr };
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    let lastHud = 0;
    const loop = (time: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const view = viewRef.current;
      const { w, h, dpr } = sizeRef.current;
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const user = view.fix;
        if (user) {
          const ordered = [...view.routes].sort((a, b) => (a.group === "blue" ? 1 : 0) - (b.group === "blue" ? 1 : 0));
          for (const route of ordered) {
            if (route.group === "concept" && !view.showConcepts) continue;
            const stroke =
              route.group === "concept"
                ? route.color
                : route.vertical === "at-grade-inferred"
                  ? "#ffcc70"
                  : "#9fd4ff";
            const maxD = route.group === "blue" ? 520 : 320;
            ctx.beginPath();
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.strokeStyle = stroke;
            ctx.shadowColor = stroke;
            ctx.shadowBlur = route.group === "blue" ? 18 * dpr : 0;
            ctx.setLineDash(route.dashed ? [14 * dpr, 10 * dpr] : []);
            ctx.lineWidth = (route.group === "blue" ? 14 : 5) * dpr;
            let drawing = false;
            let drew = false;
            for (const sample of route.samples) {
              const projected = projectPoint({
                userLat: user.lat,
                userLon: user.lon,
                lat: sample.lat,
                lon: sample.lon,
                heading: view.heading,
                pitch: view.pitch,
                width: w,
                height: h,
                hFov: view.hFov,
                ground: "ribbon",
              });
              const visible =
                projected.dist <= maxD &&
                projected.dist >= 6 &&
                Math.abs(projected.rel) < view.hFov * 0.7;
              if (!visible) {
                drawing = false;
                continue;
              }
              const x = projected.x * dpr;
              const y = projected.y * dpr;
              if (!drawing) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
              drawing = true;
              drew = true;
            }
            if (drew) ctx.stroke();
          }
          ctx.shadowBlur = 0;
          ctx.setLineDash([]);
        }
      }

      let here: string | null = null;
      let edgeRow = 0;
      if (view.fix) {
        for (const place of view.places) {
          const node = nodes.current.get(place.id);
          if (!node) continue;
          if (place.kind === "corridor-end" && !view.showConcepts) {
            node.style.display = "none";
            continue;
          }
          const projected = projectPoint({
            userLat: view.fix.lat,
            userLon: view.fix.lon,
            lat: place.lat,
            lon: place.lon,
            heading: view.heading,
            pitch: view.pitch,
            width: w,
            height: h,
            hFov: view.hFov,
            ground: "ribbon",
          });
          const limit = place.kind === "station" ? 1500 : place.kind === "depot" ? 700 : 900;
          const distNode = node.querySelector("[data-dist]");
          if (distNode) distNode.textContent = formatDistance(projected.dist);
          if (projected.dist > limit) {
            node.style.display = "none";
            continue;
          }
          if (projected.dist < 28 && place.kind === "station") here = `${place.code ?? ""} ${place.name}`.trim();
          const inView = Math.abs(projected.rel) < view.hFov * 0.46 && projected.y > 40 && projected.y < h - 20;
          const nearEdge = projected.dist < 800 && Math.abs(projected.rel) < 120;
          if (!inView && !nearEdge) {
            node.style.display = "none";
            continue;
          }
          node.style.display = "block";
          node.style.zIndex = String(2000 - Math.round(projected.dist));
          if (inView) {
            node.classList.remove("is-edge");
            node.style.transform = `translate3d(${projected.x}px, ${projected.y}px, 0) translate(-50%, -100%)`;
          } else {
            node.classList.add("is-edge");
            const x = projected.rel > 0 ? w - 28 : 28;
            const y = h * 0.38 + edgeRow * 58;
            edgeRow += 1;
            node.style.transform = `translate3d(${x}px, ${y}px, 0) translate(${projected.rel > 0 ? "-100%" : "0"}, -50%)`;
          }
        }
      } else {
        for (const node of nodes.current.values()) node.style.display = "none";
      }

      if (time - lastHud > 120) {
        lastHud = time;
        const lineSamples = view.routes.filter((route) => route.group === "blue").flatMap((route) => route.samples);
        const lineDist = view.fix ? nearestOnSamples(lineSamples, view.fix.lat, view.fix.lon) : null;
        setHud({ heading: view.heading, here, lineDist });
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button, a, input")) return;
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    const width = event.currentTarget.clientWidth || 1;
    const height = event.currentTarget.clientHeight || 1;
    onLook((-dx / width) * hFov, (dy / height) * ((hFov * height) / width));
  }

  const marks = COMPASS.flatMap((deg) => {
    const rel = wrap180(deg - hud.heading);
    if (Math.abs(rel) > 72) return [];
    return [
      <span key={deg} className={deg % 90 === 0 ? "major" : ""} style={{ left: `${50 + (rel / 72) * 50}%` }}>
        {compassLabel(deg)}
      </span>,
    ];
  });

  return (
    <div className="absolute inset-0 bg-ink">
      <div className="sky" aria-hidden>
        {!stream && (
          <p>還沒有相機畫面。允許相機後，車站和路線會疊在街上。現在仍可用手指左右滑動來環視。</p>
        )}
      </div>
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" autoPlay playsInline muted />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0">
        {places.map((place) => (
          <div
            key={place.id}
            className="ar-label"
            ref={(node) => {
              if (node) nodes.current.set(place.id, node);
              else nodes.current.delete(place.id);
            }}
          >
            <div className="ar-card">
              <div>
                <div className="code">{place.code ?? (place.kind === "depot" ? "機廠" : "構想")}</div>
              </div>
              <div>
                <div className="name">
                  {place.name}
                  {place.kind === "station" && !place.officialName && <span className="badge">推估</span>}
                </div>
                <div className="meta">
                  <span data-dist>—</span>
                  {place.subtitle ? ` · ${place.subtitle}` : ""}
                </div>
              </div>
            </div>
            <div className="stem" />
          </div>
        ))}
      </div>
      <div
        className="absolute inset-0 z-10 touch-none"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-[4.6rem] z-20">
        <div className="compass">
          {marks}
          <i className="needle" />
        </div>
        <p className="mt-1 text-center text-xs text-white/80">
          {hud.here
            ? `你在 ${hud.here} 附近`
            : hud.lineDist != null && Number.isFinite(hud.lineDist)
              ? `藍線距離你 ${formatDistance(hud.lineDist)}`
              : "左右滑動可環視"}
        </p>
      </div>
    </div>
  );
}

