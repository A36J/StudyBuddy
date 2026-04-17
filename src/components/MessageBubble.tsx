import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
        py-3.5 wrap-break-word leading-relaxed
        w-fit max-w-[85%] md:max-w-[75%] 
        ${isUser 
          ? 'px-5 bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-slate-100 rounded-3xl rounded-br-sm ml-auto' 
          : 'px-0 bg-transparent text-slate-800 dark:text-slate-200' 
        }
      `}
    >
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{
          
          h1: ({ children }) => <h1 className="text-2xl font-bold mt-5 mb-3 border-b border-gray-300 pb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-semibold mt-4 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-lg font-semibold mt-3 mb-2">{children}</h3>,
          p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
          
          // --- Lists ---
          ul: ({ children }) => <ul className="list-disc list-inside space-y-1.5 ml-4 my-3">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside space-y-1.5 ml-4 my-3">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,

          // --- Links ---
          a: ({ children, href }) => (
            <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          

          // --- Tables: Light theme style ---
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 border border-slate-200 dark:border-neutral-700 rounded-xl shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-neutral-700">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => <th className="px-6 py-3 bg-slate-50 dark:bg-neutral-800/50 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{children}</th>,
          td: ({ children }) => <td className="px-6 py-4 whitespace-normal text-sm text-slate-800 dark:text-slate-300 border-t border-slate-200 dark:border-neutral-700">{children}</td>,
        
        }}
      >
        {content}
      </ReactMarkdown>
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