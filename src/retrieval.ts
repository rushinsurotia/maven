import type { KnowledgeChunk } from "./types";

// Lexical BM25 search over knowledge chunks. Good enough for an MVP with no
// embedding key; the architecture plans hybrid vector + full-text search.
const STOPWORDS = new Set(
  "a an and are as at be but by can do does for from have how i if in is it its me my of on or our so that the their them there these they this to was we what when where which who why will with you your".split(" "),
);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((t) => !STOPWORDS.has(t) && (t.length > 1 || /\d/.test(t)))
    .map(stem);
}

function stem(t: string): string {
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 4 && t.endsWith("ing")) return t.slice(0, -3);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

interface Index {
  docs: { chunk: KnowledgeChunk; tf: Map<string, number>; len: number }[];
  df: Map<string, number>;
  avgLen: number;
}

const cache = new WeakMap<KnowledgeChunk[], Index>();

function buildIndex(chunks: KnowledgeChunk[]): Index {
  const df = new Map<string, number>();
  const docs = chunks.map((chunk) => {
    const tokens = tokenize(`${chunk.title} ${chunk.text}`);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return { chunk, tf, len: tokens.length };
  });
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, avgLen };
}

export function search(chunks: KnowledgeChunk[], query: string, k = 6): KnowledgeChunk[] {
  if (!chunks.length) return [];
  let index = cache.get(chunks);
  if (!index) {
    index = buildIndex(chunks);
    cache.set(chunks, index);
  }
  const terms = [...new Set(tokenize(query))];
  const N = index.docs.length;
  const k1 = 1.4;
  const b = 0.75;
  const scored = index.docs
    .map((d) => {
      let score = 0;
      for (const t of terms) {
        const f = d.tf.get(t);
        if (!f) continue;
        const n = index!.df.get(t)!;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / index!.avgLen)));
      }
      return { chunk: d.chunk, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.chunk);
}
