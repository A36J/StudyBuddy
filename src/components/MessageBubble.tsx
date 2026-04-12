export interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`w-full flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div 
        className={`
          max-w-[85%] md:max-w-[75%] px-5 py-3.5 break-words [word-break:break-word] 
          ${isUser 
            ? 'bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-slate-100 rounded-3xl rounded-br-sm' 
            : 'bg-transparent text-slate-800 dark:text-slate-200'
          }
        `}
      >
        {/* Optional AI Nameplate (remove if you want pure text like Gemini) */}
        {/* {!isUser && (
          <div className="font-semibold text-sm mb-2 text-blue-600 dark:text-blue-400">
            StudyBuddy
          </div>
        )} */}
        
        <div className="leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    </div>
  );
}