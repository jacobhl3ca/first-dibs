import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// One-line "why you'd love this" via OpenRouter (free model). Degrades gracefully.
export async function POST(req: NextRequest) {
  const key = process.env.OPENROUTER_API_KEY;
  const { artist, venue, date, city } = await req.json().catch(() => ({}));
  if (!key) return NextResponse.json({ blurb: "" });

  // Free OpenRouter models get rate-limited upstream constantly, so try a chain.
  const models = (
    process.env.OPENROUTER_MODEL ||
    "google/gemma-4-31b-it:free,meta-llama/llama-3.3-70b-instruct:free,openai/gpt-oss-120b:free,qwen/qwen3-next-80b-a3b-instruct:free"
  )
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const prompt =
    `In ONE punchy sentence (max 16 words, no preamble, no quotes), tell a fan why catching ` +
    `${artist} live at ${venue}${city ? " in " + city : ""}${date ? " on " + date : ""} would be special.`;

  for (const model of models) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 60,
          temperature: 0.8,
        }),
      });
      const j = await r.json();
      if (j?.error) continue; // 429/404 — try next model
      const blurb: string = j?.choices?.[0]?.message?.content?.trim?.() ?? "";
      if (blurb) return NextResponse.json({ blurb: blurb.replace(/^["']|["']$/g, "") });
    } catch {
      // try next
    }
  }
  return NextResponse.json({ blurb: "" });
}
