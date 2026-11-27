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
  Layers, Eye, EyeOff, RefreshCw, FileSpreadsheet, Mail, MessageSquare,
  Crown, Zap, ShieldCheck, Star, CreditCard
} from 'lucide-react';
import { Message, AppSettings, ModelProvider, Attachment, ConnectedApp, UserPlan, SubscriptionRequest } from '../types';
import { MessageItem } from './MessageItem';
import { AI_NAME, AI_AVATAR_URL } from '../constants';
import { translations } from '../lib/translations';
import { TCHOUMI_MODELS, TCHOUMI_PLANS, getModelById, getPlanById, hasPlanAccess } from '../lib/models';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { db, sanitizeForFirestore } from '../firebase';
import { doc, setDoc, deleteDoc, collection, onSnapshot } from 'firebase/firestore';
import { SubscriptionRequestModal } from './SubscriptionRequestModal';
import { FounderAdminDashboard, ProUserRecord, RegisteredUserRecord } from './FounderAdminDashboard';

interface ChatAreaProps {
  messages: Message[];
  settings: AppSettings;
  userPhotoURL?: string | null;
  userEmail?: string | null;
  userDisplayName?: string | null;
  userUid?: string | null;
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
  onOpenLiveVoice?: () => void;
  requestedUpgradePlan?: UserPlan | null;
  onClearRequestedUpgradePlan?: () => void;
  wasInterrupted?: boolean;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  settings,
  userPhotoURL,
  userEmail,
  userDisplayName,
  userUid,
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
  onOpenLiveVoice,
  requestedUpgradePlan = null,
  onClearRequestedUpgradePlan,
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
  const [showAdminPage, setShowAdminPage] = useState(false);
  const [upgradeTargetPlan, setUpgradeTargetPlan] = useState<UserPlan>('pro');
  const [upgradeNotification, setUpgradeNotification] = useState<string | null>(null);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  const effectivePlan: UserPlan = settings.plan || 'free';
  const activeModelDef = getModelById(settings.selectedModel);
  const selectedUpgradePlanDef = getPlanById(upgradeTargetPlan);

  useEffect(() => {
    if (requestedUpgradePlan) {
      setUpgradeTargetPlan(requestedUpgradePlan);
      setShowProUpgradeModal(true);
      onClearRequestedUpgradePlan?.();
    }
  }, [requestedUpgradePlan, onClearRequestedUpgradePlan]);

  useEffect(() => {
    if (!showModelMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showModelMenu]);

  const openUpgradeModalForPlan = (planId: UserPlan) => {
    setUpgradeTargetPlan(planId === 'free' ? 'pro' : planId);
    setShowProUpgradeModal(true);
  };

  const handleSelectModel = (modelId: string) => {
    const modelDef = getModelById(modelId);
    if (!hasPlanAccess(effectivePlan, modelDef.requiredPlan)) {
      setShowModelMenu(false);
      openUpgradeModalForPlan(modelDef.requiredPlan);
      return;
    }
    onUpdateSettings({ ...settings, selectedModel: modelDef.id });
    setShowModelMenu(false);
  };
  
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
  const isFounder = userEmail?.toLowerCase().trim() === 'ronysite4@gmail.com';
  const [proUsersList, setProUsersList] = useState<ProUserRecord[]>([]);
  const [registeredUsersList, setRegisteredUsersList] = useState<RegisteredUserRecord[]>([]);
  const [subscriptionRequests, setSubscriptionRequests] = useState<SubscriptionRequest[]>([]);
  const [isSavingProUser, setIsSavingProUser] = useState(false);
  const [founderActionMsg, setFounderActionMsg] = useState<string | null>(null);

  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const t = translations[settings.language].chat;
  const tSettings = translations[settings.language].settings;

  const pendingRequestsCount = subscriptionRequests.filter((r) => r.status === 'pending').length;

  // Listen to Pro users, registered users, and subscription requests collections if Founder
  useEffect(() => {
    if (!isFounder) return;
    const unsubs: (() => void)[] = [];
    try {
      const qPro = collection(db, 'pro_users');
      unsubs.push(
        onSnapshot(qPro, (snapshot) => {
          const list: ProUserRecord[] = [];
          snapshot.forEach((docSnap) => {
            list.push({ id: docSnap.id, ...docSnap.data() } as ProUserRecord);
          });
          setProUsersList(list);
        }, (err) => {
          console.error("Error loading pro users:", err);
        })
      );

      const qUsers = collection(db, 'users');
      unsubs.push(
        onSnapshot(qUsers, (snapshot) => {
          const users: RegisteredUserRecord[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as any;
            const rawLastLogin = data?.lastLogin;
            const lastLoginMs =
              typeof rawLastLogin?.toMillis === 'function'
                ? rawLastLogin.toMillis()
                : typeof rawLastLogin === 'number'
                  ? rawLastLogin
                  : undefined;
            if (data?.email) {
              users.push({
                uid: docSnap.id,
                email: String(data.email),
                displayName: data.displayName ? String(data.displayName) : undefined,
                photoURL: data.photoURL ? String(data.photoURL) : undefined,
                lastLoginMs,
              });
            }
          });
          users.sort((a, b) => (b.lastLoginMs || 0) - (a.lastLoginMs || 0));
          setRegisteredUsersList(users);
        }, (err) => {
          console.error("Error loading registered users:", err);
        })
      );

      const qRequests = collection(db, 'subscription_requests');
      unsubs.push(
        onSnapshot(qRequests, (snapshot) => {
          const reqs: SubscriptionRequest[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as any;
            reqs.push({
              id: docSnap.id,
              fullName: String(data?.fullName || ''),
              email: String(data?.email || ''),
              phone: String(data?.phone || ''),
              paymentMethod: data?.paymentMethod,
              plan: data?.plan === 'plus' || data?.plan === 'ultra' ? data.plan : 'pro',
              priceLabel: data?.priceLabel,
              notes: data?.notes,
              status:
                data?.status === 'approved' || data?.status === 'rejected'
                  ? data.status
                  : 'pending',
              uid: data?.uid,
              createdAt: typeof data?.createdAt === 'number' ? data.createdAt : 0,
              processedAt: data?.processedAt,
            });
          });
          reqs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setSubscriptionRequests(reqs);
        }, (err) => {
          console.error("Error loading subscription requests:", err);
        })
      );
    } catch (e) {
      console.error(e);
    }
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [isFounder]);

  const handleFounderActivatePro = async (
    emailToActivate: string,
    planToAssign: 'plus' | 'pro' | 'ultra' = 'pro',
    requestId?: string,
    meta?: { fullName?: string; phone?: string }
  ) => {
    const target = emailToActivate.toLowerCase().trim();
    if (!target || !target.includes('@')) {
      setFounderActionMsg("Veuillez saisir une adresse e-mail valide.");
      return;
    }
    setIsSavingProUser(true);
    try {
      await setDoc(
        doc(db, 'pro_users', target),
        sanitizeForFirestore({
          email: target,
          status: 'active',
          plan: planToAssign,
          activatedAt: Date.now(),
          activatedBy: 'founder',
          ...(meta?.fullName ? { fullName: meta.fullName } : {}),
          ...(meta?.phone ? { phone: meta.phone } : {}),
        }),
        { merge: true }
      );
      if (requestId) {
        await setDoc(
          doc(db, 'subscription_requests', requestId),
          {
            status: 'approved',
            plan: planToAssign,
            processedAt: Date.now(),
          },
          { merge: true }
        );
      }
      setFounderActionMsg(`Plan ${planToAssign.toUpperCase()} activé avec succès pour ${target} ! 🚀`);
      setTimeout(() => setFounderActionMsg(null), 4000);
    } catch (err: any) {
      setFounderActionMsg(`Erreur : ${err.message || "Impossible d'activer le plan"}`);
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
      setFounderActionMsg(`Abonnement désactivé pour ${target}.`);
      setTimeout(() => setFounderActionMsg(null), 4000);
    } catch (err: any) {
      setFounderActionMsg(`Erreur : ${err.message || 'Impossible de désactiver'}`);
    } finally {
      setIsSavingProUser(false);
    }
  };

  const handleFounderRejectRequest = async (requestId: string) => {
    setIsSavingProUser(true);
    try {
      await setDoc(
        doc(db, 'subscription_requests', requestId),
        { status: 'rejected', processedAt: Date.now() },
        { merge: true }
      );
      setFounderActionMsg('Demande marquée comme refusée.');
      setTimeout(() => setFounderActionMsg(null), 3500);
    } catch (err: any) {
      setFounderActionMsg(`Erreur : ${err.message || 'Impossible de refuser la demande'}`);
    } finally {
      setIsSavingProUser(false);
    }
  };

  const handleFounderDeleteRequest = async (requestId: string) => {
    setIsSavingProUser(true);
    try {
      await deleteDoc(doc(db, 'subscription_requests', requestId));
      setFounderActionMsg('Demande supprimée.');
      setTimeout(() => setFounderActionMsg(null), 3000);
    } catch (err: any) {
      setFounderActionMsg(`Erreur : ${err.message || 'Impossible de supprimer la demande'}`);
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
    <div className="flex flex-col h-full bg-[#0e0f13] relative overflow-hidden">
      {/* Header */}
      <div className="shrink-0 z-30 flex items-center justify-between px-3 sm:px-5 py-2.5 bg-[#0e0f13]/90 backdrop-blur-md border-b border-white/[0.05]">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-200">
          {/* Sidebar Toggle (shown on mobile, or on desktop when collapsed) */}
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className={cn(
                "p-2 hover:bg-white/[0.07] rounded-full text-gray-400 hover:text-white transition-colors cursor-pointer",
                isSidebarOpen ? "md:hidden" : "flex"
              )}
              title={settings.language === 'en' ? 'Open sidebar' : 'Ouvrir le menu'}
              aria-label={settings.language === 'en' ? 'Open sidebar' : 'Ouvrir le menu'}
            >
              {isSidebarOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          )}

          <div className="relative" ref={modelMenuRef}>
            <button
              type="button"
              onClick={() => setShowModelMenu((prev) => !prev)}
              className="px-2.5 py-1.5 rounded-xl hover:bg-white/[0.06] flex items-center gap-2 text-white font-semibold text-[15px] tracking-tight transition-colors cursor-pointer"
              title={settings.language === 'en' ? 'Select Tchoumi AI model' : 'Choisir le modèle Tchoumi IA'}
            >
              <span>{AI_NAME}</span>
              <span className="text-xs font-medium text-indigo-300 bg-indigo-500/15 border border-indigo-500/25 px-2 py-0.5 rounded-lg">
                {activeModelDef.name.replace('Tchoumi ', '')}
              </span>
              <ChevronDown size={14} className={cn("text-gray-400 transition-transform", showModelMenu && "rotate-180")} />
            </button>

            <AnimatePresence>
              {showModelMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-2 w-72 sm:w-80 bg-[#15171e] border border-white/10 rounded-2xl shadow-2xl p-2 z-50 space-y-1"
                >
                  <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-white/5 mb-1">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      {settings.language === 'en' ? 'Tchoumi AI Models' : 'Modèles Tchoumi IA'}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {getPlanById(effectivePlan).name}
                    </span>
                  </div>
                  {TCHOUMI_MODELS.map((m) => {
                    const isUnlocked = hasPlanAccess(effectivePlan, m.requiredPlan);
                    const isSelected = activeModelDef.id === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleSelectModel(m.id)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-xl transition-colors flex items-start justify-between gap-2.5 cursor-pointer",
                          isSelected
                            ? "bg-indigo-600/20 border border-indigo-500/40 text-white"
                            : isUnlocked
                              ? "hover:bg-white/[0.06] border border-transparent text-gray-200"
                              : "hover:bg-white/[0.04] border border-transparent text-gray-400"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{m.name}</span>
                            <span
                              className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                m.requiredPlan === 'ultra'
                                  ? "bg-violet-500/20 text-violet-300"
                                  : m.requiredPlan === 'pro'
                                    ? "bg-amber-500/20 text-amber-300"
                                    : m.requiredPlan === 'plus'
                                      ? "bg-sky-500/20 text-sky-300"
                                      : "bg-white/10 text-gray-300"
                              )}
                            >
                              {m.badge[settings.language]}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                            {m.tagline[settings.language]}
                          </p>
                        </div>
                        <div className="shrink-0 mt-0.5">
                          {isSelected ? (
                            <Check size={15} className="text-indigo-400" />
                          ) : !isUnlocked ? (
                            <Lock size={13} className="text-gray-500" />
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                  <div className="pt-1.5 mt-1 border-t border-white/5 px-2 pb-1 flex items-center justify-between text-[11px] text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <Video size={12} className="text-amber-400" />
                      {settings.language === 'en' ? 'AI Video: Pro & Ultra' : 'Vidéo IA : Pro & Ultra'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowModelMenu(false);
                        setSettingsCategory('account');
                        setShowMobileDetail(true);
                        onViewChange('settings');
                      }}
                      className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                    >
                      {settings.language === 'en' ? 'Plans' : 'Tarifs'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isLoggedIn && onLogin && (
            <button
              onClick={onLogin}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-[#1a3d70] hover:bg-[#1f4987] text-white text-xs font-semibold rounded-full transition-colors cursor-pointer"
            >
              <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center p-0.5">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-full h-full" />
              </div>
              <span className="hidden sm:inline">{settings.language === 'en' ? "Sign In" : "Se connecter"}</span>
            </button>
          )}
          {onOpenLiveVoice && (
            <button
              type="button"
              onClick={onOpenLiveVoice}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#181a21] hover:bg-[#22252f] border border-white/[0.08] text-gray-200 hover:text-white text-xs font-medium transition-colors cursor-pointer"
              title={settings.language === 'en' ? "Live Voice Conversation" : "Discussion vocale en direct"}
            >
              <AudioLines size={15} className="text-sky-400" />
              <span className="hidden sm:inline">{settings.language === 'en' ? "Voice" : "Vocal"}</span>
            </button>
          )}
          {isFounder && (
            <button
              type="button"
              onClick={() => setShowAdminPage(true)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors cursor-pointer",
                showAdminPage
                  ? "bg-amber-400 text-black border-amber-300"
                  : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/35"
              )}
              title={settings.language === 'en' ? 'Open Admin Dashboard' : "Ouvrir l'Interface Admin"}
            >
              <Crown size={14} />
              <span className="hidden sm:inline">Admin</span>
              {pendingRequestsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[10px] font-black leading-tight">
                  {pendingRequestsCount}
                </span>
              )}
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
              "p-2 rounded-full transition-colors cursor-pointer flex items-center justify-center",
              activeView === 'settings' && settingsCategory === 'account' ? "bg-indigo-600 text-white" : "hover:bg-white/[0.07] text-gray-400 hover:text-white"
            )}
            title={settings.language === 'en' ? "Account & Plan" : "Compte & Formule"}
          >
            <Sparkles size={18} />
          </button>
        </div>
      </div>

      {activeView === 'settings' ? (
        <div className="flex-1 flex bg-[#0e0f13] overflow-hidden relative">
          {/* Settings Sidebar */}
          <div className={cn(
            "w-full md:w-64 border-r border-white/[0.06] bg-[#131418] flex flex-col h-full overflow-hidden transition-all duration-300",
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
                ...(isFounder
                  ? [
                      {
                        id: 'admin',
                        icon: Crown,
                        label: settings.language === 'en' ? 'Admin Dashboard' : 'Administration',
                        badgeCount: pendingRequestsCount,
                      },
                    ]
                  : []),
                { id: 'analytics', icon: BarChart3, label: tSettings.categories.analytics },
                { id: 'apps', icon: LayoutGrid, label: tSettings.categories.apps },
                { id: 'medical', icon: Brain, label: tSettings.categories.medical },
                { id: 'personalization', icon: Palette, label: tSettings.categories.personalization },
                { id: 'general', icon: SettingsIcon, label: tSettings.categories.general },
                { id: 'security', icon: Shield, label: tSettings.categories.security },
                { id: 'data', icon: Database, label: tSettings.categories.data },
                { id: 'account', icon: UserIcon, label: tSettings.categories.account },
              ].map((cat: any) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    if (cat.id === 'admin') {
                      setShowAdminPage(true);
                      return;
                    }
                    setSettingsCategory(cat.id);
                    setShowMobileDetail(true);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all group shrink-0",
                    settingsCategory === cat.id && cat.id !== 'admin'
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                      : cat.id === 'admin'
                        ? "text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25"
                        : "text-gray-400 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-3 truncate">
                    <cat.icon size={18} className="shrink-0" />
                    <span className="truncate">{cat.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {cat.badgeCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black">
                        {cat.badgeCount}
                      </span>
                    )}
                    <ChevronRight size={14} className="md:hidden opacity-50 shrink-0" />
                  </div>
                </button>
              ))}
            </div>

            {/* Plan Card at Bottom of Settings Sidebar */}
            <div className="p-3 border-t border-white/[0.06] shrink-0 bg-[#131418]">
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
                    effectivePlan === 'ultra'
                      ? "bg-violet-500/20 text-violet-300 border border-violet-400/30"
                      : effectivePlan === 'pro'
                        ? "bg-amber-400/20 text-amber-300 border border-amber-400/30"
                        : effectivePlan === 'plus'
                          ? "bg-sky-500/20 text-sky-300 border border-sky-400/30"
                          : "bg-white/10 text-gray-300 border border-white/10"
                  )}>
                    {effectivePlan !== 'free' && <Crown size={10} />}
                    <span>
                      {effectivePlan === 'ultra'
                        ? tSettings.planUltra
                        : effectivePlan === 'pro'
                          ? tSettings.planPro
                          : effectivePlan === 'plus'
                            ? tSettings.planPlus
                            : tSettings.planFree}
                    </span>
                  </span>
                </div>
                <p className="text-xs text-gray-300 font-medium truncate">
                  {effectivePlan === 'pro' || effectivePlan === 'ultra'
                    ? tSettings.proActiveShort
                    : tSettings.upgradeToProShort}
                </p>
              </div>
            </div>
          </div>

          {/* Settings Content */}
          <div className={cn(
            "flex-1 overflow-y-auto bg-[#0e0f13] transition-all duration-300",
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
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                          <Cpu size={20} />
                        </div>
                        <div>
                          <h4 className="text-white font-medium text-sm">{tSettings.general.modelTitle}</h4>
                          <p className="text-xs text-gray-400">{tSettings.general.modelDesc}</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-semibold shrink-0">
                        {activeModelDef.name}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      {TCHOUMI_MODELS.map((m) => {
                        const isUnlocked = hasPlanAccess(effectivePlan, m.requiredPlan);
                        const isSelected = activeModelDef.id === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handleSelectModel(m.id)}
                            className={cn(
                              "p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 cursor-pointer",
                              isSelected
                                ? "bg-indigo-600/15 border-indigo-500/60 ring-1 ring-indigo-500/30"
                                : isUnlocked
                                  ? "bg-[#13141c] border-white/10 hover:border-white/25"
                                  : "bg-[#111218] border-white/5 opacity-80 hover:opacity-100 hover:border-amber-500/30"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-bold text-white">{m.name}</span>
                              <span
                                className={cn(
                                  "text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1",
                                  m.requiredPlan === 'ultra'
                                    ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                                    : m.requiredPlan === 'pro'
                                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                      : m.requiredPlan === 'plus'
                                        ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                                        : "bg-white/10 text-gray-300"
                                )}
                              >
                                {!isUnlocked && <Lock size={9} />}
                                {m.badge[settings.language]}
                              </span>
                            </div>
                            <p className="text-[11px] font-medium text-indigo-300/90">
                              {m.tagline[settings.language]}
                            </p>
                            <p className="text-[11px] text-gray-400 leading-relaxed">
                              {m.description[settings.language]}
                            </p>
                          </button>
                        );
                      })}
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

              {/* 6. SÉCURITÉ & INFRASTRUCTURE IA */}
              {settingsCategory === 'security' && (
                <div className="space-y-6">
                  <div className="p-5 bg-[#0c0d12] rounded-2xl border border-white/10 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                        <ShieldCheck size={20} />
                      </div>
                      <div>
                        <h4 className="text-white font-medium text-sm">{tSettings.security.geminiApiKeyTitle}</h4>
                        <p className="text-xs text-gray-400">{tSettings.security.geminiApiKeyDesc}</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-semibold shrink-0">
                      {tSettings.general.optimizedBadge}
                    </span>
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
                            effectivePlan === 'ultra'
                              ? "bg-violet-500/20 text-violet-300 border border-violet-400/40"
                              : effectivePlan === 'pro'
                                ? "bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm"
                                : effectivePlan === 'plus'
                                  ? "bg-sky-500/20 text-sky-300 border border-sky-400/40"
                                  : "bg-white/10 text-gray-300 border border-white/10"
                          )}>
                            {effectivePlan !== 'free' && <Crown size={12} />}
                            <span>{getPlanById(effectivePlan).name}</span>
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

                  {/* Gestion de l'Abonnement et Formules (Free, Plus, Pro, Ultra) */}
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{tSettings.account.planTitle}</h4>
                      <span className="text-xs text-gray-500">{tSettings.account.planSubtitle}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {TCHOUMI_PLANS.map((planItem) => {
                        const isCurrent = effectivePlan === planItem.id;
                        const isAlreadyIncluded = hasPlanAccess(effectivePlan, planItem.id) && !isCurrent;
                        const isProOrUltra = planItem.id === 'pro' || planItem.id === 'ultra';

                        return (
                          <div
                            key={planItem.id}
                            className={cn(
                              "p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 relative overflow-hidden",
                              isCurrent
                                ? planItem.id === 'ultra'
                                  ? "bg-gradient-to-b from-[#1a1429] to-[#0e0f19] border-violet-400/50 ring-1 ring-violet-400/30 shadow-xl shadow-violet-500/10"
                                  : planItem.id === 'pro'
                                    ? "bg-gradient-to-b from-[#171524] to-[#0e0f19] border-amber-400/50 ring-1 ring-amber-400/30 shadow-xl shadow-amber-500/10"
                                    : planItem.id === 'plus'
                                      ? "bg-gradient-to-b from-[#111926] to-[#0e0f19] border-sky-400/50 ring-1 ring-sky-400/30 shadow-xl shadow-sky-500/10"
                                      : "bg-[#0f1018] border-indigo-500/40 ring-1 ring-indigo-500/20 shadow-lg"
                                : planItem.popular
                                  ? "bg-gradient-to-b from-[#131422] to-[#0c0d14] border-amber-500/35 hover:border-amber-400/60 shadow-lg"
                                  : "bg-[#0c0d12] border-white/10 hover:border-white/25"
                            )}
                          >
                            {isProOrUltra && (
                              <div
                                className={cn(
                                  "absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl pointer-events-none",
                                  planItem.id === 'ultra' ? "bg-violet-500/15" : "bg-amber-500/10"
                                )}
                              />
                            )}

                            {isCurrent ? (
                              <div className="absolute top-3 right-3 px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 rounded-md text-[10px] font-bold">
                                {tSettings.account.currentPlan}
                              </div>
                            ) : planItem.badge ? (
                              <div
                                className={cn(
                                  "absolute top-3 right-3 px-2 py-0.5 rounded-md text-[10px] font-bold shadow-sm",
                                  planItem.id === 'ultra'
                                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white"
                                    : planItem.id === 'pro'
                                      ? "bg-gradient-to-r from-amber-500 to-indigo-500 text-white"
                                      : "bg-sky-500/20 text-sky-300 border border-sky-400/30"
                                )}
                              >
                                {planItem.badge[settings.language]}
                              </div>
                            ) : null}

                            <div className="space-y-3">
                              <div className="flex items-start gap-2.5 pr-16">
                                <div
                                  className={cn(
                                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base shadow-md",
                                    planItem.id === 'ultra'
                                      ? "bg-gradient-to-tr from-violet-600 to-indigo-600 text-white"
                                      : planItem.id === 'pro'
                                        ? "bg-gradient-to-tr from-amber-500 to-indigo-600 text-white"
                                        : planItem.id === 'plus'
                                          ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                                          : "bg-white/5 text-gray-400"
                                  )}
                                >
                                  {planItem.id === 'free' ? <UserIcon size={16} /> : <Crown size={16} />}
                                </div>
                                <div>
                                  <h5 className="text-white font-bold text-base flex items-center gap-1.5">
                                    <span>{planItem.name} {planItem.emoji}</span>
                                  </h5>
                                  <p className="text-xs text-gray-400">{planItem.subtitle[settings.language]}</p>
                                </div>
                              </div>

                              <div className="flex items-baseline justify-between gap-2 pt-1">
                                <span className="text-xl font-black text-white tracking-tight">
                                  {planItem.priceLabel[settings.language]}
                                </span>
                                <span className="text-[11px] text-gray-400">
                                  {planItem.monthlyHint[settings.language]}
                                </span>
                              </div>

                              <div className="space-y-2 pt-2.5 border-t border-white/10 text-xs text-gray-200">
                                {planItem.features[settings.language].map((feat, idx) => {
                                  const isLockedVideoLine = !planItem.videoIncluded && idx === planItem.features[settings.language].length - 1;
                                  return (
                                    <div key={idx} className="flex items-start gap-2">
                                      {isLockedVideoLine ? (
                                        <Lock size={13} className="text-gray-500 shrink-0 mt-0.5" />
                                      ) : (
                                        <Check
                                          size={14}
                                          className={cn(
                                            "shrink-0 mt-0.5",
                                            planItem.id === 'ultra'
                                              ? "text-violet-400"
                                              : planItem.id === 'pro'
                                                ? "text-emerald-400"
                                                : planItem.id === 'plus'
                                                  ? "text-sky-400"
                                                  : "text-indigo-400"
                                          )}
                                        />
                                      )}
                                      <span className={cn(isLockedVideoLine ? "text-gray-500" : "text-gray-200")}>
                                        {feat}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {isCurrent ? (
                              <div className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold text-center flex items-center justify-center gap-1.5">
                                <ShieldCheck size={14} />
                                {planItem.id === 'free'
                                  ? tSettings.account.freeStatus
                                  : settings.language === 'en'
                                    ? `${planItem.name} Active`
                                    : `${planItem.name} Actif`}
                              </div>
                            ) : isAlreadyIncluded || planItem.id === 'free' ? (
                              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-center text-xs text-gray-400">
                                {settings.language === 'en' ? 'Included in your current tier' : 'Inclus dans votre formule actuelle'}
                              </div>
                            ) : (
                              <button
                                onClick={() => openUpgradeModalForPlan(planItem.id)}
                                className={cn(
                                  "w-full py-2.5 px-4 rounded-xl font-black text-xs transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2 cursor-pointer",
                                  planItem.id === 'ultra'
                                    ? "bg-gradient-to-r from-violet-600 hover:from-violet-500 to-indigo-600 hover:to-indigo-500 text-white shadow-violet-500/20"
                                    : planItem.id === 'pro'
                                      ? "bg-gradient-to-r from-amber-500 hover:from-amber-400 to-indigo-600 hover:to-indigo-500 text-black shadow-amber-500/20"
                                      : "bg-sky-500 hover:bg-sky-400 text-black shadow-sky-500/20"
                                )}
                              >
                                <Crown size={14} />
                                <span>
                                  {settings.language === 'en'
                                    ? `Choose ${planItem.name} (${planItem.priceLabel.en})`
                                    : `Passer au ${planItem.name} (${planItem.priceLabel.fr})`}
                                </span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Raccourci vers l'Interface Admin Fondateur */}
                    {isFounder && (
                      <div className="mt-8 p-5 bg-gradient-to-r from-[#171528] to-[#0f101a] rounded-2xl border border-amber-500/35 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-black font-black shadow-md shrink-0">
                            <Crown size={20} className="fill-black" />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-white flex items-center gap-2">
                              {tSettings.account.founderConsole}
                              {pendingRequestsCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black">
                                  {pendingRequestsCount} {settings.language === 'fr' ? 'en attente' : 'pending'}
                                </span>
                              )}
                            </h4>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {settings.language === 'fr'
                                ? 'Gérez toutes les demandes clients, utilisateurs Google et activations en un clic.'
                                : 'Manage all client requests, Google users, and one-click plan activations.'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAdminPage(true)}
                          className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-black text-xs rounded-xl shadow-md transition-all cursor-pointer shrink-0"
                        >
                          {settings.language === 'fr' ? "Ouvrir l'Interface Admin" : 'Open Admin Dashboard'}
                        </button>
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
          <div className="min-h-full flex flex-col items-center justify-center text-center px-4 py-8 sm:py-12 max-w-3xl mx-auto w-full">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.25 }}
              className="mb-4"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="w-11 h-11 mx-auto">
                <defs>
                  <linearGradient id="welcomeStarGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="50%" stopColor="#818cf8" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
                <path
                  d="M12 2C12.35 7.45 16.55 11.65 22 12C16.55 12.35 12.35 16.55 12 22C11.65 16.55 7.45 12.35 2 12C7.45 11.65 11.65 7.45 12 2Z"
                  fill="url(#welcomeStarGrad)"
                />
              </svg>
            </motion.div>

            <div className="space-y-2.5 max-w-xl mx-auto mb-8">
              <p className="text-xs font-medium tracking-wide text-indigo-300/90">
                {AI_NAME}
              </p>
              <h1 className="text-2xl sm:text-4xl font-semibold text-white tracking-tight text-balance">
                {settings.language === 'en'
                  ? "How can I help you today?"
                  : "Comment puis-je vous aider aujourd'hui ?"}
              </h1>
              <p className="text-gray-400 text-xs sm:text-sm leading-relaxed">
                {settings.language === 'en'
                  ? "Next-Generation African AI · Created by Tchoumi Chilic Vitrice"
                  : "Intelligence Artificielle Africaine · Créée par Tchoumi Chilic Vitrice"}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
              {t.suggestions.map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => onSendMessage(`${suggestion.title} ${suggestion.desc}`)}
                  className="p-4 bg-[#16181f] hover:bg-[#1e212b] border border-white/[0.07] hover:border-white/[0.15] rounded-2xl text-left transition-colors group flex flex-col justify-between min-h-[92px] cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-gray-100 group-hover:text-white transition-colors flex items-center gap-2.5">
                      {i === 0 && <BarChart3 size={16} className="text-blue-400 shrink-0" />}
                      {i === 1 && <Activity size={16} className="text-emerald-400 shrink-0" />}
                      {i === 2 && <Atom size={16} className="text-indigo-400 shrink-0" />}
                      {i === 3 && <ImageIcon size={16} className="text-sky-400 shrink-0" />}
                      <span>{suggestion.title}</span>
                    </div>
                    <ChevronRight size={14} className="text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                  <div className="text-xs text-gray-400 mt-1.5 line-clamp-2 leading-relaxed">{suggestion.desc}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full px-3 sm:px-6 pt-4 pb-10 space-y-6 min-w-0">
            {messages.map((msg, idx) => (
              <MessageItem 
                key={msg.id} 
                message={msg} 
                userPhotoURL={userPhotoURL}
                onEdit={onEditMessage}
                onRetry={onRetry}
                isStreaming={isLoading && idx === messages.length - 1 && msg.role === 'assistant'}
                language={settings.language}
              />
            ))}
            {isLoading && (messages.length === 0 || messages[messages.length - 1].role !== 'assistant') && (
              <div className="w-full space-y-3 py-1">
                <div className="flex items-center gap-2.5">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="w-5 h-5 shrink-0 gemini-star-active">
                    <defs>
                      <linearGradient id="geminiLoadingGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="55%" stopColor="#818cf8" />
                        <stop offset="100%" stopColor="#38bdf8" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M12 2C12.35 7.45 16.55 11.65 22 12C16.55 12.35 12.35 16.55 12 22C11.65 16.55 7.45 12.35 2 12C7.45 11.65 11.65 7.45 12 2Z"
                      fill="url(#geminiLoadingGrad)"
                    />
                  </svg>
                  <span className="text-xs sm:text-[13px] font-medium text-gray-300 tracking-wide">
                    Tchoumi IA réfléchit...
                  </span>
                </div>
                <div className="pl-7 space-y-2.5 max-w-xl" aria-hidden="true">
                  <div className="h-2.5 w-[88%] rounded-full gemini-shimmer-bar" />
                  <div className="h-2.5 w-[70%] rounded-full gemini-shimmer-bar" />
                  <div className="h-2.5 w-[46%] rounded-full gemini-shimmer-bar" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="shrink-0 px-2 py-2 sm:px-4 sm:pb-4 sm:pt-2 bg-gradient-to-t from-[#0e0f13] via-[#0e0f13]/95 to-transparent z-20">
        <div className="max-w-3xl mx-auto relative px-1 sm:px-0">
          <AnimatePresence>
            {isLoading && onStopGeneration && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="absolute -top-11 sm:-top-12 left-1/2 -translate-x-1/2 z-30"
              >
                <button
                  onClick={onStopGeneration}
                  className="flex items-center gap-1.5 sm:gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 bg-[#181a21] border border-white/15 rounded-full text-white text-xs sm:text-sm font-medium hover:bg-white/10 transition-all shadow-xl cursor-pointer"
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
                className="absolute -top-11 sm:-top-12 left-1/2 -translate-x-1/2 z-30"
              >
                <button
                  onClick={onContinueGeneration}
                  className="flex items-center gap-1.5 sm:gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 bg-[#181a21] border border-white/15 rounded-full text-white text-xs sm:text-sm font-medium hover:bg-white/10 transition-all shadow-xl cursor-pointer"
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
                  <div key={idx} className="bg-[#181a21] border border-white/15 p-1.5 sm:p-2 rounded-xl flex items-center gap-1.5 sm:gap-2 min-w-[110px] sm:min-w-[120px] max-w-[180px] sm:max-w-[200px] shadow-lg group relative">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
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
                    className="bg-[#181a21] border border-white/15 hover:bg-[#22252f] text-white text-xs sm:text-sm py-1.5 sm:py-2.5 px-3 sm:px-4 rounded-xl text-left transition-all shadow-lg flex items-center gap-2 sm:gap-3 group"
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
                className="mb-2.5 p-2.5 sm:p-3 bg-red-500/15 border border-red-500/30 rounded-2xl flex items-center justify-between gap-2 sm:gap-3 text-red-200 text-xs sm:text-sm backdrop-blur-md shadow-xl"
              >
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <AlertCircle size={15} className="sm:w-4 sm:h-4 shrink-0 text-red-400 mt-0.5" />
                  <span className="leading-snug break-words">{error}</span>
                </div>
                {onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/25 hover:bg-red-500/40 text-red-100 hover:text-white border border-red-500/40 rounded-xl text-xs font-semibold shrink-0 transition-all active:scale-95 cursor-pointer shadow"
                  >
                    <RefreshCw size={12} className="animate-none" />
                    <span>Réessayer</span>
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="relative group bg-[#181a21] border border-white/[0.1] focus-within:border-indigo-400/50 rounded-full shadow-2xl transition-all px-2 py-1 sm:px-3.5 sm:py-2">
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
                  className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/[0.07] rounded-full transition-colors shrink-0 cursor-pointer"
                  title={settings.language === 'en' ? "Attach file (Image, Doc, CSV, JSON...)" : "Ajouter un fichier (Image, Document, CSV, JSON...)"}
                >
                  <Plus size={18} className="sm:w-5 sm:h-5" strokeWidth={2.2} />
                </button>
              </div>
              
              <div className="relative flex-1">
                <textarea
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t.placeholder}
                  className="w-full py-1 sm:py-1.5 bg-transparent outline-none transition-all resize-none text-white placeholder:text-gray-400 leading-snug sm:leading-relaxed text-[16px] sm:text-sm md:text-base min-h-[30px] sm:min-h-[38px] max-h-[160px]"
                />
              </div>

              <div className="flex items-center gap-0.5 sm:gap-1.5">
                <button
                  type="button"
                  onClick={toggleListening}
                  className={cn(
                    "w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full transition-colors shrink-0 cursor-pointer",
                    isListening ? "bg-red-500 text-white animate-pulse" : "text-gray-400 hover:text-white hover:bg-white/[0.07]"
                  )}
                  title={settings.language === 'en' ? "Voice message" : "Message vocal"}
                >
                  {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
                {(input.trim() || attachedFiles.length > 0) ? (
                  <button
                    type="submit"
                    disabled={isLoading}
                    className={cn(
                      "rounded-full transition-all active:scale-95 shrink-0 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 cursor-pointer",
                      isLoading ? "bg-white/10 text-gray-500 cursor-not-allowed" : "bg-white text-black hover:bg-gray-200"
                    )}
                    title={settings.language === 'en' ? "Send message" : "Envoyer"}
                  >
                    <ArrowUp size={16} strokeWidth={2.5} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenLiveVoice?.()}
                    disabled={isLoading}
                    className={cn(
                      "rounded-full transition-all active:scale-95 shrink-0 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 cursor-pointer",
                      isLoading
                        ? "bg-white/10 text-gray-500 cursor-not-allowed"
                        : "bg-white text-black hover:bg-gray-200 shadow-sm"
                    )}
                    title={settings.language === 'en' ? "Start Tchoumi Voice (Live Conversation)" : "Démarrer Tchoumi Voice (Discussion vocale en direct)"}
                  >
                    <AudioLines size={16} strokeWidth={2.2} />
                  </button>
                )}
              </div>
            </div>
          </form>
          <p className="text-[10px] sm:text-[11px] text-gray-500 text-center mt-1.5 sm:mt-2 font-normal">
            {AI_NAME} · {t.disclaimer}
          </p>
        </div>
      </div>
      </>
      )}

      {/* FORMULAIRE DE DEMANDE D'ABONNEMENT (PAGE COMPLÈTE) */}
      <SubscriptionRequestModal
        isOpen={showProUpgradeModal}
        initialPlan={upgradeTargetPlan}
        language={settings.language}
        userEmail={userEmail}
        userDisplayName={userDisplayName}
        userUid={userUid}
        onClose={() => setShowProUpgradeModal(false)}
      />

      {/* INTERFACE ADMIN FONDATEUR (PAGE COMPLÈTE) */}
      {isFounder && (
        <FounderAdminDashboard
          isOpen={showAdminPage}
          onClose={() => setShowAdminPage(false)}
          language={settings.language}
          subscriptionRequests={subscriptionRequests}
          proUsersList={proUsersList}
          registeredUsersList={registeredUsersList}
          isSaving={isSavingProUser}
          actionMessage={founderActionMsg}
          onActivatePlan={handleFounderActivatePro}
          onDeactivatePro={handleFounderDeactivatePro}
          onRejectRequest={handleFounderRejectRequest}
          onDeleteRequest={handleFounderDeleteRequest}
        />
      )}

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

