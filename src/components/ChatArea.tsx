import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Cpu, ChevronDown, AlertCircle, Loader2, Sparkles, 
  Menu, X, ChevronRight, LogIn, Mic, MicOff, Languages, 
  Database, Trash2, Shield, Bell, Palette, LayoutGrid, 
  Lock, Users, User as UserIcon, Settings as SettingsIcon, 
  Check, Plus, Image as ImageIcon, FileText, Video, Paperclip, 
  AudioLines, ArrowUp, ChevronLeft, Square, Play, Atom,
  Table as TableIcon, Volume2, Sparkle, BarChart3, Activity,
  Brain, Link2, CheckCircle2, Sliders, ExternalLink, Radio,
  Layers, Key, Eye, EyeOff, RefreshCw, FileSpreadsheet, Mail, MessageSquare,
  Crown, Zap, ShieldCheck, Star, CreditCard
} from 'lucide-react';
import { Message, AppSettings, ModelProvider, Attachment, ConnectedApp } from '../types';
import { MessageItem } from './MessageItem';
import { AI_NAME, AI_AVATAR_URL } from '../constants';
import { translations } from '../lib/translations';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc, collection, onSnapshot, query, orderBy } from 'firebase/firestore';

interface ChatAreaProps {
  messages: Message[];
  settings: AppSettings;
  userPhotoURL?: string | null;
  userEmail?: string | null;
  userDisplayName?: string | null;
  isLoggedIn?: boolean;
  settingsCategory?: string;
  onSettingsCategoryChange?: (category: string) => void;
  onSendMessage: (content: string, attachments?: Attachment[]) => void;
  onUpdateSettings: (settings: AppSettings) => void;
  onToggleSidebar?: () => void;
  onLogin?: () => void;
  isSidebarOpen?: boolean;
  isLoading: boolean;
  error: string | null;
  activeView: 'chat' | 'settings';
  onViewChange: (view: 'chat' | 'settings') => void;
  onClearHistory: () => void;
  onStopGeneration?: () => void;
  onContinueGeneration?: () => void;
  onEditMessage?: (id: string, newContent: string) => void;
  onRetry?: (messageId?: string) => void;
  wasInterrupted?: boolean;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  settings,
  userPhotoURL,
  userEmail,
  userDisplayName,
  isLoggedIn,
  settingsCategory: settingsCategoryProp,
  onSettingsCategoryChange,
  onSendMessage,
  onUpdateSettings,
  onToggleSidebar,
  onLogin,
  isSidebarOpen = false,
  isLoading,
  error,
  activeView,
  onViewChange,
  onClearHistory,
  onStopGeneration,
  onContinueGeneration,
  onEditMessage,
  onRetry,
  wasInterrupted = false,
}) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [internalCategory, setInternalCategory] = useState('general');
  const settingsCategory = settingsCategoryProp || internalCategory;
  const setSettingsCategory = (cat: string) => {
    setInternalCategory(cat);
    if (onSettingsCategoryChange) onSettingsCategoryChange(cat);
  };
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [showProUpgradeModal, setShowProUpgradeModal] = useState(false);
  const [upgradeNotification, setUpgradeNotification] = useState<string | null>(null);
  
  // App Connection Modal state
  const [connectingApp, setConnectingApp] = useState<{
    id: string;
    name: string;
    icon: any;
    color: string;
    category: string;
    defaultAccount?: string;
    permissions: string[];
    description: string;
  } | null>(null);
  const [appAccountInput, setAppAccountInput] = useState('');
  const [appApiKeyInput, setAppApiKeyInput] = useState('');
  const [isSubmittingAppConnect, setIsSubmittingAppConnect] = useState(false);
  
  // Founder management state
  const isFounder = userEmail === 'ronysite4@gmail.com';
  const [founderTargetEmail, setFounderTargetEmail] = useState('');
  const [proUsersList, setProUsersList] = useState<{ id: string; email: string; status: string; activatedAt?: number }[]>([]);
  const [isSavingProUser, setIsSavingProUser] = useState(false);
  const [founderActionMsg, setFounderActionMsg] = useState<string | null>(null);

  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const t = translations[settings.language].chat;
  const tSettings = translations[settings.language].settings;
  const tProModal = translations[settings.language].proModal;

  // Listen to Pro users collection if Founder
  useEffect(() => {
    if (!isFounder) return;
    try {
      const q = collection(db, 'pro_users');
      const unsub = onSnapshot(q, (snapshot) => {
        const list: { id: string; email: string; status: string; activatedAt?: number }[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as any);
        });
        setProUsersList(list);
      }, (err) => {
        console.error("Error loading pro users:", err);
      });
      return () => unsub();
    } catch (e) {
      console.error(e);
    }
  }, [isFounder]);

  const handleFounderActivatePro = async (emailToActivate?: string) => {
    const target = (emailToActivate || founderTargetEmail).toLowerCase().trim();
    if (!target || !target.includes('@')) {
      setFounderActionMsg("Veuillez saisir une adresse email valide.");
      return;
    }
    setIsSavingProUser(true);
    try {
      await setDoc(doc(db, 'pro_users', target), {
        email: target,
        status: 'active',
        activatedAt: Date.now(),
        activatedBy: 'founder'
      }, { merge: true });
      setFounderActionMsg(`Plan Pro activé avec succès pour ${target} ! 🚀`);
      if (!emailToActivate) setFounderTargetEmail('');
      setTimeout(() => setFounderActionMsg(null), 4000);
    } catch (err: any) {
      setFounderActionMsg(`Erreur : ${err.message || 'Impossible d\'activer le plan'}`);
    } finally {
      setIsSavingProUser(false);
    }
  };

  const handleFounderDeactivatePro = async (targetEmail: string) => {
    const target = targetEmail.toLowerCase().trim();
    setIsSavingProUser(true);
    try {
      await setDoc(doc(db, 'pro_users', target), {
        email: target,
        status: 'inactive',
        deactivatedAt: Date.now()
      }, { merge: true });
      setFounderActionMsg(`Plan Pro désactivé pour ${target}.`);
      setTimeout(() => setFounderActionMsg(null), 4000);
    } catch (err: any) {
      setFounderActionMsg(`Erreur : ${err.message || 'Impossible de désactiver'}`);
    } finally {
      setIsSavingProUser(false);
    }
  };

  useEffect(() => {
    if (micNotice) {
      const timer = setTimeout(() => setMicNotice(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [micNotice]);

  const COMMON_PROMPTS = settings.language === 'en' ? [
    "Explain Schrödinger's equation and Maxwell's laws with LaTeX formulas",
    "Generate an image of a futuristic African cyberpunk city in 2080",
    "Generate a comparative table of SQL vs NoSQL databases",
    "Solve a complex integral step by step with LaTeX",
    "Demonstrate Pythagoras' theorem and Newton's laws of motion",
    "Generate a forecasted budget sheet for a tech project",
    "Generate a 4-week programming curriculum study plan",
    "Generate a comparative table of React, Vue and Angular frameworks",
    "Create a breakdown of the most in-demand programming languages",
    "Who is Tchoumi Vitrice?",
    "How to automate emails with Python?",
    "How to code a React component with Tailwind CSS?",
    "How to build a mobile app with AI?",
    "How does blockchain technology work?"
  ] : [
    "Explique l'équation de Schrödinger et les lois de Maxwell avec formules LaTeX",
    "Génère une image d'une ville futuriste africaine en 2080 cyberpunk",
    "Génère un tableau comparatif des bases de données SQL vs NoSQL",
    "Résous une intégrale complexe étape par étape avec LaTeX",
    "Démontre le théorème de Pythagore et les équations de Newton",
    "Génère un tableau de budget prévisionnel pour un projet tech",
    "Génère un tableau de planning d'études en programmation sur 4 semaines",
    "Génère un tableau comparatif des frameworks React, Vue et Angular",
    "Fais-moi un tableau des langages de programmation les plus demandés",
    "Qui est Tchoumi Vitrice ?",
    "Comment automatiser mes emails avec Python ?",
    "Comment coder un composant React avec Tailwind ?",
    "Comment créer une application mobile avec IA ?",
    "Comment utiliser l'intelligence artificielle ?",
    "Comment fonctionne la blockchain ?"
  ];

  useEffect(() => {
    if (input.trim().length > 0) {
      const filtered = COMMON_PROMPTS.filter(p => 
        p.toLowerCase().includes(input.toLowerCase()) && 
        p.toLowerCase() !== input.toLowerCase()
      ).slice(0, 3);
      setAutocompleteSuggestions(filtered);
    } else {
      setAutocompleteSuggestions([]);
    }
  }, [input, settings.language]);

  const handleFileClick = () => {
    if (!isLoggedIn && onLogin) {
      onLogin();
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      if (!isLoggedIn && onLogin) {
        onLogin();
        return;
      }
      setAttachedFiles(prev => [...prev, ...files]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    // Initialize Speech Recognition safely
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = settings.language === 'fr' ? 'fr-FR' : 'en-US';

        recognition.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0])
            .map((result: any) => result.transcript)
            .join('');
          
          if (event.results[0] && event.results[0].isFinal) {
            setInput(prev => prev + (prev ? ' ' : '') + transcript);
            setIsListening(false);
          }
        };

        recognition.onerror = (event: any) => {
          setIsListening(false);
          const errType = event?.error;
          if (errType === 'not-allowed' || errType === 'service-not-allowed') {
            setMicNotice(t.micNotAllowed);
          } else if (errType === 'audio-capture') {
            setMicNotice(t.micNoDevice);
          } else if (errType === 'network') {
            setMicNotice(settings.language === 'en' ? "Voice recognition connection error." : "Erreur de connexion pour la reconnaissance vocale.");
          } else if (errType !== 'no-speech' && errType !== 'aborted') {
            setMicNotice(settings.language === 'en' ? "Voice input was interrupted." : "La saisie vocale a rencontré une interruption.");
          }
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      } catch {
        recognitionRef.current = null;
      }
    }
  }, [settings.language]);

  const toggleListening = async () => {
    if (!isLoggedIn && onLogin) {
      onLogin();
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicNotice("La reconnaissance vocale n'est pas supportée par ce navigateur.");
      return;
    }
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Safe ignore
      }
      setIsListening(false);
    } else {
      try {
        // Proactively request microphone permission to avoid abrupt silent blocks
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (micErr: any) {
            setMicNotice("Accès micro refusé. Activez le micro dans les réglages du site.");
            return;
          }
        }
        setMicNotice(null);
        recognitionRef.current?.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((input.trim() || attachedFiles.length > 0) && !isLoading) {
      let finalContent = input.trim();
      
      // Read attachments with base64 for Vision analysis or text for CSV/Data
      const attachmentsData: Attachment[] = await Promise.all(
        attachedFiles.map(file => {
          return new Promise<Attachment>((resolve) => {
            const isTextData = file.name.endsWith('.csv') || file.name.endsWith('.json') || file.name.endsWith('.tsv') || file.name.endsWith('.txt');
            
            if (isTextData) {
              const textReader = new FileReader();
              textReader.onload = () => {
                const text = textReader.result as string;
                resolve({
                  name: file.name,
                  type: file.type || 'text/plain',
                  size: file.size,
                  dataUrl: `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`,
                  mimeType: 'text/plain',
                });
              };
              textReader.readAsText(file);
            } else if (file.type.startsWith('image/')) {
              const reader = new FileReader();
              reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                  const canvas = document.createElement('canvas');
                  let { width, height } = img;
                  const maxDim = 900;
                  if (width > maxDim || height > maxDim) {
                    if (width > height) {
                      height = Math.round((height * maxDim) / width);
                      width = maxDim;
                    } else {
                      width = Math.round((width * maxDim) / height);
                      height = maxDim;
                    }
                  }
                  canvas.width = width;
                  canvas.height = height;
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
                    resolve({
                      name: file.name,
                      type: 'image/jpeg',
                      size: Math.round((compressedDataUrl.length * 3) / 4),
                      dataUrl: compressedDataUrl,
                      mimeType: 'image/jpeg',
                    });
                  } else {
                    resolve({
                      name: file.name,
                      type: file.type,
                      size: file.size,
                      dataUrl: event.target?.result as string,
                      mimeType: file.type,
                    });
                  }
                };
                img.onerror = () => {
                  resolve({
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    dataUrl: event.target?.result as string,
                    mimeType: file.type,
                  });
                };
                img.src = event.target?.result as string;
              };
              reader.readAsDataURL(file);
            } else {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                resolve({
                  name: file.name,
                  type: file.type || 'application/octet-stream',
                  size: file.size,
                  dataUrl,
                  mimeType: file.type || 'application/octet-stream',
                });
              };
              reader.readAsDataURL(file);
            }
          });
        })
      );

      if (!finalContent && attachmentsData.length > 0) {
        const hasDataFile = attachmentsData.some(a => a.name.match(/\.(csv|json|tsv|xlsx|txt)$/i));
        finalContent = settings.language === 'en'
          ? (hasDataFile 
              ? "Perform an advanced data analysis on this dataset, compute exact statistical metrics (totals, averages, deviations, trends), and generate appropriate interactive charts."
              : "Analyze this image / document in detail.")
          : (hasDataFile 
              ? "Effectue une analyse de données avancée sur ce fichier, calcule les métriques statistiques exactes (total, moyennes, écarts, tendances) et génère les graphiques et courbes appropriés." 
              : "Analyse cette image / document en détail.");
      }

      onSendMessage(finalContent, attachmentsData);
      setInput('');
      setAttachedFiles([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#000000] relative overflow-hidden">
      {/* Header */}
      <div className="shrink-0 z-30 flex items-center justify-between p-3 bg-black/90 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-200">
          {/* Mobile Toggle */}
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-2 mr-1 hover:bg-white/5 rounded-lg text-gray-400 md:hidden transition-colors"
            >
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          )}

          <div className="px-3 py-1.5 bg-white/[0.04] rounded-xl flex items-center gap-2 border border-white/10 text-white font-semibold">
            <Cpu size={14} className="text-indigo-400" />
            {AI_NAME}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isLoggedIn && onLogin && (
            <button
              onClick={onLogin}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
            >
              <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center p-0.5">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-full h-full" />
              </div>
              <span className="hidden sm:inline">{settings.language === 'en' ? "Sign In" : "Se connecter"}</span>
            </button>
          )}
          <button 
            onClick={() => {
              if (activeView === 'settings' && settingsCategory === 'account') {
                onViewChange('chat');
              } else {
                onSettingsCategoryChange?.('account');
                setShowMobileDetail(true);
                onViewChange('settings');
              }
            }}
            className={cn(
              "p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center",
              activeView === 'settings' && settingsCategory === 'account' ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" : "hover:bg-white/5 text-gray-400 hover:text-white"
            )}
            title={settings.language === 'en' ? "Account & Plan" : "Compte & Formule"}
          >
            <Sparkles size={18} />
          </button>
        </div>
      </div>

      {activeView === 'settings' ? (
        <div className="flex-1 flex bg-[#070709] overflow-hidden relative">
          {/* Settings Sidebar */}
          <div className={cn(
            "w-full md:w-64 border-r border-white/10 bg-[#070709] flex flex-col h-full overflow-hidden transition-all duration-300",
            showMobileDetail ? "hidden md:flex" : "flex"
          )}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 pb-3 border-b border-white/10 shrink-0">
              <h2 className="text-xl font-bold text-white">{tSettings.title}</h2>
              <button 
                onClick={() => onViewChange('chat')}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
                title="Fermer"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Scrollable Categories List */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1.5 scrollbar-thin scrollbar-thumb-white/20 hover:scrollbar-thumb-white/30 scrollbar-track-transparent">
              {[
                { id: 'analytics', icon: BarChart3, label: tSettings.categories.analytics },
                { id: 'apps', icon: LayoutGrid, label: tSettings.categories.apps },
                { id: 'medical', icon: Brain, label: tSettings.categories.medical },
                { id: 'personalization', icon: Palette, label: tSettings.categories.personalization },
                { id: 'general', icon: SettingsIcon, label: tSettings.categories.general },
                { id: 'security', icon: Shield, label: tSettings.categories.security },
                { id: 'data', icon: Database, label: tSettings.categories.data },
                { id: 'account', icon: UserIcon, label: tSettings.categories.account },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSettingsCategory(cat.id);
                    setShowMobileDetail(true);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all group shrink-0",
                    settingsCategory === cat.id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-gray-400 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-3 truncate">
                    <cat.icon size={18} className="shrink-0" />
                    <span className="truncate">{cat.label}</span>
                  </div>
                  <ChevronRight size={14} className="md:hidden opacity-50 shrink-0" />
                </button>
              ))}
            </div>

            {/* Plan Card at Bottom of Settings Sidebar */}
            <div className="p-3 border-t border-white/10 shrink-0 bg-[#090a10]">
              <div 
                onClick={() => {
                  setSettingsCategory('account');
                  setShowMobileDetail(true);
                }}
                className="p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-indigo-500/40 hover:bg-white/[0.05] transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{tSettings.planSection}</span>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1",
                    settings.plan === 'pro'
                      ? "bg-amber-400/20 text-amber-300 border border-amber-400/30"
                      : "bg-white/10 text-gray-300 border border-white/10"
                  )}>
                    {settings.plan === 'pro' ? (
                      <>
                        <Crown size={10} className="text-amber-400" />
                        <span>{tSettings.planPro}</span>
                      </>
                    ) : (
                      <span>{tSettings.planFree}</span>
                    )}
                  </span>
                </div>
                <p className="text-xs text-gray-300 font-medium truncate">
                  {settings.plan === 'pro' ? tSettings.proActiveShort : tSettings.upgradeToProShort}
                </p>
              </div>
            </div>
          </div>

          {/* Settings Content */}
          <div className={cn(
            "flex-1 overflow-y-auto bg-[#070709] transition-all duration-300",
            showMobileDetail ? "block" : "hidden md:block"
          )}>
            <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-8">
              <div className="flex items-center justify-between gap-4 mb-2 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setShowMobileDetail(false)}
                    className="p-2 -ml-2 hover:bg-white/5 rounded-lg text-gray-400 md:hidden transition-colors"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <div>
                    <h2 className="text-2xl font-bold text-white">
                      {settingsCategory === 'analytics' && tSettings.categoryTitles.analytics}
                      {settingsCategory === 'apps' && tSettings.categoryTitles.apps}
                      {settingsCategory === 'medical' && tSettings.categoryTitles.medical}
                      {settingsCategory === 'personalization' && tSettings.categoryTitles.personalization}
                      {settingsCategory === 'general' && tSettings.categoryTitles.general}
                      {settingsCategory === 'security' && tSettings.categoryTitles.security}
                      {settingsCategory === 'data' && tSettings.categoryTitles.data}
                      {settingsCategory === 'account' && tSettings.categoryTitles.account}
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {tSettings.subtitle}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* 1. ANALYSE DE DONNÉES */}
              {settingsCategory === 'analytics' && (
                <div className="space-y-6">
                  <div className="p-5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                      <BarChart3 size={22} />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-white font-semibold text-sm">{tSettings.analytics.bannerTitle}</h3>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        {tSettings.analytics.bannerDesc}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-[#0c0d12] rounded-2xl border border-white/10">
                      <div className="space-y-1 pr-4">
                        <h4 className="text-white font-medium text-sm">{tSettings.analytics.autoCharts}</h4>
                        <p className="text-xs text-gray-400">{tSettings.analytics.autoChartsDesc}</p>
                      </div>
                      <button
                        onClick={() => {
                          const current = settings.dataAnalytics?.autoGenerateCharts ?? true;
                          onUpdateSettings({
                            ...settings,
                            dataAnalytics: {
                              ...(settings.dataAnalytics || { detectOutliers: true, trendAnalysis: true, statPrecision: 2, defaultChartType: 'area' }),
                              autoGenerateCharts: !current
                            }
                          });
                        }}
                        className={cn(
                          "w-12 h-6 rounded-full transition-colors relative shrink-0",
                          (settings.dataAnalytics?.autoGenerateCharts ?? true) ? "bg-indigo-600" : "bg-white/10"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform",
                          (settings.dataAnalytics?.autoGenerateCharts ?? true) ? "right-0.5" : "left-0.5"
                        )} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-[#0c0d12] rounded-2xl border border-white/10">
                      <div className="space-y-1 pr-4">
                        <h4 className="text-white font-medium text-sm">{tSettings.analytics.outliers}</h4>
                        <p className="text-xs text-gray-400">{tSettings.analytics.outliersDesc}</p>
                      </div>
                      <button
                        onClick={() => {
                          const current = settings.dataAnalytics?.detectOutliers ?? true;
                          onUpdateSettings({
                            ...settings,
                            dataAnalytics: {
                              ...(settings.dataAnalytics || { autoGenerateCharts: true, trendAnalysis: true, statPrecision: 2, defaultChartType: 'area' }),
                              detectOutliers: !current
                            }
                          });
                        }}
                        className={cn(
                          "w-12 h-6 rounded-full transition-colors relative shrink-0",
                          (settings.dataAnalytics?.detectOutliers ?? true) ? "bg-indigo-600" : "bg-white/10"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform",
                          (settings.dataAnalytics?.detectOutliers ?? true) ? "right-0.5" : "left-0.5"
                        )} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-[#0c0d12] rounded-2xl border border-white/10">
                      <div className="space-y-1 pr-4">
                        <h4 className="text-white font-medium text-sm">{tSettings.analytics.trend}</h4>
                        <p className="text-xs text-gray-400">{tSettings.analytics.trendDesc}</p>
                      </div>
                      <button
                        onClick={() => {
                          const current = settings.dataAnalytics?.trendAnalysis ?? true;
                          onUpdateSettings({
                            ...settings,
                            dataAnalytics: {
                              ...(settings.dataAnalytics || { autoGenerateCharts: true, detectOutliers: true, statPrecision: 2, defaultChartType: 'area' }),
                              trendAnalysis: !current
                            }
                          });
                        }}
                        className={cn(
                          "w-12 h-6 rounded-full transition-colors relative shrink-0",
                          (settings.dataAnalytics?.trendAnalysis ?? true) ? "bg-indigo-600" : "bg-white/10"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform",
                          (settings.dataAnalytics?.trendAnalysis ?? true) ? "right-0.5" : "left-0.5"
                        )} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div className="p-4 bg-[#0c0d12] rounded-2xl border border-white/10 space-y-2">
                        <label className="text-white font-medium text-sm">{tSettings.analytics.precisionLabel}</label>
                        <select
                          value={settings.dataAnalytics?.statPrecision ?? 2}
                          onChange={(e) => {
                            onUpdateSettings({
                              ...settings,
                              dataAnalytics: {
                                ...(settings.dataAnalytics || { autoGenerateCharts: true, detectOutliers: true, trendAnalysis: true, defaultChartType: 'area' }),
                                statPrecision: parseInt(e.target.value)
                              }
                            });
                          }}
                          className="w-full bg-[#13141c] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                        >
                          <option value={1}>{tSettings.analytics.precisionOptions.one}</option>
                          <option value={2}>{tSettings.analytics.precisionOptions.two}</option>
                          <option value={3}>{tSettings.analytics.precisionOptions.three}</option>
                          <option value={4}>{tSettings.analytics.precisionOptions.four}</option>
                        </select>
                      </div>

                      <div className="p-4 bg-[#0c0d12] rounded-2xl border border-white/10 space-y-2">
                        <label className="text-white font-medium text-sm">{tSettings.analytics.chartTypeLabel}</label>
                        <select
                          value={settings.dataAnalytics?.defaultChartType ?? 'area'}
                          onChange={(e) => {
                            onUpdateSettings({
                              ...settings,
                              dataAnalytics: {
                                ...(settings.dataAnalytics || { autoGenerateCharts: true, detectOutliers: true, trendAnalysis: true, statPrecision: 2 }),
                                defaultChartType: e.target.value as any
                              }
                            });
                          }}
                          className="w-full bg-[#13141c] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                        >
                          <option value="area">{tSettings.analytics.chartTypes.area}</option>
                          <option value="bar">{tSettings.analytics.chartTypes.bar}</option>
                          <option value="line">{tSettings.analytics.chartTypes.line}</option>
                          <option value="pie">{tSettings.analytics.chartTypes.pie}</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. APPLICATIONS CONNECTÉES (TCHOUMI CONNECT) */}
              {settingsCategory === 'apps' && (
                <div className="space-y-6">
                  <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                      <Link2 size={22} />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-white font-semibold text-sm">{tSettings.apps.bannerTitle}</h3>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        {tSettings.apps.bannerDesc}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {/* WhatsApp */}
                    {(() => {
                      const isConnected = !!settings.connectedApps?.whatsapp?.connected;
                      return (
                        <div className="p-5 bg-[#0c0d12] border border-white/10 rounded-2xl space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-gray-400")}>
                                <MessageSquare size={20} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-white font-semibold text-sm">WhatsApp</h4>
                                  {isConnected ? (
                                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-500/20 flex items-center gap-1">
                                      <CheckCircle2 size={10} /> {tSettings.apps.connectedBadge}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-white/5 text-gray-400 text-[10px] font-bold rounded-full border border-white/10">
                                      {tSettings.apps.disconnectedBadge}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400">{tSettings.apps.whatsappDesc}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                if (isConnected) {
                                  const apps = settings.connectedApps || {};
                                  onUpdateSettings({
                                    ...settings,
                                    connectedApps: {
                                      ...apps,
                                      whatsapp: {
                                        ...apps.whatsapp,
                                        id: 'whatsapp',
                                        name: 'WhatsApp',
                                        category: 'communication',
                                        description: 'Envoi direct des synthèses et alertes mobiles.',
                                        connected: false,
                                        status: 'inactive',
                                      }
                                    }
                                  });
                                } else {
                                  setConnectingApp({
                                    id: 'whatsapp',
                                    name: 'WhatsApp',
                                    icon: MessageSquare,
                                    color: 'emerald',
                                    category: 'communication',
                                    defaultAccount: '+237 6•• •• •• ••',
                                    description: tSettings.apps.whatsappDesc,
                                    permissions: [
                                      settings.language === 'en' ? 'Direct delivery of automated summaries' : 'Envoi direct des synthèses et alertes mobiles',
                                      settings.language === 'en' ? 'PDF report export to mobile' : 'Envoi de rapports et graphiques PDF',
                                      settings.language === 'en' ? 'Fast mobile prompt queries' : 'Réception de requêtes rapides'
                                    ]
                                  });
                                  setAppAccountInput('');
                                  setAppApiKeyInput('');
                                }
                              }}
                              className={cn(
                                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 cursor-pointer",
                                isConnected
                                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20"
                                  : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 shadow-md shadow-emerald-600/20"
                              )}
                            >
                              {isConnected ? tSettings.apps.disconnectBtn : tSettings.apps.connectBtn}
                            </button>
                          </div>
                          {isConnected && (
                            <div className="pt-2 border-t border-white/5 flex flex-wrap gap-2 text-[11px] text-gray-400">
                              <span className="bg-white/5 px-2.5 py-1 rounded-lg">{tSettings.apps.accountLabel}: {settings.connectedApps?.whatsapp?.account || '+237 6•• •• •• ••'}</span>
                              <span className="bg-white/5 px-2.5 py-1 rounded-lg">{tSettings.apps.autoAlerts}</span>
                              <span className="bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-lg border border-emerald-500/20">{tSettings.apps.activeStatus}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Google Sheets */}
                    {(() => {
                      const isConnected = !!settings.connectedApps?.googleSheets?.connected;
                      return (
                        <div className="p-5 bg-[#0c0d12] border border-white/10 rounded-2xl space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isConnected ? "bg-green-500/20 text-green-400" : "bg-white/5 text-gray-400")}>
                                <FileSpreadsheet size={20} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-white font-semibold text-sm">Google Sheets</h4>
                                  {isConnected ? (
                                    <span className="px-2 py-0.5 bg-green-500/10 text-green-400 text-[10px] font-bold rounded-full border border-green-500/20 flex items-center gap-1">
                                      <CheckCircle2 size={10} /> {tSettings.apps.connectedBadge}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-white/5 text-gray-400 text-[10px] font-bold rounded-full border border-white/10">
                                      {tSettings.apps.disconnectedBadge}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400">{tSettings.apps.sheetsDesc}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                if (isConnected) {
                                  const apps = settings.connectedApps || {};
                                  onUpdateSettings({
                                    ...settings,
                                    connectedApps: {
                                      ...apps,
                                      googleSheets: {
                                        ...apps.googleSheets,
                                        id: 'googleSheets',
                                        name: 'Google Sheets',
                                        category: 'productivity',
                                        description: 'Lecture, écriture et calculs de classeurs.',
                                        connected: false,
                                        status: 'inactive',
                                      }
                                    }
                                  });
                                } else {
                                  setConnectingApp({
                                    id: 'googleSheets',
                                    name: 'Google Sheets',
                                    icon: FileSpreadsheet,
                                    color: 'green',
                                    category: 'productivity',
                                    defaultAccount: userEmail || 'utilisateur@gmail.com',
                                    description: tSettings.apps.sheetsDesc,
                                    permissions: [
                                      settings.language === 'en' ? 'Read tables and spreadsheet data' : 'Lecture des tableaux et classeurs',
                                      settings.language === 'en' ? 'Real-time formula computing & cell updates' : 'Mise à jour des cellules et calculs en direct',
                                      settings.language === 'en' ? 'Auto interactive charts generation' : 'Génération automatique de graphiques liés'
                                    ]
                                  });
                                  setAppAccountInput(userEmail || '');
                                  setAppApiKeyInput('');
                                }
                              }}
                              className={cn(
                                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 cursor-pointer",
                                isConnected
                                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20"
                                  : "bg-green-600 hover:bg-green-700 text-white border-green-500 shadow-md shadow-green-600/20"
                              )}
                            >
                              {isConnected ? tSettings.apps.disconnectBtn : tSettings.apps.connectBtn}
                            </button>
                          </div>
                          {isConnected && (
                            <div className="pt-2 border-t border-white/5 flex flex-wrap gap-2 text-[11px] text-gray-400">
                              <span className="bg-white/5 px-2.5 py-1 rounded-lg">{tSettings.apps.accountLabel}: {settings.connectedApps?.googleSheets?.account || userEmail || 'sheets.google.com/auth'}</span>
                              <span className="bg-white/5 px-2.5 py-1 rounded-lg">{tSettings.apps.sheetSync}</span>
                              <span className="bg-green-500/10 text-green-400 px-2.5 py-1 rounded-lg border border-green-500/20">{tSettings.apps.activeStatus}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Gmail */}
                    {(() => {
                      const isConnected = !!settings.connectedApps?.gmail?.connected;
                      return (
                        <div className="p-5 bg-[#0c0d12] border border-white/10 rounded-2xl space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isConnected ? "bg-red-500/20 text-red-400" : "bg-white/5 text-gray-400")}>
                                <Mail size={20} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-white font-semibold text-sm">Gmail</h4>
                                  {isConnected ? (
                                    <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-[10px] font-bold rounded-full border border-red-500/20 flex items-center gap-1">
                                      <CheckCircle2 size={10} /> {tSettings.apps.connectedBadge}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-white/5 text-gray-400 text-[10px] font-bold rounded-full border border-white/10">
                                      {tSettings.apps.disconnectedBadge}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400">{tSettings.apps.gmailDesc}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                if (isConnected) {
                                  const apps = settings.connectedApps || {};
                                  onUpdateSettings({
                                    ...settings,
                                    connectedApps: {
                                      ...apps,
                                      gmail: {
                                        ...apps.gmail,
                                        id: 'gmail',
                                        name: 'Gmail',
                                        category: 'communication',
                                        description: 'Extraction et rédaction d\'e-mails.',
                                        connected: false,
                                        status: 'inactive',
                                      }
                                    }
                                  });
                                } else {
                                  setConnectingApp({
                                    id: 'gmail',
                                    name: 'Gmail',
                                    icon: Mail,
                                    color: 'red',
                                    category: 'communication',
                                    defaultAccount: userEmail || 'utilisateur@gmail.com',
                                    description: tSettings.apps.gmailDesc,
                                    permissions: [
                                      settings.language === 'en' ? 'Read selected emails & threads' : 'Lecture des e-mails et fils de discussion',
                                      settings.language === 'en' ? 'Prepare automatic drafts & summaries' : 'Préparation de brouillons et résumés',
                                      settings.language === 'en' ? 'Smart classification & alerts' : 'Classification intelligente des e-mails'
                                    ]
                                  });
                                  setAppAccountInput(userEmail || '');
                                  setAppApiKeyInput('');
                                }
                              }}
                              className={cn(
                                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 cursor-pointer",
                                isConnected
                                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20"
                                  : "bg-red-600 hover:bg-red-700 text-white border-red-500 shadow-md shadow-red-600/20"
                              )}
                            >
                              {isConnected ? tSettings.apps.disconnectBtn : tSettings.apps.connectBtn}
                            </button>
                          </div>
                          {isConnected && (
                            <div className="pt-2 border-t border-white/5 flex flex-wrap gap-2 text-[11px] text-gray-400">
                              <span className="bg-white/5 px-2.5 py-1 rounded-lg">{tSettings.apps.accountLabel}: {settings.connectedApps?.gmail?.account || userEmail || 'ronysite4@gmail.com'}</span>
                              <span className="bg-white/5 px-2.5 py-1 rounded-lg">{tSettings.apps.gmailDrafts}</span>
                              <span className="bg-red-500/10 text-red-400 px-2.5 py-1 rounded-lg border border-red-500/20">{tSettings.apps.activeStatus}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Google Drive */}
                    {(() => {
                      const isConnected = !!settings.connectedApps?.googleDrive?.connected;
                      return (
                        <div className="p-5 bg-[#0c0d12] border border-white/10 rounded-2xl space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isConnected ? "bg-amber-500/20 text-amber-400" : "bg-white/5 text-gray-400")}>
                                <Database size={20} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-white font-semibold text-sm">Google Drive</h4>
                                  {isConnected ? (
                                    <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] font-bold rounded-full border border-amber-500/20 flex items-center gap-1">
                                      <CheckCircle2 size={10} /> {tSettings.apps.connectedBadge}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-white/5 text-gray-400 text-[10px] font-bold rounded-full border border-white/10">
                                      {tSettings.apps.disconnectedBadge}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400">{tSettings.apps.driveDesc}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                if (isConnected) {
                                  const apps = settings.connectedApps || {};
                                  onUpdateSettings({
                                    ...settings,
                                    connectedApps: {
                                      ...apps,
                                      googleDrive: {
                                        ...apps.googleDrive,
                                        id: 'googleDrive',
                                        name: 'Google Drive',
                                        category: 'storage',
                                        description: 'Indexation de documents et datasets.',
                                        connected: false,
                                        status: 'inactive',
                                      }
                                    }
                                  });
                                } else {
                                  setConnectingApp({
                                    id: 'googleDrive',
                                    name: 'Google Drive',
                                    icon: Database,
                                    color: 'amber',
                                    category: 'storage',
                                    defaultAccount: userEmail || 'utilisateur@gmail.com',
                                    description: tSettings.apps.driveDesc,
                                    permissions: [
                                      settings.language === 'en' ? 'Read indexed documents (PDF, CSV, JSON)' : 'Lecture des documents indexés (PDF, CSV, JSON)',
                                      settings.language === 'en' ? 'Direct dataset parsing & embeddings' : 'Indexation et analyse de jeux de données',
                                      settings.language === 'en' ? 'Auto-backup generated charts and summaries' : 'Sauvegarde automatique des graphiques et résumés'
                                    ]
                                  });
                                  setAppAccountInput(userEmail || '');
                                  setAppApiKeyInput('');
                                }
                              }}
                              className={cn(
                                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 cursor-pointer",
                                isConnected
                                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20"
                                  : "bg-amber-600 hover:bg-amber-700 text-white border-amber-500 shadow-md shadow-amber-600/20"
                              )}
                            >
                              {isConnected ? tSettings.apps.disconnectBtn : tSettings.apps.connectBtn}
                            </button>
                          </div>
                          {isConnected && (
                            <div className="pt-2 border-t border-white/5 flex flex-wrap gap-2 text-[11px] text-gray-400">
                              <span className="bg-white/5 px-2.5 py-1 rounded-lg">{tSettings.apps.accountLabel}: {settings.connectedApps?.googleDrive?.account || userEmail || 'drive.google.com/auth'}</span>
                              <span className="bg-amber-500/10 text-amber-400 px-2.5 py-1 rounded-lg border border-amber-500/20">{tSettings.apps.activeStatus}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* PACS / DICOM Viewer & Neuro-imagerie */}
                    {(() => {
                      const isConnected = !!settings.connectedApps?.dicomViewer?.connected;
                      return (
                        <div className="p-5 bg-[#0c0d12] border border-white/10 rounded-2xl space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isConnected ? "bg-purple-500/20 text-purple-400" : "bg-white/5 text-gray-400")}>
                                <Brain size={20} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-white font-semibold text-sm">{tSettings.apps.pacsTitle}</h4>
                                  {isConnected ? (
                                    <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] font-bold rounded-full border border-purple-500/20 flex items-center gap-1">
                                      <CheckCircle2 size={10} /> {tSettings.apps.connectedBadge}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-white/5 text-gray-400 text-[10px] font-bold rounded-full border border-white/10">
                                      {tSettings.apps.disconnectedBadge}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400">{tSettings.apps.pacsDesc}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setSettingsCategory('medical')}
                                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-all cursor-pointer"
                              >
                                {tSettings.apps.configMriBtn}
                              </button>
                              <button
                                onClick={() => {
                                  if (isConnected) {
                                    const apps = settings.connectedApps || {};
                                    onUpdateSettings({
                                      ...settings,
                                      connectedApps: {
                                        ...apps,
                                        dicomViewer: {
                                          ...apps.dicomViewer,
                                          id: 'dicomViewer',
                                          name: 'PACS & IRM Viewer',
                                          category: 'medical',
                                          description: 'Passerelle DICOM/NIfTI pour les IRM cérébrales.',
                                          connected: false,
                                          status: 'inactive',
                                        }
                                      }
                                    });
                                  } else {
                                    setConnectingApp({
                                      id: 'dicomViewer',
                                      name: 'PACS & IRM Viewer',
                                      icon: Brain,
                                      color: 'purple',
                                      category: 'medical',
                                      defaultAccount: 'pacs://mri-neurology.local:11112',
                                      description: tSettings.apps.pacsDesc,
                                      permissions: [
                                        settings.language === 'en' ? 'Secure DICOM & NIfTI stream parsing' : 'Flux DICOM sécurisé & parsing NIfTI',
                                        settings.language === 'en' ? 'Volumetric Brain Segmentation & Atlas' : 'Segmentation IRM Cérébrale & Atlas anatomique',
                                        settings.language === 'en' ? 'Radiological Report generation' : 'Génération de comptes-rendus radiologiques'
                                      ]
                                    });
                                    setAppAccountInput('pacs://hospital-server.local:11112');
                                    setAppApiKeyInput('');
                                  }
                                }}
                                className={cn(
                                  "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 cursor-pointer",
                                  isConnected
                                    ? "bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20"
                                    : "bg-purple-600 hover:bg-purple-700 text-white border-purple-500 shadow-md shadow-purple-600/20"
                                )}
                              >
                                {isConnected ? tSettings.apps.disconnectBtn : tSettings.apps.connectBtn}
                              </button>
                            </div>
                          </div>
                          {isConnected && (
                            <div className="pt-2 border-t border-white/5 flex flex-wrap gap-2 text-[11px] text-gray-400">
                              <span className="bg-white/5 px-2.5 py-1 rounded-lg">{tSettings.apps.accountLabel}: {settings.connectedApps?.dicomViewer?.account || 'pacs://hospital-server.local:11112'}</span>
                              <span className="bg-purple-500/10 text-purple-400 px-2.5 py-1 rounded-lg border border-purple-500/20">{tSettings.apps.activeStatus}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* 3. NEURO-IMAGERIE & ANALYSE D'IRM CÉRÉBRALE */}
              {settingsCategory === 'medical' && (
                <div className="space-y-6">
                  <div className="p-5 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                      <Brain size={22} />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-white font-semibold text-sm">{tSettings.medical.bannerTitle}</h3>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        {tSettings.medical.bannerDesc}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-[#0c0d12] rounded-2xl border border-white/10">
                      <div className="space-y-1 pr-4">
                        <h4 className="text-white font-medium text-sm">{tSettings.medical.mriAnalysis}</h4>
                        <p className="text-xs text-gray-400">{tSettings.medical.mriAnalysisDesc}</p>
                      </div>
                      <button
                        onClick={() => {
                          const current = settings.medicalImaging?.mriBrainAnalysis ?? true;
                          onUpdateSettings({
                            ...settings,
                            medicalImaging: {
                              ...(settings.medicalImaging || { t1t2flairDetection: true, lesionSegmentation: true, volumetricCortex: true, dicomParsing: true, reportType: 'clinical' }),
                              mriBrainAnalysis: !current
                            }
                          });
                        }}
                        className={cn(
                          "w-12 h-6 rounded-full transition-colors relative shrink-0",
                          (settings.medicalImaging?.mriBrainAnalysis ?? true) ? "bg-purple-600" : "bg-white/10"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform",
                          (settings.medicalImaging?.mriBrainAnalysis ?? true) ? "right-0.5" : "left-0.5"
                        )} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-[#0c0d12] rounded-2xl border border-white/10">
                      <div className="space-y-1 pr-4">
                        <h4 className="text-white font-medium text-sm">{tSettings.medical.seqDetection}</h4>
                        <p className="text-xs text-gray-400">{tSettings.medical.seqDetectionDesc}</p>
                      </div>
                      <button
                        onClick={() => {
                          const current = settings.medicalImaging?.t1t2flairDetection ?? true;
                          onUpdateSettings({
                            ...settings,
                            medicalImaging: {
                              ...(settings.medicalImaging || { mriBrainAnalysis: true, lesionSegmentation: true, volumetricCortex: true, dicomParsing: true, reportType: 'clinical' }),
                              t1t2flairDetection: !current
                            }
                          });
                        }}
                        className={cn(
                          "w-12 h-6 rounded-full transition-colors relative shrink-0",
                          (settings.medicalImaging?.t1t2flairDetection ?? true) ? "bg-purple-600" : "bg-white/10"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform",
                          (settings.medicalImaging?.t1t2flairDetection ?? true) ? "right-0.5" : "left-0.5"
                        )} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-[#0c0d12] rounded-2xl border border-white/10">
                      <div className="space-y-1 pr-4">
                        <h4 className="text-white font-medium text-sm">{tSettings.medical.lesionDetection}</h4>
                        <p className="text-xs text-gray-400">{tSettings.medical.lesionDetectionDesc}</p>
                      </div>
                      <button
                        onClick={() => {
                          const current = settings.medicalImaging?.lesionSegmentation ?? true;
                          onUpdateSettings({
                            ...settings,
                            medicalImaging: {
                              ...(settings.medicalImaging || { mriBrainAnalysis: true, t1t2flairDetection: true, volumetricCortex: true, dicomParsing: true, reportType: 'clinical' }),
                              lesionSegmentation: !current
                            }
                          });
                        }}
                        className={cn(
                          "w-12 h-6 rounded-full transition-colors relative shrink-0",
                          (settings.medicalImaging?.lesionSegmentation ?? true) ? "bg-purple-600" : "bg-white/10"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform",
                          (settings.medicalImaging?.lesionSegmentation ?? true) ? "right-0.5" : "left-0.5"
                        )} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-[#0c0d12] rounded-2xl border border-white/10">
                      <div className="space-y-1 pr-4">
                        <h4 className="text-white font-medium text-sm">{tSettings.medical.dicomSupport}</h4>
                        <p className="text-xs text-gray-400">{tSettings.medical.dicomSupportDesc}</p>
                      </div>
                      <button
                        onClick={() => {
                          const current = settings.medicalImaging?.dicomParsing ?? true;
                          onUpdateSettings({
                            ...settings,
                            medicalImaging: {
                              ...(settings.medicalImaging || { mriBrainAnalysis: true, t1t2flairDetection: true, lesionSegmentation: true, volumetricCortex: true, reportType: 'clinical' }),
                              dicomParsing: !current
                            }
                          });
                        }}
                        className={cn(
                          "w-12 h-6 rounded-full transition-colors relative shrink-0",
                          (settings.medicalImaging?.dicomParsing ?? true) ? "bg-purple-600" : "bg-white/10"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform",
                          (settings.medicalImaging?.dicomParsing ?? true) ? "right-0.5" : "left-0.5"
                        )} />
                      </button>
                    </div>

                    <div className="p-4 bg-[#0c0d12] rounded-2xl border border-white/10 space-y-2">
                      <label className="text-white font-medium text-sm">{tSettings.medical.reportFormatLabel}</label>
                      <select
                        value={settings.medicalImaging?.reportType ?? 'clinical'}
                        onChange={(e) => {
                          onUpdateSettings({
                            ...settings,
                            medicalImaging: {
                              ...(settings.medicalImaging || { mriBrainAnalysis: true, t1t2flairDetection: true, lesionSegmentation: true, volumetricCortex: true, dicomParsing: true }),
                              reportType: e.target.value as any
                            }
                          });
                        }}
                        className="w-full bg-[#13141c] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                      >
                        <option value="clinical">{tSettings.medical.reportFormats.clinical}</option>
                        <option value="academic">{tSettings.medical.reportFormats.academic}</option>
                        <option value="educational">{tSettings.medical.reportFormats.educational}</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. PERSONNALISATION */}
              {settingsCategory === 'personalization' && (
                <div className="space-y-8">
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{tSettings.personalization.instructionsLabel}</h3>
                    <textarea 
                      value={settings.customInstructions || ''}
                      onChange={(e) => onUpdateSettings({ ...settings, customInstructions: e.target.value })}
                      className="w-full h-36 p-4 bg-[#0c0d12] border border-white/10 rounded-2xl text-white text-sm outline-none focus:border-indigo-500 transition-all resize-none leading-relaxed"
                      placeholder={tSettings.personalization.instructionsPlaceholder}
                    />
                    <p className="text-xs text-gray-500">{tSettings.personalization.instructionsDesc}</p>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{tSettings.personalization.toneLabel}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'scientific', label: tSettings.personalization.tones.analytical, desc: settings.language === 'en' ? 'Rigorous & scientific' : 'Analytique & rigoureux' },
                        { id: 'balanced', label: tSettings.personalization.tones.balanced, desc: settings.language === 'en' ? 'Precise standard' : 'Précis & équilibré' },
                        { id: 'concise', label: tSettings.personalization.tones.concise, desc: settings.language === 'en' ? 'Direct & brief' : 'Direct & concis' },
                        { id: 'creative', label: tSettings.personalization.tones.creative, desc: settings.language === 'en' ? 'Original & exploratory' : 'Original & exploratoire' }
                      ].map((style) => (
                        <button 
                          key={style.id} 
                          onClick={() => onUpdateSettings({ ...settings, responseStyle: style.id as any })}
                          className={cn(
                            "p-3 rounded-xl text-left border transition-all flex flex-col justify-between", 
                            (settings.responseStyle || 'scientific') === style.id 
                              ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20" 
                              : "bg-[#0c0d12] border-white/10 text-gray-400 hover:text-white"
                          )}
                        >
                          <span className="text-xs font-bold">{style.label}</span>
                          <span className="text-[10px] opacity-70 mt-1">{style.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 5. GÉNÉRAL & MODÈLES */}
              {settingsCategory === 'general' && (
                <div className="space-y-6">
                  <div className="p-5 bg-[#0c0d12] rounded-2xl border border-white/10 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                          <Cpu size={20} />
                        </div>
                        <div>
                          <h4 className="text-white font-medium text-sm">{tSettings.general.modelTitle}</h4>
                          <p className="text-xs text-gray-400">{tSettings.general.modelDesc}</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-semibold">
                        {tSettings.general.optimizedBadge}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-[#0c0d12] rounded-2xl border border-white/10">
                      <span className="text-white font-medium text-sm">{tSettings.general.interfaceLang}</span>
                      <select 
                        value={settings.language}
                        onChange={(e) => onUpdateSettings({ ...settings, language: e.target.value as any })}
                        className="bg-[#13141c] border border-white/10 text-white rounded-xl px-3 py-1.5 text-sm outline-none font-medium cursor-pointer"
                      >
                        <option value="fr">{tSettings.general.langFr}</option>
                        <option value="en">{tSettings.general.langEn}</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-[#0c0d12] rounded-2xl border border-white/10">
                      <span className="text-white font-medium text-sm">{tSettings.general.themeLabel}</span>
                      <span className="text-xs text-indigo-400 font-semibold px-3 py-1 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                        {tSettings.general.darkTheme}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 6. SÉCURITÉ & CLÉS API */}
              {settingsCategory === 'security' && (
                <div className="space-y-6">
                  <div className="p-5 bg-[#0c0d12] rounded-2xl border border-white/10 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                        <Key size={20} />
                      </div>
                      <div>
                        <h4 className="text-white font-medium text-sm">{tSettings.security.geminiApiKeyTitle}</h4>
                        <p className="text-xs text-gray-400">{tSettings.security.geminiApiKeyDesc}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="password"
                        value={settings.apiKeys.gemini || ''}
                        onChange={(e) => onUpdateSettings({
                          ...settings,
                          apiKeys: { ...settings.apiKeys, gemini: e.target.value }
                        })}
                        placeholder="AIzaSy..."
                        className="flex-1 bg-[#13141c] border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-[#0c0d12] rounded-2xl border border-white/10">
                    <div className="space-y-1">
                      <h4 className="text-white font-medium text-sm">{tSettings.security.encryptionTitle}</h4>
                      <p className="text-xs text-gray-400">{tSettings.security.encryptionDesc}</p>
                    </div>
                    <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
                      <CheckCircle2 size={14} /> {tSettings.security.aesBadge}
                    </span>
                  </div>
                </div>
              )}

              {/* 7. DONNÉES */}
              {settingsCategory === 'data' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-5 bg-red-500/5 border border-red-500/15 rounded-2xl">
                    <div className="space-y-1">
                      <h4 className="text-red-400 font-semibold text-sm">{tSettings.data.clearHistoryTitle}</h4>
                      <p className="text-xs text-red-400/70">{tSettings.data.clearHistoryDesc}</p>
                    </div>
                    <button 
                      onClick={onClearHistory}
                      className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-bold transition-colors shadow-lg shadow-red-500/20"
                    >
                      {tSettings.data.clearBtn}
                    </button>
                  </div>
                </div>
              )}

              {/* 8. COMPTE & ABONNEMENT */}
              {settingsCategory === 'account' && (
                <div className="space-y-6">
                  {/* Notification de mise à niveau */}
                  <AnimatePresence>
                    {upgradeNotification && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-4 bg-gradient-to-r from-emerald-600/20 to-indigo-600/20 border border-emerald-500/30 rounded-2xl flex items-center justify-between gap-3 text-emerald-300 shadow-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                            <Sparkles size={18} />
                          </div>
                          <span className="text-sm font-medium">{upgradeNotification}</span>
                        </div>
                        <button
                          onClick={() => setUpgradeNotification(null)}
                          className="text-gray-400 hover:text-white p-1 rounded-lg"
                        >
                          <X size={16} />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Profil Utilisateur */}
                  <div className="flex items-center justify-between gap-4 p-6 bg-[#0c0d12] rounded-2xl border border-white/10">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold overflow-hidden shadow-xl ring-2 ring-white/10 shrink-0">
                        {userPhotoURL ? <img src={userPhotoURL} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <UserIcon size={30} />}
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-bold text-white truncate">{isLoggedIn ? (userEmail || tSettings.account.connectedAs) : tSettings.account.guestUser}</h3>
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1",
                            settings.plan === 'pro'
                              ? "bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm"
                              : "bg-white/10 text-gray-300 border border-white/10"
                          )}>
                            {settings.plan === 'pro' ? (
                              <>
                                <Crown size={12} className="text-amber-400" />
                                <span>{tSettings.account.proName}</span>
                              </>
                            ) : (
                              <span>{tSettings.account.freeName}</span>
                            )}
                          </span>
                        </div>
                        <p className="text-gray-400 text-xs truncate">
                          {isLoggedIn ? (userEmail ? `ID: ${userEmail}` : tSettings.account.userSection) : tSettings.account.loginToSync}
                        </p>
                      </div>
                    </div>

                    {!isLoggedIn && onLogin && (
                      <button
                        onClick={onLogin}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 shrink-0 flex items-center gap-2"
                      >
                        <LogIn size={14} />
                        {translations[settings.language].sidebar.signIn}
                      </button>
                    )}
                  </div>

                  {/* Gestion de l'Abonnement et Formules */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{tSettings.account.planTitle}</h4>
                      <span className="text-xs text-gray-500">{tSettings.account.planSubtitle}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Carte Plan Free */}
                      <div className={cn(
                        "p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 relative",
                        settings.plan !== 'pro'
                          ? "bg-[#0f1018] border-indigo-500/40 shadow-lg shadow-indigo-500/5 ring-1 ring-indigo-500/20"
                          : "bg-[#0c0d12] border-white/10 opacity-75 hover:opacity-100"
                      )}>
                        {settings.plan !== 'pro' && (
                          <div className="absolute top-3 right-3 px-2 py-0.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-md text-[10px] font-bold">
                            {tSettings.account.currentPlan}
                          </div>
                        )}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400">
                              <UserIcon size={16} />
                            </div>
                            <div>
                              <h5 className="text-white font-bold text-base">{tSettings.account.freeName}</h5>
                              <p className="text-xs text-gray-400">{tSettings.account.freeSubtitle}</p>
                            </div>
                          </div>

                          <div className="space-y-2 pt-2 border-t border-white/5 text-xs text-gray-300">
                            <div className="flex items-center gap-2">
                              <Check size={14} className="text-indigo-400 shrink-0" />
                              <span>{tSettings.account.freeFeature1}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Check size={14} className="text-indigo-400 shrink-0" />
                              <span>{tSettings.account.freeFeature2}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Check size={14} className="text-indigo-400 shrink-0" />
                              <span>{tSettings.account.freeFeature3}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Check size={14} className="text-indigo-400 shrink-0" />
                              <span>{tSettings.account.freeFeature4}</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-center text-xs text-gray-400">
                          {tSettings.account.freeStatus}
                        </div>
                      </div>

                      {/* Carte Plan Pro */}
                      <div className={cn(
                        "p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 relative overflow-hidden",
                        settings.plan === 'pro'
                          ? "bg-gradient-to-b from-[#171524] to-[#0e0f19] border-amber-400/40 shadow-xl shadow-amber-500/10 ring-1 ring-amber-400/30"
                          : "bg-gradient-to-b from-[#131422] to-[#0c0d14] border-indigo-500/30 hover:border-indigo-500/60 shadow-lg hover:shadow-indigo-500/10"
                      )}>
                        {/* Glow ambient */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

                        {settings.plan === 'pro' ? (
                          <div className="absolute top-3 right-3 px-2 py-0.5 bg-amber-400/20 text-amber-300 border border-amber-400/40 rounded-md text-[10px] font-black flex items-center gap-1">
                            <Crown size={10} /> {tSettings.apps.active}
                          </div>
                        ) : (
                          <div className="absolute top-3 right-3 px-2 py-0.5 bg-gradient-to-r from-amber-500 to-indigo-500 text-white rounded-md text-[10px] font-bold shadow-sm">
                            PRO
                          </div>
                        )}

                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                              <Crown size={16} />
                            </div>
                            <div>
                              <h5 className="text-white font-bold text-base flex items-center gap-1.5">
                                {tSettings.account.proName}
                                <Sparkles size={14} className="text-amber-400" />
                              </h5>
                              <p className="text-xs text-amber-300/80 font-medium">{tSettings.account.proSubtitle}</p>
                            </div>
                          </div>

                          <div className="space-y-2 pt-2 border-t border-white/10 text-xs text-gray-200">
                            <div className="flex items-center gap-2">
                              <Check size={14} className="text-emerald-400 shrink-0 font-bold" />
                              <span>{tSettings.account.proFeature1}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Check size={14} className="text-emerald-400 shrink-0 font-bold" />
                              <span>{tSettings.account.proFeature2}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Check size={14} className="text-emerald-400 shrink-0 font-bold" />
                              <span>{tSettings.account.proFeature3}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Check size={14} className="text-emerald-400 shrink-0 font-bold" />
                              <span>{tSettings.account.proFeature4}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Check size={14} className="text-emerald-400 shrink-0 font-bold" />
                              <span>{tSettings.account.proFeature5}</span>
                            </div>
                          </div>
                        </div>

                        {settings.plan === 'pro' ? (
                          <div className="w-full py-2.5 px-4 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs font-bold text-center flex items-center justify-center gap-1.5">
                            <ShieldCheck size={14} className="text-amber-400" />
                            {tSettings.account.proActiveBadge}
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowProUpgradeModal(true)}
                            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 hover:from-amber-400 to-indigo-600 hover:to-indigo-500 text-black font-black text-xs transition-all active:scale-[0.98] shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <Crown size={14} className="text-black fill-black" />
                            <span>{tSettings.account.upgradeBtn}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Console d'Administration Fondateur pour M. Tchoumi Chilic Vitrice */}
                    {isFounder && (
                      <div className="mt-8 p-6 bg-gradient-to-b from-[#131322] to-[#0d0e17] rounded-2xl border border-amber-500/30 shadow-xl space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-black font-black shadow-md">
                            <Crown size={20} className="fill-black" />
                          </div>
                          <div>
                            <h4 className="text-base font-black text-white flex items-center gap-2">
                              {tSettings.account.founderConsole}
                              <span className="px-2 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[10px] font-bold">
                                M. Tchoumi Chilic Vitrice
                              </span>
                            </h4>
                            <p className="text-xs text-gray-400">
                              {tSettings.account.founderSub}
                            </p>
                          </div>
                        </div>

                        {founderActionMsg && (
                          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs font-semibold text-amber-300">
                            {founderActionMsg}
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="email"
                            placeholder={tSettings.account.founderInputPlaceholder}
                            value={founderTargetEmail}
                            onChange={(e) => setFounderTargetEmail(e.target.value)}
                            className="flex-1 px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-amber-400 placeholder-gray-500"
                          />
                          <button
                            onClick={() => handleFounderActivatePro()}
                            disabled={isSavingProUser || !founderTargetEmail.trim()}
                            className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:opacity-50 text-black font-black text-xs rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                          >
                            <Crown size={14} className="fill-black text-black" />
                            <span>{isSavingProUser ? "..." : tSettings.account.founderActivateBtn}</span>
                          </button>
                        </div>

                        {/* Liste des utilisateurs Pro enregistrés */}
                        <div className="pt-3 border-t border-white/10 space-y-2">
                          <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                            {tSettings.account.founderAccountsTitle} ({proUsersList.filter(u => u.status === 'active').length})
                          </h5>
                          {proUsersList.length === 0 ? (
                            <p className="text-xs text-gray-500 italic">{tSettings.account.noAccounts}</p>
                          ) : (
                            <div className="max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin">
                              {proUsersList.map((proUser) => (
                                <div
                                  key={proUser.id || proUser.email}
                                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-xs"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className={cn(
                                      "w-2 h-2 rounded-full shrink-0",
                                      proUser.status === 'active' ? "bg-emerald-400 shadow-sm shadow-emerald-400/50" : "bg-gray-500"
                                    )} />
                                    <span className="font-mono text-gray-200 truncate">{proUser.email}</span>
                                    <span className="text-[10px] text-gray-500">
                                      {proUser.status === 'active' ? '• Pro' : '• Off'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {proUser.status === 'active' ? (
                                      <button
                                        onClick={() => handleFounderDeactivatePro(proUser.email)}
                                        className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-[10px] font-semibold border border-red-500/20 transition-colors"
                                      >
                                        {tSettings.account.founderDeactivateBtn}
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleFounderActivatePro(proUser.email)}
                                        className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-[10px] font-semibold border border-emerald-500/20 transition-colors"
                                      >
                                        {tSettings.account.founderReactivateBtn}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Messages */}
          <div className="flex-1 min-w-0 w-full overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {messages.length === 0 ? (
          <div className="min-h-full flex flex-col items-center justify-center text-center px-4 py-6 sm:py-8 space-y-5 sm:space-y-6">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-indigo-600 flex items-center justify-center text-white shadow-2xl shadow-indigo-500/20 ring-4 ring-white/5"
            >
              <img 
                src={AI_AVATAR_URL} 
                alt="AI Logo" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </motion.div>
            <div className="space-y-2.5">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{AI_NAME} v3.0</h1>
              <p className="text-gray-400 max-w-lg mx-auto text-sm sm:text-base leading-relaxed px-4">
                {settings.language === 'en' 
                  ? "Next-Generation African Artificial Intelligence. Created by Tchoumi Chilic Vitrice." 
                  : "L'Intelligence Artificielle Africaine de Nouvelle Génération. Créée par Tchoumi Chilic Vitrice."}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <BarChart3 size={12} /> {t.quickBadges.analytics}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Atom size={12} /> {t.quickBadges.coding}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <ImageIcon size={12} /> {t.quickBadges.vision}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Volume2 size={12} /> {settings.language === 'en' ? 'Voice Synthesis' : 'Synthèse vocale'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full mt-3 sm:mt-4 px-2 sm:px-4">
              {t.suggestions.map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => onSendMessage(`${suggestion.title} ${suggestion.desc}`)}
                  className="p-3.5 sm:p-4 bg-[#08080c] border border-white/10 rounded-2xl text-left hover:bg-white/[0.04] transition-all hover:border-indigo-500/40 group flex flex-col justify-between min-h-[90px] hover:shadow-lg hover:shadow-indigo-500/5"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors flex items-center gap-2">
                      {i === 0 && <BarChart3 size={15} className="text-indigo-400" />}
                      {i === 1 && <Activity size={15} className="text-emerald-400" />}
                      {i === 2 && <Atom size={15} className="text-blue-400" />}
                      {i === 3 && <ImageIcon size={15} className="text-purple-400" />}
                      {suggestion.title}
                    </div>
                    <ChevronRight size={14} className="text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-xs text-gray-400 mt-1.5 line-clamp-2 leading-relaxed">{suggestion.desc}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="pb-8 w-full min-w-0">
            {messages.map((msg) => (
              <MessageItem 
                key={msg.id} 
                message={msg} 
                userPhotoURL={userPhotoURL}
                onEdit={onEditMessage}
                onRetry={onRetry}
              />
            ))}
            {isLoading && (
              <div className="py-8 px-4 sm:px-6 md:px-8 lg:px-12 flex gap-4 sm:gap-6 bg-[#090a0f] border-b border-white/[0.04]">
                <div className="shrink-0 pt-1">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/20 ring-1 ring-white/10">
                    <Loader2 size={18} className="animate-spin" />
                  </div>
                </div>
                <div className="flex-1 flex items-center gap-2 text-indigo-300 italic text-sm">
                  {AI_NAME} {t.thinking}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="shrink-0 px-2 py-1.5 sm:p-4 bg-gradient-to-t from-black via-black/95 to-transparent z-20 border-t border-white/5 md:border-t-0">
        <div className="max-w-3xl mx-auto relative px-1 sm:px-0">
          <AnimatePresence>
            {isLoading && onStopGeneration && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="absolute -top-10 sm:-top-12 left-1/2 -translate-x-1/2 z-30"
              >
                <button
                  onClick={onStopGeneration}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-[#121217] border border-white/15 rounded-full text-white text-xs sm:text-sm font-medium hover:bg-white/10 transition-all shadow-xl"
                >
                  <Square size={12} className="sm:w-3.5 sm:h-3.5" fill="currentColor" />
                  <span>{settings.language === 'en' ? "Stop generating" : "Arrêter la génération"}</span>
                </button>
              </motion.div>
            )}

            {!isLoading && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && onContinueGeneration && wasInterrupted && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="absolute -top-10 sm:-top-12 left-1/2 -translate-x-1/2 z-30"
              >
                <button
                  onClick={onContinueGeneration}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-[#121217] border border-white/15 rounded-full text-white text-xs sm:text-sm font-medium hover:bg-white/10 transition-all shadow-xl"
                >
                  <Play size={12} className="sm:w-3.5 sm:h-3.5" fill="currentColor" />
                  <span>{settings.language === 'en' ? "Continue" : "Continuer"}</span>
                </button>
              </motion.div>
            )}

            {attachedFiles.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="absolute -top-20 sm:-top-24 left-1 right-1 flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 z-20 scrollbar-hide"
              >
                {attachedFiles.map((file, idx) => (
                  <div key={idx} className="bg-[#0f1015] border border-white/15 p-1.5 sm:p-2 rounded-xl flex items-center gap-1.5 sm:gap-2 min-w-[110px] sm:min-w-[120px] max-w-[180px] sm:max-w-[200px] shadow-lg group relative">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
                      {file.type.startsWith('image/') ? <ImageIcon size={13} className="sm:w-4 sm:h-4" /> : 
                       file.type.startsWith('video/') ? <Video size={13} className="sm:w-4 sm:h-4" /> : 
                       file.name.match(/\.(csv|json|xlsx|tsv)$/i) ? <BarChart3 size={13} className="sm:w-4 sm:h-4" /> : <FileText size={13} className="sm:w-4 sm:h-4" />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9px] sm:text-[10px] text-white truncate font-medium">{file.name}</span>
                      <span className="text-[7.5px] sm:text-[8px] text-gray-500 uppercase">{(file.size / 1024).toFixed(0)} KB</span>
                    </div>
                    <button 
                      onClick={() => removeFile(idx)}
                      className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={9} className="sm:w-2.5 sm:h-2.5" />
                    </button>
                  </div>
                ))}
              </motion.div>
            )}

            {autocompleteSuggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className={cn(
                  "absolute left-1 right-1 flex flex-col gap-1 z-20",
                  attachedFiles.length > 0 ? "-top-40 sm:-top-48" : "-top-20 sm:-top-24"
                )}
              >
                {autocompleteSuggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setInput(suggestion);
                      setAutocompleteSuggestions([]);
                    }}
                    className="bg-[#0f1015] border border-white/15 hover:bg-[#1a1b24] text-white text-xs sm:text-sm py-1.5 sm:py-2.5 px-3 sm:px-4 rounded-xl text-left transition-all shadow-lg flex items-center gap-2 sm:gap-3 group"
                  >
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors shrink-0">
                      <Sparkles size={12} className="text-indigo-400 sm:w-3.5 sm:h-3.5 group-hover:scale-110 transition-transform" />
                    </div>
                    <span className="flex-1 truncate">{suggestion}</span>
                    <ChevronRight size={13} className="text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
              </motion.div>
            )}

            {micNotice && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="absolute -top-14 sm:-top-16 left-1 right-1 p-2 sm:p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-2 text-amber-300 text-xs sm:text-sm backdrop-blur-md z-20"
              >
                <div className="flex items-center gap-2 truncate">
                  <MicOff size={14} className="sm:w-4 sm:h-4 shrink-0 text-amber-400" />
                  <span className="truncate">{micNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMicNotice(null)}
                  className="p-1 hover:bg-white/10 rounded-md text-amber-300/80 hover:text-white transition-colors shrink-0"
                >
                  <X size={12} />
                </button>
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="absolute -top-14 sm:-top-16 left-1 right-1 p-2 sm:p-2.5 bg-red-500/15 border border-red-500/30 rounded-xl flex items-center justify-between gap-2 sm:gap-3 text-red-300 text-xs sm:text-sm backdrop-blur-md z-20 shadow-xl"
              >
                <div className="flex items-center gap-2 truncate min-w-0">
                  <AlertCircle size={15} className="sm:w-4 sm:h-4 shrink-0 text-red-400" />
                  <span className="truncate">{error}</span>
                </div>
                {onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry()}
                    className="flex items-center gap-1.5 px-3 py-1 bg-red-500/25 hover:bg-red-500/40 text-red-100 hover:text-white border border-red-500/40 rounded-lg text-xs font-semibold shrink-0 transition-all active:scale-95 cursor-pointer shadow"
                  >
                    <RefreshCw size={12} className="animate-none" />
                    <span>Réessayer</span>
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="relative group bg-[#0d0e13] border border-white/15 focus-within:border-indigo-500/40 rounded-full shadow-2xl transition-all px-1.5 py-0.5 sm:px-3 sm:py-1.5">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.csv,.json,.xlsx,.xls,.tsv"
            />
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={handleFileClick}
                  className="w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-all shrink-0"
                  title={settings.language === 'en' ? "Attach file (Image, Doc, CSV, JSON...)" : "Ajouter un fichier (Image, Document, CSV, JSON...)"}
                >
                  <Plus size={17} className="sm:w-5 sm:h-5" strokeWidth={2.5} />
                </button>
              </div>
              
              <div className="relative flex-1">
                <textarea
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t.placeholder}
                  className="w-full py-1 sm:py-1.5 bg-transparent outline-none transition-all resize-none text-white placeholder:text-gray-500 leading-snug sm:leading-relaxed text-[16px] sm:text-sm md:text-base min-h-[30px] sm:min-h-[38px] max-h-[160px]"
                />
              </div>

              <div className="flex items-center gap-0.5 sm:gap-1.5">
                <button
                  type="button"
                  onClick={toggleListening}
                  className={cn(
                    "w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center rounded-full transition-all shrink-0",
                    isListening ? "bg-red-500 text-white animate-pulse" : "text-gray-400 hover:text-white hover:bg-white/5"
                  )}
                  title={settings.language === 'en' ? "Voice message" : "Message vocal"}
                >
                  {isListening ? <MicOff size={15} className="sm:w-4 sm:h-4" /> : <Mic size={15} className="sm:w-4 sm:h-4" />}
                </button>
                <button
                  type="submit"
                  disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
                  className={cn(
                    "rounded-full transition-all shadow-lg active:scale-95 shrink-0 flex items-center justify-center w-7 h-7 sm:w-9 sm:h-9",
                    (input.trim() || attachedFiles.length > 0)
                      ? "bg-white text-black hover:bg-gray-200" 
                      : "bg-white/10 text-gray-500 cursor-not-allowed"
                  )}
                >
                  {(input.trim() || attachedFiles.length > 0) ? <ArrowUp size={15} className="sm:w-4 sm:h-4" strokeWidth={3} /> : <AudioLines size={15} className="sm:w-4 sm:h-4" strokeWidth={2.5} />}
                </button>
              </div>
            </div>
          </form>
          <p className="text-[8px] sm:text-[10px] text-gray-500 text-center mt-1 sm:mt-2 font-medium opacity-50">
            {AI_NAME} {t.disclaimer}
          </p>
        </div>
      </div>
      </>
      )}

      {/* MODAL DE CONFIRMATION PASSAGE AU PLAN PRO VIA WHATSAPP */}
      <AnimatePresence>
        {showProUpgradeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-[#0e0f17] border border-amber-500/30 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl shadow-amber-500/10 relative overflow-hidden text-left"
            >
              {/* Effet lumineux d'ambiance */}
              <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-amber-500/20 via-indigo-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              {/* Bouton Fermer */}
              <button
                onClick={() => setShowProUpgradeModal(false)}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                title={tProModal.closeBtn}
              >
                <X size={18} />
              </button>

              {/* En-tête */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/25 ring-2 ring-amber-400/30">
                  <Crown size={24} className="text-black fill-black" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-300 text-[10px] font-bold uppercase tracking-wider mb-1">
                    <Sparkles size={11} />
                    {tProModal.badge}
                  </div>
                  <h3 className="text-xl font-black text-white tracking-tight">{tProModal.title}</h3>
                </div>
              </div>

              {/* Message d'explication */}
              <p className="text-sm text-gray-300 leading-relaxed mb-4">
                {tProModal.description}
              </p>

              {/* Affichage de l'e-mail du compte */}
              {userEmail ? (
                <div className="p-3.5 bg-amber-400/[0.06] border border-amber-400/20 rounded-2xl mb-5 flex items-center justify-between text-xs text-gray-200">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Mail size={16} className="text-amber-400 shrink-0" />
                    <span className="text-gray-400 truncate">{tProModal.accountToActivate}</span>
                    <span className="font-mono text-amber-300 font-bold truncate">{userEmail}</span>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl mb-5 text-xs text-indigo-300 flex items-center gap-2.5">
                  <UserIcon size={16} className="text-indigo-400 shrink-0" />
                  <span>
                    {tProModal.guestNotice}
                  </span>
                </div>
              )}

              {/* Actions & Bouton WhatsApp */}
              <div className="space-y-3">
                <a
                  href={`https://wa.me/237677201028?text=${encodeURIComponent(tProModal.waMessage(userEmail))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2.5 w-full py-3.5 px-6 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-sm shadow-lg shadow-[#25D366]/25 hover:shadow-[#25D366]/40 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24">
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.599 2.679-.702c.97.53 1.77.818 2.781.819h.005c3.181 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.767-5.773-5.767zm7.656 5.766c-.002 4.22-3.434 7.652-7.656 7.652-.001 0-.002 0-.003 0-1.309 0-2.589-.351-3.702-.994l-4.135 1.084 1.104-4.033c-.707-1.166-1.08-2.508-1.079-3.882.002-4.221 3.435-7.653 7.657-7.653 4.221 0 7.654 3.433 7.654 7.653z" fillRule="evenodd" clipRule="evenodd"/>
                  </svg>
                  <span>{tProModal.whatsappBtn}</span>
                </a>

                <button
                  onClick={() => setShowProUpgradeModal(false)}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-semibold transition-colors border border-white/10 text-center cursor-pointer"
                >
                  {tProModal.closeBtn}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE CONNEXION D'APPLICATION (TCHOUMI CONNECT) */}
      <AnimatePresence>
        {connectingApp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-[#0e0f17] border border-white/15 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative overflow-hidden text-left"
            >
              {/* Effet lumineux d'ambiance */}
              <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

              {/* Bouton Fermer */}
              <button
                onClick={() => setConnectingApp(null)}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                title={tSettings.apps.connectModal.cancelBtn}
              >
                <X size={18} />
              </button>

              {/* En-tête */}
              <div className="flex items-center gap-3.5 mb-4">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg ring-2 ring-white/10",
                  connectingApp.color === 'emerald' ? "bg-emerald-600 shadow-emerald-600/30" :
                  connectingApp.color === 'green' ? "bg-green-600 shadow-green-600/30" :
                  connectingApp.color === 'red' ? "bg-red-600 shadow-red-600/30" :
                  connectingApp.color === 'amber' ? "bg-amber-600 shadow-amber-600/30" :
                  "bg-purple-600 shadow-purple-600/30"
                )}>
                  <connectingApp.icon size={24} />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                    Tchoumi Connect • {connectingApp.category}
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight">
                    {tSettings.apps.connectModal.title} : {connectingApp.name}
                  </h3>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-gray-300 leading-relaxed mb-5">
                {tSettings.apps.connectModal.subtitle}
              </p>

              {/* Formulaire de saisie des informations */}
              <div className="space-y-4 mb-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-300">
                    {tSettings.apps.connectModal.accountField} <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={appAccountInput}
                    onChange={(e) => setAppAccountInput(e.target.value)}
                    placeholder={
                      connectingApp.id === 'whatsapp' ? '+237 6•• •• •• ••' :
                      connectingApp.id === 'dicomViewer' ? 'pacs://hospital-server.local:11112' :
                      'utilisateur@gmail.com'
                    }
                    className="w-full bg-[#13141c] border border-white/15 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none font-medium transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-300">
                    {tSettings.apps.connectModal.apiKeyField}
                  </label>
                  <input
                    type="password"
                    value={appApiKeyInput}
                    onChange={(e) => setAppApiKeyInput(e.target.value)}
                    placeholder="eyJhbGciOi..."
                    className="w-full bg-[#13141c] border border-white/15 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none font-mono transition-all"
                  />
                </div>

                {/* Liste des permissions */}
                <div className="p-3.5 bg-white/[0.03] border border-white/10 rounded-2xl space-y-2">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                    {tSettings.apps.connectModal.permissionsTitle}
                  </span>
                  <div className="space-y-1.5">
                    {connectingApp.permissions.map((perm, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-gray-300">
                        <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                        <span>{perm}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Boutons d'action */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setConnectingApp(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-semibold transition-colors border border-white/10 text-center cursor-pointer"
                >
                  {tSettings.apps.connectModal.cancelBtn}
                </button>
                <button
                  type="button"
                  disabled={isSubmittingAppConnect || !appAccountInput.trim()}
                  onClick={() => {
                    setIsSubmittingAppConnect(true);
                    setTimeout(() => {
                      const apps = settings.connectedApps || {};
                      const targetId = connectingApp.id;
                      onUpdateSettings({
                        ...settings,
                        connectedApps: {
                          ...apps,
                          [targetId]: {
                            id: targetId,
                            name: connectingApp.name,
                            category: connectingApp.category as any,
                            description: connectingApp.description,
                            connected: true,
                            status: 'active',
                            account: appAccountInput.trim() || connectingApp.defaultAccount,
                            apiKey: appApiKeyInput.trim() || undefined,
                            lastSync: 'Synchronisé',
                            permissions: connectingApp.permissions,
                          }
                        }
                      });
                      setIsSubmittingAppConnect(false);
                      setConnectingApp(null);
                    }, 500);
                  }}
                  className={cn(
                    "flex-1 py-2.5 px-4 rounded-xl text-white text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer",
                    !appAccountInput.trim() || isSubmittingAppConnect
                      ? "bg-indigo-600/50 cursor-not-allowed text-white/50"
                      : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30 active:scale-[0.98]"
                  )}
                >
                  {isSubmittingAppConnect ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>{tSettings.apps.connectModal.connecting}</span>
                    </>
                  ) : (
                    <span>{tSettings.apps.connectModal.confirmBtn}</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

