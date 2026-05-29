import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User, AppNotification } from '../types';
import { Bell, CheckCircle2, AlertCircle, Info, BellRing, X } from 'lucide-react';

interface NotificationsPanelProps {
  user: User | null;
  onClose: () => void;
  onNavigate?: (page: string) => void;
}

const NotificationsPanel: React.FC<NotificationsPanelProps> = ({ user, onClose, onNavigate }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    // Set up a real-time listener for notifications
    const q = query(
      collection(db, 'users', user.id, 'notifications'),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: AppNotification[] = [];
      snapshot.forEach((docSnap) => {
         notifs.push({ id: docSnap.id, ...docSnap.data() } as AppNotification);
      });
      setNotifications(notifs);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching notifications", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const markAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.id, 'notifications', id), {
        isRead: true
      });
    } catch (err) {
      console.error("Error updating notification", err);
    }
  };
  
  const markAllAsRead = async () => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      const unread = notifications.filter(n => !n.isRead);
      if (unread.length === 0) return;
      
      unread.forEach(n => {
        const notifRef = doc(db, 'users', user.id, 'notifications', n.id);
        batch.update(notifRef, { isRead: true });
      });
      
      await batch.commit();
    } catch (err) {
      console.error("Error marking all as read", err);
    }
  };

  const getIcon = (type?: string, isRead?: boolean) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={20} className={isRead ? 'text-gray-500' : 'text-emerald-400'} />;
      case 'warning':
      case 'alert':
        return <AlertCircle size={20} className={isRead ? 'text-gray-500' : 'text-amber-400'} />;
      default:
        return <Info size={20} className={isRead ? 'text-gray-500' : 'text-purple-400'} />;
    }
  };

  const handleNotificationClick = (n: AppNotification) => {
    if (!n.isRead && user) {
       updateDoc(doc(db, 'users', user.id, 'notifications', n.id), { isRead: true }).catch(console.error);
    }
    if (n.actionPage && onNavigate) {
       onNavigate(n.actionPage);
       onClose();
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="absolute right-0 top-12 mt-2 w-80 max-h-[70vh] bg-[#0A0A18]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 origin-top-right">
      <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
         <div className="flex items-center gap-2">
            <BellRing size={16} className="text-purple-400" />
            <h3 className="font-bold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <span className="bg-purple-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
         </div>
         <div className="flex items-center gap-2">
           {unreadCount > 0 && (
             <button onClick={markAllAsRead} className="text-[10px] uppercase font-bold text-gray-400 hover:text-white transition-colors">
               Mark all read
             </button>
           )}
           <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
             <X size={16} />
           </button>
         </div>
      </div>
      
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {isLoading ? (
          <div className="flex justify-center p-8">
             <div className="w-5 h-5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin"></div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-gray-400 flex flex-col items-center gap-3">
             <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-2">
                <Bell size={24} className="opacity-50" />
             </div>
             <p className="text-sm font-medium">You're all caught up!</p>
             <p className="text-xs text-gray-500">We'll notify you when there's an update on your applications.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
             {notifications.map(n => (
               <div 
                 key={n.id} 
                 onClick={() => handleNotificationClick(n)}
                 className={`p-4 transition-colors cursor-pointer flex gap-3 hover:bg-white/5 ${!n.isRead ? 'bg-purple-900/10' : ''}`}
               >
                  <div className="shrink-0 mt-0.5">
                     {getIcon(n.type, n.isRead)}
                  </div>
                  <div className="flex-1 min-w-0">
                     <h4 className={`text-sm mb-1 ${!n.isRead ? 'font-bold text-white' : 'font-medium text-gray-300'}`}>
                        {n.title}
                     </h4>
                     <p className={`text-xs mb-2 ${!n.isRead ? 'text-gray-300' : 'text-gray-500'}`}>
                        {n.message}
                     </p>
                     <p className="text-[10px] text-gray-500 font-medium">
                        {new Date(n.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}
                     </p>
                  </div>
                  {!n.isRead && (
                    <button 
                      onClick={(e) => markAsRead(n.id, e)}
                      className="shrink-0 w-2 h-2 rounded-full bg-purple-500 self-center"
                      title="Mark as read"
                    />
                  )}
               </div>
             ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationsPanel;
