import test from "node:test"
import assert from "node:assert/strict"

import { fuzzyFilter, fuzzyMatch } from "../src/shared/fuzzy"

test("fuzzyMatch matches ordered characters and rejects out-of-order queries", () => {
  assert.equal(fuzzyMatch("co48", "claude-opus-4-8").matches, true)
  assert.equal(fuzzyMatch("gpt4o", "gpt-4o").matches, true)
  assert.equal(fuzzyMatch("oc", "claude-opus").matches, false)
})

test("fuzzyMatch scores exact matches better than partial matches", () => {
  assert.ok(fuzzyMatch("gpt-4o", "gpt-4o").score < fuzzyMatch("gpt4o", "gpt-4o").score)
})

test("fuzzyFilter filters multiple tokens and keeps best matches first", () => {
  const items = [
    { id: "claude-opus-4-8", provider: "anthropic" },
    { id: "claude-sonnet-4-6", provider: "anthropic" },
    { id: "gpt-4o", provider: "openai" },
    { id: "gpt-4o-mini", provider: "openai" },
  ]

  assert.deepEqual(fuzzyFilter(items, "", (item) => item.id), items)
  assert.deepEqual(fuzzyFilter(items, "gpt openai", (item) => `${item.id} ${item.provider}`).map((item) => item.id), [
    "gpt-4o",
    "gpt-4o-mini",
  ])
  assert.deepEqual(fuzzyFilter(items, "xyz", (item) => item.id), [])
})
