import test from "node:test"
import assert from "node:assert/strict"

import { createDefaultModelConfig, createTemplateModelConfig, matchTemplate, type ModelTemplate } from "../src/shared/templates"

test("matchTemplate prefers exact matches and then longest prefix", () => {
  const templates: ModelTemplate[] = [
    { prefix: "gpt", name: "GPT family" },
    { prefix: "gpt-4.1", name: "GPT-4.1 family" },
    { id: "gpt-4o", name: "GPT-4o exact" },
  ]

  assert.deepEqual(matchTemplate("gpt-4o", templates), templates[2])
  assert.deepEqual(matchTemplate("gpt-4.1-mini", templates), templates[1])
})

test("template configs use OpenCode model fields", () => {
  assert.deepEqual(createDefaultModelConfig("mystery"), {
    id: "mystery",
    name: "mystery",
    reasoning: false,
    limit: { context: 128000, output: 16384 },
    modalities: { input: ["text"], output: ["text"] },
  })

  assert.deepEqual(createTemplateModelConfig("custom", {
    name: "Custom",
    reasoning: true,
    input: ["text", "image"],
    context: 200000,
    output: 4096,
  }), {
    id: "custom",
    name: "Custom",
    reasoning: true,
    limit: { context: 200000, output: 4096 },
    modalities: { input: ["text", "image"], output: ["text"] },
  })
})
