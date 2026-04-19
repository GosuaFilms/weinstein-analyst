import React, { useState, useRef, useEffect } from 'react';
import { chatWithAssistant } from '../services/geminiService';
import { AnalysisResult, ChatMessage, Language } from '../types';

interface Props {
  currentAnalysis: AnalysisResult | null;
  language: Language;
}

const ChatBot: React.FC<Props> = ({ currentAnalysis, language }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      parts: [{
        text: language === Language.ES
          ? '¡Hola! Soy tu asistente Weinstein. Puedo explicarte conceptos del método o profundizar en tu análisis actual. ¿En qué puedo ayudarte?'
          : 'Hi! I\'m your Weinstein assistant. I can explain concepts or dive deeper into your current analysis. How can I help?'
      }],
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', parts: [{ text: input }] };
    const history = [...messages];
    setMessages(prev => [...prev, userMsg]);
    const userMessage = input;
    setInput('');
    setIsLoading(true);

    try {
      const { text } = await chatWithAssistant({
        history,
        userMessage,
        context: currentAnalysis,
        language: language === Language.ES ? 'es' : 'en',
      });
      setMessages(prev => [...prev, { role: 'model', parts: [{ text }] }]);
    } catch (err) {
      console.error('Chat Error:', err);
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: (err as Error).message }] }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)} className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-full shadow-2xl flex items-center justify-center text-white text-2xl hover:scale-110 transition-transform z-[200] group">
        <i className={`fas ${isOpen ? 'fa-times' : 'fa-comment-dots'}`}></i>
        {!isOpen && <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full animate-ping"></span>}
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[90vw] max-w-[400px] h-[500px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl flex flex-col z-[200] overflow-hidden">
          <div className="p-4 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-lg flex items-center justify-center">
                <i className="fas fa-robot text-emerald-600 dark:text-emerald-500"></i>
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Weinstein AI</h3>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    {language === Language.ES ? 'En línea' : 'Online'}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
              <i className="fas fa-times"></i>
            </button>
          </div>

          <div ref={scrollRef} className="flex-grow overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/50">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none shadow-md' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-tl-none shadow-sm'}`}>
                  {m.parts[0].text}
                </div>
              </div>
            ))}
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

          <div className="p-4 bg-white dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
            <div className="relative flex items-center">
              <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder={language === Language.ES ? 'Pregunta sobre el análisis...' : 'Ask about the analysis...'} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl py-3 pl-4 pr-12 text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none" />
              <button onClick={handleSend} disabled={!input.trim() || isLoading} className="absolute right-2 w-8 h-8 bg-emerald-500 text-slate-900 rounded-lg flex items-center justify-center hover:bg-emerald-400 disabled:opacity-50">
                <i className="fas fa-paper-plane text-xs"></i>
              </button>
            </div>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-2 text-center uppercase tracking-widest font-bold">
              Powered by Gemini 2.5 Flash
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatBot;
