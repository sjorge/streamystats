import { db, Item, items } from "@streamystats/database";
import axios from "axios";
import { and, eq, sql } from "drizzle-orm";
import OpenAI from "openai";
import { OPENAI_CONFIG, TIMEOUT_CONFIG } from "./config";
import { logJobResult } from "./job-logger";
import { getJobQueue } from "./queue";

// Job: Generate embeddings for media items using different providers
export async function generateItemEmbeddingsJob(job: any) {
  const startTime = Date.now();
  const { serverId, provider, config } = job.data;
  let lastHeartbeat = Date.now();

  try {
    // Validate provider early
    if (!provider) {
      throw new Error(
        "Embedding provider not configured. Please select either 'openai' or 'ollama' in the server settings."
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

      return textParts.join(" ").substring(0, OPENAI_CONFIG.MAX_TEXT_LENGTH);
    };

    if (provider === "openai") {
      if (!config.openaiApiKey) {
        throw new Error("OpenAI API key not provided");
      }

      const openaiClient = new OpenAI({
        apiKey: config.openaiApiKey,
        timeout: TIMEOUT_CONFIG.DEFAULT,
        maxRetries: OPENAI_CONFIG.MAX_RETRIES,
      });

      // Process items in batches for OpenAI
      const BATCH_SIZE = 20; // OpenAI supports up to 2048 inputs, but 20 is a good balance

      for (let i = 0; i < unprocessedItems.length; i += BATCH_SIZE) {
        const batch = unprocessedItems.slice(i, i + BATCH_SIZE);

        try {
          // Send heartbeat if needed
          await sendHeartbeat();

          // Prepare all texts for the batch, track items to skip
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

          // Mark items with no text as processed (skip them permanently)
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
            continue; // All items in batch were skipped
          }

          // Extract just the texts for the API call
          const textsToEmbed = batchData.map((data) => data.textToEmbed);

          console.log(`Processing OpenAI batch: ${batchData.length} items`);

          // Call OpenAI API with batch of texts
          const response = await openaiClient.embeddings.create({
            model: OPENAI_CONFIG.EMBEDDING_MODEL,
            input: textsToEmbed,
            dimensions: OPENAI_CONFIG.EMBEDDING_DIMENSIONS,
          });

          // Validate response structure
          if (!response.data || response.data.length !== batchData.length) {
            throw new Error(
              `Invalid response structure from OpenAI API: expected ${
                batchData.length
              } embeddings, got ${response.data?.length || 0}`
            );
          }

          // Process each embedding in the batch
          for (let j = 0; j < batchData.length; j++) {
            const { item } = batchData[j];
            const embeddingData = response.data[j];

            if (!embeddingData || !embeddingData.embedding) {
              console.error(`No embedding data for item ${item.id}`);
              errorCount++;
              continue;
            }

            const rawEmbedding = embeddingData.embedding;

            // Validate embedding dimensions
            if (!Array.isArray(rawEmbedding) || rawEmbedding.length === 0) {
              console.error(`Invalid embedding data for item ${item.id}`);
              errorCount++;
              continue;
            }

            let embedding: number[];

            // Ensure embedding has correct dimensions
            if (rawEmbedding.length !== OPENAI_CONFIG.EMBEDDING_DIMENSIONS) {
              console.warn(
                `OpenAI embedding dimension mismatch for item ${item.id}: expected ${OPENAI_CONFIG.EMBEDDING_DIMENSIONS}, got ${rawEmbedding.length}`
              );

              // Normalize dimensions to match expected size
              if (rawEmbedding.length < OPENAI_CONFIG.EMBEDDING_DIMENSIONS) {
                // Pad with zeros
                embedding = [
                  ...rawEmbedding,
                  ...new Array(
                    OPENAI_CONFIG.EMBEDDING_DIMENSIONS - rawEmbedding.length
                  ).fill(0),
                ];
              } else if (
                rawEmbedding.length > OPENAI_CONFIG.EMBEDDING_DIMENSIONS
              ) {
                // Truncate
                embedding = rawEmbedding.slice(
                  0,
                  OPENAI_CONFIG.EMBEDDING_DIMENSIONS
                );
              } else {
                embedding = rawEmbedding;
              }
            } else {
              embedding = rawEmbedding;
            }

            // Update item with embedding
            try {
              await db
                .update(items)
                .set({
                  embedding: embedding,
                  processed: true,
                })
                .where(eq(items.id, item.id));

              processedCount++;
            } catch (dbError) {
              console.error(`Database error for item ${item.id}:`, dbError);
              errorCount++;
            }
          }

          // Add delay between batches (not between individual items)
          await new Promise((resolve) =>
            setTimeout(resolve, OPENAI_CONFIG.RATE_LIMIT_DELAY)
          );
        } catch (batchError) {
          console.error(
            `Error processing OpenAI batch starting at index ${i}:`,
            batchError
          );

          // Handle specific OpenAI errors
          if (batchError instanceof Error) {
            if (batchError.message.includes("rate_limit")) {
              throw new Error(
                `OpenAI rate limit exceeded. Please try again later.`
              );
            } else if (batchError.message.includes("insufficient_quota")) {
              throw new Error(
                `OpenAI quota exceeded. Please check your billing.`
              );
            } else if (batchError.message.includes("invalid_api_key")) {
              throw new Error(
                `Invalid OpenAI API key. Please check your configuration.`
              );
            }
          }

          // For other errors, mark all items in batch as errors and continue
          errorCount += batch.length;
          continue;
        }
      }
    } else if (provider === "ollama") {
      // Process items one by one for Ollama
      for (const item of unprocessedItems) {
        try {
          // Send heartbeat if needed
          await sendHeartbeat();

          const textToEmbed = prepareTextForEmbedding(item);

          if (!textToEmbed.trim()) {
            // Mark items without meaningful text as processed (skip permanently)
            await db
              .update(items)
              .set({ processed: true })
              .where(eq(items.id, item.id));
            skippedCount++;
            continue;
          }

          if (!config.ollamaBaseUrl || !config.ollamaModel) {
            throw new Error("Ollama configuration incomplete");
          }

          const headers: any = {
            "Content-Type": "application/json",
          };

          if (config.ollamaApiToken) {
            headers["Authorization"] = `Bearer ${config.ollamaApiToken}`;
          }

          const response = await axios.post(
            `${config.ollamaBaseUrl}/api/embeddings`,
            {
              model: config.ollamaModel,
              prompt: textToEmbed,
            },
            {
              headers,
              timeout: TIMEOUT_CONFIG.DEFAULT,
            }
          );

          let rawEmbedding =
            response.data.embedding || response.data.embeddings;

          if (!rawEmbedding) {
            throw new Error("No embedding returned from Ollama");
          }

          let embedding: number[];

          // Ensure we have the right dimensions (pad or truncate to match OPENAI_CONFIG.EMBEDDING_DIMENSIONS)
          if (rawEmbedding.length < OPENAI_CONFIG.EMBEDDING_DIMENSIONS) {
            // Pad with zeros
            embedding = [
              ...rawEmbedding,
              ...new Array(
                OPENAI_CONFIG.EMBEDDING_DIMENSIONS - rawEmbedding.length
              ).fill(0),
            ];
          } else if (rawEmbedding.length > OPENAI_CONFIG.EMBEDDING_DIMENSIONS) {
            // Truncate
            embedding = rawEmbedding.slice(
              0,
              OPENAI_CONFIG.EMBEDDING_DIMENSIONS
            );
          } else {
            embedding = rawEmbedding;
          }

          // Update item with embedding
          await db
            .update(items)
            .set({
              embedding: embedding,
              processed: true,
            })
            .where(eq(items.id, item.id));

          processedCount++;

          // Ollama is typically self-hosted, use shorter delay
          await new Promise((resolve) => setTimeout(resolve, 100)); // 0.1 second delay
        } catch (itemError) {
          console.error(`Error processing item ${item.id}:`, itemError);
          errorCount++;
          // Continue processing other items even if one fails
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

      // Queue next batch with singleton key to prevent duplicates
      try {
        const boss = await getJobQueue();
        const singletonKey = `embedding-server-${serverId}`;
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
            singletonKey, // Prevent duplicate jobs for same server
          }
        );

        if (nextJobId) {
          console.log(
            `Successfully queued next embedding batch with job ID: ${nextJobId}`
          );
        } else {
          console.log(
            `Embedding job for server ${serverId} already queued (singleton)`
          );
        }
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
