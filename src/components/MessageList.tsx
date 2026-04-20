import React, { useEffect, useRef } from 'react';
import { MessageBubble,ThoughtRenderer,ToolCallRenderer } from './MessageBubble';
import type { Message } from './MessageBubble';


interface MessageListProps {
  messages: Message[];
}

export const MessageList = React.memo(({ messages }: MessageListProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 
      
        [&::-webkit-scrollbar]:w-3 
        [&::-webkit-scrollbar-thumb]:bg-transparent
        
        
        hover:[&::-webkit-scrollbar-thumb]:bg-slate-300/60
        dark:hover:[&::-webkit-scrollbar-thumb]:bg-neutral-700/60
        
        
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb]:border-[3px]
        [&::-webkit-scrollbar-thumb]:border-solid
        [&::-webkit-scrollbar-thumb]:border-transparent
        [&::-webkit-scrollbar-thumb]:bg-clip-padding

        
        scrollbar-none hover:scrollbar-auto
    ">
      {messages.map((msg) => (
        <div 
          key={msg.id} 
          // Group everything belonging to one "turn" together
          className={`flex flex-col gap-2 w-full ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
        >
          {/* 1. Thoughts render completely independently */}
          {msg.reasoning && <ThoughtRenderer thought={msg.reasoning} />}

          {/* 2. Tools render completely independently */}
          {msg.toolCalls?.map((tool, idx) => (
            <ToolCallRenderer key={tool.id || idx} tool={tool} />
          ))}

          {/* 3. Text content renders completely independently */}
          {msg.content && <MessageBubble content={msg.content} role={msg.role} />}
        </div>
      ))}
      <div ref={scrollRef} className="h-px" />
    </div>
  );
});