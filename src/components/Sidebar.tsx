import { Rocket, Settings, Plus, MoreVertical,Pencil,Trash2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useState } from 'react';

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
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, newTitle: string) => void;
}

export function Sidebar({ isCollapsed, toggleCollapse, chats, activeChatId, onSelectChat, onNewChat, onDeleteChat, onRenameChat }: SidebarProps) {

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const handleStartRename = (chat: any) => {
    setEditingId(chat.id);
    setEditValue(chat.title);
    setMenuOpenId(null);
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 transition-all duration-300 ease-in-out">
      
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200 dark:border-neutral-800 shrink-0">
        <div className={`flex items-center gap-2 overflow-hidden ${isCollapsed ? 'justify-center w-full' : ''}`}>
          <Rocket className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0" />
          {!isCollapsed && (
            <span className="font-bold text-lg text-slate-800 dark:text-slate-100 whitespace-nowrap">
              StudyBuddy
            </span>
          )}
        </div>

        {!isCollapsed && (
          <button onClick={toggleCollapse} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
            <PanelLeftClose className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Expand Button */}
      {isCollapsed && (
        <button onClick={toggleCollapse} className="p-4 flex justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 shrink-0 border-b border-slate-200 dark:border-neutral-800">
          <PanelLeftOpen className="w-5 h-5" />
        </button>
      )}

      {/* Main Content (Chats Only) */}
      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin flex flex-col gap-1 mt-2">
        
        <button
          onClick={onNewChat}
          className={`w-full flex items-center gap-2 p-2 mb-2 rounded-lg border border-dashed border-slate-300 dark:border-neutral-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors ${
            isCollapsed ? 'justify-center' : ''
          }`}
        >
          <Plus className="w-5 h-5 shrink-0" />
          {!isCollapsed && <span>New Chat</span>}
        </button>

        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {!isCollapsed && chats.map((chat) => (
          <div key={chat.id} className="group relative">
            {editingId === chat.id ? (
              <input
                autoFocus
                className="w-full bg-white dark:bg-neutral-800 p-2 rounded-lg border border-blue-500 outline-none text-sm"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => { onRenameChat(chat.id, editValue); setEditingId(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { onRenameChat(chat.id, editValue); setEditingId(null); }
                  if (e.key === 'Escape') setEditingId(null);
                }}
              />
            ) : (
              <button
                onClick={() => onSelectChat(chat.id)}
                className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
                  activeChatId === chat.id ? 'bg-white dark:bg-neutral-800 text-blue-600 border border-slate-200 dark:border-neutral-700' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-800'
                }`}
              >
                <span className="truncate text-sm font-medium pr-6">{chat.title}</span>
                
                {/* Update-delete menu */}
                <div className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreVertical 
                    className="w-4 h-4 cursor-pointer hover:text-slate-900" 
                    onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === chat.id ? null : chat.id); }}
                  />
                </div>
              </button>
            )}

            {/*  Dropdown Menu */}
            {menuOpenId === chat.id && (
              <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-md shadow-lg z-50 py-1">
                <button 
                  onClick={() => handleStartRename(chat)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-neutral-700"
                >
                  <Pencil className="w-3 h-3" /> Rename
                </button>
                <button 
                  onClick={() => { onDeleteChat(chat.id); setMenuOpenId(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-neutral-800 shrink-0">
        <button className={`w-full flex items-center gap-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors ${isCollapsed ? 'justify-center' : ''}`}>
          <Settings className="w-5 h-5 shrink-0" />
          {!isCollapsed && <span className="font-medium text-sm">Settings</span>}
        </button>
      </div>

    </div>
  );
}