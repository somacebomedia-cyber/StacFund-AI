import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { AppDocument, User } from '../types';
import { FolderOpen, FileText, Upload, Download, Trash2, Loader2, Image as ImageIcon, File, Info } from 'lucide-react';
import { saveDocumentContent, getDocumentContent, deleteDocumentContent } from '../services/documentStorage';

interface DocumentsVaultProps {
  user: User | null;
}

const DocumentsVault: React.FC<DocumentsVaultProps> = ({ user }) => {
  const [documents, setDocuments] = useState<AppDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchDocs = async () => {
      if (!user) return;
      try {
        const docsRef = collection(db, 'users', user.id, 'documents');
        const docsSnap = await getDocs(docsRef);
        
        const fetchedDocs: AppDocument[] = [];
        docsSnap.forEach(snap => {
          fetchedDocs.push({ id: snap.id, ...snap.data() } as AppDocument);
        });
        
        // Sort by uploadDate descending
        fetchedDocs.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
        setDocuments(fetchedDocs);
      } catch (e) {
        console.error("Failed to fetch documents", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDocs();
  }, [user]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 5 * 1024 * 1024) {
       alert("File is too large. Maximum size is 5MB.");
       return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64 = event.target?.result as string;
          
          const newDoc: Omit<AppDocument, 'id'> = {
            userId: user.id,
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            uploadDate: new Date().toISOString(),
            category: 'Uploaded',
            hasChunks: true
          };

          const docRef = await addDoc(collection(db, 'users', user.id, 'documents'), newDoc);
          
          try {
            await saveDocumentContent(user.id, docRef.id, base64);
          } catch (chunkErr) {
            console.error("Chunk save failed", chunkErr);
            await deleteDoc(docRef); // Cleanup metadata if chunks fail
            throw new Error("Failed to save document content");
          }
          
          setDocuments([{ id: docRef.id, ...newDoc }, ...documents]);
        } catch (err) {
          console.error("Document upload processing failed:", err);
          alert("Failed to upload document content. Please try again.");
        } finally {
          setIsUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Upload error", error);
      setIsUploading(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !window.confirm("Are you sure you want to delete this document?")) return;
    try {
      // Delete chunks first
      await deleteDocumentContent(user.id, id);
      // Delete metadata
      await deleteDoc(doc(db, 'users', user.id, 'documents', id));
      setDocuments(documents.filter(d => d.id !== id));
    } catch (error) {
      console.error("Delete error", error);
    }
  };

  const handleDownload = async (documentObj: AppDocument) => {
    if (!user) return;
    
    // Legacy support for docs that stored content directly
    if (documentObj.content) {
      triggerDownload(documentObj.content, documentObj.name);
      return;
    }
    
    // If it doesn't have chunks or content, it might just be metadata
    if (!documentObj.hasChunks && !documentObj.content) {
      alert("This document's content is not available.");
      return;
    }

    setDownloadingDocId(documentObj.id);
    try {
      const content = await getDocumentContent(user.id, documentObj.id);
      if (content) {
        triggerDownload(content, documentObj.name);
      } else {
        alert("Failed to retrieve document content.");
      }
    } catch (e) {
      console.error("Download error", e);
      alert("An error occurred while preparing the download.");
    } finally {
      setDownloadingDocId(null);
    }
  };

  const triggerDownload = (base64Url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = base64Url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const getFileIcon = (type: string) => {
    if (type.includes('image')) return <ImageIcon size={24} className="text-blue-400" />;
    if (type.includes('pdf')) return <FileText size={24} className="text-red-400" />;
    return <File size={24} className="text-gray-400" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h3 className="text-2xl font-black mb-2 flex items-center gap-2">Documents Vault <FolderOpen size={24} className="text-purple-400" /></h3>
          <p className="text-gray-400 text-sm">All your uploaded and generated documents securely stored in one place.</p>
        </div>
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-sm transition-all shadow-lg"
        >
          {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
          {isUploading ? 'Uploading...' : 'Upload File'}
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          onChange={handleFileChange}
          accept="image/*,.pdf,.doc,.docx"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
        </div>
      ) : documents.length === 0 ? (
        <div className="glass-panel p-20 rounded-[2rem] text-center opacity-70 flex flex-col items-center gap-4 border border-white/5">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-gray-400">
             <FolderOpen size={32} />
          </div>
          <h4 className="text-xl font-bold">Your vault is empty</h4>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">Upload important business documents, ID copies, and certificates to keep them secure and ready for applications.</p>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 text-purple-400 hover:text-purple-300 font-bold text-sm uppercase tracking-wider"
          >
            Upload your first document
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <div 
              key={doc.id}
              className="glass-panel p-5 rounded-2xl border border-white/5 hover:border-white/20 transition-all group flex flex-col"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                  {getFileIcon(doc.type)}
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingDocId === doc.id}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-50"
                    title="Download"
                  >
                    {downloadingDocId === doc.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  </button>
                  <button 
                     onClick={(e) => handleDelete(doc.id, e)}
                     className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                     title="Delete"
                  >
                     <Trash2 size={16} />
                  </button>
                </div>
              </div>
              
              <div className="flex-1">
                 <h4 className="font-bold text-base truncate mb-1" title={doc.name}>{doc.name}</h4>
                 <div className="flex items-center gap-3 text-xs text-gray-500 font-medium">
                   <span>{formatSize(doc.size)}</span>
                   <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                   <span>{new Date(doc.uploadDate).toLocaleDateString()}</span>
                 </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center text-xs">
                <span className="px-2 py-1 rounded bg-white/5 text-gray-400 font-bold uppercase tracking-wider text-[10px]">
                  {doc.category || 'Document'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentsVault;
