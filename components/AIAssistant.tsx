
import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, Loader2, Bot, Minimize2, Mic, MicOff, RotateCcw, Zap } from 'lucide-react';
import { GoogleGenerativeAI, SchemaType, FunctionDeclaration } from '@google/generative-ai';
import { User } from '../types';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface AIAssistantProps {
  user: User | null;
  activeOpportunityId?: string | null;
  onNavigate?: (page: string) => void;
  onProfileUpdate?: () => void;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ user, activeOpportunityId, onNavigate, onProfileUpdate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Use VITE_GEMINI_API_KEY from environment, with process.env fallback
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

  // Safe initialization of GenAI
  const getGenAI = () => {
    if (!apiKey || apiKey === "YOUR_VALID_GEMINI_API_KEY_HERE") return null;
    return new GoogleGenerativeAI(apiKey);
  };
  
  const genAI = getGenAI();

  // Tools Configuration - Fixed using SchemaType instead of Type
  const tools: { functionDeclarations: FunctionDeclaration[] } = {
    functionDeclarations: [
      {
        name: 'update_business_profile',
        description: 'Update specific fields in the user business profile.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            whatsapp: { type: SchemaType.STRING, description: 'The user WhatsApp number.' },
            registration: { type: SchemaType.STRING, description: 'The SA CIPC registration number.' },
            industry: { type: SchemaType.STRING, description: 'The business industry.' },
            productsServices: { type: SchemaType.STRING, description: 'Description of products or services.' },
            description: { type: SchemaType.STRING, description: 'General business description.' }
          }
        }
      },
      {
        name: 'navigate_to_page',
        description: 'Change the current screen or tab for the user.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            page: { 
              type: SchemaType.STRING, 
              enum: ['dashboard', 'marketplace', 'profile'],
              description: 'The target page to navigate to.' 
            }
          },
          required: ['page']
        }
      }
    ]
  };

  useEffect(() => {
    if (user) {
      const savedHistory = localStorage.getItem(`fundhub_chat_history_${user.id}`);
      if (savedHistory) {
        setMessages(JSON.parse(savedHistory));
      } else {
        setMessages([
          { role: 'model', text: `Hi ${user.businessName || 'there'}! I'm your FundHub AI Assistant. I can update your profile or navigate the app for you! Try saying "Go to the marketplace".` }
        ]);
      }
    }
  }, [user]);

  useEffect(() => {
    if (user && messages.length > 0) {
      localStorage.setItem(`fundhub_chat_history_${user.id}`, JSON.stringify(messages));
    }
  }, [messages, user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, isActing]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => (prev ? `${prev} ${transcript}` : transcript));
        setIsListening(false);
      };
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setInput('');
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, presetMessage?: string) => {
    e?.preventDefault();
    const messageText = presetMessage || input;
    if (!messageText.trim() || isTyping || isActing) return;

    setMessages(prev => [...prev, { role: 'user', text: messageText }]);
    setInput('');
    setIsTyping(true);

    try {
      if (!genAI) {
        setMessages(prev => [...prev, { role: 'model', text: "I'm currently offline because my API key is missing. Please set VITE_GEMINI_API_KEY in your .env file." }]);
        return;
      }

      // Updated model to versioned name to avoid 404
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash',
        tools: [tools as any]
      });

      const chat = model.startChat();
      const result = await chat.sendMessage(messageText);
      const response = result.response;
      
      const functionCalls = response.functionCalls();
      
      if (functionCalls && functionCalls.length > 0) {
        setIsActing(true);
        for (const fc of functionCalls) {
          if (fc.name === 'update_business_profile') {
            const currentProfile = JSON.parse(localStorage.getItem(`fundhub_profile_${user?.id}`) || '{}');
            localStorage.setItem(`fundhub_profile_${user?.id}`, JSON.stringify({ ...currentProfile, ...fc.args }));
            if (onProfileUpdate) onProfileUpdate();
          } 
          else if (fc.name === 'navigate_to_page') {
            const page = (fc.args as any).page;
            if (onNavigate) onNavigate(page);
          }
        }
        setMessages(prev => [...prev, { role: 'model', text: "I've processed that request for you!" }]);
      } else {
        setMessages(prev => [...prev, { role: 'model', text: response.text() }]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'model', text: "I'm having trouble connecting. Please check your API key." }]);
    } finally {
      setIsTyping(false);
      setIsActing(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
      {isOpen && (
        <div className="mb-4 w-[90vw] sm:w-[400px] h-[500px] sm:h-[600px] glass-panel rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <Bot className="text-white" size={20} />
              </div>
              <h3 className="font-black text-sm">FundHub AI</h3>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-full text-gray-400">
              <Minimize2 size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-purple-600 text-white' : 'bg-white/5 border border-white/10 text-gray-200'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {(isTyping || isActing) && (
              <Loader2 size={16} className="animate-spin text-purple-400" />
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-white/5 bg-black/20">
            <div className="flex items-center gap-2">
              <button onClick={toggleListening} className={`p-3 rounded-xl ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-white/5 text-gray-400'}`}>
                {isListening ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              <form onSubmit={handleSendMessage} className="relative flex-1">
                <input 
                  type="text"
                  placeholder="Tell me what to do..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-4 pr-12 text-sm text-white focus:outline-none"
                />
                <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-purple-600 text-white rounded-lg">
                  <Send size={16} />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <button onClick={() => setIsOpen(!isOpen)} className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white">
        {isOpen ? <X size={24} /> : <Bot size={24} />}
      </button>
    </div>
  );
};

export default AIAssistant;