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

test("instelbare significantie", async () => {
  const { DEFAULT_SIGNIFICANCE_RULE, determineAspectSignificance, describeSignificanceRule, parseSignificanceRule } = await import("./aspects");
  const base = { priority: "LOW" as const, effectScore: 15, exposure: 6, probability: 1, legalApplies: true, complaints: false }; // risico 90 = hoog
  assert.equal(determineAspectSignificance(base, DEFAULT_SIGNIFICANCE_RULE).significant, false);
  assert.deepEqual(determineAspectSignificance({ ...base, priority: "MEDIUM" }, DEFAULT_SIGNIFICANCE_RULE).reasons, ["Prio M"]);
  const rule = { priorities: ["HIGH" as const], minRiskLevel: "high" as const, legal: true, complaints: true };
  assert.deepEqual(determineAspectSignificance(base, rule).reasons, ["Risico hoog", "Wettelijke eis"]);
  assert.equal(determineAspectSignificance({ ...base, effectScore: 3, legalApplies: false }, rule).significant, false);
  assert.equal(describeSignificanceRule(DEFAULT_SIGNIFICANCE_RULE), "prio H of M");
  assert.equal(describeSignificanceRule(rule), "prio H, of risico hoog of hoger, of een wettelijke eis, of klachten");
  assert.deepEqual(parseSignificanceRule("kapot"), DEFAULT_SIGNIFICANCE_RULE);
  assert.deepEqual(parseSignificanceRule(JSON.stringify({ priorities: ["HIGH", "X"], minRiskLevel: "medium", legal: true })), {
    priorities: ["HIGH"],
    minRiskLevel: "medium",
    legal: true,
    complaints: false,
  });
});
