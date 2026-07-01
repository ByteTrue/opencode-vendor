export type CatalogModel = Record<string, unknown> & {
  id: string
  name?: string
  family?: string
}

export type CatalogProvider = Record<string, unknown> & {
  id: string
  name?: string
  npm?: string
  api?: string
  doc?: string
  models?: Record<string, CatalogModel>
}

export type OfficialMatch = {
  configReadyModel: Record<string, unknown>
  model: CatalogModel
  provider: {
    id: string
    name?: string
    npm?: string
    api?: string
    doc?: string
  }
  score: number
}

export type OfficialModelEntry = {
  provider: OfficialMatch["provider"]
  modelId: string
  model: CatalogModel
  configReadyModel: Record<string, unknown>
}

export type OfficialModelGroup = {
  modelId: string
  entries: OfficialModelEntry[]
}

const DEFAULT_CATALOG_URL = "https://models.dev/api.json"

let cachedCatalogUrl = ""
let cachedCatalog: Record<string, CatalogProvider> | null = null

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase()
}

export async function loadOfficialCatalog(catalogUrl = DEFAULT_CATALOG_URL): Promise<Record<string, CatalogProvider>> {
  if (cachedCatalog && cachedCatalogUrl === catalogUrl) return cachedCatalog

  const response = await fetch(catalogUrl, {
    headers: {
      "User-Agent": "@bytetrue/opencode-vendor",
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    },
  })

  if (!response.ok) {
    throw new Error(`request failed for ${catalogUrl}: ${response.status} ${response.statusText}`)
  }

  const json = await response.json()
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error(`catalog at ${catalogUrl} is not an object`)
  }

  cachedCatalogUrl = catalogUrl
  cachedCatalog = json as Record<string, CatalogProvider>
  return cachedCatalog
}

function getScore(provider: CatalogProvider, model: CatalogModel, query: string, exact: boolean): number {
  const providerLower = normalize(provider.id)
  const providerNameLower = normalize(provider.name)
  const idLower = normalize(model.id)
  const nameLower = normalize(model.name)
  const familyLower = normalize(model.family)
  const fullLower = `${providerLower}/${idLower}`
  const queryLower = normalize(query)
  const haystackLower = `${providerLower} ${providerNameLower} ${idLower} ${nameLower} ${familyLower} ${fullLower}`

  if (exact) {
    if (fullLower === queryLower) return 1100
    if (idLower === queryLower) return 1000
    if (nameLower === queryLower) return 950
    if (familyLower === queryLower) return 925
    if (providerLower === queryLower || providerNameLower === queryLower) return 900
    return -1
  }

  if (fullLower === queryLower) return 1100
  if (idLower === queryLower) return 1000
  if (nameLower === queryLower) return 950
  if (familyLower === queryLower) return 925
  if (providerLower === queryLower || providerNameLower === queryLower) return 900
  if (fullLower.includes(queryLower)) return 875
  if (idLower.includes(queryLower)) return 860
  if (nameLower.includes(queryLower)) return 850
  if (familyLower.includes(queryLower)) return 840
  if (providerLower.includes(queryLower) || providerNameLower.includes(queryLower)) return 830
  if (haystackLower.includes(queryLower)) return 800

  const tokens = queryLower.split(/\s+/).filter(Boolean)
  if (tokens.length > 1 && tokens.every((token) => haystackLower.includes(token))) {
    return 700 - tokens.length
  }

  return -1
}

function makeConfigReadyCost(cost: any): Record<string, unknown> | undefined {
  if (!cost || typeof cost !== "object") return undefined

  const next: Record<string, unknown> = {
    input: cost.input,
    output: cost.output,
  }

  if (cost.cache_read != null) next.cache_read = cost.cache_read
  if (cost.cache_write != null) next.cache_write = cost.cache_write

  if (cost.context_over_200k && typeof cost.context_over_200k === "object") {
    next.context_over_200k = { ...cost.context_over_200k }
  } else if (Array.isArray(cost.tiers)) {
    const tier = cost.tiers.find(
      (entry: any) => entry && typeof entry === "object" && entry.tier?.type === "context" && entry.tier?.size === 200000,
    )
    if (tier) {
      next.context_over_200k = {
        input: tier.input,
        output: tier.output,
      }
      if (tier.cache_read != null) (next.context_over_200k as Record<string, unknown>).cache_read = tier.cache_read
      if (tier.cache_write != null) (next.context_over_200k as Record<string, unknown>).cache_write = tier.cache_write
    }
  }

  return next
}

function makeConfigReadyVariants(model: any): Record<string, unknown> | undefined {
  if (model?.variants && typeof model.variants === "object") {
    return JSON.parse(JSON.stringify(model.variants)) as Record<string, unknown>
  }

  const modes = model?.experimental?.modes
  if (!modes || typeof modes !== "object") return undefined

  const variants: Record<string, unknown> = {}
  for (const [variantId, entry] of Object.entries<any>(modes)) {
    const variant: Record<string, unknown> = {}
    if (entry?.provider?.body && typeof entry.provider.body === "object") {
      Object.assign(variant, entry.provider.body)
    }
    if (entry?.provider?.headers && typeof entry.provider.headers === "object") {
      variant.headers = { ...entry.provider.headers }
    }
    if (Object.keys(variant).length > 0) variants[variantId] = variant
  }

  return Object.keys(variants).length > 0 ? variants : undefined
}

export function makeConfigReadyModel(model: CatalogModel, provider?: CatalogProvider): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const key of [
    "id",
    "name",
    "family",
    "release_date",
    "attachment",
    "reasoning",
    "temperature",
    "tool_call",
    "interleaved",
    "limit",
    "modalities",
    "status",
  ]) {
    if (model[key] !== undefined) next[key] = model[key]
  }

  const providerConfig: Record<string, unknown> = {}
  if (provider?.npm !== undefined) providerConfig.npm = provider.npm
  if (model.provider && typeof model.provider === "object" && !Array.isArray(model.provider)) {
    Object.assign(providerConfig, model.provider)
  }
  if (Object.keys(providerConfig).length > 0) next.provider = providerConfig

  const cost = makeConfigReadyCost((model as any).cost)
  if (cost) next.cost = cost

  const variants = makeConfigReadyVariants(model)
  if (variants) next.variants = variants

  return next
}

function officialEntryToMatch(entry: OfficialModelEntry, score = 1000): OfficialMatch {
  return {
    configReadyModel: JSON.parse(JSON.stringify(entry.configReadyModel)) as Record<string, unknown>,
    model: JSON.parse(JSON.stringify(entry.model)) as CatalogModel,
    provider: { ...entry.provider },
    score,
  }
}

export function listAllOfficialModels(catalog: Record<string, CatalogProvider> | null | undefined): OfficialModelEntry[] {
  if (!catalog) return []

  const entries: OfficialModelEntry[] = []
  for (const [providerId, provider] of Object.entries(catalog)) {
    if (!provider || typeof provider !== "object") continue
    const models = provider.models
    if (!models || typeof models !== "object") continue

    for (const [modelId, model] of Object.entries(models)) {
      if (!model || typeof model !== "object") continue
      const hydratedModel: CatalogModel = { ...(model as CatalogModel), id: (model as CatalogModel).id ?? modelId }
      const hydratedProvider: CatalogProvider = { ...provider, id: provider.id ?? providerId }
      entries.push({
        provider: {
          id: hydratedProvider.id,
          name: hydratedProvider.name,
          npm: hydratedProvider.npm,
          api: hydratedProvider.api,
          doc: hydratedProvider.doc,
        },
        modelId: hydratedModel.id,
        model: hydratedModel,
        configReadyModel: makeConfigReadyModel(hydratedModel, hydratedProvider),
      })
    }
  }
  return entries
}

export function groupOfficialModelsById(entries: OfficialModelEntry[]): OfficialModelGroup[] {
  const groups: OfficialModelGroup[] = []
  const byId = new Map<string, OfficialModelGroup>()

  for (const entry of entries) {
    let group = byId.get(entry.modelId)
    if (!group) {
      group = { modelId: entry.modelId, entries: [] }
      byId.set(entry.modelId, group)
      groups.push(group)
    }
    group.entries.push(entry)
  }

  return groups
}

export function collectOfficialCandidates(
  catalog: Record<string, CatalogProvider> | null | undefined,
  modelId: string,
): OfficialMatch[] {
  return listAllOfficialModels(catalog)
    .filter((entry) => entry.modelId === modelId)
    .map((entry) => officialEntryToMatch(entry))
}

export function formatOfficialCandidate(match: OfficialMatch): string {
  const name = typeof match.model.name === "string" && match.model.name.trim() && match.model.name !== match.model.id
    ? match.model.name.trim()
    : undefined
  const npm = match.provider.npm?.trim()
  const head = name ? `${match.provider.id}/${match.model.id} - ${name}` : `${match.provider.id}/${match.model.id}`
  return npm ? `${head} (${npm})` : head
}

export async function findOfficialMatches(
  query: string,
  options: { providerFilter?: string; exact?: boolean; limit?: number; catalogUrl?: string } = {},
): Promise<OfficialMatch[]> {
  const providerFilter = options.providerFilter?.trim()
  const exact = Boolean(options.exact)
  const limit = options.limit ?? 10
  const catalog = await loadOfficialCatalog(options.catalogUrl)
  const matches: OfficialMatch[] = []

  for (const [providerId, provider] of Object.entries(catalog)) {
    if (!provider || typeof provider !== "object") continue
    if (providerFilter && normalize(providerId) !== normalize(providerFilter)) continue
    const models = provider.models
    if (!models || typeof models !== "object") continue

    for (const [modelId, model] of Object.entries(models)) {
      if (!model || typeof model !== "object") continue
      const hydratedModel: CatalogModel = { ...(model as CatalogModel), id: (model as CatalogModel).id ?? modelId }
      const hydratedProvider: CatalogProvider = { ...provider, id: provider.id ?? providerId }
      const score = getScore(hydratedProvider, hydratedModel, query, exact)
      if (score < 0) continue
      matches.push({
        configReadyModel: makeConfigReadyModel(hydratedModel, hydratedProvider),
        model: hydratedModel,
        provider: {
          id: hydratedProvider.id,
          name: hydratedProvider.name,
          npm: hydratedProvider.npm,
          api: hydratedProvider.api,
          doc: hydratedProvider.doc,
        },
        score,
      })
    }
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.provider.id !== b.provider.id) return a.provider.id.localeCompare(b.provider.id)
    return a.model.id.localeCompare(b.model.id)
  })

  if (exact && !providerFilter) return matches
  return matches.slice(0, limit)
}
