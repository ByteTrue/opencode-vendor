import test from "node:test"
import assert from "node:assert/strict"

import {
  collectOfficialCandidates,
  formatOfficialCandidate,
  groupOfficialModelsById,
  listAllOfficialModels,
  type CatalogProvider,
} from "../src/shared/catalog"

const catalog: Record<string, CatalogProvider> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    npm: "@ai-sdk/openai",
    api: "https://api.openai.com/v1",
    models: {
      "gpt-4o": { id: "gpt-4o", name: "GPT-4o", limit: { context: 128000, output: 16384 } },
      "gpt-4o-mini": { id: "gpt-4o-mini", name: "GPT-4o mini" },
    },
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    api: "https://openrouter.ai/api/v1",
    models: {
      "gpt-4o": { id: "gpt-4o", name: "GPT-4o Router" },
    },
  },
}

test("official catalog helpers group model ids across providers", () => {
  const entries = listAllOfficialModels(catalog)
  const groups = groupOfficialModelsById(entries)

  assert.deepEqual(groups.map((group) => group.modelId), ["gpt-4o", "gpt-4o-mini"])
  assert.deepEqual(groups[0]?.entries.map((entry) => entry.provider.id), ["openai", "openrouter"])
})

test("collectOfficialCandidates returns confirmation candidates for exact ids", () => {
  const candidates = collectOfficialCandidates(catalog, "gpt-4o")

  assert.equal(candidates.length, 2)
  assert.match(formatOfficialCandidate(candidates[0]!), /openai\/gpt-4o/)
  assert.deepEqual(candidates[0]?.configReadyModel, {
    id: "gpt-4o",
    name: "GPT-4o",
    limit: { context: 128000, output: 16384 },
  })
})
