import { lenientRecallAtK, recallAtK, selectionHit } from "../../metrics/metrics.js";
import type { FailureClassification } from "../failures/classify.js";
import { classifyAttempt, type AttemptRecord } from "../failures/classify.js";

export interface AttemptEvaluation extends FailureClassification {
  /** Null when the attempt is excluded from Recall@k. */
  recallAtK: number | null;
  lenientRecallAtK: number | null;
  /** Null when the attempt is outside the selection-accuracy denominator. */
  selectionAccuracy: number | null;
}

/** Scores one attempt. Does not grade prose and does not assign R5. */
export function evaluateAttempt(record: AttemptRecord, k: number): AttemptEvaluation {
  const classification = classifyAttempt(record);
  const decision = record.router.status === "valid" && !classification.routingExcluded ? record.router.decision : null;
  const candidates = decision === null ? [] : decision.candidates.map((candidate) => candidate.name);
  const selected = record.agent.status === "valid" ? record.agent.turn.selectedTool : null;

  return {
    ...classification,
    recallAtK: decision === null ? null : recallAtK(record.requiredTools, candidates, k),
    lenientRecallAtK:
      decision === null ? null : lenientRecallAtK(record.requiredTools, record.acceptableTools, candidates, k),
    selectionAccuracy:
      record.agent.status === "valid" ? selectionHit(record.requiredTools, candidates, selected) : null,
  };
}
