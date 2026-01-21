
import React, { useState, useEffect, useRef } from 'react';
import { Save, Building2, User as UserIcon, FileText, Globe, MapPin, Briefcase, Phone, Mail, Sparkles, Loader2, CheckCircle, AlertCircle, Trash2, Plus, ArrowRight, Download, Eye, Camera, Shield, Zap, Info } from 'lucide-react';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { doc, setDoc, updateDoc, collection, addDoc, getDocs, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User, AppDocument, ProfileData } from '../types';

interface ProfileFormProps {
  onBack: () => void;
  user: User | null;
  onUpgrade?: () => void;
}

type TabType = 'business' | 'owner' | 'documents' | 'readiness';

const ProfileForm: React.FC<ProfileFormProps> = ({ onBack, user, onUpgrade }) => {
  const [activeTab, setActiveTab] = useState<TabType>('business');
  const [documents, setDocuments] = useState<AppDocument[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState<string | null>(null);
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
  const [generatedProposal, setGeneratedProposal] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [setCopied] = useState(false);

  // Business Profile State
  const [profile, setProfile] = useState<ProfileData>({
    businessName: user?.businessName || '',
    industry: '',
    registration: '',
    description: '',
    website: '',
    whatsapp: '',
    email: user?.email || '',
    address: '',
    foundedYear: new Date().getFullYear().toString(),
    employeeCount: '1-5',
    ownerName: '',
    ownerID: '',
    ownerBio: ''
  });

  // Initialize AI with the correct Vite environment variable
  const genAI = new GoogleGenerativeAI("AIzaSyEk3OvUtV-P-XjZv3QXcUxcbnJMXH-5U");

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      try {
        const userDoc = doc(db, 'users', user.id);
        const docsRef = collection(db, 'users', user.id, 'documents');
        const docsSnapshot = await getDocs(docsRef);
        
        const fetchedDocs = docsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppDocument));
        setDocuments(fetchedDocs);
      } catch (e) {
        console.error("Error fetching profile data", e);
      }
    };
    fetchProfile();
  }, [user]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleAIAnalyze = async () => {
    if (!profile.description || !profile.industry) {
      alert("Please enter a business description and industry first.");
      return;
    }

    setIsScanning('ai');
    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-3.0-flash-preview",
        generationConfig: { responseMimeType: "application/json" }
      });

      const prompt = `Based on this business: ${profile.description} in the ${profile.industry} industry. 
      Generate a professional 2-sentence vision statement and a list of 3 key business strengths. 
      Return JSON: {"vision": "string", "strengths": ["string", "string", "string"]}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const data = JSON.parse(response.text());
      
      setProfile(prev => ({
        ...prev,
        description: `${prev.description}\n\nVision: ${data.vision}\n\nStrengths: ${data.strengths.join(', ')}`
      }));
    } catch (e) {
      console.error("AI Analysis failed:", e);
    } finally {
      setIsScanning(null);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.id), {
        profile: profile,
        businessName: profile.businessName,
        updatedAt: new Date().toISOString()
      });
      alert("Profile saved successfully!");
    } catch (e) {
      console.error(e);
      alert("Error saving profile.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-10">
        <button onClick={onBack} className="text-gray-400 hover:text-white flex items-center gap-2 font-bold transition-all">
          <ArrowRight className="rotate-180" size={20} /> Back to Dashboard
        </button>
        <button 
          onClick={saveProfile} 
          disabled={isSaving}
          className="bg-purple-600 hover:bg-purple-500 text-white px-8 py-3 rounded-2xl font-black transition-all shadow-xl shadow-purple-500/20 flex items-center gap-2"
        >
          {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
          Save Profile
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-2">
          {[
            { id: 'business', label: 'Business Details', icon: <Building2 size={18} /> },
            { id: 'owner', label: 'Owner Profile', icon: <UserIcon size={18} /> },
            { id: 'documents', label: 'Vault / Documents', icon: <FileText size={18} /> },
            { id: 'readiness', label: 'Funding Proposal', icon: <Sparkles size={18} /> }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl font-bold transition-all text-left ${
                activeTab === tab.id ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div className="lg:col-span-3">
          <div className="glass-panel p-8 rounded-[2.5rem] min-h-[600px] animate-in fade-in slide-in-from-right-4 duration-500">
            {activeTab === 'business' && (
              <div className="space-y-8">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black">Business Information</h3>
                  <button 
                    onClick={handleAIAnalyze}
                    disabled={!!isScanning}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 text-cyan-400 rounded-full text-xs font-black uppercase tracking-widest border border-cyan-500/20 hover:bg-cyan-500/20 transition-all"
                  >
                    {isScanning === 'ai' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    AI Smart Fill
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Company Name</label>
                    <input name="businessName" value={profile.businessName} onChange={handleInputChange} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Industry / Sector</label>
                    <input name="industry" value={profile.industry} onChange={handleInputChange} placeholder="e.g. Agriculture, Tech" className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Business Description</label>
                  <textarea name="description" value={profile.description} onChange={handleInputChange} rows={5} className="w-full bg-white/5 border border-white/10 rounded-3xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none" placeholder="Tell us about your side hustle or business..." />
                </div>
              </div>
            )}

            {activeTab === 'documents' && (
              <div className="space-y-6">
                <h3 className="text-2xl font-black">Document Vault</h3>
                <div className="p-12 border-2 border-dashed border-white/10 rounded-[2.5rem] text-center bg-white/5">
                  <FileText className="mx-auto text-gray-700 mb-4" size={48} />
                  <p className="text-gray-400 font-bold mb-6">Upload your CIPC docs, ID, and Bank Statements</p>
                  <button className="bg-white text-black font-black px-8 py-3 rounded-2xl">Browse Files</button>
                </div>
              </div>
            )}

            {activeTab === 'readiness' && (
              <div className="text-center py-20">
                <Sparkles size={48} className="mx-auto text-purple-500 mb-4" />
                <h3 className="text-2xl font-black mb-4">AI Funding Proposal</h3>
                <p className="text-gray-500 max-w-sm mx-auto mb-8">Ready to pitch? We can generate a professional funding proposal based on your business details.</p>
                <button className="bg-gradient-to-r from-purple-600 to-indigo-600 px-10 py-4 rounded-2xl font-black">Generate Proposal</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileForm;