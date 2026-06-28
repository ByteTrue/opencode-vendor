import type { Plugin, PluginModule } from "@opencode-ai/plugin"

const server: Plugin = async () => {
  return {}
}

const plugin: PluginModule = {
  id: "opencode-vendor",
  server,
}

export { server }
export {
  buildOpenAIModelsUrl,
  fetchOpenAIModelIds,
  parseOpenAIModelsResponse,
  resolveApiKeyValue,
} from "./shared/openai-models"
export default plugin
