// src/hooks/useChat.ts
import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { Message, ToolCall } from '../components/MessageBubble'; // Adjust path

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function useChat(threadId: string | null ) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);

  // 1. Fetch history whenever the active thread changes
  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      return;
    }

    async function loadHistory() {
      setIsFetchingHistory(true);
      try {
        const history = await api.getMessages(threadId as string);
        
        
        
          setMessages(history);
       
      } catch (error) {
        console.error("Failed to load chat history:", error);
      } finally {
        setIsFetchingHistory(false);
      }
    }

    loadHistory();
  }, [threadId]);

  
  const sendMessage = async (content: string) => {
    if (!threadId) return;

    // 1. Is this a Ghost Thread?
    const isFirstMessage = messages.length === 0;

    if (isFirstMessage) {
      try {
        // Create the thread in DB only now
        await api.createChat(threadId, "Untitled Chat");
      } catch (err) {
        console.error("Failed to create thread on first message:", err);
        return; 
      }
    }

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content };
    const aiMessageId = (Date.now() + 1).toString();
    
    // Add user message and initialize an empty AI message immediately
    setMessages((prev) => [
      ...prev, 
      userMsg,
      { id: aiMessageId, role: 'ai', content: '', toolCalls: [] }
    ]);
    
    setIsLoading(true);

    try {
      // Updated to use dynamic API_BASE and standard REST routing
      const response = await fetch(`${API_BASE}/api/threads/${threadId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: content }), 
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || ""; 

        for (const part of parts) {
          if (part.startsWith("data: ")) {
            try {
              const dataStr = part.replace("data: ", "");
              const parsed = JSON.parse(dataStr);

              setMessages((prev) => {
                const newMessages = [...prev];
                const msgIndex = newMessages.findIndex(m => m.id === aiMessageId);
                if (msgIndex === -1) return prev;

                const currentMsg = { ...newMessages[msgIndex] };

                if (parsed.type === "content") {
                  currentMsg.content += parsed.content;
                } else if (parsed.type === "tool_call") {
                  const newTool: ToolCall = {
                    id: Date.now().toString() + Math.random(),
                    name: parsed.name,
                    args: parsed.args
                  };
                  currentMsg.toolCalls = [...(currentMsg.toolCalls || []), newTool];
                } else if (parsed.type === "error") {
                  currentMsg.content += `\n\n⚠️ Backend Error: ${parsed.content}`;
                }

                newMessages[msgIndex] = currentMsg;
                return newMessages;
              });
            } catch (e) {
              console.error("Failed to parse stream chunk", e, part);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch response:", error);
      setMessages((prev) => {
        const newMessages = [...prev];
        const msgIndex = newMessages.findIndex(m => m.id === aiMessageId);
        if (msgIndex !== -1 && !newMessages[msgIndex].content) {
          newMessages[msgIndex].content = "⚠️ Connection interrupted.";
        }
        return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return {
    messages,
    isLoading,
    isFetchingHistory, 
    sendMessage
  };
}