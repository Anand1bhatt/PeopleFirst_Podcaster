import { Queue } from "bullmq";

const redisUrl = process.env.REDIS_URL;
function getConnection():
  | { host: string; port: number; maxRetriesPerRequest: null; password?: string }
  | undefined {
  if (!redisUrl) return undefined;
  try {
    const u = new URL(redisUrl);
    const conn: { host: string; port: number; maxRetriesPerRequest: null; password?: string } = {
      host: u.hostname,
      port: parseInt(u.port, 10) || 6379,
      maxRetriesPerRequest: null,
    };
    if (u.password) conn.password = u.password;
    return conn;
  } catch {
    return undefined;
  }
}

const connection = getConnection();

export const briefingQueue = connection
  ? new Queue<{ briefingId: string }>("briefing-pipeline", {
      connection,
      defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 2000 } },
    })
  : null;

export function isQueueAvailable(): boolean {
  if (process.env.BRIEFING_USE_QUEUE === "false" || process.env.BRIEFING_USE_QUEUE === "0") {
    return false;
  }
  return !!briefingQueue;
}
