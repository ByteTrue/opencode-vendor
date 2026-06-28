/** @jsxImportSource @opentui/solid */
import type { KeyEvent, TuiDialogSelectOption, TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createSignal } from "solid-js"

import {
  createNewProviderDraft,
  createProviderDraft,
  getOpenCodeConfigFile,
  providerLabel,
  providerModels,
  readOpencodeConfig,
  replaceModelInMap,
  removeModel,
  resolveProviderUrl,
  type OpencodeConfig,
  type ProviderConfig,
  type ProviderDraft,
  type ProviderModelConfig,
  upsertModelMap,
  upsertProvider,
  writeOpencodeConfig,
} from "../shared/config"
import {
  formatOfficialCandidate,
  groupOfficialModelsById,
  listAllOfficialModels,
  loadOfficialCatalog,
  type OfficialMatch,
  type OfficialModelEntry,
} from "../shared/catalog"
import { enrichModelId } from "../shared/enrich"
import { fuzzyFilter } from "../shared/fuzzy"
import { fetchOpenAIModelIds } from "../shared/openai-models"

const COMMAND_TITLE = "Vendor: Manage OpenCode providers"
const COMMAND_VALUE = "vendor.manage"
const COMMAND_CATEGORY = "Vendor"

function toast(api: TuiPluginApi, message: string, variant: "info" | "success" | "warning" | "error" = "info") {
  api.ui.toast({ message, variant, duration: 4000 })
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function truncateForDialog(value: string, max = 12000): string {
  return value.length > max ? `${value.slice(0, max)}\n\n…truncated…` : value
}

function matchFromEntry(entry: OfficialModelEntry): OfficialMatch {
  return {
    configReadyModel: entry.configReadyModel,
    model: entry.model,
    provider: entry.provider,
    score: 1000,
  }
}

function parseModelJson(value: string): ProviderModelConfig {
  const parsed = JSON.parse(value)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof (parsed as { id?: unknown }).id !== "string") {
    throw new Error("expected an object with a string id")
  }
  return parsed as ProviderModelConfig
}

function providerApiKey(config: ProviderConfig): string {
  const options = config.options
  if (!options || typeof options !== "object" || Array.isArray(options)) return ""
  return typeof options.apiKey === "string" ? options.apiKey : ""
}

function providerBaseURL(config: ProviderConfig): string {
  const options = config.options
  if (!options || typeof options !== "object" || Array.isArray(options)) return ""
  return typeof options.baseURL === "string" ? options.baseURL : ""
}

function providerHeaders(config: ProviderConfig): Record<string, string> {
  const options = config.options
  if (!options || typeof options !== "object" || Array.isArray(options)) return {}
  const headers = (options as Record<string, unknown>).headers
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {}
  return Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
}

function setProviderOption(config: ProviderConfig, key: string, value: unknown) {
  const options = config.options && typeof config.options === "object" && !Array.isArray(config.options)
    ? { ...(config.options as Record<string, unknown>) }
    : {}

  if (value === undefined || value === null || value === "") delete options[key]
  else options[key] = value

  config.options = options
}

function sortedProviders(config: OpencodeConfig): Array<{ key: string; config: ProviderConfig; label: string }> {
  return Object.entries(config.provider ?? {})
    .map(([key, provider]) => ({ key, config: provider, label: providerLabel(key, provider) }))
    .sort((left, right) => left.label.localeCompare(right.label))
}

function sortedModelList(config: ProviderConfig): ProviderModelConfig[] {
  return Object.values(providerModels(config)).sort((left, right) => left.id.localeCompare(right.id))
}

function modelLabel(model: ProviderModelConfig): string {
  const name = typeof model.name === "string" && model.name.trim() && model.name !== model.id ? ` - ${model.name}` : ""
  return `${model.id}${name}`
}

async function alert(api: TuiPluginApi, title: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    api.ui.dialog.replace(
      () => <api.ui.DialogAlert title={title} message={truncateForDialog(message)} onConfirm={() => resolve()} />,
      () => resolve(),
    )
  })
}

async function confirm(api: TuiPluginApi, title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    api.ui.dialog.replace(
      () => (
        <api.ui.DialogConfirm
          title={title}
          message={message}
          onConfirm={() => resolve(true)}
          onCancel={() => resolve(false)}
        />
      ),
      () => resolve(false),
    )
  })
}

async function prompt(api: TuiPluginApi, title: string, placeholder?: string, value = ""): Promise<string | null> {
  return new Promise((resolve) => {
    api.ui.dialog.replace(
      () => (
        <api.ui.DialogPrompt
          title={title}
          placeholder={placeholder}
          value={value}
          onConfirm={(next) => resolve(next)}
          onCancel={() => resolve(null)}
        />
      ),
      () => resolve(null),
    )
  })
}

async function editText(api: TuiPluginApi, title: string, value: string): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false

    const Editor = () => {
      const [text, setText] = createSignal(value)
      const finish = (next: string | null) => {
        if (settled) return
        settled = true
        api.ui.dialog.clear()
        resolve(next)
      }
      const onKeyDown = (event: KeyEvent) => {
        if (event.ctrl && event.name.toLowerCase() === "s") {
          event.preventDefault()
          finish(text())
        }
        if (event.name === "escape") {
          event.preventDefault()
          finish(null)
        }
      }

      return (
        <api.ui.Dialog size="xlarge" onClose={() => finish(null)}>
          <box flexDirection="column" gap={1} padding={1}>
            <text>{title}</text>
            <textarea
              focused
              height={24}
              initialValue={value}
              wrapMode="none"
              onContentChange={setText}
              onKeyDown={onKeyDown}
            />
            <text>Ctrl+S saves, Esc cancels.</text>
          </box>
        </api.ui.Dialog>
      )
    }

    api.ui.dialog.replace(() => <Editor />, () => {
      if (!settled) {
        settled = true
        resolve(null)
      }
    })
  })
}

async function select<Value>(
  api: TuiPluginApi,
  title: string,
  options: TuiDialogSelectOption<Value>[],
  current?: Value,
): Promise<Value | null> {
  return new Promise((resolve) => {
    api.ui.dialog.replace(
      () => (
        <api.ui.DialogSelect<Value>
          title={title}
          options={options}
          current={current}
          onSelect={(option) => resolve(option.value)}
        />
      ),
      () => resolve(null),
    )
  })
}

async function promptHeaders(api: TuiPluginApi, current: Record<string, string>): Promise<Record<string, string> | null | undefined> {
  const value = await prompt(api, "Provider headers JSON", '{"User-Agent":"..."}', Object.keys(current).length ? JSON.stringify(current) : "{}")
  if (value == null) return null
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected a JSON object")
    }
    const headers = Object.fromEntries(Object.entries(parsed).map(([key, headerValue]) => [key, String(headerValue)]))
    return headers
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    toast(api, `Invalid headers JSON: ${message}`, "error")
    return undefined
  }
}

async function chooseOfficialCandidate(api: TuiPluginApi, modelId: string, candidates: OfficialMatch[]): Promise<OfficialMatch | null> {
  return select(api, `Choose provider for ${modelId}`, candidates.map((candidate) => ({
    title: formatOfficialCandidate(candidate),
    value: candidate,
    description: candidate.provider.api,
  })))
}

async function addEnrichedModel(api: TuiPluginApi, draft: ProviderDraft, modelId: string): Promise<boolean> {
  let outcome
  try {
    outcome = await enrichModelId(modelId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    toast(api, `Official catalog unavailable: ${message}`, "warning")
    outcome = await enrichModelId(modelId, { catalog: null })
  }

  if (outcome.kind === "official-ambiguous") {
    const chosen = await chooseOfficialCandidate(api, modelId, outcome.candidates)
    if (!chosen) return false
    draft.config.models = upsertModelMap(providerModels(draft.config), chosen.configReadyModel as ProviderModelConfig)
    toast(api, `Added ${chosen.model.id} from ${chosen.provider.id}`, "success")
    return true
  }

  let model = outcome.model
  if (outcome.source === "default") {
    const edited = await editText(api, `Review model ${modelId} JSON`, prettyJson(model))
    if (edited == null) return false
    try {
      model = parseModelJson(edited)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast(api, `Invalid model JSON: ${message}`, "error")
      return false
    }
  }

  draft.config.models = upsertModelMap(providerModels(draft.config), model)
  toast(api, `Added ${model.id} from ${outcome.source}`, outcome.warning ? "warning" : "success")
  return true
}

async function addModel(api: TuiPluginApi, draft: ProviderDraft): Promise<void> {
  let allModels: OfficialModelEntry[] = []
  try {
    allModels = listAllOfficialModels(await loadOfficialCatalog())
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    toast(api, `Official catalog unavailable: ${message}`, "warning")
  }

  for (;;) {
    const query = await prompt(api, "Search models", "Type to fuzzy-search official model ids, or leave blank to list all")
    if (query == null) return

    const groups = groupOfficialModelsById(fuzzyFilter(allModels, query, (entry) => entry.modelId))
    if (groups.length === 0) {
      const choice = await select(api, "No matching model ids", [
        { title: "Enter custom model id...", value: "custom" },
        { title: "Search again", value: "again" },
        { title: "Cancel", value: "cancel" },
      ])
      if (!choice || choice === "again") continue
      if (choice === "cancel") return
      const customId = await prompt(api, "Custom model id", "Enter a model id, e.g. my-custom-model")
      if (customId?.trim()) await addEnrichedModel(api, draft, customId.trim())
      return
    }

    const choice = await select(api, query.trim() ? `Found ${groups.length} model id(s)` : `Official model ids (${groups.length})`, [
      ...groups.map((group) => ({
        title: group.modelId,
        value: group.modelId,
        description: `${group.entries.length} provider${group.entries.length === 1 ? "" : "s"}`,
      })),
      { title: "Enter custom model id...", value: "__custom__" },
      { title: "Search again", value: "__again__" },
      { title: "Cancel", value: "__cancel__" },
    ])

    if (!choice || choice === "__again__") continue
    if (choice === "__cancel__") return
    if (choice === "__custom__") {
      const customId = await prompt(api, "Custom model id", "Enter a model id, e.g. my-custom-model")
      if (customId?.trim()) await addEnrichedModel(api, draft, customId.trim())
      return
    }

    const group = groups.find((entry) => entry.modelId === choice)
    if (!group) continue
    const selectedEntry = await select(api, `Choose provider for ${group.modelId}`, group.entries.map((entry) => ({
      title: formatOfficialCandidate(matchFromEntry(entry)),
      value: entry,
      description: entry.provider.api,
    })))
    if (!selectedEntry) continue

    draft.config.models = upsertModelMap(providerModels(draft.config), selectedEntry.configReadyModel as ProviderModelConfig)
    toast(api, `Added ${selectedEntry.model.id} from ${selectedEntry.provider.id}`, "success")
    return
  }
}

async function removeExistingModel(api: TuiPluginApi, draft: ProviderDraft): Promise<void> {
  const models = sortedModelList(draft.config)
  if (models.length === 0) {
    toast(api, "No models to remove", "info")
    return
  }

  const choice = await select(api, "Remove model", models.map((model) => ({ title: modelLabel(model), value: model.id })))
  if (!choice) return

  const confirmed = await confirm(api, `Remove ${choice}?`, "The provider draft is only written on save.")
  if (!confirmed) return

  draft.config.models = removeModel(providerModels(draft.config), choice)
  toast(api, `Removed ${choice}`, "success")
}

async function previewModels(api: TuiPluginApi, draft: ProviderDraft): Promise<void> {
  const models = providerModels(draft.config)
  await alert(api, "Provider models", prettyJson(models))
}

async function editExistingModel(api: TuiPluginApi, draft: ProviderDraft): Promise<void> {
  const models = sortedModelList(draft.config)
  if (models.length === 0) {
    toast(api, "No models to edit", "info")
    return
  }

  const current = await select(api, "Replace/edit model JSON", models.map((model) => ({ title: modelLabel(model), value: model })))
  if (!current) return

  const edited = await editText(api, `Edit model ${current.id} JSON`, prettyJson(current))
  if (edited == null) return

  try {
    const next = parseModelJson(edited)
    draft.config.models = replaceModelInMap(providerModels(draft.config), current.id, next)
    toast(api, `Updated model ${next.id}`, "success")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    toast(api, `Invalid model JSON: ${message}`, "error")
  }
}

async function importModelsFromEndpoint(api: TuiPluginApi, draft: ProviderDraft): Promise<void> {
  const baseURL = providerBaseURL(draft.config)
  const apiKey = providerApiKey(draft.config)
  if (!baseURL) {
    await alert(api, "Missing base URL", "Set options.baseURL before importing from /models.")
    return
  }
  if (!apiKey) {
    await alert(api, "Missing API key", "Set options.apiKey before importing from /models.")
    return
  }

  let ids: string[]
  try {
    ids = await fetchOpenAIModelIds({
      baseURL,
      apiKey,
      headers: providerHeaders(draft.config),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await alert(api, "Could not import from /models", message)
    return
  }

  if (ids.length === 0) {
    toast(api, "/models returned no model ids", "warning")
    return
  }

  let remaining = [...ids]
  for (;;) {
    const selected = await select(api, `Import model from /models (${remaining.length} left)`, [
      ...remaining.map((id) => ({ title: id, value: id })),
      { title: "Done", value: "__done__" },
    ])
    if (!selected || selected === "__done__") return

    if (!(await addEnrichedModel(api, draft, selected))) continue

    remaining = remaining.filter((id) => id !== selected)
    if (remaining.length === 0) return
  }
}

async function manageModels(api: TuiPluginApi, draft: ProviderDraft): Promise<void> {
  for (;;) {
    const action = await select(api, `Manage models (${Object.keys(providerModels(draft.config)).length})`, [
      { title: "Add model", value: "add" },
      { title: "Remove model", value: "remove" },
      { title: "Replace/edit model JSON", value: "replace" },
      { title: "Preview models JSON", value: "preview" },
      { title: "Back", value: "back" },
    ])

    if (!action || action === "back") return
    if (action === "add") {
      const addAction = await select(api, "Add model", [
        { title: "Search official/custom model id", value: "manual" },
        { title: "Import from /models endpoint", value: "import" },
        { title: "Back", value: "back" },
      ])
      if (addAction === "manual") await addModel(api, draft)
      if (addAction === "import") await importModelsFromEndpoint(api, draft)
      continue
    }
    if (action === "remove") {
      await removeExistingModel(api, draft)
      continue
    }
    if (action === "replace") {
      await editExistingModel(api, draft)
      continue
    }
    if (action === "preview") {
      await previewModels(api, draft)
    }
  }
}

async function editProviderDraft(api: TuiPluginApi, draft: ProviderDraft): Promise<ProviderDraft | "back" | null> {
  for (;;) {
    const choice = await select(api, `Vendor: ${draft.key}`, [
      { title: "Edit provider key", value: "key" },
      { title: "Edit display name", value: "name" },
      { title: "Edit provider npm", value: "npm" },
      { title: "Edit provider api URL", value: "api" },
      { title: "Edit options.baseURL", value: "baseURL" },
      { title: "Edit options.apiKey", value: "apiKey" },
      { title: "Edit options.headers", value: "headers" },
      { title: "Manage models", value: "models" },
      { title: "Preview provider JSON", value: "preview" },
      { title: "Save provider", value: "save" },
      { title: "Cancel", value: "cancel" },
    ])

    if (!choice) return "back"
    if (choice === "cancel") return null
    if (choice === "save") return draft

    if (choice === "key") {
      const next = await prompt(api, "Provider key", "Enter a unique provider key", draft.key)
      if (next?.trim()) draft.key = next.trim()
      continue
    }

    if (choice === "name") {
      const next = await prompt(api, "Display name", "Provider display name", String(draft.config.name ?? ""))
      if (next != null) draft.config.name = next.trim()
      continue
    }

    if (choice === "npm") {
      const next = await prompt(api, "Provider npm", "@ai-sdk/openai-compatible", String(draft.config.npm ?? "@ai-sdk/openai-compatible"))
      if (next?.trim()) draft.config.npm = next.trim()
      continue
    }

    if (choice === "api") {
      const next = await prompt(api, "Provider api URL", "https://.../v1", String(draft.config.api ?? ""))
      if (next != null) draft.config.api = next.trim()
      continue
    }

    if (choice === "baseURL") {
      const next = await prompt(api, "options.baseURL", "https://.../v1", providerBaseURL(draft.config))
      if (next != null) setProviderOption(draft.config, "baseURL", next.trim())
      continue
    }

    if (choice === "apiKey") {
      const next = await prompt(api, "options.apiKey", "$ENV_VAR or literal key", providerApiKey(draft.config))
      if (next != null) setProviderOption(draft.config, "apiKey", next.trim())
      continue
    }

    if (choice === "headers") {
      const headers = await promptHeaders(api, providerHeaders(draft.config))
      if (headers === undefined) continue
      if (headers === null) continue
      setProviderOption(draft.config, "headers", headers)
      continue
    }

    if (choice === "models") {
      await manageModels(api, draft)
      continue
    }

    if (choice === "preview") {
      await alert(api, `Preview provider ${draft.key}`, prettyJson(draft.config))
    }
  }
}

async function chooseProviderDraft(api: TuiPluginApi, config: OpencodeConfig): Promise<ProviderDraft | null> {
  for (;;) {
    const providers = sortedProviders(config)
    const choice = await select(api, "OpenCode providers", [
      ...providers.map((provider) => ({ title: provider.label, value: provider.key })),
      { title: "Add provider…", value: "__add__" },
    ])

    if (!choice) return null
    if (choice === "__add__") {
      const key = await prompt(api, "Provider key", "Enter a unique provider key")
      if (!key?.trim()) continue
      const trimmed = key.trim()
      const existing = config.provider?.[trimmed]
      return existing ? createProviderDraft(trimmed, existing) : createNewProviderDraft(trimmed)
    }

    const existing = config.provider?.[choice]
    if (!existing) continue
    return createProviderDraft(choice, existing)
  }
}

async function saveDraft(api: TuiPluginApi, draft: ProviderDraft): Promise<boolean> {
  const configFile = getOpenCodeConfigFile()
  const current = readOpencodeConfig(configFile)

  if (draft.originalKey !== draft.key && current.provider?.[draft.key]) {
    const overwrite = await confirm(
      api,
      `Overwrite provider ${draft.key}?`,
      `Saving will replace the existing provider entry in ${configFile.path}.`,
    )
    if (!overwrite) return false
  }

  if (draft.originalKey !== draft.key) {
    const rename = await confirm(
      api,
      `Rename provider ${draft.originalKey} → ${draft.key}?`,
      `The old key will be removed from ${configFile.path} when you save.`,
    )
    if (!rename) return false
  }

  const next = upsertProvider(current, draft)
  writeOpencodeConfig(next, configFile)
  toast(api, `Saved ${draft.key} to ${configFile.path}`, "success")
  return true
}

async function openVendorManager(api: TuiPluginApi): Promise<void> {
  let config: OpencodeConfig
  try {
    config = readOpencodeConfig()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await alert(api, "Could not read OpenCode config", message)
    return
  }

  for (;;) {
    const draft = await chooseProviderDraft(api, config)
    if (!draft) return

    const edited = await editProviderDraft(api, draft)
    if (edited === "back") continue
    if (!edited) {
      toast(api, "Vendor config unchanged", "info")
      return
    }

    if (await saveDraft(api, edited)) return
  }
}

function registerVendorCommand(api: TuiPluginApi) {
  const run = () => {
    void openVendorManager(api)
  }

  api.keymap.registerLayer({
    commands: [
      {
        namespace: "palette",
        name: COMMAND_VALUE,
        title: COMMAND_TITLE,
        category: COMMAND_CATEGORY,
        slashName: "vendor",
        slashAliases: ["vendors"],
        run,
      },
    ],
    bindings: [],
  })
}

const tui: TuiPlugin = async (api) => {
  registerVendorCommand(api)
}

const plugin: TuiPluginModule = {
  id: "opencode-vendor",
  tui,
}

export { tui }
export default plugin
