/**
 * Prompt: task-classification v1
 *
 * Classifies an agent task description into a task class used by the Trust Ledger.
 * Keyword rules run first; this prompt is only invoked when keywords are ambiguous.
 */
import { z } from "zod";
import type { PromptDescriptor } from "../prompt-registry.js";

const TASK_CLASSES = ["feature", "bugfix", "refactor", "docs", "test", "config", "security", "unknown"] as const;
export type TaskClass = typeof TASK_CLASSES[number];

export const taskClassificationInputSchema = z.object({
  task: z.string().min(1),
  plannedPaths: z.array(z.string()).optional(),
  plannedChanges: z.string().optional()
});
export type TaskClassificationInput = z.infer<typeof taskClassificationInputSchema>;

export const taskClassificationOutputSchema = z.object({
  taskClass: z.enum(TASK_CLASSES),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string()
});
export type TaskClassificationOutput = z.infer<typeof taskClassificationOutputSchema>;

export const taskClassificationPrompt: PromptDescriptor<TaskClassificationInput, TaskClassificationOutput> = {
  name: "task-classification",
  version: "1",
  systemPrompt: `You are classifying an AI agent's task into one of these categories:
feature, bugfix, refactor, docs, test, config, security, unknown.
Consider the task description, planned file paths, and planned changes.
Return ONLY valid JSON. No markdown.`,

  buildUserPrompt: (input: TaskClassificationInput) =>
    `Task: "${input.task}"
${input.plannedPaths?.length ? `Planned paths: ${input.plannedPaths.join(", ")}` : ""}
${input.plannedChanges ? `Planned changes: ${input.plannedChanges.slice(0, 400)}` : ""}

Return JSON: { "taskClass": "...", "confidence": "high|medium|low", "reasoning": "..." }`,

  inputSchema: taskClassificationInputSchema,
  outputSchema: taskClassificationOutputSchema,
  repairPrompt: "Invalid JSON. taskClass must be one of: feature, bugfix, refactor, docs, test, config, security, unknown."
};
