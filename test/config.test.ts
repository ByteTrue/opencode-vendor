import test from "node:test"
import assert from "node:assert/strict"

import { upsertProvider, createProviderDraft, replaceModelInMap } from "../src/shared/config"
import { parseJsonc } from "../src/shared/jsonc"

test("parseJsonc strips comments and trailing commas", () => {
  const value = parseJsonc<{ provider: { demo: { api: string } } }>(`{
    // comment
    "provider": {
      "demo": {
        "api": "https://example.com/v1",
      },
    },
  }`)

  assert.equal(value.provider.demo.api, "https://example.com/v1")
})

test("upsertProvider replaces renamed key", () => {
  const draft = createProviderDraft("old", { name: "Old", models: {} })
  draft.key = "new"
  draft.config.name = "New"

  const result = upsertProvider({ provider: { old: { name: "Old", models: {} } } }, draft)

  assert.deepEqual(Object.keys(result.provider ?? {}), ["new"])
  assert.equal(result.provider?.new?.name, "New")
})

test("replaceModelInMap removes the old id when edited JSON changes id", () => {
  const result = replaceModelInMap({ old: { id: "old" } }, "old", { id: "new", name: "New" })

  assert.deepEqual(result, { new: { id: "new", name: "New" } })
})
