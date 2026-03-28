// Night Shift MVP — Automatic issue selection and risk scoring (SPEC.md §13)

import type { GitHubIssue, RiskLevel } from "./types";

type SelectionResult = {
  issue: GitHubIssue;
  selectionReason: string;
  riskLevel: RiskLevel;
  summary: string;
  acceptanceCriteria: string[];
  nonGoals: string[];
  riskNote: string;
};

// Heuristic scoring: prefer bounded, specific, small issues.
function score(issue: GitHubIssue): number {
  let s = 0;
  const body = issue.body ?? "";
  const titleLen = issue.title.length;

  // Prefer issues with descriptive but not too long titles
  if (titleLen > 10 && titleLen < 120) s += 2;

  // Prefer issues with a body
  if (body.length > 20) s += 2;
  if (body.length > 200) s += 1;

  // Bonus for issues with actionable keywords
  const actionWords = /\b(fix|add|update|implement|create|remove|change|refactor|bug|feature)\b/i;
  if (actionWords.test(issue.title)) s += 3;

  // Penalty for oversized issues
  if (body.length > 3000) s -= 2;

  // Penalty for ambiguous / multi-step signals
  const multiStep = /\b(phase|step\s?\d|epic|milestone|rfc|proposal|discussion)\b/i;
  if (multiStep.test(issue.title) || multiStep.test(body)) s -= 4;

  // Bonus for labels suggesting bounded work
  const goodLabels = ["bug", "enhancement", "good first issue", "help wanted"];
  for (const l of issue.labels) {
    if (goodLabels.includes(l.name.toLowerCase())) s += 2;
  }

  // Penalty for blocked signals
  if (/\bblocked\b/i.test(body)) s -= 3;

  return s;
}

export function classifyRisk(issue: GitHubIssue): { level: RiskLevel; note: string } {
  const text = `${issue.title} ${issue.body ?? ""}`.toLowerCase();

  const highRiskPatterns = [
    /\b(auth|authentication|authorization|security|password|token|secret)\b/,
    /\b(database|migration|schema|deploy|production|infra)\b/,
    /\b(payment|billing|stripe|subscription)\b/,
    /\b(delete|drop|remove\s+all|destroy)\b/,
    /\b(breaking\s+change|major\s+refactor)\b/,
  ];

  for (const p of highRiskPatterns) {
    if (p.test(text)) {
      return {
        level: "high",
        note: `Matched high-risk pattern: ${p.source}. Approval required before execution.`,
      };
    }
  }

  return { level: "low", note: "No high-risk patterns detected. Safe to auto-start." };
}

export function selectIssue(issues: GitHubIssue[], preferIssueNumber?: number): SelectionResult | null {
  if (issues.length === 0) return null;

  // Filter out PRs just in case
  const candidates = issues.filter((i) => !i.pull_request);
  if (candidates.length === 0) return null;

  // If a specific issue is requested, use that
  if (preferIssueNumber) {
    const preferred = candidates.find((i) => i.number === preferIssueNumber);
    if (preferred) {
      const { level, note } = classifyRisk(preferred);
      const body = preferred.body ?? "";
      const summary = `Implement: ${preferred.title}. ${body.slice(0, 300)}${body.length > 300 ? "…" : ""}`;
      const acceptanceCriteria = extractCriteria(body, preferred.number);
      const nonGoals = [
        "Do not expand scope beyond the issue description",
        "Do not refactor unrelated code",
        "Do not modify CI/CD configuration",
      ];
      return {
        issue: preferred,
        selectionReason: `Operator selected issue #${preferred.number} directly.`,
        riskLevel: level,
        summary,
        acceptanceCriteria,
        nonGoals,
        riskNote: note,
      };
    }
  }

  // Score and sort
  const scored = candidates
    .map((issue) => ({ issue, score: score(issue) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0].issue;
  const { level, note } = classifyRisk(best);
  const body = best.body ?? "";

  // Generate mission draft
  const summary = `Implement: ${best.title}. ${body.slice(0, 300)}${body.length > 300 ? "…" : ""}`;

  // Extract acceptance criteria from issue body if available
  const acceptanceCriteria = extractCriteria(body, best.number);


  const nonGoals = [
    "Do not expand scope beyond the issue description",
    "Do not refactor unrelated code",
    "Do not modify CI/CD configuration",
  ];

  const selectionReason =
    `Selected issue #${best.number} ("${best.title}") because it is bounded, specific, ` +
    `and likely implementable in one mission. Score: ${scored[0].score}/${candidates.length} candidates evaluated.`;

  return {
    issue: best,
    selectionReason,
    riskLevel: level,
    summary,
    acceptanceCriteria,
    nonGoals,
    riskNote: note,
  };
}

/**
 * Extract acceptance criteria from issue body.
 * Looks for bullet lists under "Acceptance Criteria" headers, or any "- " items.
 * Falls back to generic criteria if nothing found.
 */
function extractCriteria(body: string, issueNumber: number): string[] {
  if (!body) {
    return [
      `Issue #${issueNumber} requirements are satisfied`,
      "All existing tests continue to pass",
    ];
  }

  // Look for section after "Acceptance Criteria" header
  const acMatch = body.match(/#+\s*Acceptance\s*Criteria\s*\n([\s\S]*?)(?=\n#|\n##|$)/i);
  const section = acMatch ? acMatch[1] : body;

  // Extract bullet items (- or * prefixed lines)
  const bullets = section
    .split("\n")
    .map((line) => line.replace(/^[\s]*[-*]\s*/, "").trim())
    .filter((line) => line.length > 5 && line.length < 200 && !line.startsWith("#"));

  if (bullets.length >= 2) {
    // Add standard checks to extracted criteria
    return [...bullets.slice(0, 8), "All existing tests continue to pass"];
  }

  // Fallback
  return [
    `Issue #${issueNumber} requirements are satisfied`,
    "All existing tests continue to pass",
    "New functionality has appropriate test coverage",
  ];
}
