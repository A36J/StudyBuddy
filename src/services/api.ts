
const USER_ID = 'user_123'; // Hardcoded for this phase

export interface SourceFile {
  id: string;
  name: string;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  chatId: string;
  isActive: boolean;
}

export interface Note {
  id: string;
  title: string;
  content: any[]; 
  updatedAt: string;
}

export const api = {
  // --- CHATS ---
  getChats: async () => {
    const res = await fetch(`/api/threads?user_id=${USER_ID}`);
    return res.json();
  },
  
  createChat: async (threadId: string, title: string) => {
    const res = await fetch(`/api/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: threadId, user_id: USER_ID, title })
    });
    return res.json();
  },

  updateChatTitle: async (threadId: string, title: string) => {
    const res = await fetch(`/api/threads/${threadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    return res.json();
  },

  deleteChat: async (threadId: string) => {
    await fetch(`/api/threads/${threadId}`, { method: 'DELETE' });
  },

  getMessages: async (threadId: string) => {
    const res = await fetch(`/api/threads/${threadId}/messages`);
    if (!res.ok) throw new Error("Failed to fetch messages");
    return res.json();
  },

  // --- DOCUMENTS ---
  getPresignedUrl: async (filename: string,thread_id:string) => {
    const res = await fetch(`/api/documents/presigned-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: USER_ID, filename:filename ,thread_id: thread_id})
    });
    return res.json(); 
  },

  notifyUploadComplete: async (docId: string) => {
    const res = await fetch(`/api/documents/${docId}/process`, { method: 'POST' });
    return res.json();
  },

  checkDocStatus: async (docId: string) => {
    const res = await fetch(`/api/documents/${docId}/status`);
    return res.json(); 
  },

  getSourcesByChatId: async (chatId: string): Promise<SourceFile[]> => {
    
    const response = await fetch(`/api/threads/${chatId}/sources`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch sources: ${response.status}`);
    }
    
    const data = await response.json();
    return data.sources; 
  },

  toggleSourceStatus: async (docId: string, isActive: boolean): Promise<void> => {
    const response = await fetch(`/api/documents/${docId}/toggle`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      
      body: JSON.stringify({ is_active: isActive }), 
    });

    if (!response.ok) {
      throw new Error('Failed to toggle document status');
    }
  },
  // --- NOTES ---
  getNotes: async () => {
    const res = await fetch(`/api/notes?user_id=${USER_ID}`);
    if (!res.ok) throw new Error('Failed to fetch notes');
    return res.json();
  },
  
  createNote: async (noteId: string, title: string = "Untitled Note") => {
    const res = await fetch(`/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      
      body: JSON.stringify({ id: noteId, user_id: USER_ID, title, content: [] }) 
    });
    if (!res.ok) throw new Error('Failed to create note');
    return res.json();
  },

  updateNote: async (noteId: string, content: any[], title?: string) => {
    const res = await fetch(`/api/notes/${noteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: USER_ID, content, title })
    });
    if (!res.ok) throw new Error('Failed to update note');
    return res.json();
  },
  deleteNote: async (noteId: string) => {
    const res = await fetch(`/api/notes/${noteId}?user_id=${USER_ID}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete note');
    return res.json();
  },
};