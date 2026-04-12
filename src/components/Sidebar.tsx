import { Rocket, Settings, Plus, MessageSquare, PanelLeftClose, PanelLeftOpen, FileText } from 'lucide-react';
import { useState } from 'react';

// Defining the types for our chat objects and component props
export interface Chat {
  id: string;
  title: string;
}

interface SidebarProps {
  isCollapsed: boolean;
  toggleCollapse: () => void;
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
}

export function Sidebar({
  isCollapsed,
  toggleCollapse,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
}: SidebarProps) {
  // Local state to manage which tab is active in the sidebar
  const [activeTab, setActiveTab] = useState<'chats' | 'sources'>('chats');

  return (
    <div
      className={`
        flex flex-col h-full w-full bg-slate-50 dark:bg-neutral-900 rounded-xl 
        border border-slate-200 dark:border-neutral-800 transition-all duration-300 ease-in-out
      `}
    >
      {/* HEADER */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800">
        <div className={`flex items-center gap-2 overflow-hidden ${isCollapsed ? 'justify-center w-full' : ''}`}>
          <Rocket className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0" />
          {!isCollapsed && <span className="font-bold text-lg text-slate-800 dark:text-slate-100 whitespace-nowrap">StudyBuddy</span>}
        </div>
        {!isCollapsed && (
          <button onClick={toggleCollapse} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
            <PanelLeftClose className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* TABS (Only show when not collapsed) */}
      {!isCollapsed && (
        <div className="flex p-2 gap-1 bg-slate-100 dark:bg-neutral-950 m-2 rounded-lg">
          <button
            onClick={() => setActiveTab('chats')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'chats' ? 'bg-white dark:bg-neutral-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            Chats
          </button>
          <button
            onClick={() => setActiveTab('sources')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'sources' ? 'bg-white dark:bg-neutral-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            Sources
          </button>
        </div>
      )}

      {/* COLLAPSED EXPAND BUTTON */}
      {isCollapsed && (
        <button onClick={toggleCollapse} className="p-4 flex justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          <PanelLeftOpen className="w-5 h-5" />
        </button>
      )}

      {/* SCROLLABLE CONTENT AREA */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
        {activeTab === 'chats' && (
          <>
            <button
              onClick={onNewChat}
              className={`w-full flex items-center gap-2 p-2 rounded-lg border border-dashed border-slate-300 dark:border-neutral-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors ${
                isCollapsed ? 'justify-center' : ''
              }`}
            >
              <Plus className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span>New Chat</span>}
            </button>

            <div className="space-y-1 mt-4">
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => onSelectChat(chat.id)}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors overflow-hidden ${
                    activeChatId === chat.id
                      ? 'bg-white dark:bg-neutral-800 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-neutral-700'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-800'
                  }`}
                  title={isCollapsed ? chat.title : ''}
                >
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  {!isCollapsed && <span className="truncate text-sm font-medium text-left">{chat.title}</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Placeholder for Sources Tab */}
        {activeTab === 'sources' && !isCollapsed && (
           <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-neutral-800 rounded-lg">
             <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
             <p>No sources uploaded for this chat yet.</p>
           </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="p-4 border-t border-slate-200 dark:border-neutral-800">
        <button className={`w-full flex items-center gap-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors ${
          isCollapsed ? 'justify-center' : ''
        }`}>
          <Settings className="w-5 h-5 shrink-0" />
          {!isCollapsed && <span className="font-medium text-sm">Settings</span>}
        </button>
      </div>
    </div>
  );
}