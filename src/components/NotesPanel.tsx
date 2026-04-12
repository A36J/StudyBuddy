import { PanelRightClose, PanelRightOpen, FileEdit, Download, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';

interface NotesPanelProps {
  isCollapsed: boolean;
  toggleCollapse: () => void;
}

export function NotesPanel({ isCollapsed, toggleCollapse }: NotesPanelProps) {
  const [content, setContent] = useState('');

  return (
    <aside
      className={`
        flex flex-col h-full bg-slate-50 dark:bg-neutral-900 rounded-xl 
        border border-slate-200 dark:border-neutral-800 transition-all duration-300 ease-in-out shrink-0
        ${isCollapsed ? 'w-16' : 'w-[35%] min-w-[320px] max-w-[600px]'}
      `}
    >
      {/* HEADER */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800">
        {!isCollapsed && (
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold">
            <FileEdit className="w-5 h-5 text-indigo-500" />
            <span>Notebook Canvas</span>
          </div>
        )}
        
        <div className={`flex items-center gap-2 ${isCollapsed ? 'w-full justify-center' : ''}`}>
          {!isCollapsed && (
             <>
               <button className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                 <Download className="w-4 h-4" />
               </button>
               <button className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mr-1">
                 <MoreHorizontal className="w-4 h-4" />
               </button>
             </>
          )}
          <button 
            onClick={toggleCollapse} 
            className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            title={isCollapsed ? "Expand Notes" : "Collapse Notes"}
          >
            {isCollapsed ? <PanelRightOpen className="w-5 h-5" /> : <PanelRightClose className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* BODY - The Text Editor Canvas */}
      <div className="flex-1 p-0 overflow-hidden flex flex-col">
        {!isCollapsed ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Click anywhere to start typing your notes..."
            className="flex-1 w-full h-full p-6 bg-transparent resize-none outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 leading-relaxed scrollbar-thin"
          />
        ) : (
          <div className="flex-1 flex flex-col items-center py-6 gap-4">
            {/* Vertical text indicator when collapsed */}
            <div className="writing-vertical text-slate-400 tracking-widest text-sm uppercase font-medium" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
              Notes
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}