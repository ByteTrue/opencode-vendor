import test from "node:test"
import assert from "node:assert/strict"

import {
  buildOpenAIModelsUrl,
  fetchOpenAIModelIds,
  parseOpenAIModelsResponse,
  resolveApiKeyValue,
} from "../src/shared/openai-models"

test("buildOpenAIModelsUrl appends /models", () => {
  assert.equal(buildOpenAIModelsUrl("https://example.com/v1"), "https://example.com/v1/models")
  assert.equal(buildOpenAIModelsUrl("https://example.com/v1/"), "https://example.com/v1/models")
})

test("resolveApiKeyValue supports env references", () => {
  assert.deepEqual(resolveApiKeyValue("literal-key", {}), { value: "literal-key", source: "literal" })
  assert.deepEqual(resolveApiKeyValue("$DEMO_KEY", { DEMO_KEY: "secret" } as NodeJS.ProcessEnv), {
    value: "secret",
    source: "env",
  })
})

test("parseOpenAIModelsResponse returns sorted unique ids", () => {
  assert.deepEqual(
    parseOpenAIModelsResponse({
      data: [{ id: "z-model" }, { id: "a-model" }, { id: "z-model" }, { nope: true }],
    }),
    ["a-model", "z-model"],
  )
})

test("fetchOpenAIModelIds requests /models with bearer auth", async () => {
  const seen: Array<{ input: string; headers?: Record<string, string> }> = []
  const ids = await fetchOpenAIModelIds(
    {
      baseURL: "https://example.com/v1",
      apiKey: "secret",
      headers: { "X-Test": "1" },
    },
    async (input, init) => {
      seen.push({ input, headers: init?.headers })
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async json() {
          return { data: [{ id: "model-b" }, { id: "model-a" }] }
        },
      }
    },
  )

  assert.deepEqual(ids, ["model-a", "model-b"])
  assert.deepEqual(seen, [
    {
      input: "https://example.com/v1/models",
      headers: {
        "X-Test": "1",
        Authorization: "Bearer secret",
      },
    },
  ])
})
