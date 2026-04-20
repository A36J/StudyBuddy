import { PanelRightClose, PanelRightOpen, FileEdit, Download,Printer, MoreVertical,Trash2,Check,X,Edit2, Plus, ChevronLeft } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Note } from '../services/api';
import { v4 as uuidv4 } from 'uuid';
import { forwardRef, useImperativeHandle } from 'react';


import TurndownService from 'turndown';


import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";

interface NotesPanelProps {
  isCollapsed: boolean;
  toggleCollapse: () => void;
}

export interface NoteEditorRef {
  downloadMarkdown: () => Promise<void>;
  printPDF: () => void;
}

export function NotesPanel({ isCollapsed, toggleCollapse }: NotesPanelProps) {
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  
  // 2. Create the ref to control the child editor
  const editorRef = useRef<NoteEditorRef>(null);

  const { data: notes = [], isLoading } = useQuery({ 
    queryKey: ['notes'], 
    queryFn: api.getNotes,
    staleTime: Infinity, 
    refetchOnWindowFocus: false, 
    refetchOnMount: false 
  });

  const createNoteMutation = useMutation({
    mutationFn: (newNoteId: string) => api.createNote(newNoteId, "Untitled Note"),
    onMutate: async (newNoteId) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] });
      const previousNotes = queryClient.getQueryData<Note[]>(['notes']);
      const optimisticNote: Note = { id: newNoteId, title: "Untitled Note", content: [], updatedAt: new Date().toISOString() };
      queryClient.setQueryData(['notes'], (old: Note[] = []) => [optimisticNote, ...old]);
      setActiveNoteId(newNoteId);
      return { previousNotes };
    },
    onError: (err, newNoteId, context) => {
      if (context?.previousNotes) queryClient.setQueryData(['notes'], context.previousNotes);
      setActiveNoteId(null);
    }
  });

  const activeNote = notes.find(n => n.id === activeNoteId);

  return (
    <aside className={`flex flex-col h-full bg-slate-50 dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 transition-all duration-300 ease-in-out shrink-0 ${isCollapsed ? 'w-16' : 'w-[clamp(320px,40%,600px)]'}`}>
      
      {/* DYNAMIC HEADER */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-slate-200 dark:border-neutral-800 shrink-0">
        {!isCollapsed && (
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold truncate">
            {activeNoteId ? (
              <>
                <button onClick={() => setActiveNoteId(null)} className="flex items-center gap-1 hover:text-indigo-500 transition-colors shrink-0">
                  <ChevronLeft className="w-5 h-5" />
                  
                </button>
                <span className="ml-2 truncate text-sm">{activeNote?.title || "Untitled Note"}</span>
              </>
            ) : (
              <>
                <FileEdit className="w-5 h-5 text-indigo-500" />
                <span>Notebook Canvas</span>
              </>
            )}
          </div>
        )}
        
        <div className={`flex items-center gap-2 ${isCollapsed ? 'w-full justify-center' : ''}`}>
          {/* NOTE EDITOR ACTIONS (Only show when a note is active) */}
          {!isCollapsed && activeNoteId && (
             <>
               <button onClick={() => editorRef.current?.printPDF()} className="p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-neutral-800 rounded-md transition-colors" title="Save as PDF">
                 <Printer className="w-4 h-4" />
               </button>
               <button onClick={() => editorRef.current?.downloadMarkdown()} className="p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-neutral-800 rounded-md transition-colors mr-2" title="Download Markdown">
                 <Download className="w-4 h-4" />
               </button>
             </>
          )}

          {/* GRID VIEW ACTIONS (Only show when NO note is active) */}
          {!isCollapsed && !activeNoteId && (
            <button onClick={() => createNoteMutation.mutate(uuidv4())} className="flex items-center gap-1.5 px-2 py-1.5 mr-2 text-sm bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 rounded-md transition-colors font-medium">
              <Plus className="w-4 h-4" />
              <span>Add Note</span>
            </button>
          )}

          {/* ALWAYS VISIBLE */}
          <button onClick={toggleCollapse} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
            {isCollapsed ? <PanelRightOpen className="w-5 h-5" /> : <PanelRightClose className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* BODY */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {isCollapsed ? (
          <div className="flex-1 flex flex-col items-center py-6 gap-4">
             <div className="writing-vertical text-slate-400 tracking-widest text-sm uppercase font-medium" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>Notes</div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto h-full p-4">
            {isLoading && !activeNoteId ? (
              <div className="text-center text-slate-500 mt-10">Loading notes...</div>
            ) : activeNoteId && activeNote ? (
              // 3. Attach the ref to the child
              <NoteEditor ref={editorRef} key={activeNote.id} note={activeNote} />
            ) : (
              <NotesGrid notes={notes} onSelectNote={setActiveNoteId} />
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

// --- SUB-COMPONENTS ---

function NotesGrid({ notes, onSelectNote }: { notes: Note[], onSelectNote: (id: string) => void }) {
  const queryClient = useQueryClient();
  
  
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitleText, setEditTitleText] = useState("");
  
 
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- Mutations ---
  const deleteMutation = useMutation({
    mutationFn: api.deleteNote,
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] });
      const previousNotes = queryClient.getQueryData<Note[]>(['notes']);
      queryClient.setQueryData(['notes'], (old: Note[] = []) => old.filter(n => n.id !== deletedId));
      return { previousNotes };
    },
    onError: (err, variables, context) => {
      if (context?.previousNotes) queryClient.setQueryData(['notes'], context.previousNotes);
    }
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string, title: string }) => 
      // We pass the existing content but update the title
      api.updateNote(id, notes.find(n => n.id === id)?.content || [], title),
    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] });
      queryClient.setQueryData(['notes'], (old: Note[] = []) => 
        old.map(n => n.id === id ? { ...n, title } : n)
      );
    }
  });

  // --- Handlers ---
  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent opening the note when clicking on the 3-dot menu
    deleteMutation.mutate(id);
    setMenuOpenId(null);
  };

  const startRename = (e: React.MouseEvent, id: string, currentTitle: string) => {
    e.stopPropagation();
    setEditTitleText(currentTitle || "Untitled Note");
    setEditingId(id);
    setMenuOpenId(null);
  };

  const submitRename = (e: React.MouseEvent | React.KeyboardEvent, id: string) => {
    e.stopPropagation();
    if (editTitleText.trim()) {
      renameMutation.mutate({ id, title: editTitleText.trim() });
    }
    setEditingId(null);
  };

  const getPreviewText = (content: any[]) => {
    if (!content || !content.length) return "Empty note...";
    const firstParagraph = content.find(block => block.type === 'paragraph');
    if (!firstParagraph?.content?.[0]?.text) return "Empty note...";
    return firstParagraph.content[0].text;
  };

  return (
    <div className="grid grid-cols-2 gap-3" ref={menuRef}>
      {notes.map(note => (
        <div key={note.id} className="relative group">
          {/* Main Card Button */}
          <button
            onClick={() => {
              // Only open if we aren't currently renaming it
              if (editingId !== note.id) onSelectNote(note.id);
            }}
            className="flex flex-col text-left p-3 h-32 w-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg hover:border-indigo-400 dark:hover:border-indigo-500 transition-all shadow-sm focus:outline-none"
          >
            {/* Title / Edit Mode */}
            {editingId === note.id ? (
              <div className="flex items-center w-full gap-1 mb-1" onClick={e => e.stopPropagation()}>
                <input 
                  autoFocus
                  value={editTitleText}
                  onChange={(e) => setEditTitleText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitRename(e, note.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="w-full bg-slate-100 dark:bg-neutral-800 text-slate-900 dark:text-slate-100 font-medium text-sm rounded px-1.5 py-0.5 outline-none border border-indigo-400"
                />
                <button onClick={(e) => submitRename(e, note.id)} className="text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 p-1 rounded">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-1 rounded">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate w-full pr-6 mb-1">
                {note.title || "Untitled Note"}
              </span>
            )}
            
            {/* Body Preview */}
            <span className="text-xs text-slate-500 line-clamp-3 leading-relaxed">
              {getPreviewText(note.content)}
            </span>
          </button>

          {/* 3-Dot Menu Button */}
          {!editingId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpenId(menuOpenId === note.id ? null : note.id);
              }}
              className={`absolute top-2 right-2 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-neutral-800 transition-all
                ${menuOpenId === note.id ? 'opacity-100 bg-slate-100 dark:bg-neutral-800' : 'opacity-0 group-hover:opacity-100'}`
              }
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          )}

          {/* Dropdown Menu */}
          {menuOpenId === note.id && (
            <div className="absolute top-9 right-2 w-32 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-slate-200 dark:border-neutral-700 py-1 z-10 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={(e) => startRename(e, note.id, note.title)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-neutral-700 text-left"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Rename
              </button>
              <button
                onClick={(e) => handleDelete(e, note.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-left"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          )}
        </div>
      ))}

      {notes.length === 0 && (
        <div className="col-span-2 text-center text-sm text-slate-500 mt-10">
          No notes yet. Create one to get started.
        </div>
      )}
    </div>
  );
}

const NoteEditor = forwardRef<NoteEditorRef, { note: Note }>(({ note }, ref) => {
  const queryClient = useQueryClient();
  const [editorTheme, setEditorTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  
  const previousBlockCount = useRef<number>(note.content ? note.content.length : 1);
  const latestContent = useRef<any[]>(note.content);

  const updateMutation = useMutation({
    mutationFn: (content: any[]) => api.updateNote(note.id, content),
    onMutate: async (newContent) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] });
      queryClient.setQueryData(['notes'], (old: Note[]) => 
        old.map(n => n.id === note.id ? { ...n, content: newContent } : n)
      );
    }
  });

  const editor = useCreateBlockNote({
    initialContent: note.content && note.content.length > 0 ? note.content : undefined,
  });

  // Handle Unmount Save
  useEffect(() => {
    return () => {
      if (latestContent.current) updateMutation.mutate(latestContent.current);
    };
  }, []);

  // Theme Sync
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = (e: MediaQueryListEvent) => setEditorTheme(e.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handleThemeChange);
    return () => mediaQuery.removeEventListener('change', handleThemeChange);
  }, []);

  // 2. Expose the functions to the parent ref
  useImperativeHandle(ref, () => ({
    downloadMarkdown: async () => {
      const htmlString = await editor.blocksToHTMLLossy(editor.document);
      const turndownService = new TurndownService();
      const markdown = turndownService.turndown(htmlString);
      
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${note.title || 'Note'}.md`; 
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    printPDF: () => {
      window.print();
    }
  }));

  return (
    <div id="printable-note-editor" className="h-full pb-20">
      <BlockNoteView 
        editor={editor} 
        theme={editorTheme}
        onChange={() => {
          const currentBlocks = editor.document;
          latestContent.current = currentBlocks;
          if (currentBlocks.length !== previousBlockCount.current) {
            updateMutation.mutate(currentBlocks);
            previousBlockCount.current = currentBlocks.length;
          }
        }}
      />
    </div>
  );
});