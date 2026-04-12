import { Plus, Globe, ArrowUp } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
}

export function ChatInput({ onSendMessage }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isSearchEnabled, setIsSearchEnabled] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      // Cap at 200px OR 30% of window height, whichever is smaller
      const maxHeight = Math.min(200, window.innerHeight * 0.3);
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim()) {
      onSendMessage(input);
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="p-4 bg-slate-50 dark:bg-neutral-900">
      <form 
        onSubmit={handleSubmit}
        className="flex flex-col bg-white dark:bg-neutral-800 rounded-3xl border border-slate-200 dark:border-neutral-700 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all overflow-hidden"
      >
        {/* Top Section: Full Width Textarea */}
        <div className="px-4 pt-4 pb-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question or type '/' for commands..."
            className="w-full max-h-[200px] max-h-[30vh] min-h-[24px] bg-transparent resize-none outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 scrollbar-thin"
            rows={1}
          />
        </div>

        {/* Bottom Section: Fixed Toolbar */}
        <div className="flex items-center justify-between px-3 pb-3">
          
          {/* Left Controls */}
          <div className="flex items-center gap-2">
            <button 
              type="button"
              className="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-neutral-700 dark:hover:text-slate-200 transition-colors"
              title="Add Sources"
            >
              <Plus size={20} />
            </button>

            <button 
              type="button"
              onClick={() => setIsSearchEnabled(!isSearchEnabled)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                isSearchEnabled 
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' 
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-neutral-700 dark:hover:text-slate-200'
              }`}
            >
              <Globe size={16} />
              <span>Search</span>
            </button>
          </div>

          {/* Right Controls */}
          <button
            type="submit"
            disabled={!input.trim()}
            className={`p-2 rounded-full flex items-center justify-center transition-all ${
              input.trim() 
                ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700' 
                : 'bg-slate-100 text-slate-400 dark:bg-neutral-700/50 dark:text-neutral-500 cursor-not-allowed'
            }`}
          >
            <ArrowUp size={20} />
          </button>
        </div>
      </form>
      
      <div className="text-center mt-3 text-xs text-slate-400 dark:text-slate-500">
        AI can make mistakes. Verify important information.
      </div>
    </div>
  );
}