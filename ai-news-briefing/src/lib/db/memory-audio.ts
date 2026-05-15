// In-memory audio store for localhost when Supabase storage is not configured
const memoryAudio = new Map<string, Buffer>();

export function setAudio(briefingId: string, buffer: Buffer): void {
  memoryAudio.set(briefingId, buffer);
}

export function getAudio(briefingId: string): Buffer | undefined {
  return memoryAudio.get(briefingId);
}
