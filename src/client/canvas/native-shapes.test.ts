import assert from "node:assert/strict";
import test from "node:test";
import { EXTRA_OBJECT_PROPERTIES } from "../canvas-model";
import { configureNativeShapeControls } from "./native-shape-controls";
import { chartSeriesFor, type SmartChartData } from "./smart-elements";
import { buildNativeShape, createNativeShapeData, dashArrayFor, normalizeNativeShapeData } from "./native-shapes";

test("native shape defaults remain persistent and bounded", () => {
  const data = createNativeShapeData("star", "#123456");
  assert.equal(data.kind, "star");
  assert.equal(data.fillColor, "#123456");
  assert.equal(data.points, 5);
  assert.ok(EXTRA_OBJECT_PROPERTIES.includes("ddoneNativeShapeData"));

  const normalized = normalizeNativeShapeData({ ...data, points: 100, progress: -20, strokeWidth: 999 });
  assert.equal(normalized.points, 24);
  assert.equal(normalized.progress, 0);
  assert.equal(normalized.strokeWidth, 160);
});

test("stroke presets create distinct dash sequences", () => {
  assert.equal(dashArrayFor({ strokeStyle: "solid", strokeWidth: 4, customDash: [] }), undefined);
  assert.deepEqual(dashArrayFor({ strokeStyle: "dashed", strokeWidth: 4, customDash: [] }), [10, 6]);
  assert.deepEqual(dashArrayFor({ strokeStyle: "dotted", strokeWidth: 4, customDash: [] }), [0.01, 7.2]);
  assert.deepEqual(dashArrayFor({ strokeStyle: "custom", strokeWidth: 4, customDash: [12, 5, 2] }), [12, 5, 2]);
});

test("shape-specific canvas handles are attached", () => {
  const arc = buildNativeShape(createNativeShapeData("arc"));
  configureNativeShapeControls(arc);
  assert.ok(arc.controls.ddoneArcStart);
  assert.ok(arc.controls.ddoneArcEnd);

  const progress = buildNativeShape(createNativeShapeData("progress-ring"));
  configureNativeShapeControls(progress);
  assert.ok(progress.controls.ddoneArcStart);
  assert.ok(progress.controls.ddoneProgress);

  const star = buildNativeShape(createNativeShapeData("star"));
  configureNativeShapeControls(star);
  assert.ok(star.controls.ddoneInner);
});

test("gradient handles match the fill mode", () => {
  const linearData = createNativeShapeData("rounded-rect");
  linearData.fillMode = "linear";
  const linear = buildNativeShape(linearData);
  configureNativeShapeControls(linear);
  assert.ok(linear.controls.ddoneGradientStart);
  assert.ok(linear.controls.ddoneGradientEnd);
  assert.ok(linear.controls.ddoneRadius);

  const radialData = createNativeShapeData("circle");
  radialData.fillMode = "radial";
  const radial = buildNativeShape(radialData);
  configureNativeShapeControls(radial);
  assert.ok(radial.controls.ddoneGradientCenter);
  assert.ok(radial.controls.ddoneGradientRadius);
});

test("legacy single-series charts are upgraded without losing data", () => {
  const legacy: SmartChartData = {
    type: "chart",
    variant: "chart-line",
    chartType: "line",
    width: 620,
    height: 420,
    title: "Legacy",
    labels: ["A", "B", "C"],
    values: [10, 20, 30],
    colors: ["#7c3aed"],
    backgroundColor: "#ffffff",
    textColor: "#18181b",
    gridColor: "#e4e4e7",
    showLegend: false,
    showValues: true,
    rounded: true,
  };
  assert.deepEqual(chartSeriesFor(legacy), [{ name: "Serie A", values: [10, 20, 30], color: "#7c3aed" }]);
});

test("multi-series charts keep names values and colors", () => {
  const data = {
    type: "chart",
    variant: "chart-grouped",
    chartType: "grouped-bar",
    width: 620,
    height: 420,
    title: "Series",
    labels: ["A", "B"],
    values: [1, 2],
    colors: ["#111111", "#222222"],
    series: [
      { name: "Uno", values: [1, 2], color: "#111111" },
      { name: "Due", values: [3, 4], color: "#222222" },
    ],
    backgroundColor: "#ffffff",
    textColor: "#18181b",
    gridColor: "#e4e4e7",
    showLegend: true,
    showValues: true,
    rounded: true,
  } satisfies SmartChartData;
  assert.deepEqual(chartSeriesFor(data), data.series);
});
