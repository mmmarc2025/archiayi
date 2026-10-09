import { bearing, destination, sampleLine, wrap360 } from "./geo";
import type { Network, NetworkMeta, Place, PlaceKind, RouteModel } from "./types";

interface RawFeature {
  type: "Feature";
  geometry:
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

interface RawCollection {
  metadata?: NetworkMeta;
  features: RawFeature[];
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function loadNetwork(): Promise<Network> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/chiayi-lrt.geojson`);
  if (!response.ok) throw new Error(`讀取路線資料失敗（${response.status}）`);
  const raw = (await response.json()) as RawCollection;
  const routes: RouteModel[] = [];
  const places: Place[] = [];

  for (const feature of raw.features) {
    const props = feature.properties ?? {};
    if (feature.geometry.type === "LineString") {
      const group = props.group === "concept" ? "concept" : "blue";
      const coords = feature.geometry.coordinates;
      routes.push({
        id: str(props.id),
        name: str(props.name, "路線"),
        group,
        status: str(props.status),
        precision: str(props.precision),
        color: str(props.color, "#1f5fbf"),
        dashed: Boolean(props.dashed),
        vertical: str(props.vertical, "unknown"),
        summary: str(props.summary),
        lengthPublishedKm: num(props.lengthPublishedKm),
        lengthDrawnKm: num(props.lengthDrawnKm) ?? 0,
        coords,
        samples: sampleLine(coords, group === "blue" ? 22 : 90),
      });
      continue;
    }
    const [lon, lat] = feature.geometry.coordinates;
    const kind = str(props.kind, "station") as PlaceKind;
    places.push({
      id: str(props.id),
      name: str(props.name, "未命名"),
      kind,
      line: str(props.line) || undefined,
      code: str(props.code) || undefined,
      officialName: Boolean(props.officialName),
      precision: props.precision === "schematic" ? "schematic" : "approximate",
      area: str(props.area) || undefined,
      subtitle: str(props.subtitle) || undefined,
      note: str(props.note),
      chainageM: num(props.chainageM) ?? undefined,
      lat,
      lon,
    });
  }

  const meta = raw.metadata ?? {
    title: "嘉義輕軌",
    disclaimer: "示範資料。",
    blueLine: {
      publishedLengthKm: 15.06,
      drawnLengthKm: 0,
      publishedStations: 13,
      publishedVertical: "",
      alignment: "",
      gaps: [],
      beigangRoad: "",
    },
    sources: [],
  };

  return { meta, routes, places };
}

export function poseForPlace(place: Place, places: Place[], routes: RouteModel[]) {
  if (place.kind === "station") {
    const blues = places
      .filter((item) => item.kind === "station")
      .sort((a, b) => (a.chainageM ?? 0) - (b.chainageM ?? 0));
    const index = blues.findIndex((item) => item.id === place.id);
    const anchor = index <= 0 ? blues[Math.min(1, blues.length - 1)] : blues[index - 1];
    if (anchor && anchor.id !== place.id) {
      const backward =
        index <= 0
          ? wrap360(bearing(place.lat, place.lon, anchor.lat, anchor.lon) + 180)
          : bearing(place.lat, place.lon, anchor.lat, anchor.lon);
      const stand = destination(place.lat, place.lon, backward, 58);
      return {
        ...stand,
        heading: bearing(stand.lat, stand.lon, place.lat, place.lon),
      };
    }
  }

  const route = routes.find((item) => item.id === place.line);
  if (route && route.coords.length >= 2) {
    const start = route.coords[0];
    const end = route.coords[route.coords.length - 1];
    const nearStart =
      Math.hypot(place.lon - start[0], place.lat - start[1]) <
      Math.hypot(place.lon - end[0], place.lat - end[1]);
    const other = nearStart ? end : start;
    const stand = destination(place.lat, place.lon, bearing(place.lat, place.lon, other[1], other[0]), 80);
    return {
      ...stand,
      heading: bearing(stand.lat, stand.lon, place.lat, place.lon),
    };
  }

  const stand = destination(place.lat, place.lon, 180, 60);
  return { ...stand, heading: bearing(stand.lat, stand.lon, place.lat, place.lon) };
}
