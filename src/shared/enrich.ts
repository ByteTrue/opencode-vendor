import {
  collectOfficialCandidates,
  loadOfficialCatalog,
  type CatalogProvider,
  type OfficialMatch,
} from "./catalog"
import type { ProviderModelConfig } from "./config"
import {
  createDefaultModelConfig,
  createTemplateModelConfig,
  matchTemplate,
  type ModelTemplate,
} from "./templates"

export type ModelEnrichmentReady = {
  kind: "ready"
  source: "template" | "default"
  model: ProviderModelConfig
  warning?: string
}

export type ModelEnrichmentAmbiguous = {
  kind: "official-ambiguous"
  modelId: string
  candidates: OfficialMatch[]
}

export type ModelEnrichmentResult = ModelEnrichmentReady | ModelEnrichmentAmbiguous

export type EnrichOptions = {
  catalog?: Record<string, CatalogProvider> | null
  templates?: readonly ModelTemplate[]
  catalogUrl?: string
}

export async function enrichModelId(modelId: string, options: EnrichOptions = {}): Promise<ModelEnrichmentResult> {
  const catalog = options.catalog === undefined ? await loadOfficialCatalog(options.catalogUrl) : options.catalog
  const officialCandidates = collectOfficialCandidates(catalog, modelId)

  if (officialCandidates.length >= 1) {
    return {
      kind: "official-ambiguous",
      modelId,
      candidates: officialCandidates,
    }
  }

  const template = matchTemplate(modelId, options.templates)
  if (template) {
    return {
      kind: "ready",
      source: "template",
      model: createTemplateModelConfig(modelId, template),
    }
  }

  return {
    kind: "ready",
    source: "default",
    model: createDefaultModelConfig(modelId),
    warning: `No official catalog or template match for ${modelId}; using safe defaults.`,
  }
}
