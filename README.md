# @bytetrue/opencode-vendor

OpenCode **TUI plugin** for manually managing custom providers in `~/.config/opencode/opencode.jsonc`.

This follows the `pi-vendor` feature flow, but writes OpenCode's provider schema.

## What it does

- Adds an interactive **Vendor** manager to the OpenCode TUI.
- Lets you add or edit custom providers under `provider.*`.
- Lets you fuzzy-search official model ids, then choose the provider-specific official config.
- Always asks before using official catalog data, even when there is only one official match.
- Falls back to local templates or editable safe defaults for custom model ids.
- Lets you import model ids from an OpenAI-compatible `/models` endpoint using the provider draft's `options.baseURL` and `options.apiKey`; each imported id uses the same enrichment flow.
- Lets you remove models, preview model JSON, and replace/edit a model JSON object.
- Saves back to `~/.config/opencode/opencode.jsonc` when you confirm.

## Install

### From GitHub, without npm publish

Add the plugin to your OpenCode TUI config:

```json
{
  "plugin": ["github:ByteTrue/opencode-vendor"]
}
```

OpenCode installs npm-style plugin specs with Bun, so this uses the GitHub repo directly.

### From npm package

If this package is published to npm later, use:

```json
{
  "plugin": ["@bytetrue/opencode-vendor"]
}
```

### Local clone fallback

Clone the repo somewhere stable and install its dependencies:

```sh
git clone https://github.com/ByteTrue/opencode-vendor ~/.local/share/opencode/opencode-vendor
cd ~/.local/share/opencode/opencode-vendor
npm install
```

Then point OpenCode at the local TUI plugin file:

```json
{
  "plugin": ["file:///Users/you/.local/share/opencode/opencode-vendor/src/tui/index.tsx"]
}
```

Use your real absolute path. A relative path also works if it is relative to the config file.

Typical location:

- `~/.config/opencode/tui.jsonc`

## Use

- In TUI builds with legacy slash-command shim: run `/vendor`
- Otherwise: open the command palette and run **Vendor: Manage OpenCode providers**

## Notes

- This package is for **manual TUI editing**. It does not ship a separate skill or external helper script.
- The plugin fetches the OpenCode official provider/model catalog from `https://models.dev/api.json` during the add-model flow.
- The plugin reads JSON/JSONC, but saves back as formatted JSON. Existing comments in `opencode.jsonc` are not preserved.
- Restart OpenCode after saving config changes; running sessions keep the already-loaded config.

## Development

```sh
npm install
npm run typecheck
npm test
```
