import { useState } from 'react';
import type { Message, ToolCall } from '../components/MessageBubble'; // Adjust path as needed

export function useChat(threadId: string = "test_thread_001") {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'ai', content: 'Hello! I am ready to help you analyze your documents.' }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (content: string) => {
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
      const response = await fetch('http://localhost:8000/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: content, thread_id: threadId }),
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
                  currentMsg.content = `⚠️ Backend Error: ${parsed.content}`;
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
    sendMessage
  };
}