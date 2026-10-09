import type { Sample } from "./geo";

export type PlaceKind = "station" | "corridor-end" | "depot";

export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  line?: string;
  code?: string;
  officialName: boolean;
  precision: "approximate" | "schematic";
  area?: string;
  subtitle?: string;
  note: string;
  chainageM?: number;
  lat: number;
  lon: number;
}

export interface RouteModel {
  id: string;
  name: string;
  group: "blue" | "concept";
  status: string;
  precision: string;
  color: string;
  dashed: boolean;
  vertical: string;
  summary: string;
  lengthPublishedKm: number | null;
  lengthDrawnKm: number;
  coords: [number, number][];
  samples: Sample[];
}

export interface SourceNote {
  title: string;
  url: string;
  used: string;
}

export interface NetworkMeta {
  title: string;
  disclaimer: string;
  blueLine: {
    publishedLengthKm: number;
    drawnLengthKm: number;
    publishedStations: number;
    publishedVertical: string;
    alignment: string;
    gaps: string[];
    beigangRoad: string;
  };
  sources: SourceNote[];
}

export interface Network {
  meta: NetworkMeta;
  routes: RouteModel[];
  places: Place[];
}

export interface Fix {
  lat: number;
  lon: number;
  accuracy: number | null;
  simulated: boolean;
  label: string;
  placeId?: string;
}
