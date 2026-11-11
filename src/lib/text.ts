// A full stop ends a sentence when a capital (or an opening quote or digit) follows,
// unless it closes an initial such as "U.S." or "N.V.".
const SENTENCE_END = /(?<!(?:^|[\s.(])\p{Lu}\.)(?<=[.!?])\s+(?=[\p{Lu}\d„“"])/u;

// The opening sentences of a text: at most `maxSentences` and about `maxChars` characters.
export function shortSummary(text: string, maxChars = 450, maxSentences = 3): string {
  const sentences = text.replace(/\s+/g, ' ').trim().split(SENTENCE_END);
  let summary = sentences[0];
  for (const sentence of sentences.slice(1, maxSentences)) {
    if (summary.length + 1 + sentence.length > maxChars) break;
    summary += ` ${sentence}`;
  }
  if (summary.length <= maxChars) return summary;
  // One very long sentence: cut at the last whole word.
  return `${summary.slice(0, maxChars).replace(/\s+\S*$/, '').replace(/[,;:–-]$/, '')}…`;
}
