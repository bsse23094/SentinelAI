/**
 * Standalone unit test for filterAndNormalizeIssues logic.
 * Tests all 3 discard gates + severity downgrade.
 * Run: node test-filter.js
 */

const CONFIDENCE_THRESHOLD = 0.75;
const CONFIDENCE_ERROR_THRESHOLD = 0.9;

function filterAndNormalizeIssues(issues) {
  const kept = [];
  const discarded = [];
  let downgraded = 0;

  for (const issue of issues) {
    if (!issue.trigger || typeof issue.trigger !== "string" || issue.trigger.trim() === "") {
      discarded.push({ id: issue.id, rule: issue.rule, reason: "missing or empty 'trigger' field" });
      continue;
    }
    if (!issue.impact || typeof issue.impact !== "string" || issue.impact.trim() === "") {
      discarded.push({ id: issue.id, rule: issue.rule, reason: "missing or empty 'impact' field" });
      continue;
    }
    const confidence = typeof issue.confidence === "number" ? issue.confidence : -1;
    if (confidence < CONFIDENCE_THRESHOLD) {
      discarded.push({ id: issue.id, rule: issue.rule, reason: `confidence too low (${confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD})` });
      continue;
    }
    const normalized = { ...issue };
    if (normalized.severity === "error" && confidence < CONFIDENCE_ERROR_THRESHOLD) {
      normalized.severity = "warning";
      downgraded++;
    }
    kept.push(normalized);
  }

  return { kept, discarded, stats: { total: issues.length, kept: kept.length, discarded: discarded.length, downgraded } };
}

// ── Test fixtures ──
const testIssues = [
  // EXPECT: KEEP as error (conf=0.95 >= 0.9)
  { id: "s1", agent: "security", severity: "error", rule: "sql-injection",     trigger: "username + password", impact: "Attacker can dump entire DB",  confidence: 0.95 },
  // EXPECT: KEEP but DOWNGRADE error→warning (conf=0.85 < 0.9)
  { id: "s2", agent: "security", severity: "error", rule: "hardcoded-secret",  trigger: "TOKEN_ABC123",         impact: "Secret stolen from repo",      confidence: 0.85 },
  // EXPECT: KEEP as warning (already warning, conf=0.78)
  { id: "s3", agent: "complexity", severity: "warning", rule: "deep-nesting",  trigger: "if(a){if(b){if(c){",  impact: "Hard to maintain/debug",        confidence: 0.78 },
  // EXPECT: DISCARD — confidence too low (0.60 < 0.75)
  { id: "s4", agent: "smell",    severity: "warning", rule: "possible-smell",  trigger: "someVar",              impact: "Minor readability issue",       confidence: 0.60 },
  // EXPECT: DISCARD — trigger is empty
  { id: "s5", agent: "security", severity: "error",   rule: "vague-issue",    trigger: "",                     impact: "Something bad might happen",    confidence: 0.90 },
  // EXPECT: DISCARD — impact is empty
  { id: "s6", agent: "security", severity: "error",   rule: "no-impact",      trigger: "eval(userInput)",      impact: "",                              confidence: 0.95 },
  // EXPECT: DISCARD — trigger missing entirely
  { id: "s7", agent: "smell",    severity: "info",    rule: "magic-number",                                    impact: "Unclear what 86400 means",      confidence: 0.80 },
];

const result = filterAndNormalizeIssues(testIssues);

console.log("═══════════════════════════════════════════════");
console.log("  SentinelAI Filter Unit Test");
console.log("═══════════════════════════════════════════════\n");

console.log(`📊 Stats: ${result.stats.total} total → ${result.stats.kept} kept, ${result.stats.discarded} discarded, ${result.stats.downgraded} downgraded\n`);

console.log("✅ KEPT issues:");
result.kept.forEach(i => {
  const downgraded = testIssues.find(t => t.id === i.id)?.severity !== i.severity ? " [DOWNGRADED]" : "";
  console.log(`  [${i.severity.toUpperCase()}] ${i.rule} (confidence=${i.confidence})${downgraded}`);
});

console.log("\n❌ DISCARDED issues:");
result.discarded.forEach(d => {
  console.log(`  [${d.id}] ${d.rule}: ${d.reason}`);
});

// Assertions
let pass = true;
function assert(condition, msg) {
  if (!condition) { console.error("\n  FAIL: " + msg); pass = false; }
}

assert(result.stats.kept === 3,       "Should keep exactly 3 issues");
assert(result.stats.discarded === 4,  "Should discard exactly 4 issues");
assert(result.stats.downgraded === 1, "Should downgrade exactly 1 issue");
assert(result.kept.find(i => i.id === "s1")?.severity === "error",   "s1 should remain ERROR (conf=0.95)");
assert(result.kept.find(i => i.id === "s2")?.severity === "warning", "s2 should be DOWNGRADED to warning (conf=0.85)");
assert(result.kept.find(i => i.id === "s3")?.severity === "warning", "s3 should remain WARNING");
assert(!result.kept.find(i => i.id === "s4"), "s4 should be DISCARDED (low confidence)");
assert(!result.kept.find(i => i.id === "s5"), "s5 should be DISCARDED (empty trigger)");
assert(!result.kept.find(i => i.id === "s6"), "s6 should be DISCARDED (empty impact)");
assert(!result.kept.find(i => i.id === "s7"), "s7 should be DISCARDED (missing trigger)");

console.log(pass ? "\n🎉 ALL ASSERTIONS PASSED" : "\n💥 SOME ASSERTIONS FAILED");
