import { supabase } from "./client";
import { setAudio } from "./memory-audio";
import { devAudioWrite } from "./dev-briefing-store";

const BUCKET = "briefing-audio";

export async function uploadAudio(briefingId: string, buffer: Buffer): Promise<string | null> {
  if (supabase) {
    const path = `${briefingId}.mp3`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: "audio/mpeg",
      upsert: true,
    });
    if (error) return null;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl ?? null;
  }
  // Localhost: memory + disk so any dev worker can serve audio
  setAudio(briefingId, buffer);
  await devAudioWrite(briefingId, buffer).catch((e) =>
    console.error("[storage] dev audio write failed", e)
  );
  return `/api/briefings/${briefingId}/audio`;
}
