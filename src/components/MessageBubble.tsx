import React from 'react';

export interface ToolCall {
  id: string; 
  name: string;
  args: Record<string, any>;
}

export interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  thought?: string; 
  toolCalls?: ToolCall[];
  toolResults?: any[] ;
}



interface MessageBubbleProps {
  content: string;
  role: 'user' | 'ai';
}

export const MessageBubble = React.memo(({ content, role }: MessageBubbleProps) => {
  if (!content) return null;

  const isUser = role === 'user';

  return (
    <div 
      className={`
        py-3.5 break-words whitespace-pre-wrap leading-relaxed
        w-fit max-w-[85%] md:max-w-[75%] 
        ${isUser 
          ? 'px-5 bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-slate-100 rounded-3xl rounded-br-sm ml-auto' 
          : 'px-0 bg-transparent text-slate-800 dark:text-slate-200' 
        }
      `}
    >
      {content}
    </div>
  );
});

export const ToolCallRenderer = React.memo(({ tool }: { tool: ToolCall }) => {
  return (
    <details 
      className="w-full max-w-2xl bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-lg overflow-hidden [&_summary::-webkit-details-marker]:hidden"
    >
      
      <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-neutral-800/50 hover:bg-slate-200 dark:hover:bg-neutral-700 transition-colors flex items-center gap-2">
        <span className="text-base">🛠️</span>
        Using tool: <span className="font-mono text-xs bg-slate-200 dark:bg-neutral-900 px-1.5 py-0.5 rounded">{tool.name}</span>
      </summary>
      <div className="px-3 py-3 bg-white dark:bg-neutral-900 text-xs font-mono text-slate-600 dark:text-slate-400 overflow-x-auto">
        <pre>{JSON.stringify(tool.args, null, 2)}</pre>
      </div>
    </details>
  );
});

export const ThoughtRenderer = React.memo(({ thought }: { thought: string }) => {
  if (!thought) return null;

  return (
    <details 
      className="group w-full max-w-2xl bg-slate-50/50 dark:bg-neutral-800/30 border border-slate-200 dark:border-neutral-700 rounded-lg overflow-hidden [&_summary::-webkit-details-marker]:hidden"
    >
      
      <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors flex items-center gap-2 select-none">
        <span className="transform transition-transform duration-200 group-open:rotate-90 text-xs">
          ▶
        </span>
        <span className="font-mono">Thinking Process</span>
      </summary>
      
      <div className="px-3 py-3 border-t border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800/50 text-sm font-mono text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
        {thought}
      </div>
    </details>
  );
});