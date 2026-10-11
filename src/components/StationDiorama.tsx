import { useEffect, useRef } from "react";
import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { createStation, disposeStation, repaintStationSigns } from "../ar/buildStation";

interface StationDioramaProps {
  name: string;
  code: string;
  elevated: boolean;
}

/** Turntable of one station, used on the map when the camera is unavailable. */
export function StationDiorama({ name, code, elevated }: StationDioramaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x243246, 1);

    const scene = new Scene();
    scene.background = new Color(0x243246);
    scene.add(new HemisphereLight(0xd5e2f2, 0x6a5b4c, 1.3));
    const sun = new DirectionalLight(0xfff6ea, 1.7);
    sun.position.set(12, 18, 8);
    scene.add(sun);

    const camera = new PerspectiveCamera(32, 1, 0.1, 200);
    const lookY = elevated ? 5.2 : 2.6;
    camera.position.set(20, lookY + 7, 24);
    camera.lookAt(1.4, lookY, 0);

    const station = createStation({ id: "diorama", name, code, elevated });
    scene.add(station);
    const fontTask = document.fonts?.load("700 64px 'Noto Sans TC'");
    void fontTask?.then(() => repaintStationSigns(station));

    let frame = 0;
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 2 || height < 2) return;
      const dpr = renderer.getPixelRatio();
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
      station.rotation.y = time * 0.00035;
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      disposeStation(station);
      renderer.dispose();
    };
  }, [name, code, elevated]);

  return (
    <figure className="station-diorama pointer-events-none">
      <canvas ref={canvasRef} />
      <figcaption>
        <strong>
          {code} {name}
        </strong>
        <span>示意車站 · 非真實站體</span>
      </figcaption>
    </figure>
  );
}
