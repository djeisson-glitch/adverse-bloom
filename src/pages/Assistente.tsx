import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Send, Bot, User, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant`;

export default function Assistente() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load history
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("memories")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (!error && data) setMessages(data as Message[]);
      setLoadingHistory(false);
    })();
  }, [user]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const saveMessage = async (role: "user" | "assistant", content: string) => {
    if (!user) return;
    const { error } = await (supabase as any).from("memories").insert({ user_id: user.id, role, content });
    if (error) console.error("Erro ao salvar memória:", error);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    await saveMessage("user", text);

    let assistantContent = "";

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Add empty assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);

          if (!line.startsWith("data: ") || line.trim() === "") continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(jsonStr);
            // Anthropic SSE format
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              assistantContent += parsed.delta.text;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: assistantContent };
                return copy;
              });
            }
          } catch {
            // partial JSON, ignore
          }
        }
      }

      if (assistantContent) {
        await saveMessage("assistant", assistantContent);
      }
    } catch (e: any) {
      console.error("Chat error:", e);
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      // Remove empty assistant message if error
      if (!assistantContent) {
        setMessages((prev) => prev.filter((_, i) => i !== prev.length - 1));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    if (!user) return;
    await (supabase as any).from("memories").delete().eq("user_id", user.id);
    setMessages([]);
    toast({ title: "Histórico limpo" });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Assistente</h1>
          <p className="text-sm text-muted-foreground">Chat com memória permanente</p>
        </div>
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleClear}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Limpar
          </Button>
        )}
      </motion.div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-2 pb-4">
        {loadingHistory ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Bot className="h-12 w-12 opacity-30" />
            <p className="text-sm">Envie uma mensagem para começar</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown>{msg.content || "..."}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
              {msg.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <User className="h-4 w-4 text-foreground" />
                </div>
              )}
            </div>
          ))
        )}
        {isLoading && !messages[messages.length - 1]?.content && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-card border border-border rounded-xl px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4 flex gap-2">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua mensagem..."
          className="min-h-[44px] max-h-[120px] resize-none"
          rows={1}
        />
        <Button onClick={handleSend} disabled={isLoading || !input.trim()} size="icon" className="shrink-0 h-11 w-11">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
