import React, { useState, useRef, useEffect } from 'react';
import { chatStream } from '../lib/api';
import { AnalysisResult, ChatMessage, Language } from '../types';

interface Props {
  currentAnalysis: AnalysisResult | null;
  language: Language;
}

// Simple markdown renderer: **bold**, *italic*, bullet lists, line breaks
function renderMarkdown(text: string): React.ReactNode[] {
  return text.split('\n').map((line, i) => {
    const isBullet = /^[•\-*]\s/.test(line);
    const content = line.replace(/^[•\-*]\s/, '');

    const parts = content.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, j) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      if (/^\*[^*]+\*$/.test(part)) {
        return <em key={j}>{part.slice(1, -1)}</em>;
      }
      return part;
    });

    return (
      <React.Fragment key={i}>
        {isBullet ? (
          <span className="flex gap-1.5 mt-0.5">
            <span className="text-emerald-500 shrink-0 mt-[2px]">•</span>
            <span>{parts}</span>
          </span>
        ) : (
          <span>{parts}</span>
        )}
        {i < text.split('\n').length - 1 && !isBullet && <br />}
      </React.Fragment>
    );
  });
}

const ChatBot: React.FC<Props> = ({ currentAnalysis, language }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      parts: [{
        text: language === Language.ES
          ? '¡Hola! Soy tu asistente Weinstein. Escribe el nombre de una empresa o ticker para analizarla, o pregúntame lo que quieras sobre el método.'
          : 'Hi! I\'m your Weinstein assistant. Type a company name or ticker to analyze it, or ask me anything about the method.',
      }],
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<boolean>(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || isStreaming) return;

    const userMsg: ChatMessage = { role: 'user', parts: [{ text: input }] };
    const history = [...messages];
    setMessages(prev => [...prev, userMsg]);
    const userMessage = input;
    setInput('');
    setIsLoading(true);
    abortRef.current = false;

    try {
      // Add empty AI message placeholder — will be filled by stream
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: '' }] }]);
      setIsLoading(false);
      setIsStreaming(true);

      await chatStream(
        {
          history,
          userMessage,
          context: currentAnalysis,
          language: language === Language.ES ? 'es' : 'en',
        },
        (chunk) => {
          if (abortRef.current) return;
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'model') return prev;
            return [
              ...prev.slice(0, -1),
              { role: 'model', parts: [{ text: last.parts[0].text + chunk }] },
            ];
          });
        }
      );
    } catch (err) {
      if (!abortRef.current) {
        setMessages(prev => {
          // Replace the last empty message if it exists
          const last = prev[prev.length - 1];
          const errMsg = { role: 'model' as const, parts: [{ text: `⚠️ ${(err as Error).message}` }] };
          if (last?.role === 'model' && last.parts[0].text === '') {
            return [...prev.slice(0, -1), errMsg];
          }
          return [...prev, errMsg];
        });
      }
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const handleClose = () => {
    abortRef.current = true;
    setIsOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-full shadow-2xl flex items-center justify-center text-white text-2xl hover:scale-110 transition-transform z-[200] group"
      >
        <i className={`fas ${isOpen ? 'fa-times' : 'fa-comment-dots'}`}></i>
        {!isOpen && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full animate-ping"></span>
        )}
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[90vw] max-w-[420px] h-[520px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl flex flex-col z-[200] overflow-hidden">
          {/* Header */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-lg flex items-center justify-center">
                <i className="fas fa-robot text-emerald-600 dark:text-emerald-500"></i>
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Weinstein AI</h3>
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-blue-400 animate-ping' : 'bg-emerald-500 animate-pulse'}`}></span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    {isStreaming
                      ? (language === Language.ES ? 'Respondiendo…' : 'Responding…')
                      : (language === Language.ES ? 'En línea' : 'Online')}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
              <i className="fas fa-times"></i>
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-grow overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/50">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] p-3 rounded-2xl text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-none shadow-md'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-tl-none shadow-sm'
                  }`}
                >
                  {m.role === 'model' && m.parts[0].text === '' ? (
                    // Streaming placeholder — cursor blink
                    <span className="inline-block w-2 h-4 bg-emerald-500 animate-pulse rounded-sm"></span>
                  ) : m.role === 'model' ? (
                    <div className="space-y-0.5">{renderMarkdown(m.parts[0].text)}</div>
                  ) : (
                    m.parts[0].text
                  )}
                </div>
              </div>
            ))}
            {/* Old-style loading dots (only while waiting for first chunk) */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-tl-none border border-slate-200 dark:border-slate-700 flex gap-1 items-center shadow-sm">
                  <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce"></span>
                  <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 bg-white dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
            <div className="relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={language === Language.ES ? 'Escribe un ticker o pregunta…' : 'Type a ticker or question…'}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl py-3 pl-4 pr-12 text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none"
                disabled={isLoading || isStreaming}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading || isStreaming}
                className="absolute right-2 w-8 h-8 bg-emerald-500 text-slate-900 rounded-lg flex items-center justify-center hover:bg-emerald-400 disabled:opacity-50 transition-colors"
              >
                <i className="fas fa-paper-plane text-xs"></i>
              </button>
            </div>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-2 text-center uppercase tracking-widest font-bold">
              Powered by Claude · Alpha Stage
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatBot;
