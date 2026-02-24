/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { getConvexClient } from "@/lib/convex";
import { createSSEParser } from "@/lib/createSSEParser";
import { ChatRequestBody, StreamMessageType } from "@/lib/types";
import { ArrowRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import MessageBubble from "@/components/MessageBubble";
import MessageWelcome from "@/components/MessageWelcome";

interface ChatInterfaceProps {
  chatId: Id<"chats">;
  initialMessages: Doc<"messages">[];
}

function ChatInterface({ chatId, initialMessages }: ChatInterfaceProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Doc<"messages">[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streamedResponse, setStreamedResponse] = useState("");
  const [currentTool, setCurrentTool] = useState<{ name: string; input: unknown } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedResponse]);

  const formatToolOutput = (output: unknown): string => {
    if (typeof output === "string") return output;
    return JSON.stringify(output, null, 2);
  };

  const formatTerminalOutput = (tool: string, input: unknown, output: unknown) => {
    const terminalHtml = `<div class="bg-[#1e1e1e] text-white font-mono p-2 rounded-md my-2 overflow-x-auto whitespace-normal max-w-[600px]">
      <div class="flex items-center gap-1.5 border-b border-gray-700 pb-1">
        <span class="text-red-500">●</span>
        <span class="text-yellow-500">●</span>
        <span class="text-green-500">●</span>
        <span class="text-gray-400 ml-1 text-sm">~/${tool}</span>
      </div>
      <div class="text-gray-400 mt-1">$ Input</div>
      <pre class="text-yellow-400 mt-0.5 whitespace-pre-wrap overflow-x-auto">${formatToolOutput(input)}</pre>
      <div class="text-gray-400 mt-2">$ Output</div>
      <pre class="text-green-400 mt-0.5 whitespace-pre-wrap overflow-x-auto">${formatToolOutput(output)}</pre>
    </div>`;

    return `---START---\n${terminalHtml}\n---END---`;
  };

  const processStream = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onChunk: (chunk: string) => Promise<void>,
  ) => {
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) {
          console.warn("Empty chunk received");
          continue;
        }
        const chunk = decoder.decode(value);
        await onChunk(chunk);
      }
    } catch (error) {
      console.log("Error processing stream: ", error);
      throw error;
    } finally {
      reader.releaseLock();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    // Reset UI state for new message
    setInput("");
    setStreamedResponse("");
    setCurrentTool(null);
    setIsLoading(true);

    // Add user´s message immediatily for better UX
    const optimisticUserMessage: Doc<"messages"> = {
      _id: `temp_${Date.now()}` as Id<"messages">,
      chatId,
      content: trimmedInput,
      role: "user",
      createdAt: Date.now(),
      _creationTime: Date.now(),
    } as Doc<"messages">;

    setMessages((prev) => [...prev, optimisticUserMessage]);

    // Track complete response for saving to database
    let fullResponse = "";

    // Start streaming response
    try {
      // Normalize messages before creating the prompt
      const messagesForPrompt = messages.map((msg) => {
        if (Array.isArray(msg.content)) {
          const textContent = msg.content.find((part) => part.type === "text")?.text || "";
          return { ...msg, content: textContent };
        }
        return msg;
      });

      const requestBody: ChatRequestBody = {
        messages: messagesForPrompt.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        newMessage: trimmedInput,
        chatId,
      };

      // Initialize SSE Connection
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) throw new Error(await response.text());
      if (!response.body) throw new Error("No response body available");

      // Handle the stream
      // Create SSE parser and stream reader
      const parser = createSSEParser();
      const reader = response.body.getReader();

      // Process the stream chunks
      await processStream(reader, async (chunk) => {
        // Parse SSE messages from the chunk
        const messages = parser.parse(chunk);

        // Handle each based on its type
        for (const message of messages) {
          if (!message || !message.type) {
            continue;
          }

          switch (message.type) {
            case StreamMessageType.Token:
              if ("token" in message && typeof message.token === "string") {
                fullResponse += message.token;
                setStreamedResponse(fullResponse);
              } else {
                console.warn("Invalid Token:", message);
              }
              break;

            case StreamMessageType.ToolStart:
              if ("tool" in message && "input" in message) {
                setCurrentTool({
                  name: message.tool,
                  input: message.input,
                });
                fullResponse += formatTerminalOutput(message.tool, message.input, "Processing...");
                setStreamedResponse(fullResponse);
              } else {
                console.warn("Invalid ToolStart:", message);
              }
              break;
            case StreamMessageType.ToolEnd:
              if ("tool" in message && "output" in message && currentTool) {
                const lastTerminalIndex = fullResponse.lastIndexOf('<div class="bg-[#1e1e1e]');
                if (lastTerminalIndex !== -1) {
                  fullResponse =
                    fullResponse.substring(0, lastTerminalIndex) +
                    formatTerminalOutput(message.tool, currentTool.input, message.output);
                  setStreamedResponse(fullResponse);
                }
                setCurrentTool(null);
              } else {
                console.warn("Invalid ToolEnd and currentTool undefined:", message);
              }
              break;
            case StreamMessageType.Error:
              if ("error" in message) {
                throw new Error(message.error);
              } else {
                console.warn("Invalid Error:", message);
              }
              break;
            case StreamMessageType.Done:
              const assistantMessage: Doc<"messages"> = {
                _id: `temp_assistant_${Date.now()}` as Id<"messages">,
                chatId,
                content: fullResponse,
                role: "assistant",
                createdAt: Date.now(),
                _creationTime: Date.now(),
              } as Doc<"messages">;

              const convex = getConvexClient();
              await convex.mutation(api.messages.store, {
                chatId,
                content: fullResponse,
                role: "assistant",
              });

              setMessages((prev) => [...prev, assistantMessage]);
              setStreamedResponse("");
              return;
          }
        }
      });
    } catch (error: any) {
      // Remove the optimistic user message if there was an error
      setMessages((prev) => prev.filter((msg) => msg._id !== optimisticUserMessage._id));
      setStreamedResponse(
        formatTerminalOutput(
          "error",
          "Failed to process message",
          error instanceof Error ? error.message : "Unknown error",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex flex-col h-[calc(100vh-theme(spacing.14))]">
      <section className="flex-1 overflow-y-auto bg-gray-50 p-2 md:p-0">
        <div className="max-w-4xl mx-auto p-4 space-y-3">
          {messages.length === 0 && <MessageWelcome />}
          {/** Messages */}
          {messages.map((message: Doc<"messages">) => (
            <MessageBubble
              key={message._id}
              content={message.content}
              isUser={message.role === "user"}
            />
          ))}

          {streamedResponse && <MessageBubble content={streamedResponse} />}

          {/**Loading Indicator */}
          {isLoading && !streamedResponse && (
            <div className="flex justify-start animate-in fade-in-0">
              <div className="rounded-2xl px-4 py-3 bg-white text-gray-900 rounded-bl-none shadow-sm ring-1 ring-inset ring-gray-200">
                <div className="flex items-center gap-1.5">
                  {[0.3, 0.15, 0].map((delay, i) => (
                    <div
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce"
                      style={{ animationDelay: `-${delay}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </section>

      <footer className="border-t bg-white p-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative">
          <div className="relative flex items-center">
            <input
              className="flex-1 py-3 px-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12 bg-gray-50 placeholder:text-gray-500"
              type="text"
              value={input}
              placeholder="Message AI Agent..."
              disabled={isLoading}
              onChange={(e) => setInput(e.target.value)}
            />
            <Button
              className={`absolute right-1.5 rounded-xl h-9 w-9 p-0 flex items-center justify-center transition-all ${input.trim() ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm" : "bg-gray-100 text-gray-400"}`}
              type="submit"
              disabled={isLoading || !input.trim()}
            >
              <ArrowRight />
            </Button>
          </div>
        </form>
      </footer>
    </main>
  );
}

export default ChatInterface;
