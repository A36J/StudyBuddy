import React, { useState } from 'react';
import { Loader2, MessageSquareDashed, Upload, Trash2, Files, Plus } from 'lucide-react';
import { MessageList } from './MessageList'; 
import { ChatInput } from './ChatInput';
import { useChat } from '../hooks/useChat';
import type { SourceFile } from '../App'; // Import the type from wherever you defined it

interface ChatPanelProps {
  activeChatId: string | null;
  sources: SourceFile[];
  onUploadSource: (file: File) => void;
  onDeleteSource: (id: string) => void;
  onToggleSource: (id: string) => void;
  
}

export function ChatPanel({ activeChatId, sources, onUploadSource, onDeleteSource, onToggleSource }: ChatPanelProps) {
  const { messages, isFetchingHistory, sendMessage } = useChat(activeChatId);
  const [isSourcesMenuOpen, setIsSourcesMenuOpen] = useState(false);

  // Filter sources for the current active chat thread
  const threadSources = sources.filter(s => s.chatId === activeChatId);
  const activeSourcesCount = threadSources.filter(s => s.isActive && s.status === 'ready').length;

  if (!activeChatId) {
    return (
      <main className="flex-1 min-w-[300px] flex flex-col h-full bg-slate-50 dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 items-center justify-center text-slate-500 dark:text-slate-400">
        <MessageSquareDashed className="w-12 h-12 mb-4 opacity-50" />
        <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">No Chat Selected</h3>
        <p className="text-sm">Select a conversation from the sidebar or start a new one.</p>
      </main>
    );
  }

  return (
    <main className="flex-1 min-w-[300px] flex flex-col h-full bg-slate-50 dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 overflow-hidden relative">
      
      {/* HEADER */}
      <header className="px-6 h-14 border-b border-slate-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm shrink-0 flex justify-end items-center gap-4 relative z-20">
        
        {/* Active Sources Counter */}
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
          {activeSourcesCount} {activeSourcesCount === 1 ? 'source' : 'sources'} active
        </span>

        {/* Upload/Edit Sources Button */}
        <button 
          onClick={() => setIsSourcesMenuOpen(!isSourcesMenuOpen)}
          className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-neutral-700 transition-colors shadow-sm"
        >
          <Files className="w-4 h-4" />
          Upload/Edit Sources
        </button>

        {/* Sources Dropdown Menu */}
        {isSourcesMenuOpen && (
          <div className="absolute top-16 right-6 w-80 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl shadow-xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2">
            
            {/* 1. Upload File Button */}
            <label className="flex items-center gap-2 p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-neutral-800 border-b border-slate-100 dark:border-neutral-800 transition-colors text-blue-600 dark:text-blue-400 font-medium text-sm">
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onUploadSource(file);
                    e.target.value = ''; 
                  }
                }}
              />
              <Plus className="w-4 h-4" />
              Upload New Document
            </label>

            {/* 2. List of Thread Documents */}
            <div className="max-h-64 overflow-y-auto p-2 space-y-1 scrollbar-thin">
              {threadSources.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 p-4 text-center">No documents in this thread yet.</p>
              ) : (
                threadSources.map(source => (
                  <div key={source.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-neutral-800/50 group">
                    
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-sm font-medium truncate text-slate-700 dark:text-slate-200" title={source.name}>
                        {source.name}
                      </span>
                      {source.status === 'error' && <span className="text-xs text-red-500">Upload failed</span>}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Loading Spinner vs Toggle */}
                      {source.status === 'uploading' || source.status === 'processing' ? (
                        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                      ) : source.status === 'ready' ? (
                        <button 
                          onClick={() => onToggleSource(source.id)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${source.isActive ? 'bg-blue-600' : 'bg-slate-300 dark:bg-neutral-600'}`}
                        >
                          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${source.isActive ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      ) : null}

                      {/* Delete Button */}
                      <button 
                        onClick={() => onDeleteSource(source.id)}
                        className="text-slate-400 hover:text-red-500 transition-colors p-1"
                        title="Delete source"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </header>

      {/* Loading State */}
      {isFetchingHistory ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-transparent z-10">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-2" />
          <p className="text-sm text-slate-500">Loading chat history...</p>
        </div>
      ) : (
        <MessageList messages={messages} />
      )}

      {/* Input */}
      <div className="shrink-0 z-10 bg-transparent w-full max-w-3xl mx-auto ">
        <ChatInput onSendMessage={sendMessage} />
      </div>
    </main>
  );
}