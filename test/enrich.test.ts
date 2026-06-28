import test from "node:test"
import assert from "node:assert/strict"

import { enrichModelId } from "../src/shared/enrich"
import type { CatalogProvider } from "../src/shared/catalog"

test("enrichModelId asks for confirmation even with one official candidate", async () => {
  const catalog: Record<string, CatalogProvider> = {
    openai: {
      id: "openai",
      models: {
        "gpt-4o": { id: "gpt-4o", name: "Official GPT-4o" },
      },
    },
  }

  const result = await enrichModelId("gpt-4o", {
    catalog,
    templates: [{ id: "gpt-4o", name: "Template GPT-4o" }],
  })

  assert.equal(result.kind, "official-ambiguous")
  if (result.kind === "official-ambiguous") {
    assert.equal(result.candidates.length, 1)
    assert.equal(result.candidates[0]?.provider.id, "openai")
  }
})

test("enrichModelId falls back to templates and then defaults", async () => {
  const templated = await enrichModelId("gpt-4.1-mini", {
    catalog: null,
    templates: [
      { prefix: "gpt", name: "GPT family", context: 1, output: 1 },
      { prefix: "gpt-4.1", name: "GPT-4.1 family", reasoning: true, input: ["text", "image"], context: 2, output: 2 },
    ],
  })

  assert.deepEqual(templated, {
    kind: "ready",
    source: "template",
    model: {
      id: "gpt-4.1-mini",
      name: "GPT-4.1 family",
      reasoning: true,
      limit: { context: 2, output: 2 },
      modalities: { input: ["text", "image"], output: ["text"] },
    },
  })

  const unknown = await enrichModelId("mystery-model", { catalog: null, templates: [] })
  assert.equal(unknown.kind, "ready")
  if (unknown.kind === "ready") {
    assert.equal(unknown.source, "default")
    assert.match(unknown.warning ?? "", /mystery-model/)
    assert.equal(unknown.model.id, "mystery-model")
  }
})
