export type FuzzyMatch = {
  matches: boolean
  score: number
}

export function fuzzyMatch(query: string, text: string): FuzzyMatch {
  const queryLower = query.toLowerCase()
  const textLower = text.toLowerCase()

  const matchQuery = (normalizedQuery: string): FuzzyMatch => {
    if (normalizedQuery.length === 0) return { matches: true, score: 0 }
    if (normalizedQuery.length > textLower.length) return { matches: false, score: 0 }

    let queryIndex = 0
    let score = 0
    let lastMatchIndex = -1
    let consecutiveMatches = 0

    for (let index = 0; index < textLower.length && queryIndex < normalizedQuery.length; index += 1) {
      if (textLower[index] !== normalizedQuery[queryIndex]) continue

      const previous = textLower[index - 1]
      const isWordBoundary = index === 0 || /[\s\-_./:]/.test(previous ?? "")

      if (lastMatchIndex === index - 1) {
        consecutiveMatches += 1
        score -= consecutiveMatches * 5
      } else {
        consecutiveMatches = 0
        if (lastMatchIndex >= 0) score += (index - lastMatchIndex - 1) * 2
      }

      if (isWordBoundary) score -= 10
      score += index * 0.1
      lastMatchIndex = index
      queryIndex += 1
    }

    if (queryIndex < normalizedQuery.length) return { matches: false, score: 0 }
    if (normalizedQuery === textLower) score -= 100
    return { matches: true, score }
  }

  const primaryMatch = matchQuery(queryLower)
  if (primaryMatch.matches) return primaryMatch

  const alphaNumericMatch = queryLower.match(/^(?<letters>[a-z]+)(?<digits>[0-9]+)$/)
  const numericAlphaMatch = queryLower.match(/^(?<digits>[0-9]+)(?<letters>[a-z]+)$/)
  const swappedQuery = alphaNumericMatch
    ? `${alphaNumericMatch.groups?.digits ?? ""}${alphaNumericMatch.groups?.letters ?? ""}`
    : numericAlphaMatch
      ? `${numericAlphaMatch.groups?.letters ?? ""}${numericAlphaMatch.groups?.digits ?? ""}`
      : ""

  if (!swappedQuery) return primaryMatch

  const swappedMatch = matchQuery(swappedQuery)
  return swappedMatch.matches ? { matches: true, score: swappedMatch.score + 5 } : primaryMatch
}

export function fuzzyFilter<T>(items: T[], query: string, getText: (item: T) => string): T[] {
  if (!query.trim()) return items

  const tokens = query.trim().split(/[\s/]+/).filter(Boolean)
  if (tokens.length === 0) return items

  const results: Array<{ item: T; score: number }> = []
  for (const item of items) {
    let totalScore = 0
    let allMatch = true
    const text = getText(item)

    for (const token of tokens) {
      const match = fuzzyMatch(token, text)
      if (!match.matches) {
        allMatch = false
        break
      }
      totalScore += match.score
    }

    if (allMatch) results.push({ item, score: totalScore })
  }

  results.sort((left, right) => left.score - right.score)
  return results.map((result) => result.item)
}
