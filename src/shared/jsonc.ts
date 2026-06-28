import { existsSync, readFileSync } from "node:fs"

export function stripJsonComments(content: string): string {
  let result = ""
  let inString = false
  let escaped = false
  let inLineComment = false
  let inBlockComment = false

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]
    const next = content[index + 1]

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false
        result += char
      }
      continue
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false
        index += 1
      }
      continue
    }

    if (inString) {
      result += char
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') {
      inString = true
      result += char
      continue
    }

    if (char === "/" && next === "/") {
      inLineComment = true
      index += 1
      continue
    }

    if (char === "/" && next === "*") {
      inBlockComment = true
      index += 1
      continue
    }

    result += char
  }

  return result
}

export function stripTrailingCommas(content: string): string {
  let result = ""
  let inString = false
  let escaped = false

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]

    if (inString) {
      result += char
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') {
      inString = true
      result += char
      continue
    }

    if (char === ",") {
      let lookahead = index + 1
      while (lookahead < content.length && /\s/.test(content[lookahead] ?? "")) {
        lookahead += 1
      }
      const next = content[lookahead]
      if (next === "}" || next === "]") continue
    }

    result += char
  }

  return result
}

export function parseJsonc<T = unknown>(content: string): T {
  return JSON.parse(stripTrailingCommas(stripJsonComments(content))) as T
}

export function readJsoncFile<T = unknown>(filePath: string): T | null {
  try {
    return parseJsonc<T>(readFileSync(filePath, "utf8"))
  } catch {
    return null
  }
}

export function detectConfigFile(basePathWithoutExtension: string): {
  format: "json" | "jsonc" | "none"
  path: string
} {
  const jsoncPath = `${basePathWithoutExtension}.jsonc`
  const jsonPath = `${basePathWithoutExtension}.json`

  if (existsSync(jsoncPath)) return { format: "jsonc", path: jsoncPath }
  if (existsSync(jsonPath)) return { format: "json", path: jsonPath }
  return { format: "none", path: jsoncPath }
}
