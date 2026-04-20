// src/hooks/useChat.ts
import { useState } from 'react';
import { api } from '../services/api';
// import type { Message, ToolCall } from '../components/MessageBubble'; // Adjust path




import { useQuery, useQueryClient } from '@tanstack/react-query';


export interface ToolCall {
  id: string;
  name: string;
  args: any;
}

export interface Message {
  id: string; 
  role: 'user' | 'ai';
  content: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
}

export function useChat(threadId: string | null) {
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();

  // 1. Fetch History via React Query
  const { data: messages = [], isLoading: isFetchingHistory } = useQuery({
    queryKey: ['messages', threadId],
    queryFn: () => api.getMessages(threadId as string),
    enabled: !!threadId,
    staleTime: 1000 * 60 * 5, // Cache messages for 5 mins
  });

  const sendMessage = async (content: string) => {
    if (!threadId) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content };
    
    // Add user message to React Query Cache immediately
    queryClient.setQueryData(['messages', threadId], (old: Message[] = []) => [...old, userMsg]);
    setIsLoading(true);

    const isFirstMessage = messages.length === 0;
    if (isFirstMessage) {
      try { await api.createChat(threadId, "Untitled Chat"); } 
      catch (err) { console.error("Failed to create thread", err); return; }
    }

    try {
      const response = await fetch(`/api/threads/${threadId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: content }), 
      });

      if (!response.ok || !response.body) throw new Error(`Server error: ${response.status}`);

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
              const parsed = JSON.parse(part.replace("data: ", ""));
              const runId = parsed.run_id;

              // Update the React Query cache directly as the stream arrives
              queryClient.setQueryData(['messages', threadId], (oldMessages: Message[] = []) => {
                const newMessages = [...oldMessages];

                if (parsed.type === "new_message") {
                  if (!newMessages.find(m => m.id === runId)) {
                    newMessages.push({ id: runId, role: 'ai', content: '', reasoning: '', toolCalls: [] });
                  }
                  return newMessages;
                }

                let msgIndex = newMessages.findIndex(m => m.id === runId);
                
                if (msgIndex === -1) {
                    if (parsed.type === "error") {
                        const lastMsg = newMessages[newMessages.length - 1];
                        if (lastMsg) lastMsg.content += `\n\n⚠️ Backend Error: ${parsed.content}`;
                        return newMessages;
                    }
                    newMessages.push({ id: runId, role: 'ai', content: '', reasoning: '', toolCalls: [] });
                    msgIndex = newMessages.length - 1;
                }

                const currentMsg = { ...newMessages[msgIndex] };

                if (parsed.type === "content") {
                  currentMsg.content += parsed.content;
                } else if (parsed.type === "reasoning") {
                  currentMsg.reasoning = (currentMsg.reasoning || '') + parsed.content;
                } else if (parsed.type === "tool_call") {
                  currentMsg.toolCalls = [
                    ...(currentMsg.toolCalls || []),
                    { id: Date.now().toString() + Math.random(), name: parsed.name, args: parsed.args }
                  ];
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
      
      queryClient.setQueryData(['messages', threadId], (old: Message[] = []) => [
        ...old,
        {
          id: Date.now().toString(),
          role: 'ai',
          content: `⚠️ Request failed: ${error instanceof Error ? error.message : "Unknown error occurred."}`,
          reasoning: '',
          toolCalls: []
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return { messages, isLoading, isFetchingHistory, sendMessage };
}