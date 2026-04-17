import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Sidebar, type Chat } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { NotesPanel } from './components/NotesPanel';
import { api } from './services/api';

// Updated SourceFile interface
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

  // State
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceFile[]>([]);

  // 1. Load Chat History on Mount
  useEffect(() => {
    async function loadChats() {
      try {
        const history = await api.getChats();
        setChats(history);
        if (history.length > 0) {
          setActiveChatId(history[0].id);
        }
      } catch (error) {
        console.error("Failed to load chats:", error);
      }
    }
    loadChats();
  }, []);

  // 1.5 Load Sources when Active Chat changes
  useEffect(() => {
    async function loadSourcesForChat() {
      if (!activeChatId) return;
      
      try {
        const fetchedSources = await api.getSourcesByChatId(activeChatId);
        
        // Merge fetched sources into state, overwriting any existing ones for this chat to avoid duplicates
        setSources((prev) => {
          const otherThreadsSources = prev.filter(s => s.chatId !== activeChatId);
          return [...otherThreadsSources, ...fetchedSources];
        });
      } catch (error) {
        console.error(`Failed to load sources for chat ${activeChatId}:`, error);
      }
    }

    loadSourcesForChat();
  }, [activeChatId]); // This triggers every time the user clicks a different chat

  // 2. Handle New Chat
  const handleNewChat = () => {
    const threadId = uuidv4();
    // We ONLY update local state
    const newChat = { id: threadId, title: 'Untitled Chat' };
    
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(threadId);
  };

  

  const handleDeleteChat = async (id: string) => {
    const isDeletingActive = activeChatId === id;
    
    // Optimistic Update
    const updatedChats = chats.filter(c => c.id !== id);
    setChats(updatedChats);

    if (isDeletingActive) {
      setActiveChatId(updatedChats.length > 0 ? updatedChats[0].id : null);
    }

    try {
      await api.deleteChat(id);
    } catch (err) {
      console.error("Delete failed", err);
      
    }
  };

  const handleRenameChat = async (id: string, newTitle: string) => {
    setChats(prev => prev.map(c => c.id === id ? { ...c, title: newTitle } : c));
    try {
      await api.updateChatTitle(id, newTitle);
    } catch (err) {
      console.error("Rename failed", err);
    }
  };

  // 3. Document Upload Flow
  const handleUploadSource = async (file: File) => {
    if (!activeChatId) return;

    try {
      const { uploadUrl, docId } = await api.getPresignedUrl(file.name);

      // Add to UI optimistically, scoped to the active chat, defaulted to active
      const newSource: SourceFile = { 
        id: docId, 
        name: file.name, 
        status: 'uploading',
        chatId: activeChatId,
        isActive: true 
      };
      setSources((prev) => [newSource, ...prev]);

      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      setSources((prev) => prev.map(s => s.id === docId ? { ...s, status: 'processing' } : s));
      await api.notifyUploadComplete(docId);

      const pollInterval = setInterval(async () => {
        const { status } = await api.checkDocStatus(docId);
        
        if (status === 'ready' || status === 'error') {
          clearInterval(pollInterval);
          setSources((prev) => prev.map(s => s.id === docId ? { ...s, status } : s));
        }
      }, 3000);

    } catch (error) {
      console.error("Upload failed", error);
    }
  };

  const handleDeleteSource = (id: string) => {
    //await api.deleteDocument(id); ---need to add the deletedocument api service
    setSources((prev) => prev.filter((source) => source.id !== id));
  };

  // 4. Toggle Source Active Status
  const handleToggleSource = async (id: string) => {
    // 1. Find the source we are toggling
    const targetSource = sources.find(s => s.id === id);
    if (!targetSource) return;

    const newIsActive = !targetSource.isActive;

    // 2. Optimistic UI update (feels instant to the user)
    setSources((prev) => 
      prev.map(s => s.id === id ? { ...s, isActive: newIsActive } : s)
    );

    // 3. Update the database
    try {
      await api.toggleSourceStatus(id, newIsActive);
    } catch (error) {
      console.error("Failed to update source status in DB:", error);
      
      // Revert the UI if the database update failed
      setSources((prev) => 
        prev.map(s => s.id === id ? { ...s, isActive: targetSource.isActive } : s)
      );
    }
  };

  return (
    <div className="h-screen w-screen bg-white dark:bg-black p-2 flex gap-2 overflow-hidden text-slate-900 dark:text-slate-100">
      
      {/* LEFT PANE: Sidebar */}
      <div
        className={`transition-all duration-300 ease-in-out shrink-0 ${
          isSidebarCollapsed 
            ? 'w-16' 
            : 'w-[clamp(260px,20%,350px)]' 
        }`}
      >
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          toggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={setActiveChatId}
          onDeleteChat={handleDeleteChat}
          onRenameChat={handleRenameChat}
          onNewChat={handleNewChat}
        />
      </div>

      {/* MIDDLE PANE: Chat */}
      <ChatPanel 
        activeChatId={activeChatId} 
        sources={sources}
        onUploadSource={handleUploadSource}
        onDeleteSource={handleDeleteSource}
        onToggleSource={handleToggleSource}
        
      />

      {/* RIGHT PANE: Notes */}
      <NotesPanel
        isCollapsed={isNotesCollapsed}
        toggleCollapse={() => setIsNotesCollapsed(!isNotesCollapsed)}
      />
    </div>
  );
}

export default App;