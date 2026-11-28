import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aspectCode,
  aspectDisplayCode,
  aspectRisk,
  aspectRiskLevel,
  aspectTypeFromTheme,
  defaultCo2Relevant,
  isSignificant,
  prioritySignal,
  situationFromTheme,
} from "./aspects";

test("codes", () => {
  assert.equal(aspectCode(4), "MA-004");
  assert.equal(aspectDisplayCode({ number: 4, externalRef: "A004" }), "A004");
  assert.equal(aspectDisplayCode({ number: 4, externalRef: null }), "MA-004");
});

test("risico = E × B × W (Fine & Kinney)", () => {
  assert.equal(aspectRisk(3, 7, 3), 63);
  assert.equal(aspectRisk(7, 6, 0.5), 21);
  assert.equal(aspectRisk("3", "0.5", "0.1"), 0.15);
  assert.equal(aspectRisk(3, null, 1), null);
  assert.equal(aspectRisk(3, 0, 1), 0);
});

test("risiconiveau: ≤20 laag, ≤70 middel, ≤200 hoog, daarboven zeer hoog", () => {
  assert.equal(aspectRiskLevel(20), "low");
  assert.equal(aspectRiskLevel(20.5), "medium");
  assert.equal(aspectRiskLevel(70), "medium");
  assert.equal(aspectRiskLevel(71), "high");
  assert.equal(aspectRiskLevel(200), "high");
  assert.equal(aspectRiskLevel(201), "veryHigh");
  assert.equal(aspectRiskLevel(null), null);
});

test("significant = prio hoog of middel", () => {
  assert.equal(isSignificant("HIGH"), true);
  assert.equal(isSignificant("MEDIUM"), true);
  assert.equal(isSignificant("LOW"), false);
  assert.equal(isSignificant(null), false);
});

test("signaal prio en risico (kansen tellen niet mee)", () => {
  assert.equal(prioritySignal({ priority: "LOW", risk: 63, opportunity: false }), "lower");
  assert.equal(prioritySignal({ priority: "HIGH", risk: 9, opportunity: false }), "higher");
  assert.equal(prioritySignal({ priority: "MEDIUM", risk: 63, opportunity: false }), null);
  assert.equal(prioritySignal({ priority: "HIGH", risk: 250, opportunity: false }), null);
  assert.equal(prioritySignal({ priority: "LOW", risk: 63, opportunity: true }), null);
  assert.equal(prioritySignal({ priority: null, risk: 63, opportunity: false }), null);
});

test("type, situatie en CO2 uit het thema", () => {
  assert.equal(aspectTypeFromTheme("Geluid"), "NOISE");
  assert.equal(aspectTypeFromTheme("F-gassen"), "AIR");
  assert.equal(aspectTypeFromTheme("CO₂"), "ENERGY");
  assert.equal(aspectTypeFromTheme("Calamiteiten"), "OTHER");
  assert.equal(aspectTypeFromTheme("", "lozing spoelwater"), "WATER");
  assert.equal(situationFromTheme("Calamiteiten"), "EMERGENCY");
  assert.equal(situationFromTheme("Bodem"), "NORMAL");
  assert.equal(defaultCo2Relevant("Energie"), true);
  assert.equal(defaultCo2Relevant("CO₂"), true);
  assert.equal(defaultCo2Relevant("Geluid", "Energie, CO₂ en elektrificatie"), true);
  assert.equal(defaultCo2Relevant("Geluid", "Wet- en regelgeving"), false);
});
