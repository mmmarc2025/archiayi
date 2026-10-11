import assert from "node:assert/strict";
import { test } from "node:test";
import { destination, projectPoint } from "../src/lib/geo.ts";
import {
  CAMERA_HEIGHT,
  eastNorth,
  projectWorld,
  ribbonBaseY,
  routeBearingDeg,
  routeOffsetMeters,
  stationCrownY,
  stationModelPoses,
  stationScale,
  verticalFov,
} from "../src/lib/spatial.ts";
import type { Place } from "../src/lib/types.ts";

function place(partial: Pick<Place, "id" | "name" | "lat" | "lon"> & Partial<Place>): Place {
  return {
    kind: "station",
    officialName: false,
    precision: "approximate",
    note: "",
    line: "blue",
    ...partial,
  };
}

test("eastNorth grows east and north in meters", () => {
  const east = eastNorth(23.48, 120.45, 23.48, 120.44);
  assert.ok(east.east > 900 && east.east < 1100);
  assert.ok(Math.abs(east.north) < 8);
  const north = eastNorth(23.49, 120.44, 23.48, 120.44);
  assert.ok(north.north > 1000 && north.north < 1200);
  assert.ok(Math.abs(north.east) < 8);
});

test("station long axis follows the route and the platform sits to the left of travel", () => {
  const along = routeOffsetMeters(90, 0, 10);
  assert.ok(along.east > 9);
  assert.ok(Math.abs(along.north) < 0.5);
  const side = routeOffsetMeters(0, 4, 0);
  assert.ok(side.east < -3);
  assert.ok(Math.abs(side.north) < 0.5);
});

test("route bearing points from one stop toward the next", () => {
  const origin = place({ id: "a", name: "甲", lat: 23.48, lon: 120.44, chainageM: 0 });
  const next = destination(23.48, 120.44, 90, 400);
  const east = place({ id: "b", name: "乙", lat: next.lat, lon: next.lon, chainageM: 400 });
  const deg = routeBearingDeg(origin, [origin, east]);
  assert.ok(Math.abs(deg - 90) < 2);
});

test("readable scale stays near life size up close and does not run away", () => {
  const crown = stationCrownY(false);
  const near = stationScale(40, crown, 60);
  const mid = stationScale(220, crown, 60);
  assert.ok(near >= 0.85 && near <= 2.2);
  assert.ok(mid >= near);
  assert.ok(mid <= 3.6);
  assert.equal(stationModelPoses([place({ id: "far", name: "遠", lat: 23.6, lon: 120.44 })], 23.48, 120.44, 60).length, 0);
});

test("station base shares the ribbon screen row", () => {
  const ahead = destination(23.48, 120.44, 30, 80);
  const width = 390;
  const height = 800;
  const hFov = 67;
  const pitch = -14;
  const ribbon = projectPoint({
    userLat: 23.48,
    userLon: 120.44,
    lat: ahead.lat,
    lon: ahead.lon,
    heading: 30,
    pitch,
    width,
    height,
    hFov,
    ground: "ribbon",
  });
  const { east, north } = eastNorth(ahead.lat, ahead.lon, 23.48, 120.44);
  const vFov = verticalFov(hFov, width, height);
  const base = ribbonBaseY(ribbon.dist, vFov);
  assert.ok(base < CAMERA_HEIGHT);
  const world = projectWorld({
    east,
    north,
    height: base,
    heading: 30,
    pitch,
    width,
    heightPx: height,
    hFov,
  });
  assert.ok(Math.abs(world.y - ribbon.y) < 8);
  assert.ok(Math.abs(world.x - ribbon.x) < 8);
});

test("only the nearest few stations get a model", () => {
  const places: Place[] = [];
  for (let i = 0; i < 6; i += 1) {
    const point = destination(23.48, 120.44, 90, 80 + i * 120);
    places.push(
      place({
        id: `s${i}`,
        name: `站${i}`,
        lat: point.lat,
        lon: point.lon,
        chainageM: i * 120,
        code: `B0${i}`,
      }),
    );
  }
  const poses = stationModelPoses(places, 23.48, 120.44, 50);
  assert.equal(poses.length, 4);
  assert.ok(poses[0].dist < poses[1].dist);
  assert.equal(poses[0].showDetail, true);
});
