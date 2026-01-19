
import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Sparkles, Loader2, Bot, Minimize2, ArrowUpRight, Mic, MicOff, RotateCcw, Zap } from 'lucide-react';
import { GoogleGenAI, GenerateContentResponse, Type, FunctionDeclaration } from '@google/genai';
import { User, Application } from '../types';
import { MOCK_FUNDING } from '../constants';

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
  const [isActing, setIsActing] = useState(false); // New state for tool execution
  const [isListening, setIsListening] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);

  // Tools Configuration
  const tools: { functionDeclarations: FunctionDeclaration[] } = {
    functionDeclarations: [
      {
        name: 'update_business_profile',
        description: 'Update specific fields in the user business profile such as whatsapp, registration number, industry, or products/services.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            whatsapp: { type: Type.STRING, description: 'The user WhatsApp number in international format.' },
            registration: { type: Type.STRING, description: 'The South African CIPC registration number.' },
            industry: { type: Type.STRING, description: 'The business industry (e.g. Tech, Retail).' },
            productsServices: { type: Type.STRING, description: 'A description of the products or services offered.' },
            description: { type: Type.STRING, description: 'The general business description or vision.' }
          }
        }
      },
      {
        name: 'navigate_to_page',
        description: 'Change the current screen or tab for the user.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            page: { 
              type: Type.STRING, 
              enum: ['dashboard', 'marketplace', 'profile'],
              description: 'The target page to navigate to.' 
            }
          },
          required: ['page']
        }
      }
    ]
  };

  // Load Chat History
  useEffect(() => {
    if (user) {
      const savedHistory = localStorage.getItem(`fundhub_chat_history_${user.id}`);
      if (savedHistory) {
        setMessages(JSON.parse(savedHistory));
      } else {
        setMessages([
          { role: 'model', text: `Hi ${user.businessName || 'there'}! I'm your FundHub AI Assistant. I'm agentic now—I can update your profile or navigate the app for you! Try saying "Save my WhatsApp number" or "Show me the marketplace".` }
        ]);
      }
    }
  }, [user]);

  // Persist Chat History
  useEffect(() => {
    if (user && messages.length > 0) {
      localStorage.setItem(`fundhub_chat_history_${user.id}`, JSON.stringify(messages));
    }
  }, [messages, user]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, isActing]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => (prev ? `${prev} ${transcript}` : transcript));
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
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

  const clearChat = () => {
    if (!user) return;
    const initialMessage: Message = { role: 'model', text: `Chat cleared. How else can I help you, ${user.businessName}?` };
    setMessages([initialMessage]);
    localStorage.removeItem(`fundhub_chat_history_${user.id}`);
  };

  const handleSendMessage = async (e?: React.FormEvent, presetMessage?: string) => {
    e?.preventDefault();
    const messageText = presetMessage || input;
    if (!messageText.trim() || isTyping || isActing) return;

    const userMessage: Message = { role: 'user', text: messageText };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const profileData = user ? localStorage.getItem(`fundhub_profile_${user.id}`) : null;
      const parsedProfile = profileData ? JSON.parse(profileData) : null;
      
      const sessionChat = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
          tools: [tools],
          systemInstruction: `You are the FundHub AI Assistant. You are AGENTIC. 
          
          CAPABILITIES:
          - You can update user profile fields using 'update_business_profile'.
          - You can navigate the app using 'navigate_to_page'.
          
          CONTEXT:
          - Business: ${user?.businessName || 'N/A'}
          - WhatsApp: ${parsedProfile?.whatsapp || 'Not saved yet'}
          
          BEHAVIOR:
          1. If a user gives you information (like a WhatsApp number or industry), call 'update_business_profile' immediately.
          2. If a user wants to see their applications or marketplace, use 'navigate_to_page'.
          3. Always confirm to the user what action you have taken.
          4. Keep responses brief and proactive.`,
        },
      });

      const response = await sessionChat.sendMessage({ message: messageText });
      
      // Handle Function Calls
      if (response.functionCalls && response.functionCalls.length > 0) {
        setIsActing(true);
        const functionResponses = [];
        
        for (const fc of response.functionCalls) {
          let result = "Action performed successfully.";
          
          if (fc.name === 'update_business_profile') {
            const currentProfile = JSON.parse(localStorage.getItem(`fundhub_profile_${user?.id}`) || '{}');
            const updatedProfile = { ...currentProfile, ...fc.args };
            localStorage.setItem(`fundhub_profile_${user?.id}`, JSON.stringify(updatedProfile));
            if (onProfileUpdate) onProfileUpdate();
            result = `Profile updated with: ${Object.keys(fc.args).join(', ')}`;
          } 
          else if (fc.name === 'navigate_to_page') {
            if (onNavigate) onNavigate(fc.args.page as string);
            result = `Navigated user to ${fc.args.page}`;
          }

          functionResponses.push({
            id: fc.id,
            name: fc.name,
            response: { result }
          });
        }

        // Send tool results back to get final conversational response
        const finalResponse = await sessionChat.sendMessage({
          message: "The actions were performed.", // Internal trigger
          // In actual API usage, we send functionResponses. For this wrapper, we can follow up.
        });
        
        setMessages(prev => [...prev, { role: 'model', text: finalResponse.text || "I've handled that for you!" }]);
      } else {
        setMessages(prev => [...prev, { role: 'model', text: response.text || "How else can I help?" }]);
      }

    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'model', text: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment." }]);
    } finally {
      setIsTyping(false);
      setIsActing(false);
    }
  };

  const suggestions = [
    "Set WhatsApp to +27 71 234 5678",
    "Go to Marketplace",
    "Update my industry to Agriculture",
    "Check my readiness"
  ];

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
      {isOpen && (
        <div className="mb-4 w-[90vw] sm:w-[400px] h-[500px] sm:h-[600px] glass-panel rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <Bot className="text-white" size={20} />
              </div>
              <div>
                <h3 className="font-black text-sm">Agentic Assistant</h3>
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${isActing ? 'bg-cyan-500 animate-ping' : isListening ? 'bg-red-500 animate-ping' : 'bg-emerald-500 animate-pulse'}`}></span>
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                    {isActing ? 'Executing Task...' : isListening ? 'Listening...' : 'Active Agent'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={clearChat} title="Clear Chat History" className="p-2 hover:bg-white/10 rounded-full text-gray-500 hover:text-white transition-colors">
                <RotateCcw size={16} />
              </button>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-full text-gray-400 transition-colors">
                <Minimize2 size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl text-sm whitespace-pre-wrap ${
                  msg.role === 'user' 
                    ? 'bg-purple-600 text-white rounded-tr-none shadow-lg' 
                    : 'bg-white/5 border border-white/10 text-gray-200 rounded-tl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {(isTyping || isActing) && (
              <div className="flex justify-start">
                <div className="bg-white/5 border border-white/10 p-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-purple-400" />
                  {isActing && <span className="text-[10px] font-black uppercase text-cyan-400 tracking-widest">Running Tool...</span>}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-white/5 bg-black/20">
            <div className="flex flex-wrap gap-2 mb-4">
              {suggestions.map((s, i) => (
                <button 
                  key={i}
                  onClick={() => handleSendMessage(undefined, s)}
                  className="text-[10px] font-bold bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-full text-gray-400 hover:text-white transition-all whitespace-nowrap flex items-center gap-1"
                >
                  <Zap size={10} className="text-cyan-400" /> {s}
                </button>
              ))}
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={toggleListening}
                className={`p-3 rounded-xl transition-all shadow-lg ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}
              >
                {isListening ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              <form onSubmit={handleSendMessage} className="relative flex-1">
                <input 
                  type="text"
                  placeholder={isActing ? "Performing task..." : isListening ? "Listening..." : "Tell me what to do..."}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                />
                <button 
                  type="submit"
                  disabled={!input.trim() || isTyping || isActing}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg transition-all shadow-lg"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 group ${
          isOpen ? 'bg-white text-black' : 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white'
        }`}
      >
        {isOpen ? <X size={24} /> : (
          <div className="relative">
            <Bot size={24} />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-cyan-400 border-2 border-[#050510] rounded-full animate-pulse"></div>
            <Sparkles size={12} className="absolute -bottom-2 -left-2 text-amber-400 animate-pulse" />
          </div>
        )}
      </button>
    </div>
  );
};

export default AIAssistant;
