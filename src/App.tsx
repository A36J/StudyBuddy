import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { NotesPanel } from './components/NotesPanel';
import type {Chat} from './components/Sidebar'

const DUMMY_CHATS: Chat[] = [
  { id: '1', title: 'React Performance Tips' },
  { id: '2', title: 'Calculus Assignment 3' },
  { id: '3', title: 'Project Brainstorming' },
];

function App() {
  // Application State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isNotesCollapsed, setIsNotesCollapsed] = useState(true);
  const [chats, setChats] = useState<Chat[]>(DUMMY_CHATS);
  const [activeChatId, setActiveChatId] = useState<string | null>('1');

  // Handlers
  const handleNewChat = () => {
    const newChat = { id: Date.now().toString(), title: 'New Conversation' };
    setChats([newChat, ...chats]);
    setActiveChatId(newChat.id);
  };

  return (
    <div className="h-screen w-screen bg-white dark:bg-black p-2 flex gap-2 overflow-hidden text-slate-900 dark:text-slate-100">
      
      {/* LEFT PANE: Sidebar (25% Width) */}
      {/* Note: We are overriding the Sidebar's internal width class using a wrapper div for strict percentage control */}
      <div className={`transition-all duration-300 ease-in-out shrink-0 ${isSidebarCollapsed ? 'w-16' : 'w-[20%] min-w-[260px] max-w-[350px]'}`}>
        <Sidebar 
          isCollapsed={isSidebarCollapsed}
          toggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={setActiveChatId}
          onNewChat={handleNewChat}
        />
      </div>

      {/* MIDDLE PANE: Chat Area (Dynamic Flex Width) */}
      {/* Because this has flex-1, it will automatically consume whatever space is left by the side panels */}
      <ChatPanel />

      {/* RIGHT PANE: Notes/Canvas (35% Width) */}
      <NotesPanel 
        isCollapsed={isNotesCollapsed}
        toggleCollapse={() => setIsNotesCollapsed(!isNotesCollapsed)}
      />

    </div>
  );
}

export default App;