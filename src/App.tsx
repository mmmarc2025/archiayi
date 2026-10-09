import { Camera, Compass, Info, LocateFixed, Map as MapIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArPane } from "./components/ArPane";
import { MapPane } from "./components/MapPane";
import { Button } from "./components/ui/button";
import { Dialog, DialogContent } from "./components/ui/dialog";
import { haversine, lookPhrase, smoothAngle, wrap360 } from "./lib/geo";
import { loadNetwork, poseForPlace } from "./lib/network";
import {
  headingFromEvent,
  pitchFromEvent,
  requestOrientationPermission,
  type OrientedEvent,
} from "./lib/orientation";
import type { Fix, Network, Place } from "./lib/types";

type GeoState = "idle" | "watching" | "denied" | "unsupported" | "error";
type CamState = "idle" | "live" | "blocked" | "missing";

function cameraMessage(error: unknown): string {
  if (!window.isSecureContext) return "相機需要 HTTPS。請用加密網址開啟，不要用一般的 http。";
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "相機被拒絕。iPhone 請到設定 > Safari > 相機允許；Android 請點網址列鎖頭開啟相機。";
  }
  if (name === "NotFoundError") return "這台裝置沒有可用的相機。可以先看地圖，或用手指滑動預覽疊加。";
  if (name === "NotReadableError") return "相機正被其他 App 占用。關掉相機 App 後再試。";
  return "無法開啟相機。";
}

export default function App() {
  const [network, setNetwork] = useState<Network | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"map" | "ar">("map");
  const [introOpen, setIntroOpen] = useState(true);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [showConcepts, setShowConcepts] = useState(true);
  const [showCamPrompt, setShowCamPrompt] = useState(false);
  const [realFix, setRealFix] = useState<Fix | null>(null);
  const [simFix, setSimFix] = useState<Fix | null>(null);
  const [useSim, setUseSim] = useState(false);
  const [geoState, setGeoState] = useState<GeoState>("idle");
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [camState, setCamState] = useState<CamState>("idle");
  const [camMessage, setCamMessage] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [oriNote, setOriNote] = useState<string | null>(null);
  const [headingMode, setHeadingMode] = useState<"device" | "manual">("manual");
  const [manualHeading, setManualHeading] = useState(0);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [pitch, setPitch] = useState(-14);
  const [offset, setOffset] = useState(0);
  const [hFov, setHFov] = useState(67);
  const [panToken, setPanToken] = useState(0);

  const deviceRef = useRef<number | null>(null);
  const manualRef = useRef(0);
  const modeRef = useRef(headingMode);
  const manualLock = useRef(false);
  const watchStop = useRef<(() => void) | null>(null);
  const oriStarted = useRef(false);
  const booted = useRef(false);
  modeRef.current = headingMode;
  manualRef.current = manualHeading;

  const fix = useSim ? simFix : realFix;
  const liveHeading = wrap360(
    (headingMode === "device" && deviceHeading != null ? deviceHeading : manualHeading) + offset,
  );

  useEffect(() => {
    return () => {
      watchStop.current?.();
    };
  }, []);

  useEffect(() => {
    loadNetwork()
      .then(setNetwork)
      .catch(() => setLoadError("路線資料載入失敗。請重新整理頁面。"));
  }, []);

  function ensureGeo() {
    if (watchStop.current || geoState === "unsupported") return;
    if (!("geolocation" in navigator)) {
      setGeoState("unsupported");
      setGeoMessage("這個瀏覽器沒有定位功能。請改選車站模擬。");
      return;
    }
    if (!window.isSecureContext) {
      setGeoState("error");
      setGeoMessage("定位需要 HTTPS。請用加密網址開啟。");
      return;
    }
    setGeoState("watching");
    const id = navigator.geolocation.watchPosition(
      (position) => {
        setRealFix({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          simulated: false,
          label: "目前位置",
        });
        setGeoMessage(null);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setGeoState("denied");
          setGeoMessage("定位被拒絕。可在瀏覽器設定改允許，或先點一座車站模擬。");
          return;
        }
        setGeoState("error");
        setGeoMessage(
          error.code === error.TIMEOUT
            ? "定位逾時。走到較空曠的地方再試，或先模擬一座車站。"
            : "目前讀不到位置。",
        );
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 },
    );
    watchStop.current = () => navigator.geolocation.clearWatch(id);
  }

  function startOrientation() {
    if (oriStarted.current) return;
    oriStarted.current = true;
    let sawAbsolute = false;
    let lastEmit = 0;
    const onEvent = (event: Event) => {
      const oriented = event as OrientedEvent;
      if (oriented.absolute) sawAbsolute = true;
      if (!oriented.absolute && sawAbsolute && typeof oriented.webkitCompassHeading !== "number") return;
      const nextHeading = headingFromEvent(oriented);
      if (nextHeading == null) return;
      const prev = deviceRef.current;
      const smoothed = prev == null ? nextHeading : smoothAngle(prev, nextHeading, 0.22);
      deviceRef.current = smoothed;
      const nextPitch = pitchFromEvent(oriented);
      const now = performance.now();
      if (now - lastEmit < 90) return;
      lastEmit = now;
      setDeviceHeading(smoothed);
      if (!manualLock.current) {
        setHeadingMode("device");
        if (nextPitch != null) setPitch(nextPitch);
      }
    };
    window.addEventListener("deviceorientationabsolute", onEvent, true);
    window.addEventListener("deviceorientation", onEvent, true);
  }

  function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState("missing");
      setCamMessage("這個瀏覽器不能開相機。");
      return;
    }
    if (!window.isSecureContext) {
      setCamState("blocked");
      setCamMessage("相機需要 HTTPS。請用加密網址開啟這個頁面。");
      return;
    }
    void navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      .then((media) => {
        setStream((previous) => {
          previous?.getTracks().forEach((track) => track.stop());
          return media;
        });
        setCamState("live");
        setCamMessage(null);
        setShowCamPrompt(false);
      })
      .catch((error: unknown) => {
        setCamState("blocked");
        setCamMessage(cameraMessage(error));
      });
  }

  function beginSensors() {
    const permission = requestOrientationPermission();
    openCamera();
    ensureGeo();
    startOrientation();
    void permission.then((result) => {
      if (result === "denied") {
        setOriNote("方向被拒絕。iPhone 請允許「動作與方向」，或用手指左右滑動環視。");
        return;
      }
      if (result === "granted" || result === "na") {
        setOriNote(null);
      }
    });
  }

  function enterAr(prompt: boolean) {
    setMode("ar");
    setIntroOpen(false);
    if (prompt) {
      setShowCamPrompt(true);
      beginSensors();
    }
  }

  function applySim(place: Place, openAr: boolean, prompt: boolean) {
    if (!network) return;
    const pose = poseForPlace(place, network.places, network.routes);
    setSimFix({
      lat: pose.lat,
      lon: pose.lon,
      accuracy: null,
      simulated: true,
      label: place.name,
      placeId: place.id,
    });
    setUseSim(true);
    if (deviceRef.current == null) {
      manualLock.current = true;
      manualRef.current = pose.heading;
      setManualHeading(pose.heading);
      setHeadingMode("manual");
    }
    setPanToken((value) => value + 1);
    setSimOpen(false);
    if (!openAr) return;
    setMode("ar");
    setIntroOpen(false);
    if (prompt && camState !== "live") {
      setShowCamPrompt(true);
      beginSensors();
    } else if (camState !== "live") {
      setShowCamPrompt(true);
    }
  }

  useEffect(() => {
    if (!network || booted.current) return;
    booted.current = true;
    const params = new URLSearchParams(window.location.search);
    const simId = params.get("sim");
    const view = params.get("view");
    if (simId) {
      const place = network.places.find((item) => item.id === simId || item.code === simId);
      if (place) applySim(place, view === "ar", false);
    } else if (view === "ar") {
      setMode("ar");
      setShowCamPrompt(true);
    }
    if (view || simId) setIntroOpen(false);
    // Boot from the URL once, after the GeoJSON arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  function onLook(dHeading: number, dPitch: number) {
    const base =
      modeRef.current === "device" && deviceRef.current != null ? deviceRef.current : manualRef.current;
    const next = wrap360(base + dHeading);
    manualRef.current = next;
    manualLock.current = true;
    setManualHeading(next);
    setHeadingMode("manual");
    setPitch((value) => Math.max(-42, Math.min(28, value + dPitch)));
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (mode !== "ar") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.key === "ArrowLeft") onLook(-8, 0);
      if (event.key === "ArrowRight") onLook(8, 0);
      if (event.key === "ArrowUp") onLook(0, -4);
      if (event.key === "ArrowDown") onLook(0, 4);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const nearest = useMemo(() => {
    if (!fix || !network) return null;
    let best: Place | null = null;
    let dist = Infinity;
    for (const place of network.places) {
      if (place.kind !== "station") continue;
      const meters = haversine(fix.lat, fix.lon, place.lat, place.lon);
      if (meters < dist) {
        dist = meters;
        best = place;
      }
    }
    return best ? { place: best, phrase: lookPhrase(fix.lat, fix.lon, best.lat, best.lon, liveHeading) } : null;
  }, [fix, network, liveHeading]);

  const farAway =
    !!fix && !fix.simulated && haversine(fix.lat, fix.lon, 23.48, 120.44) > 25_000;

  const stations = network?.places.filter((place) => place.kind === "station") ?? [];
  const ends = network?.places.filter((place) => place.kind !== "station") ?? [];

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-ink text-foreground">
      {loadError && (
        <div className="absolute inset-0 z-[1500] grid place-items-center bg-paper p-6 text-center">
          <p>{loadError}</p>
        </div>
      )}
      {network && mode === "map" && (
        <MapPane
          network={network}
          fix={fix}
          showConcepts={showConcepts}
          panToken={panToken}
          onSimulate={(place) => applySim(place, false, false)}
          onOpenAr={(place) => applySim(place, true, true)}
        />
      )}
      {network && mode === "ar" && (
        <ArPane
          routes={network.routes}
          places={network.places}
          fix={fix}
          stream={stream}
          heading={liveHeading}
          pitch={pitch}
          hFov={hFov}
          showConcepts={showConcepts}
          onLook={onLook}
        />
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1200] flex items-start justify-between gap-3 px-3 pt-[max(0.7rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto max-w-[70%] rounded-2xl bg-paper/92 px-3 py-2 shadow-lg backdrop-blur">
          <p className="font-serif text-lg leading-none">嘉義輕軌實境</p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">近似示範 · 不能拿來導航</p>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="pointer-events-auto shadow-lg"
          aria-label="資料說明"
          onClick={() => setAboutOpen(true)}
        >
          <Info />
        </Button>
      </header>

      {mode === "map" && (
        <div className="pointer-events-none absolute left-3 top-[4.6rem] z-[1100] flex max-w-[16rem] flex-col gap-2">
          <div className="pointer-events-auto rounded-2xl bg-paper/92 p-2 text-[11px] shadow-lg">
            <div className="flex items-center gap-2">
              <i className="h-1.5 w-6 rounded-full bg-[#1f5fbf]" /> 藍線 · 推估高架
            </div>
            <div className="mt-1 flex items-center gap-2">
              <i className="h-1.5 w-6 rounded-full bg-[#c47b2b]" /> 藍線 · 推估平面
            </div>
            <div className="mt-1 flex items-center gap-2">
              <i className="h-0.5 w-6 border-t-2 border-dashed border-[#5e584e]" /> 路網構想
            </div>
            <button
              type="button"
              className="mt-2 text-left text-primary underline-offset-2 hover:underline"
              onClick={() => setShowConcepts((value) => !value)}
            >
              {showConcepts ? "隱藏構想走廊" : "顯示構想走廊"}
            </button>
          </div>
        </div>
      )}

      {mode === "ar" && showCamPrompt && camState !== "live" && (
        <div className="absolute inset-x-3 top-28 z-[1250] rounded-3xl bg-paper p-4 shadow-2xl md:left-1/2 md:w-[28rem] md:-translate-x-1/2">
          <p className="font-serif text-xl">開啟街上的實境</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            需要三項權限：相機（街景底圖）、定位（你離車站多遠）、方向（標籤跟著你轉身）。iPhone 會另外跳出「動作與方向存取」。
          </p>
          {!window.isSecureContext && (
            <p className="mt-2 text-sm text-persimmon">這個網址不是 HTTPS，手機瀏覽器不會開放相機和定位。</p>
          )}
          {camMessage && <p className="mt-2 text-sm text-persimmon">{camMessage}</p>}
          {oriNote && <p className="mt-2 text-sm text-persimmon">{oriNote}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={beginSensors}>
              <Camera /> 允許並開啟
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowCamPrompt(false)}
            >
              先用手指環視
            </Button>
          </div>
        </div>
      )}

      <section className="absolute inset-x-0 bottom-0 z-[1200] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-4 md:left-4 md:w-[23rem] md:p-0">
        <div className="rounded-3xl bg-paper/95 p-3 shadow-2xl backdrop-blur">
          <p className="text-[11px] tracking-wide text-muted-foreground">
            {fix?.simulated ? `模擬定位 · ${fix.label}` : fix ? "目前位置" : "尚未定位"}
          </p>
          <p className="font-serif text-xl leading-tight">
            {nearest ? `${nearest.place.code ?? ""} ${nearest.place.name}`.trim() : "選一座車站開始"}
          </p>
          <p className="text-sm text-muted-foreground">
            {nearest ? nearest.phrase : "人在嘉義以外，也能點車站把自己放到那一站。"}
          </p>
          {farAway && (
            <p className="mt-1 text-xs text-persimmon">你離嘉義較遠，實境畫面會是空的。先模擬一座車站。</p>
          )}
          {geoMessage && <p className="mt-1 text-xs text-persimmon">{geoMessage}</p>}
          {fix && !fix.simulated && fix.accuracy != null && fix.accuracy > 80 && (
            <p className="mt-1 text-xs text-muted-foreground">定位精度約 ±{Math.round(fix.accuracy)} 公尺，距離只供參考。</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant={mode === "ar" ? "default" : "secondary"} onClick={() => enterAr(true)}>
              <Camera /> 實境
            </Button>
            <Button variant={mode === "map" ? "default" : "secondary"} onClick={() => setMode("map")}>
              <MapIcon /> 地圖
            </Button>
            <Button variant="outline" onClick={() => setSimOpen(true)}>
              模擬定位
            </Button>
            <Button variant="outline" onClick={ensureGeo}>
              <LocateFixed /> 我的位置
            </Button>
          </div>
          {mode === "ar" && (
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setCalOpen(true)}>
                <Compass /> 校正方向
              </Button>
              {headingMode === "manual" && deviceHeading != null && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    manualLock.current = false;
                    setHeadingMode("device");
                  }}
                >
                  改跟羅盤
                </Button>
              )}
              <p className="self-center text-[11px] text-muted-foreground">
                {headingMode === "device" && deviceHeading != null ? "方向來自裝置" : "方向為手動"}
              </p>
            </div>
          )}
          {useSim && (
            <button
              type="button"
              className="mt-2 text-xs text-primary"
              onClick={() => {
                setUseSim(false);
                setPanToken((value) => value + 1);
              }}
            >
              清除模擬，改用真實定位
            </button>
          )}
        </div>
      </section>

      <Dialog open={introOpen} onOpenChange={setIntroOpen}>
        <DialogContent
          title="把規劃中的輕軌，疊在這條街上"
          description="手機開啟相機、定位與羅盤。不用安裝 App。"
        >
          <p className="text-sm leading-relaxed">
            嘉義市正在推動輕軌藍線：從未來高架化的臺鐵嘉義站北側，沿自由路、世賢路、北港路與高鐵大道，到高鐵嘉義站。公布長度約 15.06 公里、13 座車站。可行性研究已送審，還沒核定，也還沒動工。
          </p>
          <p className="mt-3 rounded-2xl bg-secondary px-3 py-2 text-sm leading-relaxed">
            中間站的名字和座標是沿著公開路廊推估的，不是官方測量。路網構想線只連起點和終點。請不要拿這頁導航。
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" onClick={() => enterAr(true)}>
              <Camera /> 開啟實境
            </Button>
            <Button className="flex-1" variant="secondary" onClick={() => setIntroOpen(false)}>
              <MapIcon /> 先看地圖
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={simOpen} onOpenChange={setSimOpen}>
        <DialogContent title="模擬定位" description="人不必在嘉義。選一個點，地圖和實境都會把你放在那裡。">
          <p className="mb-2 text-xs text-muted-foreground">藍線車站</p>
          <ul className="space-y-2">
            {stations.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-2xl bg-secondary px-3 py-2 text-left"
                  onClick={() => applySim(place, mode === "ar", false)}
                >
                  <span>
                    <span className="font-medium">
                      {place.code} {place.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {place.officialName ? "公開站名" : "推估站名"} · {place.subtitle}
                    </span>
                  </span>
                  <span className="text-xs text-primary">放置</span>
                </button>
              </li>
            ))}
          </ul>
          {showConcepts && (
            <>
              <p className="mb-2 mt-4 text-xs text-muted-foreground">構想端點與機廠</p>
              <ul className="space-y-2">
                {ends.map((place) => (
                  <li key={place.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-2xl border border-border px-3 py-2 text-left"
                      onClick={() => applySim(place, mode === "ar", false)}
                    >
                      <span>
                        <span className="font-medium">{place.name}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{place.subtitle}</span>
                      </span>
                      <span className="text-xs text-primary">放置</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={calOpen} onOpenChange={setCalOpen}>
        <DialogContent title="校正" description="羅盤和相機視角每支手機都不一樣，可以在這裡微調。">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">方向微調 {offset > 0 ? `+${offset}` : offset}°</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setOffset((value) => Math.max(-60, value - 5))}>
                −5°
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setOffset((value) => Math.min(60, value + 5))}>
                ＋5°
              </Button>
            </div>
          </div>
          <label className="mt-4 block text-sm">
            相機水平視角 {hFov}°
            <input
              className="mt-2 w-full"
              type="range"
              min={48}
              max={90}
              value={hFov}
              onChange={(event) => setHFov(Number(event.target.value))}
            />
          </label>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            也可以直接在畫面上左右滑動。往右滑，視線會跟著轉向左，像在拖動街景。上下滑動改俯仰。
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent title="這是示範，不是竣工圖">
          {network && (
            <div className="space-y-3 text-sm leading-relaxed">
              <p>{network.meta.disclaimer}</p>
              <p>
                畫出來的藍線約 {network.meta.blueLine.drawnLengthKm} 公里，公布長度{" "}
                {network.meta.blueLine.publishedLengthKm} 公里。{network.meta.blueLine.alignment}
              </p>
              <p>{network.meta.blueLine.publishedVertical}</p>
              <p>
                實境裡的路線會畫得比真實透視更「貼近地面」，否則在手機上只剩貼著地平線的一條細線。方向與左右位置仍依羅盤和座標計算。
              </p>
              <p>{network.meta.blueLine.beigangRoad}</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {network.meta.blueLine.gaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
              <div>
                <p className="font-medium">手機權限</p>
                <p className="text-muted-foreground">
                  iPhone（Safari）：點「開啟實境」後會依序詢問動作與方向、相機、定位。若之前按了不允許，請到設定 &gt; Safari，把相機、定位服務、動作與方向存取改成詢問或允許，再重新整理。
                </p>
                <p className="mt-1 text-muted-foreground">
                  Android（Chrome）：網址列鎖頭可以重開相機與位置。方向使用裝置羅盤；若標籤偏了，用「校正方向」。
                </p>
              </div>
              <div>
                <p className="font-medium">資料來源</p>
                <ul className="mt-1 space-y-2">
                  {network.meta.sources.map((source) => (
                    <li key={source.url}>
                      <a className="text-primary underline-offset-2 hover:underline" href={source.url} target="_blank" rel="noreferrer">
                        {source.title}
                      </a>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{source.used}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">
                換上官方測量時，替換 <code>public/data/chiayi-lrt.geojson</code> 即可。
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
