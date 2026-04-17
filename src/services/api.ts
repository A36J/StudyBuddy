const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const USER_ID = 'user_123'; // Hardcoded for this phase

export interface SourceFile {
  id: string;
  name: string;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  chatId: string;
  isActive: boolean;
}

export const api = {
  // --- CHATS ---
  getChats: async () => {
    const res = await fetch(`${API_BASE}/api/threads?user_id=${USER_ID}`);
    return res.json();
  },
  
  createChat: async (threadId: string, title: string) => {
    const res = await fetch(`${API_BASE}/api/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: threadId, user_id: USER_ID, title })
    });
    return res.json();
  },

  updateChatTitle: async (threadId: string, title: string) => {
    const res = await fetch(`${API_BASE}/api/threads/${threadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    return res.json();
  },

  deleteChat: async (threadId: string) => {
    await fetch(`${API_BASE}/api/threads/${threadId}`, { method: 'DELETE' });
  },

  getMessages: async (threadId: string) => {
    const res = await fetch(`${API_BASE}/api/threads/${threadId}/messages`);
    if (!res.ok) throw new Error("Failed to fetch messages");
    return res.json();
  },

  // --- DOCUMENTS ---
  getPresignedUrl: async (filename: string) => {
    const res = await fetch(`${API_BASE}/api/documents/presigned-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: USER_ID, filename })
    });
    return res.json(); // Expected: { uploadUrl: string, docId: string }
  },

  notifyUploadComplete: async (docId: string) => {
    const res = await fetch(`${API_BASE}/api/documents/${docId}/process`, { method: 'POST' });
    return res.json();
  },

  checkDocStatus: async (docId: string) => {
    const res = await fetch(`${API_BASE}/api/documents/${docId}/status`);
    return res.json(); // Expected: { status: 'processing' | 'ready' | 'error' }
  },

  getSourcesByChatId: async (chatId: string): Promise<SourceFile[]> => {
    
    const response = await fetch(`${API_BASE}/api/threads/${chatId}/sources`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch sources: ${response.status}`);
    }
    
    const data = await response.json();
    return data.sources; 
  },

  toggleSourceStatus: async (docId: string, isActive: boolean): Promise<void> => {
    const response = await fetch(`${API_BASE}/api/documents/${docId}/toggle`, {
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
};