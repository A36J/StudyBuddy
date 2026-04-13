// ChatPanel.tsx
import React from 'react';
import { MessageList } from './MessageList'; 
import { ChatInput } from './ChatInput';
import { useChat } from '../hooks/useChat';

export function ChatPanel() {
  // All business logic is in the hook
  const { messages, isLoading, sendMessage } = useChat("test_thread_001");

  return (
    <main className="flex-1 min-w-[300px] flex flex-col h-full bg-slate-50 dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 overflow-hidden">
      <header className="px-6 py-4 border-b border-slate-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm shrink-0">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200">Current Conversation</h2>
      </header>

      {/* The MessageList handles rendering the bubbles and auto-scrolling */}
      <MessageList messages={messages} />

      {/* The ChatInput stays anchored at the bottom */}
      <div className="shrink-0">
        <ChatInput onSendMessage={sendMessage}  />
      </div>
    </main>
  );
}