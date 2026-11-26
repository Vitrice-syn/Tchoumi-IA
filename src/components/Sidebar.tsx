import React from 'react';
import {
  Search,
  PanelLeftClose,
  SquarePen,
  Image as ImageIcon,
  BarChart3,
  Brain,
  SlidersHorizontal,
  LayoutGrid,
  ListFilter,
  Trash2,
  Settings,
  LogOut,
  X,
  User as UserIcon,
} from 'lucide-react';
import { Chat, User, UserPlan, Language } from '../types';
import { AI_NAME } from '../constants';
import { translations } from '../lib/translations';
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
  onQuickImageMode?: () => void;
  onLogin?: () => void;
  onClose?: () => void;
}

const SidebarStarIcon: React.FC = () => {
  const gradId = React.useId();
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="w-6 h-6 shrink-0">
      <defs>
        <linearGradient id={gradId} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="50%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <path
        d="M12 2C12.35 7.45 16.55 11.65 22 12C16.55 12.35 12.35 16.55 12 22C11.65 16.55 7.45 12.35 2 12C7.45 11.65 11.65 7.45 12 2Z"
        fill={`url(#${gradId})`}
      />
    </svg>
  );
};

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
  onQuickImageMode,
  onLogin,
  onClose,
}) => {
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterMediaOnly, setFilterMediaOnly] = React.useState(false);
  const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const t = translations[language].sidebar;

  React.useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 40);
    }
  }, [isSearchOpen]);

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

  const filteredChats = React.useMemo(() => {
    return chats.filter((chat) => {
      if (filterMediaOnly) {
        const hasMedia = chat.messages.some(
          (m) =>
            (m.attachments && m.attachments.length > 0) ||
            m.content.includes('pollinations.ai') ||
            m.content.includes('![')
        );
        if (!hasMedia) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = (chat.title || '').toLowerCase().includes(q);
        const msgMatch = chat.messages.some((m) =>
          (m.content || '').toLowerCase().includes(q)
        );
        return titleMatch || msgMatch;
      }

      return true;
    });
  }, [chats, filterMediaOnly, searchQuery]);

  const userInitial = React.useMemo(() => {
    if (!user) return 'T';
    const label = user.displayName || user.email || 'T';
    return label.trim().charAt(0).toUpperCase();
  }, [user]);

  const navItems = [
    {
      id: 'new-chat',
      label: language === 'en' ? 'New chat' : 'Nouvelle discussion',
      icon: SquarePen,
      onClick: () => {
        onNewChat();
        if (window.innerWidth < 768) onClose?.();
      },
    },
    {
      id: 'images',
      label: 'Images',
      icon: ImageIcon,
      onClick: () => {
        if (onQuickImageMode) {
          onQuickImageMode();
        } else {
          onNewChat();
        }
        if (window.innerWidth < 768) onClose?.();
      },
    },
    {
      id: 'analytics',
      label: language === 'en' ? 'Data Analytics' : 'Analyse de données',
      icon: BarChart3,
      onClick: () => {
        onOpenSettings('analytics');
        if (window.innerWidth < 768) onClose?.();
      },
    },
    {
      id: 'medical',
      label: language === 'en' ? 'Brain MRI' : 'IRM & Neuro-imagerie',
      icon: Brain,
      onClick: () => {
        onOpenSettings('medical');
        if (window.innerWidth < 768) onClose?.();
      },
    },
    {
      id: 'personalize',
      label: language === 'en' ? 'Customize' : 'Personnaliser',
      icon: SlidersHorizontal,
      onClick: () => {
        onOpenSettings('personalization');
        if (window.innerWidth < 768) onClose?.();
      },
    },
    {
      id: 'apps',
      label: language === 'en' ? 'Apps' : 'Applications',
      icon: LayoutGrid,
      onClick: () => {
        onOpenSettings('apps');
        if (window.innerWidth < 768) onClose?.();
      },
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#131418] text-white w-64 sm:w-[272px] border-r border-white/[0.06] relative select-none">
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

      {/* Top Gemini-style Header */}
      <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <SidebarStarIcon />
          <span className="text-[17px] font-semibold tracking-tight text-white whitespace-nowrap truncate">
            {AI_NAME}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen((prev) => {
                if (prev) setSearchQuery('');
                return !prev;
              });
            }}
            className={cn(
              "p-2 rounded-full transition-colors cursor-pointer",
              isSearchOpen
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/[0.07]"
            )}
            title={language === 'en' ? 'Search chats' : 'Rechercher une discussion'}
            aria-label={language === 'en' ? 'Search chats' : 'Rechercher une discussion'}
          >
            <Search size={17} />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/[0.07] transition-colors cursor-pointer"
              title={language === 'en' ? 'Collapse sidebar' : 'Réduire le menu'}
              aria-label={language === 'en' ? 'Collapse sidebar' : 'Réduire le menu'}
            >
              <PanelLeftClose size={17} />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Search Input */}
      {isSearchOpen && (
        <div className="px-3 pb-2 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.06] border border-white/10 focus-within:border-indigo-400/50">
            <Search size={13} className="text-gray-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'en' ? 'Search...' : 'Rechercher...'}
              className="w-full bg-transparent text-xs text-white placeholder-gray-400 outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-gray-400 hover:text-white cursor-pointer"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Clean Gemini-style Action Navigation */}
      <nav className="px-2.5 py-1 space-y-0.5 shrink-0">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-full text-[13.5px] font-medium text-gray-200 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer text-left"
          >
            <item.icon size={17} className="text-gray-300 shrink-0" strokeWidth={1.8} />
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Section Header + Filter */}
      <div className="px-4 pt-4 pb-1.5 flex items-center justify-between shrink-0">
        <span className="text-xs font-medium text-gray-400">
          {filterMediaOnly
            ? (language === 'en' ? 'With media' : 'Avec médias')
            : (language === 'en' ? 'All' : 'Toutes')}
        </span>
        <button
          type="button"
          onClick={() => setFilterMediaOnly((prev) => !prev)}
          className={cn(
            "p-1.5 rounded-full transition-colors cursor-pointer",
            filterMediaOnly
              ? "bg-indigo-500/20 text-indigo-300"
              : "text-gray-400 hover:text-white hover:bg-white/[0.07]"
          )}
          title={
            filterMediaOnly
              ? (language === 'en' ? 'Show all chats' : 'Afficher toutes les discussions')
              : (language === 'en' ? 'Filter chats with media' : 'Filtrer les discussions avec médias')
          }
          aria-label="Filter chats"
        >
          <ListFilter size={15} />
        </button>
      </div>

      {/* Scrollable Conversations List */}
      <div className="flex-1 overflow-y-auto px-2.5 py-1 space-y-0.5 scrollbar-thin scrollbar-thumb-white/10">
        {filteredChats.length === 0 ? (
          <div className="text-xs text-gray-500 text-center mt-6 px-4 leading-relaxed">
            {searchQuery || filterMediaOnly
              ? (language === 'en' ? 'No matching chats.' : 'Aucune discussion trouvée.')
              : t.historyEmpty}
          </div>
        ) : (
          filteredChats.map((chat) => (
            <div
              key={chat.id}
              className={cn(
                "group flex items-center justify-between gap-2 px-3.5 py-2 rounded-full cursor-pointer transition-colors text-[13.5px] relative",
                activeChatId === chat.id
                  ? "bg-[#22252f] text-white font-medium"
                  : "text-gray-300 hover:text-white hover:bg-white/[0.05]"
              )}
              onClick={() => onSelectChat(chat.id)}
              onTouchStart={() => handleTouchStart(chat.id)}
              onTouchEnd={handleTouchEnd}
              onTouchMove={handleTouchEnd}
            >
              <span className="flex-1 truncate">{chat.title || t.newChat}</span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeletingId(chat.id);
                }}
                className={cn(
                  "p-1 rounded-full hover:text-red-400 transition-opacity shrink-0 cursor-pointer",
                  activeChatId === chat.id ? "opacity-75 hover:opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                title={t.deleteConfirm}
                aria-label={t.deleteConfirm}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Bottom Account & Settings Bar */}
      <div className="px-3 py-2.5 border-t border-white/[0.06] flex items-center justify-between gap-1.5 shrink-0 bg-[#131418]">
        <button
          type="button"
          onClick={() => {
            if (user) {
              onOpenSettings('account');
            } else if (onLogin) {
              onLogin();
            } else {
              onOpenSettings('account');
            }
            if (window.innerWidth < 768) onClose?.();
          }}
          className="flex items-center gap-2.5 min-w-0 flex-1 p-1.5 rounded-full hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
        >
          <div className="w-8 h-8 rounded-full overflow-hidden bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt="User"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : user ? (
              <span>{userInitial}</span>
            ) : (
              <UserIcon size={15} />
            )}
          </div>
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="truncate text-[13.5px] font-medium text-gray-100">
              {user ? (user.displayName || user.email?.split('@')[0]) : t.signIn}
            </span>
            {plan && plan !== 'free' && (
              <span
                className={cn(
                  "text-[10px] font-semibold shrink-0",
                  plan === 'ultra'
                    ? "text-violet-300"
                    : plan === 'pro'
                      ? "text-amber-400"
                      : "text-sky-400"
                )}
              >
                {plan === 'ultra' ? t.ultraBadge : plan === 'pro' ? t.proBadge : t.plusBadge}
              </span>
            )}
          </div>
        </button>

        <div className="flex items-center gap-0.5 shrink-0">
          {user && (
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="p-2 rounded-full text-gray-400 hover:text-red-400 hover:bg-white/[0.07] transition-colors cursor-pointer"
              title={t.logoutBtn}
              aria-label={t.logoutBtn}
            >
              <LogOut size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onOpenSettings();
              if (window.innerWidth < 768) onClose?.();
            }}
            className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/[0.07] transition-colors cursor-pointer"
            title={t.settings}
            aria-label={t.settings}
          >
            <Settings size={17} />
          </button>
        </div>
      </div>
    </div>
  );
};
