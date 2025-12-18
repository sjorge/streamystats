import { db, jobResults, type NewJobResult } from "@streamystats/database";

// Helper function to log job results
export async function logJobResult(
  jobId: string,
  jobName: string,
  status: "completed" | "failed" | "processing",
  result: Record<string, unknown> | null,
  processingTime: number,
  error?: Error | string
) {
  try {
    const errorMessage =
      error instanceof Error ? error.message : error ? String(error) : null;

    const jobResult: NewJobResult = {
      jobId,
      jobName,
      status,
      result: result ? JSON.parse(JSON.stringify(result)) : null,
      error: errorMessage,
      processingTime,
    };

    await db.insert(jobResults).values(jobResult);
  } catch (err) {
    console.error("Failed to log job result:", err);
  }
}
