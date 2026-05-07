import React, { useRef, useState } from 'react';
import { Camera, Image as ImageIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { updateDoc, doc } from 'firebase/firestore';
import { db, auth, hasValidFirebaseConfig } from '../services/firebase';

interface GlassAvatarProps {
  initialLogoUrl?: string;
  onUpdate?: (newLogoUrl: string) => void;
  businessName: string;
}

const GlassAvatar: React.FC<GlassAvatarProps> = ({ initialLogoUrl, onUpdate, businessName }) => {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxDim) {
              height *= maxDim / width;
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width *= maxDim / height;
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/png'));
          } else {
            reject(new Error('Failed to get canvas context'));
          }
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        if (e.target?.result) {
          img.src = e.target.result as string;
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      const dataUrl = await resizeImage(file);
      setLogoUrl(dataUrl);
      if (onUpdate) onUpdate(dataUrl);

      // Save to Firestore if available
      const user = auth.currentUser;
      if (user && hasValidFirebaseConfig()) {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { logoUrl: dataUrl });
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to process image. Try a smaller file.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div 
      className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full cursor-pointer group flex-shrink-0 z-10"
      onClick={() => fileInputRef.current?.click()}
    >
      {/* Dynamic Background aura behind the helmet */}
      <div className="absolute inset-[-10px] bg-purple-500/20 rounded-full blur-xl group-hover:bg-purple-500/40 transition-all duration-500"></div>

      {/* Shimmering Metallic Ring */}
      <div className="absolute inset-[-6px] rounded-full bg-gradient-to-tr from-gray-400 via-gray-100 to-gray-500 shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.8)] overflow-hidden">
        {/* Animated metal glare */}
        <motion.div
          animate={{ x: ['-200%', '200%'] }}
          transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
          className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white to-transparent opacity-70 transform skew-x-12"
        ></motion.div>
        
        {/* Inner shadow to give the ring depth before the glass starts */}
        <div className="absolute inset-[3px] rounded-full bg-[#0a0f16] shadow-[inset_0_4px_10px_rgba(0,0,0,0.8)]" />
      </div>

      {/* The interior with the 2D logo */}
      <div className="absolute inset-[0px] rounded-full overflow-hidden bg-white/5 flex items-center justify-center p-3">
        {logoUrl ? (
          <img src={logoUrl} alt={businessName} className="w-full h-full object-contain drop-shadow-md" />
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-400 opacity-60">
            <ImageIcon size={32} />
          </div>
        )}
      </div>

      {/* The 3D Glass Dome Overlay */}
      <div className="absolute inset-0 rounded-full border border-white/40 
        shadow-[inset_0_4px_10px_rgba(255,255,255,0.4),inset_0_-8px_16px_rgba(0,0,0,0.5),0_10px_20px_rgba(0,0,0,0.4)] 
        bg-gradient-to-br from-white/10 to-transparent transition-all duration-300 pointer-events-none overflow-hidden">
        
        {/* Main top highlight (dome curvature reflections) */}
        <div className="absolute top-[2%] left-[10%] w-[80%] h-[40%] bg-gradient-to-b from-white/70 to-transparent rounded-[50%] blur-[1px]"></div>
        
        {/* Subtle rim light on the bottom */}
        <div className="absolute bottom-[2%] left-[10%] w-[80%] h-[15%] bg-white/20 rounded-[50%] blur-[3px]"></div>
      </div>
      
      {/* Hover State Upload Indicator (Floating Pill at the bottom) */}
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 group-hover:-translate-y-4 transition-all flex items-center justify-center text-white border border-white/20 shadow-xl pointer-events-none z-20">
        {isUploading ? (
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full"></div>
          </motion.div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Camera size={12} />
            <span className="text-[9px] font-bold uppercase tracking-widest">Update</span>
          </div>
        )}
      </div>
      
      <input 
        type="file" 
        className="hidden" 
        ref={fileInputRef} 
        accept="image/*" 
        onChange={handleFileChange} 
      />
    </div>
  );
};

export default GlassAvatar;
