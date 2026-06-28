# @bytetrue/opencode-vendor

OpenCode **TUI plugin** for manually managing custom providers in `~/.config/opencode/opencode.jsonc`.

## What it does

- Adds an interactive **Vendor** manager to the OpenCode TUI.
- Lets you add or edit custom providers under `provider.*`.
- Lets you add models from the official OpenCode built-in catalog, with provider-aware selection when the same model id exists under multiple official providers.
- Saves back to `~/.config/opencode/opencode.jsonc` when you confirm.

## Install

Add the plugin to your OpenCode TUI config:

```json
{
  "plugin": ["@bytetrue/opencode-vendor"]
}
```

Typical location:

- `~/.config/opencode/tui.jsonc`

## Use

- In TUI builds with legacy slash-command shim: run `/vendor`
- Otherwise: open the command palette and run **Vendor: Manage OpenCode providers**

## Notes

- This package is for **manual TUI editing**. It does not ship a separate skill or external helper script.
- The plugin fetches the OpenCode official provider/model catalog from `https://models.dev/api.json` during the add-model flow.
- The plugin reads JSON/JSONC, but saves back as formatted JSON. Existing comments in `opencode.jsonc` are not preserved.

## Development

```sh
npm install
npm run typecheck
npm test
```
