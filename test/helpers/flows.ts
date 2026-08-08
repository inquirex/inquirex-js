// Flow fixtures shared by the widget and entry-point suites.
//
// Deliberately small: each fixture isolates one branch of the widget's
// rendering, so a failure names the behaviour rather than "the big flow broke".

import type { FlowDefinition, StepDefinition } from "../../src/types.js";

/** A one-step flow of the given step, with sensible id/version/meta. */
export function singleStepFlow(
  id: string,
  step: StepDefinition,
  extra: Partial<FlowDefinition> = {},
): FlowDefinition {
  return {
    id: "fixture",
    version: "1.0.0",
    start: id,
    steps: { [id]: step },
    ...extra,
  };
}

/** Ask one short-text question, then end. */
export const TEXT_FLOW: FlowDefinition = singleStepFlow("name", {
  verb: "ask",
  type: "string",
  question: "What is your name?",
});

/** A two-step flow: a question, then a closing message. */
export const TWO_STEP_FLOW: FlowDefinition = {
  id: "fixture",
  version: "1.0.0",
  meta: { title: "Tax Preparation Intake", subtitle: "A few quick questions" },
  start: "name",
  steps: {
    name: {
      verb: "ask",
      type: "string",
      question: "What is your name?",
      transitions: [{ to: "thanks" }],
    },
    thanks: { verb: "say", text: "Thanks — that is everything." },
  },
};

/** Single-select with options whose labels differ from their form values. */
export const ENUM_FLOW: FlowDefinition = singleStepFlow("filing_status", {
  verb: "ask",
  type: "enum",
  question: "What is your filing status?",
  options: [
    { value: "single", label: "Single" },
    { value: "married_jointly", label: "Married Filing Jointly" },
  ],
});

/** Multi-select, which needs the widget's own Continue button. */
export const MULTI_FLOW: FlowDefinition = singleStepFlow("income_types", {
  verb: "ask",
  type: "multi_enum",
  question: "Select all income types.",
  options: [
    { value: "w2", label: "W-2 employment" },
    { value: "business", label: "Business income" },
    { value: "rental", label: "Rental income" },
  ],
});

/** A yes/no gate via the `confirm` verb, which has no `type` of its own. */
export const CONFIRM_FLOW: FlowDefinition = singleStepFlow("has_dependents", {
  verb: "confirm",
  question: "Do you have dependents?",
});

/** A currency amount, for the numeric control and the money formatter. */
export const CURRENCY_FLOW: FlowDefinition = singleStepFlow("revenue", {
  verb: "ask",
  type: "currency",
  question: "Estimated revenue?",
});

/** A flow whose only step ends it, used for the completion screen. */
export const DISPLAY_FLOW: FlowDefinition = singleStepFlow("welcome", {
  verb: "say",
  text: "Welcome — this will take two minutes.",
});

/** A `summarize` step, so the flow ends on the summary screen. */
export const SUMMARIZE_FLOW: FlowDefinition = singleStepFlow("wrap_up", {
  verb: "summarize",
  thinking_label: "Writing your summary…",
});
