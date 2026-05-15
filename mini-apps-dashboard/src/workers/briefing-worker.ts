import "dotenv/config";
import { Worker } from "bullmq";
import { runPipeline } from "@/lib/pipeline/run";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error("REDIS_URL is required to run the worker");
  process.exit(1);
}

function getConnection(url: string): { host: string; port: number; maxRetriesPerRequest: null } {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port, 10) || 6379,
    maxRetriesPerRequest: null,
  };
}

const worker = new Worker<{ briefingId: string }>(
  "briefing-pipeline",
  async (job) => {
    await runPipeline(job.data.briefingId);
  },
  { connection: getConnection(redisUrl), concurrency: 2 }
);

worker.on("completed", (job) => console.log(`Job ${job.id} completed`));
worker.on("failed", (job, err) => console.error(`Job ${job?.id} failed:`, err));

console.log("Briefing worker started");
