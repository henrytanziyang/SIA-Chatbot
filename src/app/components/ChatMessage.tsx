import { Wrench, Bot } from 'lucide-react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export function ChatMessage({ role, content, timestamp }: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-[#6F2C91]' : 'bg-[#00205B]'
      }`}>
        {isUser ? (
          <Wrench className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>

      <div className={`flex flex-col max-w-[70%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`px-4 py-3 rounded-2xl ${
          isUser
            ? 'bg-[#6F2C91] text-white'
            : 'bg-muted text-foreground'
        }`}>
          <div className="whitespace-pre-wrap">{content}</div>
        </div>
        {timestamp && (
          <span className="text-xs text-muted-foreground mt-1 px-2">
            {timestamp}
          </span>
        )}
      </div>
    </div>
  );
}
