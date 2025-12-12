import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { createChatModel, type ChatConfig } from "@/lib/ai/providers";
import { createChatTools } from "@/lib/ai/tools";
import { getServer } from "@/lib/db/server";
import { getMe } from "@/lib/db/users";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a helpful media assistant for Streamystats, a Jellyfin statistics and analytics platform. You help users discover content, understand their watching habits, and get personalized recommendations.

Your capabilities:
- Find user's most watched movies and series
- Provide personalized AI-powered recommendations based on watch history
- Search the media library by name or genre
- Show recently added content
- Get watch statistics (total time, streaks, etc.)
- Find shared recommendations for multiple users to watch together
- Filter content by genre or rating

Guidelines:
- Be concise and helpful
- When showing lists, format them nicely with key details (name, year, rating)
- If recommendations require embeddings and none are found, suggest the user configure AI embeddings in settings
- For watch time, always convert seconds to human-readable format (hours/minutes)
- When users ask about watching with someone else, use the shared recommendations tool
- Be conversational and friendly

IMPORTANT - Recommendation format:
When presenting recommendations, ALWAYS explain what each recommendation is based on using the "basedOn" and "reason" fields from the tool results. Format like:
- "I recommend [title] because you watched [basedOn names]"
- "Since you enjoyed [basedOn names], you might like [recommendation]"
- "Based on your viewing of [basedOn names], I suggest [recommendation]"

Never list recommendations without mentioning what they're based on. The basedOn data shows which items from the user's watch history led to each recommendation.`;

export async function POST(req: Request) {
  try {
    const { messages, serverId } = await req.json();

    if (!serverId) {
      return new Response(JSON.stringify({ error: "Server ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [server, me] = await Promise.all([getServer({ serverId }), getMe()]);

    if (!server) {
      return new Response(JSON.stringify({ error: "Server not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!me) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const chatConfig: ChatConfig = {
      provider: server.chatProvider as ChatConfig["provider"],
      baseUrl: server.chatBaseUrl,
      apiKey: server.chatApiKey,
      model: server.chatModel,
    };

    const model = createChatModel(chatConfig);

    if (!model) {
      return new Response(
        JSON.stringify({
          error:
            "Chat AI not configured. Please configure it in Settings > Chat AI.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const tools = createChatTools(server.id, me.id);
    const convertedMessages = convertToModelMessages(messages);

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: convertedMessages,
      tools,
      stopWhen: stepCountIs(5),
      onError: ({ error }) => {
        console.error("[Chat API] Stream error:", error);
      },
      onFinish: ({
        text,
        toolCalls,
        toolResults,
        usage,
        finishReason,
        steps,
      }) => {
        console.log("[Chat API] Stream finished:", {
          finishReason,
          stepsCount: steps?.length,
          textLength: text?.length,
          text: text?.slice(0, 200),
          toolCallsCount: toolCalls?.length,
          toolResultsCount: toolResults?.length,
          usage,
        });
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[Chat API] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
