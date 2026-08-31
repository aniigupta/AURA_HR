"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/utils/api";
import { 
  Sparkles, Send, Bot, User, RotateCcw, ChevronDown, BookOpen, 
  Copy, Check, X, Maximize2, Minimize2, Zap, ArrowUp, MessageSquare
} from "lucide-react";
import { toast } from "@/components/ui/toast";

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

let messageSequence = 0;

function nextMessageId(prefix: string): string {
  messageSequence += 1;
  return `${prefix}-${messageSequence}`;
}

const WELCOME_PREFIX = "welcome";

function clockLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function HRAssistantChatbot() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [conversation, setConversation] = useState(0);
  const [conversationStartedAt, setConversationStartedAt] = useState(clockLabel);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const welcomeMessage: ChatMessage | null = useMemo(() => {
    if (!user) return null;
    const companyName = user.organization_name || "AuraHR";
    const firstName = user.profile?.first_name || "there";
    return {
      id: `${WELCOME_PREFIX}-${conversation}`,
      role: "assistant",
      content:
        conversation === 0
          ? `Hello **${firstName}**! 👋 I am your **${companyName} AI Assistant**.\n\nYou can ask me anything about your **leave balances**, **office timings**, **WFH policies**, **benefits**, or **public holidays**!`
          : `Conversation reset! How can I assist you with **${companyName}** guidelines today, **${firstName}**?`,
      sources: ["Company Knowledge Base"],
      timestamp: conversationStartedAt,
    };
  }, [user, conversation, conversationStartedAt]);

  const transcript = useMemo(
    () => (welcomeMessage ? [welcomeMessage, ...messages] : messages),
    [welcomeMessage, messages]
  );

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript, isOpen, isLoading]);

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
    "How does overtime compensation work?",
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
        content: `⚠️ **Connection issue**: ${errorMsg}. Please try asking again or verify your connection.`,
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
    toast.success("Conversation cleared.");
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Response copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2500);
  };

  const renderFormattedContent = (content: string) => {
    const lines = content.split("\n");
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      // Bullet points
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const bulletText = trimmed.substring(2);
        return (
          <div key={idx} className="flex items-start gap-2 my-1 pl-1">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
            <span className="text-xs text-slate-700 leading-relaxed">{formatInline(bulletText)}</span>
          </div>
        );
      }
      // Numbered lists
      if (/^\d+\.\s/.test(trimmed)) {
        const match = trimmed.match(/^(\d+)\.\s(.*)$/);
        if (match) {
          return (
            <div key={idx} className="flex items-start gap-2 my-1 pl-1">
              <span className="text-[11px] font-bold text-indigo-600 shrink-0 min-w-[14px]">{match[1]}.</span>
              <span className="text-xs text-slate-700 leading-relaxed">{formatInline(match[2])}</span>
            </div>
          );
        }
      }
      // Headings
      if (trimmed.startsWith("### ")) {
        return (
          <h4 key={idx} className="font-bold text-xs text-slate-900 mt-2.5 mb-1 flex items-center gap-1.5">
            <span className="h-1 w-2.5 rounded-full bg-indigo-600 inline-block" />
            {trimmed.substring(4)}
          </h4>
        );
      }
      if (trimmed.startsWith("## ")) {
        return (
          <h3 key={idx} className="font-bold text-xs text-slate-900 mt-3 mb-1.5">
            {trimmed.substring(3)}
          </h3>
        );
      }
      if (!trimmed) {
        return <div key={idx} className="h-1.5" />;
      }
      return (
        <p key={idx} className="text-xs text-slate-700 leading-relaxed my-0.5 font-normal">
          {formatInline(line)}
        </p>
      );
    });
  };

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
          <strong key={key++} className="font-semibold text-slate-900">
            {match[1]}
          </strong>
        );
      } else {
        nodes.push(
          <code
            key={key++}
            className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[11px] font-mono"
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
      <div className="fixed bottom-6 right-6 z-50">
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            className="group relative flex items-center gap-2.5 pl-3.5 pr-4 py-3 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 hover:from-indigo-500 hover:to-purple-600 text-white rounded-full shadow-[0_10px_30px_rgba(79,70,229,0.35)] hover:shadow-[0_15px_35px_rgba(79,70,229,0.45)] transition-all duration-300 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 select-none border border-white/20"
            aria-label="Open HR Policy Assistant"
          >
            <div className="relative flex items-center justify-center h-7 w-7 rounded-full bg-white/20 backdrop-blur-xs text-white shadow-inner">
              <Sparkles className="h-4 w-4 text-amber-300 animate-pulse" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 border border-white"></span>
              </span>
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold tracking-tight text-white leading-tight">Ask AI Assistant</span>
              <span className="text-[10px] text-indigo-100 font-medium opacity-90">Instant Policy & Leaves Q&A</span>
            </div>
          </button>
        )}
      </div>

      {/* Floating Chat Window */}
      {isOpen && (
        <div 
          className={`fixed z-50 transition-all duration-300 ease-out flex flex-col bg-white rounded-3xl border border-slate-200/90 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] overflow-hidden ${
            isExpanded 
              ? "bottom-4 right-4 w-[95vw] sm:w-[560px] h-[90vh] max-h-[850px]"
              : "bottom-6 right-6 w-[92vw] sm:w-[420px] h-[590px] max-h-[85vh]"
          }`}
        >
          {/* Header */}
          <div className="relative px-4 py-3.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white shrink-0 shadow-sm">
            {/* Ambient Background Shimmer */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)] pointer-events-none" />

            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center h-9 w-9 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 text-white shadow-inner">
                  <Bot className="h-5 w-5 text-indigo-100" />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-indigo-700" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs sm:text-sm tracking-tight text-white drop-shadow-xs">
                      {user.organization_name || "AuraHR"} AI
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-400/20 text-emerald-300 px-1.5 py-0.5 rounded-full border border-emerald-400/30">
                      Live Assistant
                    </span>
                  </div>
                  <span className="text-[11px] text-indigo-200 font-normal">
                    Trained on your official company policies
                  </span>
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex items-center gap-1">
                <button
                  onClick={handleClearChat}
                  title="Clear conversation"
                  className="p-1.5 hover:bg-white/20 active:bg-white/30 rounded-xl text-indigo-100 hover:text-white transition-all cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  title={isExpanded ? "Collapse view" : "Expand view"}
                  className="p-1.5 hover:bg-white/20 active:bg-white/30 rounded-xl text-indigo-100 hover:text-white transition-all cursor-pointer hidden sm:block"
                >
                  {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  title="Minimize chat"
                  className="p-1.5 hover:bg-white/20 active:bg-white/30 rounded-xl text-indigo-100 hover:text-white transition-all cursor-pointer"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 p-4 space-y-4 overflow-y-auto bg-gradient-to-b from-slate-50/70 via-slate-50/40 to-white">
            {transcript.map((msg) => {
              const isAi = msg.role === "assistant";
              const isCopied = copiedId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 ${isAi ? "justify-start" : "justify-end"} group/msg`}
                >
                  {isAi && (
                    <div className="h-7 w-7 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5 ring-2 ring-indigo-100">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                  )}

                  <div className={`flex flex-col max-w-[84%] ${isAi ? "items-start" : "items-end"}`}>
                    <div
                      className={`p-3.5 text-xs transition-all relative ${
                        isAi
                          ? "bg-white border border-slate-200/90 text-slate-800 shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-2xl rounded-tl-xs"
                          : "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-xs rounded-2xl rounded-tr-xs"
                      }`}
                    >
                      {isAi ? (
                        <div>{renderFormattedContent(msg.content)}</div>
                      ) : (
                        <p className="text-xs leading-relaxed whitespace-pre-wrap font-normal">{msg.content}</p>
                      )}

                      {/* Copy Action button on Assistant Card */}
                      {isAi && (
                        <div className="flex items-center justify-end mt-2 pt-2 border-t border-slate-100/80 gap-2">
                          <button
                            onClick={() => handleCopyMessage(msg.id, msg.content)}
                            title="Copy reply"
                            className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-indigo-50"
                          >
                            {isCopied ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-600" />
                                <span className="text-emerald-600 font-semibold">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Meta info & Sources */}
                    <div className="flex items-center gap-2 mt-1 px-1">
                      {isAi && msg.sources && msg.sources.length > 0 && (
                        <div className="flex items-center gap-1 bg-indigo-50/80 border border-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-md">
                          <BookOpen className="h-2.5 w-2.5 text-indigo-500" />
                          <span className="text-[9px] font-semibold truncate max-w-[200px]">
                            {msg.sources.join(", ")}
                          </span>
                        </div>
                      )}
                      <span className="text-[9px] text-slate-400 font-medium">
                        {msg.timestamp}
                      </span>
                    </div>
                  </div>

                  {!isAi && (
                    <div className="h-7 w-7 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 shadow-xs mt-0.5 font-bold text-[11px]">
                      {user.profile?.first_name ? user.profile.first_name[0].toUpperCase() : "U"}
                    </div>
                  )}
                </div>
              );
            })}

            {/* AI Typing Indicator */}
            {isLoading && (
              <div className="flex gap-2.5 justify-start animate-in fade-in-0 duration-200">
                <div className="h-7 w-7 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5 animate-pulse">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div className="p-3.5 bg-white border border-slate-200 rounded-2xl rounded-tl-xs shadow-xs flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:0s]"></span>
                    <span className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium ml-1">Searching company knowledge base...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestion Prompts Slider */}
          <div className="px-3.5 py-2.5 border-t border-slate-100 bg-white shrink-0 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              {suggestionPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(prompt)}
                  disabled={isLoading}
                  className="group flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full bg-slate-50 hover:bg-indigo-50/80 text-slate-600 hover:text-indigo-700 transition-all duration-150 cursor-pointer shrink-0 border border-slate-200/80 hover:border-indigo-200 hover:shadow-xs active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Sparkles className="h-2.5 w-2.5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Integrated Omnibar Input Bar */}
          <div className="p-3 border-t border-slate-200/80 bg-white shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="relative flex items-center bg-slate-50/80 border border-slate-200 focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-500/15 rounded-2xl transition-all duration-200 px-3.5 py-1.5 shadow-inner"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask about leaves, timings, policies, benefits..."
                disabled={isLoading}
                className="flex-1 py-1.5 text-xs bg-transparent border-0 focus:outline-none text-slate-800 placeholder:text-slate-400 font-normal pr-2"
              />

              {inputMessage && (
                <button
                  type="button"
                  onClick={() => setInputMessage("")}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/60 mr-1 transition-colors cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}

              <button
                type="submit"
                disabled={isLoading || !inputMessage.trim()}
                aria-label="Send query"
                className={`flex items-center justify-center h-7 w-7 rounded-xl transition-all duration-200 cursor-pointer shrink-0 ${
                  inputMessage.trim() && !isLoading
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs scale-100"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed scale-95 opacity-60"
                }`}
              >
                <ArrowUp className="h-4 w-4 stroke-[2.5]" />
              </button>
            </form>
            <div className="flex items-center justify-between px-1.5 mt-1.5 text-[10px] text-slate-400">
              <span className="flex items-center gap-1 font-medium">
                <Zap className="h-2.5 w-2.5 text-amber-500" />
                Powered by AuraHR AI Engine
              </span>
              <span>Press <strong>Enter ↵</strong> to send</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
