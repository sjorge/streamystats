"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader, Send, Sparkles, User, Bot, AlertCircle } from "lucide-react";

interface ChatDialogProps {
  chatConfigured: boolean;
}

export function ChatDialog({ chatConfigured }: ChatDialogProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const params = useParams();
  const serverId = params.id as string;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { serverId },
      }),
    [serverId]
  );

  const { messages, sendMessage, status, error } = useChat({
    transport,
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status]);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;
      sendMessage({ text: input });
      setInput("");
    },
    [input, isLoading, sendMessage]
  );

  const renderInlineMarkdown = (text: string) => {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let keyIndex = 0;

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const italicMatch = remaining.match(/(?<!\*)\*([^*]+?)\*(?!\*)/);
      const codeMatch = remaining.match(/`(.+?)`/);

      type MatchType = { index: number; length: number; node: React.ReactNode };
      let nextMatch: MatchType | null = null;

      if (boldMatch?.index !== undefined) {
        nextMatch = {
          index: boldMatch.index,
          length: boldMatch[0].length,
          node: (
            <strong
              key={`b-${keyIndex++}`}
              className="font-semibold text-foreground"
            >
              {boldMatch[1]}
            </strong>
          ),
        };
      }

      if (italicMatch?.index !== undefined) {
        if (!nextMatch || italicMatch.index < nextMatch.index) {
          nextMatch = {
            index: italicMatch.index,
            length: italicMatch[0].length,
            node: (
              <em key={`i-${keyIndex++}`} className="italic">
                {italicMatch[1]}
              </em>
            ),
          };
        }
      }

      if (codeMatch?.index !== undefined) {
        if (!nextMatch || codeMatch.index < nextMatch.index) {
          nextMatch = {
            index: codeMatch.index,
            length: codeMatch[0].length,
            node: (
              <code
                key={`c-${keyIndex++}`}
                className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs font-mono"
              >
                {codeMatch[1]}
              </code>
            ),
          };
        }
      }

      if (nextMatch) {
        if (nextMatch.index > 0) {
          parts.push(remaining.slice(0, nextMatch.index));
        }
        parts.push(nextMatch.node);
        remaining = remaining.slice(nextMatch.index + nextMatch.length);
      } else {
        parts.push(remaining);
        break;
      }
    }

    return parts;
  };

  const renderMessageContent = (content: string) => {
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let inList = false;
    let listItems: React.ReactNode[] = [];
    let listType: "ul" | "ol" = "ul";

    const flushList = () => {
      if (listItems.length > 0) {
        if (listType === "ol") {
          elements.push(
            <ol
              key={`ol-${elements.length}`}
              className="list-decimal pl-5 space-y-1.5 my-2"
            >
              {listItems}
            </ol>
          );
        } else {
          elements.push(
            <ul
              key={`ul-${elements.length}`}
              className="list-disc pl-5 space-y-1.5 my-2"
            >
              {listItems}
            </ul>
          );
        }
        listItems = [];
        inList = false;
      }
    };

    lines.forEach((line, i) => {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith("- ") || trimmedLine.startsWith("* ")) {
        if (!inList || listType !== "ul") {
          flushList();
          inList = true;
          listType = "ul";
        }
        listItems.push(
          <li key={`li-${i}`} className="leading-relaxed">
            {renderInlineMarkdown(trimmedLine.slice(2))}
          </li>
        );
        return;
      }

      if (trimmedLine.match(/^\d+[\.\)]\s/)) {
        if (!inList || listType !== "ol") {
          flushList();
          inList = true;
          listType = "ol";
        }
        listItems.push(
          <li key={`li-${i}`} className="leading-relaxed">
            {renderInlineMarkdown(trimmedLine.replace(/^\d+[\.\)]\s*/, ""))}
          </li>
        );
        return;
      }

      flushList();

      if (trimmedLine === "") {
        elements.push(<div key={`br-${i}`} className="h-3" />);
        return;
      }

      if (trimmedLine.startsWith("### ")) {
        elements.push(
          <h4 key={`h4-${i}`} className="font-semibold text-sm mt-3 mb-1">
            {renderInlineMarkdown(trimmedLine.slice(4))}
          </h4>
        );
        return;
      }

      if (trimmedLine.startsWith("## ")) {
        elements.push(
          <h3 key={`h3-${i}`} className="font-semibold mt-3 mb-1">
            {renderInlineMarkdown(trimmedLine.slice(3))}
          </h3>
        );
        return;
      }

      if (trimmedLine.startsWith("# ")) {
        elements.push(
          <h2 key={`h2-${i}`} className="font-bold text-base mt-3 mb-1">
            {renderInlineMarkdown(trimmedLine.slice(2))}
          </h2>
        );
        return;
      }

      elements.push(
        <p key={`p-${i}`} className="leading-relaxed">
          {renderInlineMarkdown(trimmedLine)}
        </p>
      );
    });

    flushList();
    return elements;
  };

  return (
    <>
      <Button
        variant="outline"
        className="relative h-9 w-9 p-0 xl:h-9 xl:w-60 xl:justify-start xl:px-3 xl:py-2"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-4 w-4 xl:mr-2" />
        <span className="hidden xl:inline-flex">Ask AI...</span>
        <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 xl:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl h-[600px] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI Assistant
            </DialogTitle>
          </DialogHeader>

          {!chatConfigured ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center space-y-3">
                <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground" />
                <h3 className="font-semibold">Chat AI Not Configured</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  To use the AI assistant, configure a chat provider in Settings
                  &gt; Chat AI.
                </p>
              </div>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-8">
                    <Sparkles className="h-12 w-12 text-muted-foreground" />
                    <div className="space-y-2">
                      <h3 className="font-semibold">
                        Ask me about your media library
                      </h3>
                      <p className="text-sm text-muted-foreground max-w-sm">
                        Try asking things like:
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {[
                          "What's my most watched movie?",
                          "Recommend something new",
                          "Recently added movies",
                          "Top rated series",
                        ].map((suggestion) => (
                          <Button
                            key={suggestion}
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => setInput(suggestion)}
                          >
                            {suggestion}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message, messageIndex) => {
                      const isLastMessage =
                        messageIndex === messages.length - 1;
                      const hasTextContent = message.parts.some(
                        (p) => p.type === "text" && p.text.trim()
                      );
                      const hasToolCalls = message.parts.some((p) =>
                        p.type.startsWith("tool-")
                      );
                      const isAssistantThinking =
                        isLoading &&
                        isLastMessage &&
                        message.role === "assistant" &&
                        !hasTextContent;

                      return (
                        <div
                          key={message.id}
                          className={`flex gap-3 ${
                            message.role === "user" ? "justify-end" : ""
                          }`}
                        >
                          {message.role === "assistant" && (
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <Bot className="h-4 w-4 text-primary" />
                            </div>
                          )}
                          <div
                            className={`rounded-xl px-4 py-3 max-w-[85%] shadow-sm ${
                              message.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted/80 border border-border/50"
                            }`}
                          >
                            <div className="text-sm">
                              {message.parts.map((part, partIndex) => {
                                if (part.type === "text" && part.text.trim()) {
                                  return (
                                    <div key={partIndex}>
                                      {renderMessageContent(part.text)}
                                    </div>
                                  );
                                }
                                if (part.type.startsWith("tool-")) {
                                  const toolPart = part as {
                                    type: string;
                                    toolName?: string;
                                    state?: string;
                                  };
                                  const toolDisplayName = toolPart.toolName
                                    ?.replace(/([A-Z])/g, " $1")
                                    .toLowerCase()
                                    .trim();

                                  if (
                                    toolPart.state === "call" ||
                                    toolPart.state === "partial-call"
                                  ) {
                                    return (
                                      <div
                                        key={partIndex}
                                        className="flex items-center gap-2 text-xs text-muted-foreground py-1"
                                      >
                                        <Loader className="h-3 w-3 animate-spin" />
                                        Looking up {toolDisplayName}...
                                      </div>
                                    );
                                  }
                                  if (toolPart.state === "result") {
                                    return (
                                      <div
                                        key={partIndex}
                                        className="flex items-center gap-2 text-xs text-muted-foreground py-1"
                                      >
                                        <span className="text-green-500">
                                          ✓
                                        </span>
                                        Found {toolDisplayName} data
                                      </div>
                                    );
                                  }
                                }
                                return null;
                              })}
                              {isAssistantThinking && !hasToolCalls && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                                  <Loader className="h-3 w-3 animate-spin" />
                                  Thinking...
                                </div>
                              )}
                              {isAssistantThinking && hasToolCalls && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                                  <Loader className="h-3 w-3 animate-spin" />
                                  Generating response...
                                </div>
                              )}
                            </div>
                          </div>
                          {message.role === "user" && (
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                              <User className="h-4 w-4 text-primary-foreground" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {isLoading &&
                      messages[messages.length - 1]?.role === "user" && (
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Bot className="h-4 w-4 text-primary" />
                          </div>
                          <div className="rounded-xl px-4 py-3 bg-muted/80 border border-border/50 shadow-sm">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader className="h-3 w-3 animate-spin" />
                              Thinking...
                            </div>
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </ScrollArea>

              {error && (
                <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20">
                  <p className="text-sm text-destructive">{error.message}</p>
                </div>
              )}

              <form onSubmit={onSubmit} className="p-4 border-t flex gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about your watch history..."
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button type="submit" disabled={isLoading || !input.trim()}>
                  {isLoading ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
