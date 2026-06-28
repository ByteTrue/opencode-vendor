import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"

import { detectConfigFile, parseJsonc } from "./jsonc"

export type ProviderModelConfig = Record<string, unknown> & {
  id: string
  name?: string
}

export type ProviderConfig = Record<string, unknown> & {
  npm?: string
  name?: string
  api?: string
  options?: Record<string, unknown>
  models?: Record<string, ProviderModelConfig>
}

export type OpencodeConfig = Record<string, unknown> & {
  provider?: Record<string, ProviderConfig>
  skills?: {
    paths?: string[]
    [key: string]: unknown
  }
}

export type ProviderDraft = {
  key: string
  originalKey: string
  config: ProviderConfig
}

export type ConfigFile = {
  format: "json" | "jsonc" | "none"
  path: string
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function getOpenCodeConfigDir(): string {
  const envDir = process.env.OPENCODE_CONFIG_DIR?.trim()
  if (envDir) return resolve(envDir)
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode")
}

export function getOpenCodeConfigFile(): ConfigFile {
  const configDir = getOpenCodeConfigDir()
  return detectConfigFile(join(configDir, "opencode"))
}

export function getOpenCodeTuiConfigFile(): ConfigFile {
  const configDir = getOpenCodeConfigDir()
  return detectConfigFile(join(configDir, "tui"))
}

function normalizeProviderConfig(config: ProviderConfig): ProviderConfig {
  const next = cloneJson(config)
  next.options = next.options && typeof next.options === "object" && !Array.isArray(next.options)
    ? cloneJson(next.options)
    : {}
  next.models = next.models && typeof next.models === "object" && !Array.isArray(next.models)
    ? Object.fromEntries(Object.entries(next.models).map(([key, value]) => [key, cloneJson(value as ProviderModelConfig)]))
    : {}
  return next
}

export function createMinimalProviderConfig(): ProviderConfig {
  return {
    npm: "@ai-sdk/openai-compatible",
    name: "",
    api: "",
    options: {
      apiKey: "$ENV_VAR",
    },
    models: {},
  }
}

export function createProviderDraft(key: string, config: ProviderConfig): ProviderDraft {
  return {
    key,
    originalKey: key,
    config: normalizeProviderConfig(config),
  }
}

export function createNewProviderDraft(key: string): ProviderDraft {
  return createProviderDraft(key, createMinimalProviderConfig())
}

export function readOpencodeConfig(file = getOpenCodeConfigFile()): OpencodeConfig {
  try {
    const raw = parseJsonc<unknown>(readFileSync(file.path, "utf8"))
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("expected a JSON object")
    }
    const config = raw as OpencodeConfig
    if (config.provider !== undefined && (!config.provider || typeof config.provider !== "object" || Array.isArray(config.provider))) {
      throw new Error("provider must be an object")
    }
    return config
  } catch (error) {
    if (file.format === "none") return { provider: {} }
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to read ${file.path}: ${message}`)
  }
}

export function writeOpencodeConfig(config: OpencodeConfig, file = getOpenCodeConfigFile()): void {
  mkdirSync(dirname(file.path), { recursive: true })
  writeFileSync(file.path, `${JSON.stringify(config, null, 2)}\n`, "utf8")
}

export function upsertProvider(config: OpencodeConfig, draft: ProviderDraft): OpencodeConfig {
  const providers = { ...(config.provider ?? {}) }
  if (draft.originalKey !== draft.key) {
    delete providers[draft.originalKey]
  }
  providers[draft.key] = normalizeProviderConfig(draft.config)
  return {
    ...config,
    provider: providers,
  }
}

export function providerModels(config: ProviderConfig): Record<string, ProviderModelConfig> {
  return config.models && typeof config.models === "object" && !Array.isArray(config.models)
    ? Object.fromEntries(Object.entries(config.models).map(([key, value]) => [key, cloneJson(value as ProviderModelConfig)]))
    : {}
}

export function upsertModelMap(models: Record<string, ProviderModelConfig>, model: ProviderModelConfig): Record<string, ProviderModelConfig> {
  return {
    ...models,
    [model.id]: cloneJson(model),
  }
}

export function replaceModelInMap(
  models: Record<string, ProviderModelConfig>,
  oldModelId: string,
  model: ProviderModelConfig,
): Record<string, ProviderModelConfig> {
  const next = { ...models }
  delete next[oldModelId]
  next[model.id] = cloneJson(model)
  return next
}

export function removeModel(models: Record<string, ProviderModelConfig>, modelId: string): Record<string, ProviderModelConfig> {
  const next = { ...models }
  delete next[modelId]
  return next
}

export function providerLabel(key: string, config: ProviderConfig): string {
  const parts = [key]
  if (config.name && String(config.name).trim()) parts.push(`(${String(config.name).trim()})`)
  const url = resolveProviderUrl(config)
  if (url) parts.push(`- ${url}`)
  return parts.join(" ")
}

export function resolveProviderUrl(config: ProviderConfig): string {
  const baseURL = config.options && typeof config.options === "object" && !Array.isArray(config.options)
    ? config.options.baseURL
    : undefined
  if (typeof baseURL === "string" && baseURL.trim()) return baseURL.trim()
  if (typeof config.api === "string" && config.api.trim()) return config.api.trim()
  return ""
}
