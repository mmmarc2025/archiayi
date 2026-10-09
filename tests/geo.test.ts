import assert from "node:assert/strict";
import { test } from "node:test";
import { bearing, destination, haversine, projectPoint, sampleLine, wrap180 } from "../src/lib/geo.ts";

test("haversine is near zero for the same point and grows northwards", () => {
  assert.ok(haversine(23.48, 120.44, 23.48, 120.44) < 1);
  const north = haversine(23.48, 120.44, 23.489, 120.44);
  assert.ok(north > 900 && north < 1100);
});

test("bearing due north is about 0", () => {
  const deg = bearing(23.48, 120.44, 23.49, 120.44);
  assert.ok(Math.abs(wrap180(deg)) < 2);
});

test("destination then haversine returns the requested distance", () => {
  const moved = destination(23.48, 120.44, 90, 500);
  const back = haversine(23.48, 120.44, moved.lat, moved.lon);
  assert.ok(Math.abs(back - 500) < 2);
  assert.ok(moved.lon > 120.44);
});

test("a point straight ahead projects near the horizontal center", () => {
  const ahead = destination(23.48, 120.44, 20, 80);
  const projected = projectPoint({
    userLat: 23.48,
    userLon: 120.44,
    lat: ahead.lat,
    lon: ahead.lon,
    heading: 20,
    pitch: 0,
    width: 400,
    height: 800,
    hFov: 60,
  });
  assert.ok(Math.abs(projected.x - 200) < 12);
  assert.ok(projected.y > 400);
  assert.ok(Math.abs(projected.rel) < 2);
});

test("sampleLine keeps the ends of a segment", () => {
  const samples = sampleLine(
    [
      [120.44, 23.48],
      [120.45, 23.48],
    ],
    200,
  );
  assert.ok(samples.length > 3);
  assert.equal(samples[0].lon, 120.44);
  assert.ok(Math.abs(samples[samples.length - 1].lon - 120.45) < 0.0001);
});
