import { useEffect, useRef } from "react";
import {
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type Group,
} from "three";
import { createStation, disposeStation, repaintStationSigns } from "../ar/buildStation";
import {
  CAMERA_HEIGHT,
  eastNorth,
  stationModelPoses,
  stationYawRad,
  verticalFov,
} from "../lib/spatial";
import type { Fix, Place } from "../lib/types";

interface StationFieldProps {
  places: Place[];
  fix: Fix | null;
  heading: number;
  pitch: number;
  hFov: number;
}

export function StationField({ places, fix, heading, pitch, hFov }: StationFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef({ places, fix, heading, pitch, hFov });
  useEffect(() => {
    viewRef.current = { places, fix, heading, pitch, hFov };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    const scene = new Scene();
    scene.add(new HemisphereLight(0xc5d4e8, 0x5c5148, 1.25));
    const sun = new DirectionalLight(0xfff4e4, 1.55);
    sun.position.set(24, 48, 16);
    scene.add(sun);

    const camera = new PerspectiveCamera(50, 1, 0.2, 4000);
    camera.rotation.order = "YXZ";
    camera.position.set(0, CAMERA_HEIGHT, 0);

    const models = new Map<string, Group>();
    let fontReady = false;
    const repaintAll = () => {
      for (const group of models.values()) repaintStationSigns(group);
    };
    const fontTask = document.fonts?.load("700 64px 'Noto Sans TC'");
    void fontTask?.then(() => {
      fontReady = true;
      repaintAll();
    });

    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (document.hidden) return;
      const view = viewRef.current;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width < 2 || height < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height, false);
      }

      const vFov = verticalFov(view.hFov, width, height);
      camera.aspect = width / height;
      camera.fov = vFov;
      camera.position.set(0, CAMERA_HEIGHT, 0);
      camera.rotation.y = (-view.heading * Math.PI) / 180;
      camera.rotation.x = (-view.pitch * Math.PI) / 180;
      camera.updateProjectionMatrix();

      const poses = view.fix
        ? stationModelPoses(view.places, view.fix.lat, view.fix.lon, vFov)
        : [];
      const seen = new Set<string>();
      for (const pose of poses) {
        seen.add(pose.id);
        let group = models.get(pose.id);
        if (!group) {
          group = createStation({
            id: pose.id,
            name: pose.place.name,
            code: pose.place.code ?? "",
            elevated: pose.elevated,
          });
          models.set(pose.id, group);
          scene.add(group);
          if (fontReady) repaintStationSigns(group);
        }
        const { east, north } = eastNorth(pose.place.lat, pose.place.lon, view.fix!.lat, view.fix!.lon);
        group.visible = true;
        group.position.set(east, pose.baseY, -north);
        group.rotation.set(0, stationYawRad(pose.bearingDeg), 0);
        group.scale.setScalar(pose.scale);
        const detail = group.getObjectByName("detail");
        if (detail) detail.visible = pose.showDetail;
      }
      for (const [id, group] of models) {
        if (!seen.has(id)) group.visible = false;
      }
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      for (const group of models.values()) disposeStation(group);
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />;
}
