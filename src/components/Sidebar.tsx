import React from 'react';
import { Plus, MessageSquare, Settings, Trash2, User as UserIcon, Cpu, LogOut, X, Sparkles, Crown } from 'lucide-react';
import { Chat, User, UserPlan } from '../types';
import { AI_NAME, AI_AVATAR_URL } from '../constants';
import { translations } from '../lib/translations';
import { Language } from '../types';
import { cn } from '../lib/utils';
import { logout } from '../firebase';

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  language: Language;
  user: User | null;
  plan?: UserPlan;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onOpenSettings: (category?: string) => void;
  onLogin?: () => void;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  chats,
  activeChatId,
  language,
  user,
  plan = 'free',
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onOpenSettings,
  onLogin,
  onClose,
}) => {
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);
  const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);
  const t = translations[language].sidebar;

  const handleTouchStart = (id: string) => {
    longPressTimer.current = setTimeout(() => {
      setDeletingId(id);
      if (window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 600);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#070709] text-white w-64 border-r border-white/10 relative">
      {/* Delete Confirmation Overlay */}
      {deletingId && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 text-center">
          <div className="space-y-4">
            <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto text-red-500">
              <Trash2 size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold">{t.deleteConfirm}</h3>
              <p className="text-xs text-gray-400">{t.deleteIrreversible}</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  onDeleteChat(deletingId);
                  setDeletingId(null);
                }}
                className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                {t.confirm}
              </button>
              <button
                onClick={() => setDeletingId(null)}
                className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Overlay */}
      {showLogoutConfirm && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 text-center">
          <div className="space-y-4 max-w-[220px]">
            <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto text-indigo-400">
              <LogOut size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white">{t.logoutConfirmTitle}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">{t.logoutConfirmDesc}</p>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  logout();
                }}
                className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-md"
              >
                {t.logoutBtn}
              </button>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="w-full py-2 bg-white/10 hover:bg-white/15 text-gray-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branding Section */}
      <div className="p-4 flex items-center justify-between border-b border-white/5 bg-[#070709]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/20 ring-1 ring-white/10 overflow-hidden shrink-0">
            <img 
              src={AI_AVATAR_URL} 
              alt="Logo" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                if (target.parentElement) {
                  target.parentElement.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-indigo-600 text-white font-bold text-xs">T</div>`;
                }
              }}
            />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight">{AI_NAME}</span>
            <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-[0.2em]">{t.byVitronix}</span>
          </div>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-lg text-gray-400 md:hidden transition-colors"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <div className="p-3">
        <button
          onClick={onNewChat}
          className="flex items-center gap-3 w-full p-3 border border-white/15 bg-white/[0.02] rounded-xl hover:bg-white/5 transition-all text-sm font-medium shadow-sm active:scale-[0.98] hover:border-indigo-500/30 cursor-pointer"
        >
          <Plus size={16} className="text-indigo-400" />
          {t.newChat}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 scrollbar-thin scrollbar-thumb-white/10">
        {chats.length === 0 ? (
          <div className="text-xs text-gray-500 text-center mt-8 px-4 leading-relaxed">
            {t.historyEmpty}
          </div>
        ) : (
          chats.map((chat) => (
            <div
              key={chat.id}
              className={cn(
                "group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all text-sm relative select-none",
                activeChatId === chat.id 
                  ? "bg-[#14151c] text-white border border-indigo-500/20 font-medium pr-10 shadow-sm" 
                  : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]"
              )}
              onClick={() => onSelectChat(chat.id)}
              onTouchStart={() => handleTouchStart(chat.id)}
              onTouchEnd={handleTouchEnd}
              onTouchMove={handleTouchEnd}
            >
              <MessageSquare size={16} className={cn("shrink-0", activeChatId === chat.id ? "text-indigo-400" : "text-gray-500")} />
              <span className="flex-1 truncate">{chat.title || t.newChat}</span>
              
              <div className={cn(
                "absolute right-2 flex items-center gap-1 transition-opacity",
                activeChatId === chat.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingId(chat.id);
                  }}
                  className="p-1 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-3 border-t border-white/10 space-y-1 bg-[#070709]">
        <button
          onClick={() => {
            onOpenSettings();
            if (window.innerWidth < 768) onClose?.();
          }}
          className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/[0.04] transition-colors text-sm text-gray-300 hover:text-white cursor-pointer"
        >
          <Settings size={16} className="text-gray-400" />
          {t.settings}
        </button>

        {user ? (
          <div className="flex items-center justify-between gap-2 w-full p-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors text-sm group">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-indigo-600 flex items-center justify-center text-white ring-1 ring-white/10 shrink-0">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <UserIcon size={15} />
                )}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate font-medium text-xs text-white leading-tight">{user.displayName || user.email?.split('@')[0]}</span>
                </div>
                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <span className="text-[10px] text-gray-500 truncate">{user.email}</span>
                </div>
              </div>
              
              {/* Badge Plan Free / Pro */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSettings('account');
                  if (window.innerWidth < 768) onClose?.();
                }}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 tracking-wider uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer",
                  plan === 'pro'
                    ? "bg-gradient-to-r from-amber-400 to-amber-500 text-black border border-amber-300 shadow-amber-500/25 font-black"
                    : "bg-white/10 text-gray-300 hover:bg-indigo-600 hover:text-white border border-white/10 hover:border-indigo-500"
                )}
                title={plan === 'pro' ? t.proActive : t.freeAction}
              >
                {plan === 'pro' ? (
                  <>
                    <Crown size={10} className="text-black fill-black" />
                    <span>{t.proBadge}</span>
                  </>
                ) : (
                  <span>{t.freeBadge}</span>
                )}
              </button>
            </div>
            <button 
              onClick={() => setShowLogoutConfirm(true)}
              className="p-1.5 hover:bg-white/10 rounded-md text-gray-400 hover:text-red-400 transition-all opacity-70 group-hover:opacity-100 shrink-0 cursor-pointer"
              title={t.logoutBtn}
            >
              <LogOut size={13} />
            </button>
          </div>
        ) : (
          /* Non connecté / Mode Invité */
          <div className="flex items-center justify-between gap-2 w-full p-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors text-sm group">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center text-gray-400 ring-1 ring-white/10 shrink-0">
                <UserIcon size={15} />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate font-medium text-xs text-white leading-tight">{t.guestMode}</span>
                </div>
                {onLogin ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onLogin();
                      if (window.innerWidth < 768) onClose?.();
                    }}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 hover:underline text-left truncate mt-0.5 cursor-pointer"
                  >
                    {t.signIn}
                  </button>
                ) : (
                  <span className="text-[10px] text-gray-500 truncate">{t.notConnected}</span>
                )}
              </div>
              
              {/* Badge Plan Free pour invité */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSettings('account');
                  if (window.innerWidth < 768) onClose?.();
                }}
                className="px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 tracking-wider uppercase transition-all shadow-sm flex items-center gap-1 bg-white/10 text-gray-300 hover:bg-indigo-600 hover:text-white border border-white/10 hover:border-indigo-500 cursor-pointer"
                title={t.freeAction}
              >
                <span>{t.freeBadge}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

