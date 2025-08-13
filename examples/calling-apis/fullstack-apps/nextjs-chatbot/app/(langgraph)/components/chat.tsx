"use client";

import { FormEventHandler, useRef, useState } from "react";

import { EnsureAPIAccessPopup } from "@/components/auth0-ai/FederatedConnections/popup";

const useFocus = () => {
  const htmlElRef = useRef<HTMLInputElement>(null);
  const setFocus = () => {
    if (!htmlElRef.current) {
      return;
    }
    htmlElRef.current.focus();
  };
  return [htmlElRef, setFocus] as const;
};

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function Chat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [interrupt, setInterrupt] = useState<any>(null);
  const [inputRef, setInputFocus] = useFocus();

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setInterrupt(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No reader available");
      }

      let assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
      };

      setMessages(prev => [...prev, assistantMessage]);

      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              setIsLoading(false);
              setInputFocus();
              return;
            }
            
            if (data.startsWith('AUTH0_AI_INTERRUPTION:')) {
              const interruptData = JSON.parse(data.slice(22));
              setInterrupt({
                value: interruptData,
                ns: ["auth0", "interrupt"],
              });
              setIsLoading(false);
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              
              if (parsed.type === "content" && parsed.content) {
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === assistantMessage.id 
                      ? { ...msg, content: parsed.content }
                      : msg
                  )
                );
              } else if (parsed.type === "error") {
                throw new Error(parsed.error);
              }
            } catch (parseError) {
              // Ignore parsing errors for malformed chunks
              console.warn("Failed to parse chunk:", data);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error in chat:", error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: "Sorry, I encountered an error processing your request.",
      }]);
    } finally {
      setIsLoading(false);
      setInputFocus();
    }
  };

  const handleInterruptFinish = () => {
    setInterrupt(null);
    // Optionally, you could re-submit the last message here
  };

  return (
    <div className="flex flex-col gap-4 w-full max-w-md py-12 sm:py-24 px-4 sm:px-0 mx-auto stretch">
      {messages
        .filter((m) => m.content && ["user", "assistant"].includes(m.role))
        .map((message) => (
          <div key={message.id} className="whitespace-pre-wrap">
            {message.role === "user" ? "User: " : "AI: "}
            {message.content}
          </div>
        ))}

      {interrupt ? (
        <div className="whitespace-pre-wrap">
          <EnsureAPIAccessPopup
            interrupt={interrupt.value}
            onFinish={handleInterruptFinish}
            connectWidget={{
              title: interrupt.value.message || "Authorization Required",
              description: "Please authorize access to continue...",
              action: { label: "Authorize" },
            }}
          />
        </div>
      ) : null}

      <form onSubmit={handleSubmit}>
        <input
          className="fixed dark:bg-zinc-900 bg-white bottom-0 w-full max-w-sm sm:max-w-md p-3 mb-8 border border-zinc-300 dark:border-zinc-800 rounded-lg shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          value={input}
          ref={inputRef}
          placeholder="Say something..."
          readOnly={isLoading}
          disabled={isLoading}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
        />
      </form>
    </div>
  );
}
