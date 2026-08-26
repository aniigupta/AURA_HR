"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/utils/api";
import { Sparkles, Send, Bot, User, RotateCcw, ChevronDown, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/atoms";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  timestamp: string;
}

interface AIChatResponse {
  reply: string;
  sources: string[];
}

// Message ids and timestamps are read off the clock, which makes them impure.
// They live at module scope so the React Compiler lint can see they are not
// render-time reads, and so the id counter is monotonic rather than
// clock-derived: `user-${Date.now()}` collided whenever two messages were
// created inside the same millisecond, which duplicated React keys.
let messageSequence = 0;

function nextMessageId(prefix: string): string {
  messageSequence += 1;
  return `${prefix}-${messageSequence}`;
}

// Welcome turns are generated locally and must never be sent back as
// conversation history. They now live outside `messages` entirely (see
// welcomeMessage below), which fixes this structurally: previously the
// greeting was pushed into state and filtered out again by comparing against
// the literal id "welcome-1" — a check the "Clear conversation" greeting did
// not match, so after a reset it leaked into the next request's history. The
// prefix filter in handleSend is kept as a cheap guard in case a greeting is
// ever placed into `messages` again.
const WELCOME_PREFIX = "welcome";

function clockLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function HRAssistantChatbot() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Bumped by "Clear conversation". Identifies the current conversation so the
  // derived greeting gets a fresh key and a fresh opening line.
  const [conversation, setConversation] = useState(0);
  const [conversationStartedAt, setConversationStartedAt] = useState(clockLabel);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The greeting is derived from the signed-in user rather than pushed into
  // state by an effect. The previous version set state from inside an effect
  // that also depended on messages.length, so its own write re-triggered it —
  // a cascading render the React Compiler lint flags. Deriving it means the
  // transcript is a pure function of (user, conversation, messages), and the
  // greeting cannot go stale if the user's name or tenant loads late.
  const welcomeMessage: ChatMessage | null = useMemo(() => {
    if (!user) return null;
    const companyName = user.organization_name || "AuraHR";
    const firstName = user.profile?.first_name || "there";
    return {
      id: `${WELCOME_PREFIX}-${conversation}`,
      role: "assistant",
      content:
        conversation === 0
          ? `Hello **${firstName}**! 👋 I am your **${companyName} HR Policy Assistant**.\n\nYou can ask me anything about your leave balances, office timings, WFH rules, company policies, or public holidays!`
          : `Conversation reset! How can I assist you with **${companyName}** policies today, **${firstName}**?`,
      sources: ["AuraHR AI"],
      timestamp: conversationStartedAt,
    };
  }, [user, conversation, conversationStartedAt]);

  // Memoized so the auto-scroll effect below keys on content changes rather
  // than on a fresh array identity every render.
  const transcript = useMemo(
    () => (welcomeMessage ? [welcomeMessage, ...messages] : messages),
    [welcomeMessage, messages]
  );

  // Auto-scroll to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript, isOpen]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const suggestionPrompts = [
    "Check my current leave balance",
    "What are our official office timings?",
    "What are the upcoming holidays?",
    "Explain our Work From Home (WFH) policy",
    "What is the company notice period?",
  ];

  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText || inputMessage).trim();
    if (!textToSend || isLoading) return;

    const userMsg: ChatMessage = {
      id: nextMessageId("user"),
      role: "user",
      content: textToSend,
      timestamp: clockLabel()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setIsLoading(true);

    try {
      // Prepare history for API
      const history = messages
        .filter((m) => !m.id.startsWith(`${WELCOME_PREFIX}-`))
        .slice(-6)
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          content: m.content
        }));

      const data = await apiFetch<AIChatResponse>("/assistant/chat", {
        method: "POST",
        body: JSON.stringify({
          message: textToSend,
          history: history
        })
      });

      const aiMsg: ChatMessage = {
        id: nextMessageId("assistant"),
        role: "assistant",
        content: data.reply,
        sources: data.sources || [],
        timestamp: clockLabel()
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to connect to HR AI Assistant.";
      const errorReply: ChatMessage = {
        id: nextMessageId("err"),
        role: "assistant",
        content: `⚠️ **Connection issue**: ${errorMsg}. Please try asking again or contact your HR administrator.`,
        timestamp: clockLabel()
      };
      setMessages((prev) => [...prev, errorReply]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setConversation((n) => n + 1);
    setConversationStartedAt(clockLabel());
  };

  // Basic formatting helper for bold and bullet lists in assistant responses
  const renderFormattedContent = (content: string) => {
    const lines = content.split("\n");
    return lines.map((line, idx) => {
      // Bullet points
      if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        const bulletText = line.trim().substring(2);
        return (
          <li key={idx} className="ml-4 list-disc text-xs text-slate-700 leading-relaxed my-0.5">
            <span>{formatInline(bulletText)}</span>
          </li>
        );
      }
      // Headings
      if (line.trim().startsWith("### ")) {
        return (
          <h4 key={idx} className="font-medium text-xs text-slate-900 mt-2 mb-1">
            {line.trim().substring(4)}
          </h4>
        );
      }
      if (!line.trim()) {
        return <div key={idx} className="h-1.5" />;
      }
      return (
        <p key={idx} className="text-xs text-slate-700 leading-relaxed my-0.5 font-normal">
          <span>{formatInline(line)}</span>
        </p>
      );
    });
  };

  // Renders **bold** and `code` as React elements rather than an HTML string.
  //
  // This deliberately does NOT use dangerouslySetInnerHTML. Assistant replies
  // are not trusted input: the rule-based fallback engine in app/core/ai.py
  // echoes company-policy content back verbatim, and that content comes from
  // documents an admin uploaded. Interpolating it as markup made any policy
  // body a stored-XSS vector that fired in every employee's browser the moment
  // they asked about that policy. Returning nodes means React escapes the text
  // for us and there is no string that can carry an event handler.
  const formatInline = (text: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    const pattern = /\*\*(.*?)\*\*|`([^`]+)`/g;
    let lastIndex = 0;
    let key = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(text.slice(lastIndex, match.index));
      }
      if (match[1] !== undefined) {
        nodes.push(
          <strong key={key++} className="font-medium text-slate-900">
            {match[1]}
          </strong>
        );
      } else {
        nodes.push(
          <code
            key={key++}
            className="bg-slate-100 px-1 py-0.5 rounded text-[11px] font-mono text-indigo-700"
          >
            {match[2]}
          </code>
        );
      }
      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
      nodes.push(text.slice(lastIndex));
    }
    return nodes;
  };

  if (!user) return null;

  return (
    <>
      {/* Floating Chat Trigger Button */}
      <div className="fixed bottom-5 right-5 z-50">
        {!isOpen ? (
          <button
            onClick={() => setIsOpen(true)}
            className="group flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-full shadow-xl hover:shadow-2xl transition-all duration-200 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 font-medium"
            aria-label="Open HR Policy Assistant"
          >
            <div className="relative">
              <Sparkles className="h-5 w-5 text-indigo-200 group-hover:text-white transition-colors" />
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
            <span className="text-xs font-medium tracking-wide pr-1">Ask HR Policy AI</span>
          </button>
        ) : null}
      </div>

      {/* Floating Chat Modal Window */}
      {isOpen && (
        <div className="fixed bottom-5 right-5 z-50 w-[92vw] sm:w-[410px] h-[580px] max-h-[85vh] bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-white/15 text-white backdrop-blur-xs">
                <Bot className="h-4.5 w-4.5" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-xs tracking-tight">
                    {user.organization_name || "AuraHR"} AI Assistant
                  </span>
                  <span className="text-[9px] font-medium bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-400/30">
                    Live
                  </span>
                </div>
                <span className="text-[10px] text-indigo-200 font-normal">
                  Instant Company Policy & Balance Q&A
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleClearChat}
                title="Clear conversation"
                className="p-1.5 hover:bg-white/15 rounded-lg text-indigo-200 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Minimize assistant"
                className="p-1.5 hover:bg-white/15 rounded-lg text-indigo-200 hover:text-white transition-colors cursor-pointer"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages Container */}
          <div className="flex-1 p-3.5 space-y-3.5 overflow-y-auto bg-slate-50/50">
            {transcript.map((msg) => {
              const isAi = msg.role === "assistant";
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 ${isAi ? "justify-start" : "justify-end"}`}
                >
                  {isAi && (
                    <div className="h-7 w-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                  )}

                  <div className={`flex flex-col max-w-[82%] ${isAi ? "items-start" : "items-end"}`}>
                    <div
                      className={`p-3 rounded-2xl text-xs ${
                        isAi
                          ? "bg-white border border-slate-200 text-slate-800 shadow-xs rounded-tl-sm"
                          : "bg-indigo-600 text-white rounded-tr-sm shadow-xs"
                      }`}
                    >
                      {isAi ? (
                        <div>{renderFormattedContent(msg.content)}</div>
                      ) : (
                        <p className="text-xs leading-relaxed whitespace-pre-wrap font-normal">{msg.content}</p>
                      )}
                    </div>

                    {/* Sources Badge if available */}
                    {isAi && msg.sources && msg.sources.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 pl-1">
                        <BookOpen className="h-2.5 w-2.5 text-slate-400" />
                        <span className="text-[10px] text-slate-400 font-normal truncate max-w-[240px]">
                          Sources: {msg.sources.join(", ")}
                        </span>
                      </div>
                    )}

                    <span className="text-[9px] text-slate-400 mt-0.5 px-1 font-normal">
                      {msg.timestamp}
                    </span>
                  </div>

                  {!isAi && (
                    <div className="h-7 w-7 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                      <User className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* AI Typing Indicator */}
            {isLoading && (
              <div className="flex gap-2.5 justify-start">
                <div className="h-7 w-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5 animate-pulse">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-2xl rounded-tl-sm shadow-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestion Prompts Bar */}
          <div className="px-3 py-2 border-t border-slate-100 bg-white shrink-0 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              {suggestionPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(prompt)}
                  disabled={isLoading}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 font-normal transition-colors cursor-pointer shrink-0 border border-slate-200"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Input Bar */}
          <div className="p-3 border-t border-slate-200 bg-white shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask about leaves, timings, policies..."
                disabled={isLoading}
                className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 placeholder:text-slate-400 font-normal"
              />
              <Button
                type="submit"
                size="sm"
                disabled={isLoading || !inputMessage.trim()}
                className="h-8.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shrink-0 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
