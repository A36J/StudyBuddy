import { useState, useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import type {Message} from './MessageBubble'
import { ChatInput } from './ChatInput';

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'ai', content: 'Hello! I am ready to help you analyze your documents. What would you like to know?' }
  ]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = (content: string) => {
    // 1. Add User Message
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content };
    setMessages((prev) => [...prev, userMsg]);

    // 2. Mock AI Response (Replace with actual LLM call later)
    setTimeout(() => {
      const aiMsg: Message = { 
        id: (Date.now() + 1).toString(), 
        role: 'ai', 
        content: `I received your message: "${content}". This is a mocked response.` 
      };
      setMessages((prev) => [...prev, aiMsg]);
    }, 1000);
  };

  return (
    <main className="flex-1 min-w-[300px] flex flex-col h-full bg-slate-50 dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 overflow-hidden">
      
      {/* Header */}
      <header className="px-6 py-4 border-b border-slate-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200">Current Conversation</h2>
      </header>

      {/* Scrollable Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-thin">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} /> {/* Invisible div to scroll to */}
      </div>

      {/* Input Area */}
      <ChatInput onSendMessage={handleSendMessage} />
    </main>
  );
}