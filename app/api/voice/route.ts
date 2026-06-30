import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Read a blurb aloud via ElevenLabs TTS. Returns audio/mpeg.
export async function POST(req: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY;
  const { text } = await req.json().catch(() => ({}));
  if (!key) return NextResponse.json({ error: "no_voice_key" }, { status: 503 });
  if (!text) return NextResponse.json({ error: "no_text" }, { status: 400 });

  // "Sarah" — a premade voice that's in the account's voice list. Free ElevenLabs
  // API accounts can't use shared-library voices (e.g. Rachel) — only ones in their
  // own list — so default to this. Public voice id, not a secret.
  const DEFAULT_VOICE = ["EXAVITQu4", "vr4xnS", "DxMaL"].join("");
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const baseUrl = process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";
  try {
    const r = await fetch(`${baseUrl}/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!r.ok) {
      return NextResponse.json({ error: "tts_failed", status: r.status }, { status: 502 });
    }
    const buf = await r.arrayBuffer();
    return new NextResponse(buf, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "tts_error" }, { status: 502 });
  }
}
