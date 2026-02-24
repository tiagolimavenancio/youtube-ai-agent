/* eslint-disable @typescript-eslint/no-explicit-any */
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex";
import { submitQuestion } from "@/lib/langgraph";
import {
  ChatRequestBody,
  SSE_DATA_PREFIX,
  SSE_LINE_DELIMITER,
  StreamMessage,
  StreamMessageType,
} from "@/lib/types";
import { auth } from "@clerk/nextjs/server";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { NextResponse } from "next/server";

function sendSSEMessage(writer: WritableStreamDefaultWriter<Uint8Array>, data: StreamMessage) {
  const encoder = new TextEncoder();
  return writer.write(
    encoder.encode(`${SSE_DATA_PREFIX}${JSON.stringify(data)}${SSE_LINE_DELIMITER}`),
  );
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }
    const body = (await request.json()) as ChatRequestBody;
    const { messages, newMessage, chatId } = body;
    const convex = getConvexClient();

    //* Create stream with larger queue strategy for better performance
    const stream = new TransformStream({}, { highWaterMark: 1024 });
    const writer = stream.writable.getWriter();

    const response = new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });

    //* Send the initial message to the client
    const startStream = async () => {
      try {
        //* Send initial connection stableshed message
        await sendSSEMessage(writer, {
          type: StreamMessageType.Connected,
          content: "",
        });
        //* Send user message to Convex
        await convex.mutation(api.messages.send, {
          chatId,
          content: newMessage,
        });
        // Convert messages to LangChain format
        const langChainMessages = [
          ...messages.map((msg) =>
            msg.role === "user" ? new HumanMessage(msg.content) : new AIMessage(msg.content),
          ),
          new HumanMessage(newMessage),
        ];

        try {
          const eventStream = await submitQuestion(langChainMessages, chatId);

          //? Process the event stream
          for await (const event of eventStream) {
            if (event.event === "on_chat_model_stream") {
              const token = event.data.chunk;
              if (token) {
                //* Access the text property
                const text = token.content.at(0)?.["text"];
                if (text) {
                  await sendSSEMessage(writer, {
                    type: StreamMessageType.Token,
                    token: text,
                    content: "",
                  });
                }
              }
            } else if (event.event === "on_chat_model_end") {
              // We ensure that the Done message is sent when the LLM model ends
              console.log("LLM completed, sending Done message");
              await sendSSEMessage(writer, {
                type: StreamMessageType.Done,
                content: "",
              });
            } else if (event.event === "on_tool_start") {
              await sendSSEMessage(writer, {
                type: StreamMessageType.ToolStart,
                tool: event.name || "unknown",
                input: event.data.input,
                content: "",
              });
            } else if (event.event === "on_tool_end") {
              const toolMessage = new ToolMessage(event.data.output);
              await sendSSEMessage(writer, {
                type: StreamMessageType.ToolEnd,
                tool: toolMessage.lc_kwargs.name || "unknown",
                output: event.data.output,
                content: "",
              });
            }
          }

          // We send the Done message as a fallback if the on_chat_model_end event was not received
          await sendSSEMessage(writer, {
            type: StreamMessageType.Done,
            content: "",
          });
          console.log("Backup Done message sent");
        } catch (streamError) {
          console.log("Stream error: ", streamError);
          await sendSSEMessage(writer, {
            type: StreamMessageType.Error,
            error: streamError instanceof Error ? streamError.message : "Stream processing failed",
            content: "",
          });
        }
      } catch (error) {
        console.error("Error in chat stream: ", error);
        await sendSSEMessage(writer, {
          type: StreamMessageType.Error,
          error: error instanceof Error ? error.message : "Unknown error in chat stream",
          content: "",
        });
      } finally {
        try {
          await writer.close();
        } catch (error) {
          console.error("Error closing stream: ", error);
        }
      }
    };

    startStream();
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to process chat request" } as const, { status: 500 });
  }
}
