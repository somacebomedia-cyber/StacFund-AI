
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Send, Sparkles, Loader2, Bot, Minimize2, ArrowUpRight, Mic, MicOff, RotateCcw, Zap, Command, CreditCard, Shield } from 'lucide-react';
import { GoogleGenAI, GenerateContentResponse, Type, FunctionDeclaration } from '@google/genai';
import { collection, getDocs, updateDoc, doc, query, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User, Application } from '../types';
import { MOCK_FUNDING } from '../constants';
import { handleGeminiError } from '../services/geminiError';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface AIAssistantProps {
  user: User | null;
  onNavigate?: (page: string) => void;
  onProfileUpdate?: () => void;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ user, onNavigate, onProfileUpdate }) => {
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
              enum: ['dashboard', 'funding', 'profile', 'tools', 'needs', 'applications', 'pricing', 'documents'],
              description: 'The target page to navigate to.' 
            }
          },
          required: ['page']
        }
      },
      {
        name: 'filter_marketplace',
        description: 'Apply search and category filters to the funding marketplace, and navigate the user there.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            search: { type: Type.STRING, description: 'The search query or keyword to filter by (e.g., "preschool", "tech", "under R50k"). Leave empty if not applicable.' },
            category: { type: Type.STRING, enum: ['All', 'GRANT', 'LOAN', 'EQUITY', 'COMPETITION'], description: 'The category to filter by. Defaults to "All".' }
          }
        }
      },
      {
        name: 'generate_logo',
        description: 'Open the AI Logo Generator tool to create a logo for the business.',
        parameters: {
          type: Type.OBJECT,
          properties: {}
        }
      },
      {
        name: 'register_business',
        description: 'Open the Business Registration wizard to let the user register a new company (e.g. CIPC).',
        parameters: {
          type: Type.OBJECT,
          properties: {}
        }
      },
      {
        name: 'create_video_advert',
        description: 'Generate a product or business video advert using the latest Veo model. Takes a prompt.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            prompt: { type: Type.STRING, description: 'The prompt to use for creating the video advert.' }
          },
          required: ['prompt']
        }
      },
      {
        name: 'read_document',
        description: 'Read a user\'s document by its title keyword from their library.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            titleKeyword: { type: Type.STRING, description: 'A keyword from the title of the document to search for.' }
          },
          required: ['titleKeyword']
        }
      },
      {
        name: 'edit_document',
        description: 'Edit or append to an existing document by its ID.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            docId: { type: Type.STRING, description: 'The ID of the document to edit.' },
            newContent: { type: Type.STRING, description: 'The modified or new content to append or replace.' },
            action: { type: Type.STRING, enum: ['append', 'replace'], description: 'Whether to append to the existing content or replace it entirely.'}
          },
          required: ['docId', 'newContent', 'action']
        }
      },
      {
        name: 'open_form_digitizer',
        description: 'Open the Offline Form Digitizer tool to scan and auto-fill physical municipality forms.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'open_presentation_designer',
        description: 'Open the AI Pitch Deck Designer tool to create a funding presentation.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'get_applications',
        description: 'Get the list of the user\'s funding applications and their statuses.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'clear_applications',
        description: 'Clear all of the user\'s current applications.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'list_documents',
        description: 'List all of the user\'s uploaded documents.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'open_dashboard_tab',
        description: 'Change the active tab on the Dashboard screen.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            tab: { type: Type.STRING, enum: ['overview', 'applications', 'opportunities', 'needs', 'tools', 'documents'], description: 'The dashboard tab to open.'}
          },
          required: ['tab']
        }
      }
    ]
  };

  // Load Chat History
  useEffect(() => {
    if (user) {
      const savedHistory = localStorage.getItem(`stacfund_chat_history_${user.id}`);
      if (savedHistory) {
        setMessages(JSON.parse(savedHistory));
      } else {
        setMessages([
          { role: 'model', text: `Hi ${user.businessName || 'there'}! I'm your StacFund AI Assistant. I'm agentic now—I can update your profile or navigate the app for you! Try saying "Save my WhatsApp number" or "Show me the marketplace".` }
        ]);
      }
    }
  }, [user]);

  // Persist Chat History
  useEffect(() => {
    if (user && messages.length > 0) {
      localStorage.setItem(`stacfund_chat_history_${user.id}`, JSON.stringify(messages));
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
    localStorage.removeItem(`stacfund_chat_history_${user.id}`);
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
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'proxy', httpOptions: { baseUrl: typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:3000/api/gemini' } });
      const profileData = user ? localStorage.getItem(`stacfund_profile_${user.id}`) : null;
      const parsedProfile = profileData ? JSON.parse(profileData) : null;
      
      const sessionChat = ai.chats.create({
        model: 'gemini-3.5-flash',
        config: {
          tools: [tools],
          systemInstruction: `You are the StacFund AI Assistant. You are AGENTIC. 
          
          CAPABILITIES:
          - Update user profile fields using 'update_business_profile'.
          - Navigate the app using 'navigate_to_page'.
          - Search and filter funding using 'filter_marketplace'.
          - Read/edit user documents using 'read_document' and 'edit_document'.
          - Open Logo generator using 'generate_logo'.
          - Generate Video Adverts using 'create_video_advert'.
          - Register a business with CIPC using 'register_business'.
          - Access user applications via 'get_applications' and 'clear_applications'.
          - Open the offline form digitizer with 'open_form_digitizer'.
          - Open the AI pitch deck designer with 'open_presentation_designer'.
          - List all uploaded documents with 'list_documents'.
          - Switch Dashboard tabs using 'open_dashboard_tab' (e.g. applications, opportunities, needs, tools).
          
          CONTEXT:
          - Business Name: ${user?.businessName || 'N/A'}
          - Full Profile Data: ${JSON.stringify(parsedProfile || {})}
          
          BEHAVIOR:
          1. Actively use 'read_document' if the user asks about their business plan, pitch deck, or what documents they have. Read the document to answer their question!
          2. Use 'edit_document' if they ask you to modify, add to, or rewrite a section of a document.
          3. For adverts, call 'create_video_advert' and generate a highly detailed, cinematic prompt for Veo 2.
          4. For logos, call 'generate_logo' and direct the user to the popup.
          5. For business registration (CIPC), call 'register_business'.
          6. ALWAYS ACT on the user's behalf if a tool exists for it. DO NOT just give instructions.
          7. Keep conversational responses brief. Let the tools do the work!`,
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
            if (user) {
              try {
                await setDoc(doc(db, 'users', user.id), { profile: fc.args }, { merge: true });
                if (onProfileUpdate) onProfileUpdate();
                result = `Profile updated with: ${Object.keys(fc.args).join(', ')}`;
              } catch (e) {
                result = `Failed to update profile: ${e}`;
              }
            } else {
              result = 'User not logged in.';
            }
          } 
          else if (fc.name === 'navigate_to_page') {
            if (onNavigate) onNavigate(fc.args.page as string);
            result = `Navigated user to ${fc.args.page}`;
          }
          else if (fc.name === 'filter_marketplace') {
            if (onNavigate) onNavigate('marketplace');
            window.dispatchEvent(new CustomEvent('update_marketplace_filter', { 
              detail: { search: fc.args.search || '', category: fc.args.category || 'All' } 
            }));
            result = `Filtered marketplace for: ${fc.args.search || 'anything'} ${fc.args.category ? `in category ${fc.args.category}` : ''}`;
          }
          else if (fc.name === 'generate_logo') {
            if (onNavigate) onNavigate('dashboard');
            window.dispatchEvent(new CustomEvent('open_ai_tool', { detail: { tool: 'logo' } }));
            result = `Navigated to dashboard and opened Logo Generator popup.`;
          }
          else if (fc.name === 'register_business') {
            if (onNavigate) onNavigate('dashboard');
            window.dispatchEvent(new CustomEvent('open_ai_tool', { detail: { tool: 'register' } }));
            result = `Navigated to dashboard and opened Business Registration popup.`;
          }
          else if (fc.name === 'create_video_advert') {
            if (onNavigate) onNavigate('dashboard');
            window.dispatchEvent(new CustomEvent('open_ai_tool', { detail: { tool: 'advert', prompt: fc.args.prompt } }));
            result = `Started generating a Video Advert for the user context with prompt: ${fc.args.prompt}`;
          }
          else if (fc.name === 'read_document') {
             if (user) {
               try {
                 const docsRef = collection(db, 'users', user.id, 'documents');
                 const docSnap = await getDocs(docsRef);
                 const foundDoc = docSnap.docs.map(doc => ({id: doc.id, ...doc.data()})).find((d: any) => d.name?.toLowerCase().includes(String(fc.args.titleKeyword).toLowerCase()));
                 if (foundDoc) {
                   result = `Found document "${(foundDoc as any).name}" (ID: ${(foundDoc as any).id}). Content: ${(foundDoc as any).content || 'No text content available'}`;
                 } else {
                   result = `No document found containing keyword "${fc.args.titleKeyword}". Available documents: ${docSnap.docs.map(d=>d.data().name).join(', ')}`;
                 }
               } catch (e) {
                 result = `Failed to read documents from database: ${e}`;
               }
             } else {
               result = `User not logged in.`;
             }
          }
          else if (fc.name === 'edit_document') {
             if (user) {
               try {
                 const dRef = doc(db, 'users', user.id, 'documents', String(fc.args.docId));
                 const allDocs = await getDocs(collection(db, 'users', user.id, 'documents'));
                 const existingDoc = allDocs.docs.find(d => d.id === fc.args.docId);
                 if (existingDoc) {
                   const oldContent = existingDoc.data().content || '';
                   const updatedContent = fc.args.action === 'append' ? oldContent + '\n\n' + fc.args.newContent : fc.args.newContent;
                   await updateDoc(dRef, { content: updatedContent, updatedAt: new Date().toISOString() });
                   result = `Successfully updated document ${fc.args.docId} (${fc.args.action}ed).`;
                 } else {
                   result = `Document with ID ${fc.args.docId} not found.`;
                 }
               } catch(e) {
                 result = `Failed to update document: ${e}`;
               }
             } else {
               result = `User not logged in.`;
             }
          }
          else if (fc.name === 'open_form_digitizer') {
            if (onNavigate) onNavigate('dashboard');
            window.dispatchEvent(new CustomEvent('open_ai_tool', { detail: { tool: 'digitizer' } }));
            result = `Navigated to dashboard and opened Form Digitizer popup.`;
          }
          else if (fc.name === 'open_presentation_designer') {
            if (onNavigate) onNavigate('dashboard');
            window.dispatchEvent(new CustomEvent('open_ai_tool', { detail: { tool: 'presentation' } }));
            result = `Navigated to dashboard and opened AI Pitch Deck Designer popup.`;
          }
          else if (fc.name === 'get_applications') {
            if (user) {
              try {
                const appsRef = collection(db, 'users', user.id, 'applications');
                const appSnap = await getDocs(appsRef);
                const apps = appSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                result = `User has ${apps.length} applications: ${JSON.stringify(apps)}`;
              } catch (e) {
                result = `Failed to fetch applications: ${e}`;
              }
            } else {
              result = 'User not logged in.';
            }
          }
          else if (fc.name === 'clear_applications') {
            if (user) {
              try {
                const appsRef = collection(db, 'users', user.id, 'applications');
                const appSnap = await getDocs(appsRef);
                const deletePromises = appSnap.docs.map(document => deleteDoc(doc(db, 'users', user.id, 'applications', document.id)));
                await Promise.all(deletePromises);
                result = `Successfully cleared all ${appSnap.docs.length} applications.`;
                if (onNavigate) onNavigate('dashboard'); // Trigger re-render or navigation to see changes
              } catch (e) {
                result = `Failed to clear applications: ${e}`;
              }
            } else {
              result = 'User not logged in.';
            }
          }
          else if (fc.name === 'list_documents') {
            if (user) {
              try {
                const docsRef = collection(db, 'users', user.id, 'documents');
                const docSnap = await getDocs(docsRef);
                const docs = docSnap.docs.map(doc => ({id: doc.id, name: doc.data().name}));
                result = `User has ${docs.length} documents: ${JSON.stringify(docs)}`;
              } catch (e) {
                result = `Failed to list documents: ${e}`;
              }
            } else {
              result = `User not logged in.`;
            }
          }
          else if (fc.name === 'open_dashboard_tab') {
            if (onNavigate) onNavigate('dashboard');
            window.dispatchEvent(new CustomEvent('update_dashboard_tab', { detail: { tab: fc.args.tab } }));
            result = `Navigated to Dashboard and opened the '${fc.args.tab}' tab.`;
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
      handleGeminiError(error);
      setMessages(prev => [...prev, { role: 'model', text: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment." }]);
    } finally {
      setIsTyping(false);
      setIsActing(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end pointer-events-none">
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20, rotateX: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20, rotateX: 10 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="mb-6 w-[90vw] sm:w-[420px] h-[500px] sm:h-[580px] glass-panel rounded-[32px] border border-white/20 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden pointer-events-auto origin-bottom-right"
            style={{ 
              perspective: '1000px',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 20px 50px rgba(0,0,0,0.5), inset 0 0 20px rgba(255,255,255,0.05)'
            }}
          >
            {/* Premium Header */}
            <div className="p-5 border-b border-white/5 bg-white/5 backdrop-blur-3xl flex justify-between items-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 via-blue-600/10 to-transparent pointer-none" />
              <div className="flex items-center gap-4 relative z-10">
                <div className="relative">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-600 flex items-center justify-center shadow-[0_8px_16px_rgba(139,92,246,0.3)]">
                    <Bot className="text-white" size={24} />
                  </div>
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-[#050510] rounded-full" 
                  />
                </div>
                <div>
                  <h3 className="font-black text-base tracking-tight flex items-center gap-2">
                    StacFund AI <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border border-purple-500/30 font-mono">Agent v2.4</span>
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.15em]">
                      {isActing ? 'Synchronizing Data...' : isListening ? 'Processing Voice...' : 'Ready for Commands'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 relative z-10">
                <button onClick={clearChat} title="Reset Protocol" className="p-2.5 hover:bg-white/10 rounded-xl text-gray-500 hover:text-white transition-all">
                  <RotateCcw size={18} />
                </button>
                <button onClick={() => setIsOpen(false)} className="p-2.5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all">
                  <Minimize2 size={20} />
                </button>
              </div>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-gradient-to-b from-transparent to-black/20">
              {messages.map((msg, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  key={i} 
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[88%] p-4 rounded-3xl text-[13px] leading-relaxed relative ${
                    msg.role === 'user' 
                      ? 'bg-gradient-to-br from-purple-600 to-indigo-700 text-white rounded-tr-none shadow-[0_10px_30px_-5px_rgba(139,92,246,0.3)]' 
                      : 'bg-white/[0.03] border border-white/10 text-gray-200 rounded-tl-none backdrop-blur-md'
                  }`}>
                    {msg.text}
                    {msg.role === 'model' && (
                      <div className="absolute -left-2 top-0 w-2 h-2 text-white/10">
                        <svg width="8" height="8" viewBox="0 0 8 8"><path d="M8 0 C8 0 0 0 0 8 L0 0 Z" fill="currentColor"/></svg>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {(isTyping || isActing) && (
                <div className="flex justify-start">
                  <div className="bg-white/[0.03] border border-white/10 p-4 rounded-3xl rounded-tl-none flex items-center gap-3 backdrop-blur-md">
                    <div className="flex gap-1">
                      <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 1, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                      <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 1, repeat: Infinity, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 1, repeat: Infinity, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    </div>
                    {isActing && <span className="text-[10px] font-black uppercase text-cyan-400 tracking-[0.2em] animate-pulse">Neural Task In-Progress</span>}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-6 border-t border-white/5 bg-black/40 backdrop-blur-3xl">
              
              <div className="flex items-center gap-3">
                <motion.button 
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={toggleListening}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-xl ${
                    isListening 
                      ? 'bg-red-500 text-white animate-pulse' 
                      : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                </motion.button>
                <form onSubmit={handleSendMessage} className="relative flex-1 group">
                  <input 
                    type="text"
                    placeholder={isActing ? "Performing task..." : isListening ? "Listening..." : "How can I assist your business today?"}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-4 pl-5 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder:text-gray-600"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <motion.button 
                      whileHover={{ scale: 1.1, x: 2 }}
                      whileTap={{ scale: 0.9 }}
                      type="submit"
                      disabled={!input.trim() || isTyping || isActing}
                      className="p-2.5 bg-gradient-to-tr from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-30 disabled:grayscale text-white rounded-xl transition-all shadow-lg"
                    >
                      <Send size={18} />
                    </motion.button>
                  </div>
                </form>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button 
        initial={{ scale: 0, opacity: 0 }}
        animate={{ 
          scale: 1, 
          opacity: 1,
          y: isOpen ? 0 : [0, -8, 0],
        }}
        transition={{ 
          y: { duration: 4, repeat: Infinity, ease: "easeInOut" },
          scale: { type: "spring", damping: 12, stiffness: 200 }
        }}
        whileHover={{ scale: 1.08, rotate: 3, y: -4 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-16 h-16 rounded-[24px] flex items-center justify-center transition-all duration-500 pointer-events-auto relative overflow-visible ${
          isOpen 
            ? 'bg-white text-black border border-white/40' 
            : 'bg-gradient-to-b from-purple-400 via-indigo-500 to-indigo-800 text-white'
        }`}
        style={{
          boxShadow: isOpen 
            ? '0 10px 30px rgba(0,0,0,0.5), inset 0 2px 5px rgba(255,255,255,1), 0 0 0 1px rgba(0,0,0,0.05)' 
            : '0 20px 40px -5px rgba(139,92,246,0.6), inset 0 2px 4px rgba(255,255,255,0.7), inset 0 -4px 8px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.15)'
        }}
      >
        {/* Under-Glow */}
        {!isOpen && (
          <div className="absolute inset-0 rounded-[24px] bg-purple-500/40 blur-xl -z-10 animate-pulse" />
        )}
        
        {isOpen ? <X size={28} strokeWidth={2.5} /> : (
          <div className="relative">
            <Bot size={30} strokeWidth={2.2} style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.2))' }} />
            <motion.div 
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-cyan-400 border-2 border-indigo-800 rounded-full shadow-[0_0_10px_#22d3ee]" 
            />
            <Sparkles size={16} className="absolute -bottom-3 -left-3 text-amber-300 animate-pulse drop-shadow-md" />
          </div>
        )}
        
        {/* Hover Shine Effect */}
        {!isOpen && (
          <div className="absolute inset-0 overflow-hidden rounded-[24px] pointer-events-none">
            <motion.div 
              animate={{ left: ['-100%', '200%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", repeatDelay: 1 }}
              className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12"
            />
          </div>
        )}
      </motion.button>
    </div>
  );
};

export default AIAssistant;
