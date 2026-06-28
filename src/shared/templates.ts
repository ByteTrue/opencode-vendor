import type { ProviderModelConfig } from "./config"

export type ModelTemplate = {
  id?: string
  prefix?: string
  name?: string
  reasoning?: boolean
  input?: Array<"text" | "image" | "audio" | "video" | "pdf">
  context?: number
  output?: number
  cost?: ProviderModelConfig["cost"]
}

export const MODEL_TEMPLATES: readonly ModelTemplate[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    reasoning: true,
    input: ["text", "image"],
    context: 128000,
    output: 16384,
  },
  {
    prefix: "gpt-4",
    name: "GPT-4 family",
    reasoning: true,
    input: ["text", "image"],
    context: 128000,
    output: 16384,
  },
  {
    prefix: "claude-3.7",
    name: "Claude 3.7 family",
    reasoning: true,
    input: ["text", "image"],
    context: 200000,
    output: 8192,
  },
  {
    prefix: "gemini-2.5",
    name: "Gemini 2.5 family",
    reasoning: true,
    input: ["text", "image"],
    context: 1000000,
    output: 8192,
  },
  {
    prefix: "deepseek-v3",
    name: "DeepSeek V3 family",
    reasoning: true,
    input: ["text"],
    context: 128000,
    output: 16384,
  },
] as const

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function listModelTemplates(): ModelTemplate[] {
  return MODEL_TEMPLATES.map((template) => cloneJson(template))
}

export function templateLabel(template: ModelTemplate): string {
  if (template.id) return template.name && template.name !== template.id ? `${template.id} - ${template.name}` : template.id
  if (template.prefix) return template.name ? `${template.prefix}* - ${template.name}` : `${template.prefix}*`
  return template.name ?? "template"
}

export function matchTemplate(modelId: string, templates: readonly ModelTemplate[] = MODEL_TEMPLATES): ModelTemplate | undefined {
  const exact = templates.find((template) => template.id === modelId)
  if (exact) return exact

  let best: ModelTemplate | undefined
  let bestLength = -1
  for (const template of templates) {
    if (!template.prefix || !modelId.startsWith(template.prefix)) continue
    if (template.prefix.length > bestLength) {
      best = template
      bestLength = template.prefix.length
    }
  }
  return best
}

export function createTemplateModelConfig(modelId: string, template: ModelTemplate): ProviderModelConfig {
  const model: ProviderModelConfig = {
    id: modelId,
    name: template.name?.trim() || modelId,
    reasoning: template.reasoning ?? false,
    limit: {
      context: template.context ?? 128000,
      output: template.output ?? 16384,
    },
    modalities: {
      input: template.input ? [...template.input] : ["text"],
      output: ["text"],
    },
  }
  if (template.cost) model.cost = cloneJson(template.cost)
  return model
}

export function createDefaultModelConfig(modelId: string): ProviderModelConfig {
  return {
    id: modelId,
    name: modelId,
    reasoning: false,
    limit: {
      context: 128000,
      output: 16384,
    },
    modalities: {
      input: ["text"],
      output: ["text"],
    },
  }
}
