import { db, Item, items } from "@streamystats/database";
import axios from "axios";
import { and, eq, sql } from "drizzle-orm";
import OpenAI from "openai";
import { TIMEOUT_CONFIG } from "./config";
import { logJobResult } from "./job-logger";
import { getJobQueue } from "./queue";
import { sleep } from "../utils/sleep";

// Embedding configuration passed from job data
interface EmbeddingConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  dimensions: number;
}

// Default config values
const DEFAULT_MAX_TEXT_LENGTH = 8000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RATE_LIMIT_DELAY = 500;

// Track if index has been ensured this session (per dimension)
const indexEnsuredForDimension = new Set<number>();

/**
 * Ensure HNSW index exists for the given embedding dimension.
 * pgvector requires indexes to be created with a specific dimension.
 * This creates the index if it doesn't exist, improving similarity query performance.
 */
async function ensureEmbeddingIndex(dimensions: number): Promise<void> {
  // Skip if already ensured this session
  if (indexEnsuredForDimension.has(dimensions)) {
    return;
  }

  try {
    // Check if an index exists and get its definition
    const existingIndex = await db.execute<{
      indexname: string;
      indexdef: string;
    }>(sql`
      SELECT indexname, indexdef FROM pg_indexes 
      WHERE tablename = 'items' 
      AND indexname = 'items_embedding_idx'
    `);

    if (existingIndex.length > 0) {
      const indexDef = existingIndex[0].indexdef;
      // Check if the existing index matches our dimensions
      const dimensionMatch = indexDef.match(/vector\((\d+)\)/);
      if (dimensionMatch && parseInt(dimensionMatch[1]) === dimensions) {
        // Index exists with correct dimensions
        indexEnsuredForDimension.add(dimensions);
        return;
      }
      // Index exists but with different dimensions - need to recreate
      console.log(`Dropping existing index (dimension mismatch)...`);
      await db.execute(sql`DROP INDEX IF EXISTS items_embedding_idx`);
    }

    // Create HNSW index for cosine similarity
    // The cast to vector(N) allows the index to work with our variable-dimension column
    console.log(
      `Creating HNSW index for ${dimensions}-dimensional embeddings...`
    );
    await db.execute(sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS items_embedding_idx 
      ON items 
      USING hnsw ((embedding::vector(${sql.raw(
        String(dimensions)
      )})) vector_cosine_ops)
    `);
    console.log(`HNSW index created successfully for ${dimensions} dimensions`);
    indexEnsuredForDimension.add(dimensions);
  } catch (error) {
    // Log but don't fail - queries will work, just slower
    console.warn("Could not create embedding index:", error);
  }
}

// Job: Generate embeddings for media items using different providers
export async function generateItemEmbeddingsJob(job: any) {
  const startTime = Date.now();
  const {
    serverId,
    provider: rawProvider,
    config,
  } = job.data as {
    serverId: number;
    provider: "openai-compatible" | "openai" | "ollama"; // "openai" is legacy alias
    config: EmbeddingConfig;
  };

  // Normalize legacy "openai" provider to "openai-compatible"
  const provider = rawProvider === "openai" ? "openai-compatible" : rawProvider;
  let lastHeartbeat = Date.now();

  try {
    // Validate provider early
    if (!provider) {
      throw new Error(
        "Embedding provider not configured. Please configure it in server settings."
      );
    }

    if (!config.baseUrl || !config.model) {
      throw new Error(
        "Embedding configuration incomplete. Base URL and model are required."
      );
    }

    console.log(
      `Generating embeddings for movies and series on server ${serverId} using ${provider}`
    );

    // Update job status to processing
    await logJobResult(
      job.id,
      "generate-item-embeddings",
      "processing",
      { serverId, provider, status: "starting" },
      Date.now() - startTime
    );

    // Get unprocessed items (Movies and Series) for this server
    const unprocessedItems = await db
      .select()
      .from(items)
      .where(
        and(
          eq(items.serverId, serverId),
          eq(items.processed, false),
          sql`${items.type} IN ('Movie', 'Series')`
        )
      )
      .limit(100); // Process in batches

    if (unprocessedItems.length === 0) {
      await logJobResult(
        job.id,
        "generate-item-embeddings",
        "completed",
        { serverId, provider, processed: 0, message: "No items to process" },
        Date.now() - startTime
      );
      return { success: true, processed: 0 };
    }

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Helper function to send heartbeat every 30 seconds
    const sendHeartbeat = async () => {
      const now = Date.now();
      if (now - lastHeartbeat > 30000) {
        // 30 seconds
        console.log(
          `Embedding job heartbeat: ${processedCount}/${unprocessedItems.length} processed, ${skippedCount} skipped`
        );
        lastHeartbeat = now;
      }
    };

    // Helper function to prepare text for embedding
    const prepareTextForEmbedding = (item: Item): string => {
      const textParts = [
        item.name,
        item.overview,
        item.type,
        item.officialRating,
        item.premiereDate,
        item.communityRating,
        item.productionYear,
        item.seriesStudio,
        item.runtimeTicks,
        item.seriesName,
        ...(item.genres || []),
      ].filter(Boolean);

      // Add people data if available (actors, directors, etc.)
      if (item.people) {
        try {
          const peopleData =
            typeof item.people === "string"
              ? JSON.parse(item.people)
              : item.people;

          if (peopleData && typeof peopleData === "object") {
            const peopleNames = Object.values(peopleData)
              .filter((person: any) => person && person.Name)
              .map((person: any) => {
                // Include both name and role for better context
                const parts = [person.Name];
                if (person.Role && person.Type === "Actor") {
                  parts.push(`as ${person.Role}`);
                }
                if (person.Type && person.Type !== "Actor") {
                  parts.push(`(${person.Type})`);
                }
                return parts.join(" ");
              });

            textParts.push(...peopleNames);
          }
        } catch (error) {
          // Silently continue if people data can't be parsed
          console.warn(
            `Failed to parse people data for item ${item.id}:`,
            error
          );
        }
      }

      return textParts.join(" ").substring(0, DEFAULT_MAX_TEXT_LENGTH);
    };

    const expectedDimensions = config.dimensions;

    // Validate embedding dimensions match expected
    const validateEmbedding = (
      rawEmbedding: number[],
      itemId: string
    ): number[] | null => {
      if (!Array.isArray(rawEmbedding) || rawEmbedding.length === 0) {
        console.error(`Invalid embedding data for item ${itemId}`);
        return null;
      }

      if (rawEmbedding.length !== expectedDimensions) {
        console.error(
          `Dimension mismatch for item ${itemId}: got ${rawEmbedding.length}, expected ${expectedDimensions}. ` +
            `Check your model configuration - the model may output different dimensions than configured.`
        );
        return null;
      }

      return rawEmbedding;
    };

    if (provider === "openai-compatible") {
      // Use OpenAI SDK with custom baseURL for any OpenAI-compatible API
      // Supports: OpenAI, Azure OpenAI, Together AI, Fireworks, Anyscale, LocalAI, LM Studio, vLLM, etc.
      if (!config.apiKey) {
        throw new Error("API key not provided for OpenAI-compatible provider");
      }

      const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        timeout: TIMEOUT_CONFIG.DEFAULT,
        maxRetries: DEFAULT_MAX_RETRIES,
      });

      // Process items in batches
      const BATCH_SIZE = 20;

      for (let i = 0; i < unprocessedItems.length; i += BATCH_SIZE) {
        const batch = unprocessedItems.slice(i, i + BATCH_SIZE);

        try {
          await sendHeartbeat();

          const batchData: { item: Item; textToEmbed: string }[] = [];
          const itemsToSkip: Item[] = [];

          for (const item of batch) {
            const textToEmbed = prepareTextForEmbedding(item);
            if (textToEmbed.trim()) {
              batchData.push({ item, textToEmbed });
            } else {
              itemsToSkip.push(item);
            }
          }

          if (itemsToSkip.length > 0) {
            for (const item of itemsToSkip) {
              await db
                .update(items)
                .set({ processed: true })
                .where(eq(items.id, item.id));
              skippedCount++;
            }
          }

          if (batchData.length === 0) {
            continue;
          }

          const textsToEmbed = batchData.map((data) => data.textToEmbed);

          console.log(
            `Processing batch: ${batchData.length} items via ${config.baseUrl}`
          );

          // Call embedding API
          // Note: 'dimensions' param only works for models that support it (e.g., OpenAI text-embedding-3-*)
          const response = await client.embeddings.create({
            model: config.model,
            input: textsToEmbed,
            ...(expectedDimensions ? { dimensions: expectedDimensions } : {}),
          });

          if (!response.data || response.data.length !== batchData.length) {
            throw new Error(
              `Invalid response: expected ${batchData.length} embeddings, got ${
                response.data?.length || 0
              }`
            );
          }

          for (let j = 0; j < batchData.length; j++) {
            const { item } = batchData[j];
            const embeddingData = response.data[j];

            if (!embeddingData?.embedding) {
              console.error(`No embedding data for item ${item.id}`);
              errorCount++;
              continue;
            }

            const rawEmbedding = embeddingData.embedding;

            const embedding = validateEmbedding(rawEmbedding, item.id);
            if (!embedding) {
              errorCount++;
              continue;
            }

            try {
              await db
                .update(items)
                .set({
                  embedding,
                  processed: true,
                })
                .where(eq(items.id, item.id));
              processedCount++;
            } catch (dbError) {
              console.error(`Database error for item ${item.id}:`, dbError);
              errorCount++;
            }
          }

          await sleep(DEFAULT_RATE_LIMIT_DELAY);
        } catch (batchError) {
          console.error(`Error processing batch at index ${i}:`, batchError);

          if (batchError instanceof Error) {
            if (batchError.message.includes("rate_limit")) {
              throw new Error("Rate limit exceeded. Please try again later.");
            } else if (batchError.message.includes("insufficient_quota")) {
              throw new Error("Quota exceeded. Please check your billing.");
            } else if (
              batchError.message.includes("invalid_api_key") ||
              batchError.message.includes("401")
            ) {
              throw new Error(
                "Invalid API key. Please check your configuration."
              );
            }
          }

          errorCount += batch.length;
          continue;
        }
      }
    } else if (provider === "ollama") {
      // Ollama uses a different API format (/api/embeddings)
      for (const item of unprocessedItems) {
        try {
          await sendHeartbeat();

          const textToEmbed = prepareTextForEmbedding(item);

          if (!textToEmbed.trim()) {
            await db
              .update(items)
              .set({ processed: true })
              .where(eq(items.id, item.id));
            skippedCount++;
            continue;
          }

          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };

          if (config.apiKey) {
            headers["Authorization"] = `Bearer ${config.apiKey}`;
          }

          const response = await axios.post(
            `${config.baseUrl}/api/embeddings`,
            {
              model: config.model,
              prompt: textToEmbed,
            },
            {
              headers,
              timeout: TIMEOUT_CONFIG.DEFAULT,
            }
          );

          const rawEmbedding =
            response.data.embedding || response.data.embeddings;

          if (!rawEmbedding) {
            throw new Error("No embedding returned from Ollama");
          }

          const embedding = validateEmbedding(rawEmbedding, item.id);
          if (!embedding) {
            errorCount++;
            continue;
          }

          await db
            .update(items)
            .set({
              embedding,
              processed: true,
            })
            .where(eq(items.id, item.id));

          processedCount++;

          // Ollama is typically self-hosted, use shorter delay
          await sleep(100);
        } catch (itemError) {
          console.error(`Error processing item ${item.id}:`, itemError);
          errorCount++;
          continue;
        }
      }
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const processingTime = Date.now() - startTime;
    await logJobResult(
      job.id,
      "generate-item-embeddings",
      "completed",
      {
        serverId,
        provider,
        processed: processedCount,
        skipped: skippedCount,
        errors: errorCount,
      },
      processingTime
    );

    // Ensure HNSW index exists for similarity queries (only on first batch)
    if (processedCount > 0) {
      await ensureEmbeddingIndex(config.dimensions);
    }

    // Check if there are more items to process using an efficient count query
    const remainingCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(items)
      .where(
        and(
          eq(items.serverId, serverId),
          eq(items.processed, false),
          sql`${items.type} IN ('Movie', 'Series')`
        )
      );

    const remaining = Number(remainingCount[0]?.count ?? 0);

    if (remaining > 0) {
      console.log(
        `Queueing next batch for server ${serverId}, ${remaining} items remaining`
      );

      // Queue next batch (no singleton - chained jobs need to run sequentially)
      try {
        const boss = await getJobQueue();
        const nextJobId = await boss.send(
          "generate-item-embeddings",
          {
            serverId,
            provider,
            config,
          },
          {
            retryLimit: 3,
            retryDelay: 30, // 30 seconds
          }
        );

        console.log(`Queued next embedding batch with job ID: ${nextJobId}`);
      } catch (queueError) {
        console.error("Failed to queue next embedding batch:", queueError);
      }
    } else {
      console.log(
        `Embedding job complete for server ${serverId}. Processed: ${processedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`
      );
    }

    return {
      success: true,
      processed: processedCount,
      skipped: skippedCount,
      errors: errorCount,
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`Embedding job failed for server ${serverId}:`, error);

    await logJobResult(
      job.id,
      "generate-item-embeddings",
      "failed",
      {
        serverId,
        provider,
        error: error instanceof Error ? error.message : String(error),
      },
      processingTime,
      error
    );
    throw error;
  }
}
