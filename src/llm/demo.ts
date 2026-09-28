import type { Provider } from "./types";

// Keyless provider so anyone can try the product before connecting an AI
// account. It does not generate language: it quotes the most relevant
// passages from the crawled site.
export const demoProvider: Provider = {
  id: "demo",
  async *streamChat(_cred, req) {
    const question = req.messages.at(-1)?.content ?? "";
    const chunks = req.knowledge ?? [];
    let reply: string;
    if (/^\s*(hi|hello|hey|yo|good (morning|afternoon|evening))\b/i.test(question) && question.length < 40) {
      reply = "Hi! I'm running in **demo mode**, so I answer by quoting the most relevant parts of this website. Ask me about services, hours, pricing, or anything on the site.";
    } else if (!chunks.length) {
      reply = "I couldn't find anything about that on the website. Connect an AI provider in the dashboard for full conversational answers, or leave your contact details and the team will get back to you.";
    } else {
      const terms = question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
      const excerpts = chunks.slice(0, 2).map((c) => {
        const lines = c.text.split("\n");
        const scored = lines.map((l, i) => ({ i, s: terms.filter((t) => l.toLowerCase().includes(t)).length }));
        const top = scored.sort((a, b) => b.s - a.s)[0] ?? { i: 0, s: 0 };
        const excerpt = lines.slice(Math.max(0, top.i - 1), top.i + 3).join(" ").slice(0, 400);
        return { score: top.s, text: `> ${excerpt}\n\n_Source: [${c.title}](${c.url})_` };
      });
      // Show the second passage only if it also matches the question.
      const best = excerpts.filter((e, i) => i === 0 || e.score > 0).map((e) => e.text);
      reply = `Here's what I found on the website:\n\n${best.join("\n\n")}\n\n*(Demo mode: connect an AI provider for natural answers.)*`;
    }
    for (const word of reply.split(/(?<=\s)/)) {
      if (req.signal?.aborted) return;
      yield word;
      await new Promise((r) => setTimeout(r, 12));
    }
  },
};
