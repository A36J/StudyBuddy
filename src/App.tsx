import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sidebar, type Chat } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { NotesPanel } from './components/NotesPanel';
import { api } from './services/api';

export interface SourceFile {
  id: string;
  name: string;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  chatId: string;
  isActive: boolean;
}

function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isNotesCollapsed, setIsNotesCollapsed] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // 1. Fetch Chats (Cached)
  const { data: chats = [] } = useQuery({
    queryKey: ['chats'],
    queryFn: async () => {
      const history = await api.getChats();
      if (history.length > 0 && !activeChatId) {
        setActiveChatId(history[0].id);
      }
      return history;
    },
    staleTime: 1000 * 60 * 5, // Data stays fresh for 5 mins
  });

  // 2. Fetch Sources for Active Chat (Cached)
  const { data: sources = [] } = useQuery({
    queryKey: ['sources', activeChatId],
    queryFn: () => api.getSourcesByChatId(activeChatId!),
    enabled: !!activeChatId, // Only run if we have an active chat
    staleTime: 1000 * 60 * 5, // Prevents DB spam on tab switch
  });

  // 3. Mutations for Chats
  const handleNewChat = () => {
    const threadId = uuidv4();
    const newChat = { id: threadId, title: 'Untitled Chat' };
    
    // Optimistically add to cache
    queryClient.setQueryData(['chats'], (old: Chat[]) => [newChat, ...(old || [])]);
    setActiveChatId(threadId);
  };

  const deleteChatMutation = useMutation({
    mutationFn: api.deleteChat,
    onMutate: async (id) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['chats'] });
      const previousChats = queryClient.getQueryData<Chat[]>(['chats']);
      
      const updatedChats = previousChats?.filter(c => c.id !== id) || [];
      queryClient.setQueryData(['chats'], updatedChats);
      
      if (activeChatId === id) {
        setActiveChatId(updatedChats.length > 0 ? updatedChats[0].id : null);
      }
      return { previousChats };
    },
    onError: (err, id, context) => {
      queryClient.setQueryData(['chats'], context?.previousChats); // Rollback
    }
  });

  const renameChatMutation = useMutation({
    mutationFn: ({ id, newTitle }: { id: string, newTitle: string }) => api.updateChatTitle(id, newTitle),
    onMutate: async ({ id, newTitle }) => {
      await queryClient.cancelQueries({ queryKey: ['chats'] });
      const previousChats = queryClient.getQueryData<Chat[]>(['chats']);
      queryClient.setQueryData(['chats'], (old: Chat[]) => 
        old?.map(c => c.id === id ? { ...c, title: newTitle } : c)
      );
      return { previousChats };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['chats'], context?.previousChats);
    }
  });

  // 4. Source Upload Flow
  const handleUploadSource = async (file: File) => {
    if (!activeChatId) return;

    try {
      const { uploadUrl, docId } = await api.getPresignedUrl(file.name,activeChatId);

      const newSource: SourceFile = { 
        id: docId, name: file.name, status: 'uploading', chatId: activeChatId, isActive: true 
      };

      // Optimistically add to active chat's sources
      queryClient.setQueryData(['sources', activeChatId], (old: SourceFile[] = []) => [newSource, ...old]);

      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      // Update status to processing
      queryClient.setQueryData(['sources', activeChatId], (old: SourceFile[] = []) => 
        old.map(s => s.id === docId ? { ...s, status: 'processing' } : s)
      );
      
      await api.notifyUploadComplete(docId);

      // Polling for status 
      const pollInterval = setInterval(async () => {
        const { status } = await api.checkDocStatus(docId);
        if (status === 'ready' || status === 'error') {
          clearInterval(pollInterval);
          queryClient.setQueryData(['sources', activeChatId], (old: SourceFile[] = []) => 
            old.map(s => s.id === docId ? { ...s, status } : s)
          );
        }
      }, 3000);

    } catch (error) {
      console.error("Upload failed", error);
    }
  };

  const handleDeleteSource = (id: string) => {
    // Optimistic delete
    queryClient.setQueryData(['sources', activeChatId], (old: SourceFile[] = []) => 
      old.filter(s => s.id !== id)
    );
    // api.deleteDocument(id);
  };

  const toggleSourceMutation = useMutation({
    mutationFn: ({ id, newIsActive }: { id: string, newIsActive: boolean }) => api.toggleSourceStatus(id, newIsActive),
    onMutate: async ({ id, newIsActive }) => {
      await queryClient.cancelQueries({ queryKey: ['sources', activeChatId] });
      const previousSources = queryClient.getQueryData<SourceFile[]>(['sources', activeChatId]);
      
      queryClient.setQueryData(['sources', activeChatId], (old: SourceFile[] = []) => 
        old.map(s => s.id === id ? { ...s, isActive: newIsActive } : s)
      );
      return { previousSources };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['sources', activeChatId], context?.previousSources);
    }
  });

  return (
    <div className="h-screen w-screen bg-white dark:bg-black p-2 flex gap-2 overflow-hidden text-slate-900 dark:text-slate-100">
      
      <div className={`transition-all duration-300 ease-in-out shrink-0 ${isSidebarCollapsed ? 'w-16' : 'w-[clamp(260px,20%,350px)]'}`}>
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          toggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={setActiveChatId}
          onDeleteChat={(id) => deleteChatMutation.mutate(id)}
          onRenameChat={(id, title) => renameChatMutation.mutate({ id, newTitle: title })}
          onNewChat={handleNewChat}
        />
      </div>

      <ChatPanel 
        activeChatId={activeChatId} 
        sources={sources} 
        onUploadSource={handleUploadSource}
        onDeleteSource={handleDeleteSource}
        onToggleSource={(id) => {
          const target = sources.find(s => s.id === id);
          if (target) toggleSourceMutation.mutate({ id, newIsActive: !target.isActive });
        }}
      />

      <NotesPanel
        isCollapsed={isNotesCollapsed}
        toggleCollapse={() => setIsNotesCollapsed(!isNotesCollapsed)}
      />
    </div>
  );
}

export default App;