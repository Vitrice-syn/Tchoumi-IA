import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { LoadingScreen } from './components/LoadingScreen';
import { LiveVoiceModal, VoiceTranscriptTurn } from './components/LiveVoiceModal';
import { Chat, Message, AppSettings, ModelProvider, User, Attachment, UserPlan } from './types';
import { callGeminiStream, generateImage, formatFriendlyErrorMessage } from './lib/ai';
import { TCHOUMI_MODELS, getModelById, hasPlanAccess } from './lib/models';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, X, LogIn, Sparkles, ShieldCheck, Check, Lock, Cloud, Zap, ArrowRight } from 'lucide-react';
import { auth, db, loginWithGoogle, logout, OperationType, handleFirestoreError, sanitizeForFirestore } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, addDoc, serverTimestamp, getDocs, writeBatch } from 'firebase/firestore';
import { AI_NAME, AI_AVATAR_URL } from './constants';
import { translations } from './lib/translations';

const DEFAULT_SETTINGS: AppSettings = {
  plan: 'free',
  apiKeys: {},
  selectedProvider: 'gemini',
  selectedModel: 'tchoumi-pulse',
  language: 'en',
  customInstructions: '',
  responseStyle: 'scientific',
  dataAnalytics: {
    autoGenerateCharts: true,
    detectOutliers: true,
    trendAnalysis: true,
    statPrecision: 2,
    defaultChartType: 'area',
  },
  medicalImaging: {
    mriBrainAnalysis: true,
    t1t2flairDetection: true,
    lesionSegmentation: true,
    volumetricCortex: true,
    dicomParsing: true,
    reportType: 'clinical',
  },
  connectedApps: {
    whatsapp: {
      id: 'whatsapp',
      name: 'WhatsApp',
      category: 'communication',
      description: 'Envoi direct des synthèses, alertes de données et interactions mobiles via WhatsApp.',
      connected: false,
      status: 'inactive',
      permissions: ['Notifications automatiques', 'Envoi de rapports PDF', 'Réception de requêtes rapides'],
    },
    googleSheets: {
      id: 'googleSheets',
      name: 'Google Sheets',
      category: 'productivity',
      description: 'Lecture, écriture et synchronisation dynamique des classeurs et calculs tabulaires.',
      connected: false,
      status: 'inactive',
      permissions: ['Lecture des tableaux', 'Mise à jour des cellules', 'Génération de graphiques liés'],
    },
    gmail: {
      id: 'gmail',
      name: 'Gmail',
      category: 'communication',
      description: 'Extraction intelligente de pièces jointes, rédaction de réponses et résumés d\'e-mails.',
      connected: false,
      status: 'inactive',
      permissions: ['Lecture des e-mails', 'Préparation de brouillons', 'Extraction de pièces jointes'],
    },
    googleDrive: {
      id: 'googleDrive',
      name: 'Google Drive',
      category: 'storage',
      description: 'Accès et indexation des documents de recherche, datasets et rapports d\'analyses.',
      connected: false,
      status: 'inactive',
      permissions: ['Lecture de documents PDF & CSV', 'Sauvegarde automatique des graphiques'],
    },
    dicomViewer: {
      id: 'dicomViewer',
      name: 'PACS & IRM Viewer',
      category: 'medical',
      description: 'Passerelle DICOM/NIfTI pour l\'importation et l\'analyse automatisée des IRM cérébrales.',
      connected: false,
      status: 'inactive',
      permissions: ['Flux DICOM sécurisé', 'Segmentation IRM Cérébrale', 'Extraction métadonnées de séquence'],
    },
    slack: {
      id: 'slack',
      name: 'Slack',
      category: 'communication',
      description: 'Partage instantané de résultats d\'analyses statistiques et résumés d\'équipes.',
      connected: false,
      status: 'inactive',
      permissions: ['Envoi de messages dans les canaux #data-science & #general'],
    },
  },
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [chats, setChats] = useState<Chat[]>([]);
  const [guestChats, setGuestChats] = useState<Chat[]>(() => {
    const saved = localStorage.getItem('tchoumi_guest_chats');
    return saved ? JSON.parse(saved) : [];
  });
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showLiveVoice, setShowLiveVoice] = useState(false);
  const [requestedUpgradePlan, setRequestedUpgradePlan] = useState<UserPlan | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('tchoumi_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const merged = { ...DEFAULT_SETTINGS, ...parsed, apiKeys: {} };
        const isKnownModel = TCHOUMI_MODELS.some((m) => m.id === merged.selectedModel);
        if (!isKnownModel) {
          merged.selectedModel = 'tchoumi-pulse';
        }
        return merged;
      } catch (e) {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeView, setActiveView] = useState<'chat' | 'settings'>('chat');
  const [settingsCategory, setSettingsCategory] = useState<string>('general');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return true;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasInterrupted, setWasInterrupted] = useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });
      } else {
        setUser(null);
        setSettings(prev => ({ ...prev, plan: 'free' }));
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Sync user plan from Firestore (Plus / Pro / Ultra managed by founder)
  useEffect(() => {
    if (!user || !user.email) {
      setSettings(prev => ({ ...prev, plan: 'free' }));
      return;
    }

    const emailKey = user.email.toLowerCase().trim();
    const isFounderAccount = emailKey === 'ronysite4@gmail.com';
    const proDocRef = doc(db, 'pro_users', emailKey);

    const unsubPro = onSnapshot(proDocRef, (snap) => {
      if (snap.exists() && snap.data()?.status === 'active') {
        const rawPlan = snap.data()?.plan;
        const resolvedPlan: UserPlan =
          rawPlan === 'plus' || rawPlan === 'pro' || rawPlan === 'ultra' ? rawPlan : 'pro';
        setSettings(prev => ({ ...prev, plan: resolvedPlan }));
      } else {
        setSettings(prev => ({ ...prev, plan: isFounderAccount ? 'ultra' : 'free' }));
      }
    }, () => {
      setSettings(prev => ({ ...prev, plan: isFounderAccount ? 'ultra' : 'free' }));
    });

    return () => unsubPro();
  }, [user]);

  // Firestore sync
  useEffect(() => {
    if (!user) {
      setChats([]);
      return;
    }

    const chatsRef = collection(db, 'users', user.uid, 'chats');
    const q = query(chatsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedChats: Chat[] = [];
      snapshot.forEach((doc) => {
        fetchedChats.push({ id: doc.id, ...doc.data() } as Chat);
      });
      setChats(fetchedChats);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/chats`);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (isAuthReady) {
      // Instant transition once auth state is resolved
      setIsAppLoading(false);
    }
  }, [isAuthReady]);

  useEffect(() => {
    localStorage.setItem('tchoumi_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('tchoumi_guest_chats', JSON.stringify(guestChats));
  }, [guestChats]);

  const currentChats = user ? chats : guestChats;
  const activeChat = currentChats.find(c => c.id === activeChatId) || null;

  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const handleNewChat = async () => {
    const chatId = generateId();
    const newChat = {
      id: chatId,
      title: '',
      messages: [],
      createdAt: Date.now(),
      userId: user?.uid || 'guest',
    };

    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid, 'chats', chatId), sanitizeForFirestore(newChat));
        setActiveChatId(chatId);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/chats/${chatId}`);
      }
    } else {
      setGuestChats([newChat, ...guestChats]);
      setActiveChatId(chatId);
    }
  };

  const handleDeleteChat = async (id: string) => {
    if (user) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'chats', id));
        if (activeChatId === id) setActiveChatId(null);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/chats/${id}`);
      }
    } else {
      setGuestChats(guestChats.filter(c => c.id !== id));
      if (activeChatId === id) setActiveChatId(null);
    }
  };

  const handleClearHistory = async () => {
    if (user) {
      try {
        const batch = writeBatch(db);
        const chatsRef = collection(db, 'users', user.uid, 'chats');
        const snapshot = await getDocs(chatsRef);
        snapshot.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        setActiveChatId(null);
        setActiveView('chat');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/chats`);
      }
    } else {
      setGuestChats([]);
      setActiveChatId(null);
      setActiveView('chat');
    }
  };

  const handleSendMessage = async (content: string, attachments?: Attachment[], overrideMessages?: Message[]) => {
    let currentChatId = activeChatId;
    let currentChatObj = activeChat;
    setWasInterrupted(false);

    // Create new chat if none active
    if (!currentChatId) {
      currentChatId = generateId();
      const displayTitle = content.trim() 
        ? (content.slice(0, 30) + (content.length > 30 ? '...' : '')) 
        : (attachments && attachments.length > 0 ? `Analyse ${attachments[0].name}` : 'Nouvelle discussion');
      
      const newChat = {
        id: currentChatId,
        title: displayTitle,
        messages: [],
        createdAt: Date.now(),
        userId: user?.uid || 'guest',
      };
      
      if (user) {
        try {
          await setDoc(doc(db, 'users', user.uid, 'chats', currentChatId), sanitizeForFirestore(newChat));
          setActiveChatId(currentChatId);
          currentChatObj = newChat as Chat;
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/chats/${currentChatId}`);
          return;
        }
      } else {
        setGuestChats([newChat, ...guestChats]);
        setActiveChatId(currentChatId);
        currentChatObj = newChat as Chat;
      }
    }

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    };

    const updatedMessages = overrideMessages || [...(currentChatObj?.messages || []), userMessage];
    const chatTitle = currentChatObj?.title && currentChatObj.title !== 'Nouveau Chat' 
      ? currentChatObj.title 
      : (content.slice(0, 30) + (content.length > 30 ? '...' : ''));
    
    const saveChatState = async (chatId: string, messagesList: Message[], titleStr?: string) => {
      if (user) {
        try {
          const payload: any = {
            messages: messagesList,
            updatedAt: Date.now(),
            userId: user.uid,
          };
          if (titleStr) payload.title = titleStr;
          const sanitizedPayload = sanitizeForFirestore(payload);
          await setDoc(doc(db, 'users', user.uid, 'chats', chatId), sanitizedPayload, { merge: true });
        } catch (err: any) {
          console.error("Failed to sync chat to Firestore:", err);
          // If size limit or transient error, keep local state intact
        }
      } else {
        setGuestChats(prev => prev.map(c => 
          c.id === chatId 
            ? { ...c, messages: messagesList, ...(titleStr ? { title: titleStr } : {}) } 
            : c
        ));
      }
    };

    await saveChatState(currentChatId, updatedMessages, chatTitle);

    setIsLoading(true);
    setError(null);
    abortControllerRef.current = new AbortController();

    const assistantMessageId = generateId();
    let assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    // Add empty assistant message for streaming
    await saveChatState(currentChatId, [...updatedMessages, assistantMessage]);

    let latestStreamedText = "";
    let latestStreamedThoughts = "";

    try {
      let responseContent = "";
      let responseThoughts = "";

      // Check for video generation request (Pro & Ultra exclusive)
      const isDirectVideoRequest =
        /(g[eé]n[eé]r|cr[eé]|fai[st]|produi|r[eé]alis|generat|creat|make).*(vid[eé]o|clip|film|reel|animation)/i.test(content) ||
        /^(vid[eé]o|clip)\s+(de|d'|du|sur|pour|about|of)/i.test(content.trim()) ||
        content.toLowerCase().startsWith('/video');

      const effectivePlan: UserPlan = settings.plan || 'free';
      const hasProVideoAccess = hasPlanAccess(effectivePlan, 'pro');

      // Check for direct image generation request without attached images
      const hasImageAttachment = attachments && attachments.some(a => a.mimeType?.startsWith('image/') || a.type?.startsWith('image/'));
      const isDirectImageRequest =
        !isDirectVideoRequest &&
        !hasImageAttachment && (
          /(g[eé]n[eé]r|cr[eé]|dessin|pein|illustr|fai[st]|produi|rend|draw|generat|creat|make).*(image|dessin|illustration|visuel|portrait|photo|tableau d'art|picture|artwork|avatar)/i.test(content) ||
          /^(image|photo|dessin|illustration|portrait)\s+(de|d'|du|des|d'un|d'une|pour|sur)/i.test(content.trim()) ||
          content.toLowerCase().startsWith('/image') ||
          content.toLowerCase().startsWith('/imagine')
        );

      if (isDirectVideoRequest && !hasProVideoAccess) {
        responseContent =
          settings.language === 'en'
            ? `🎬 **AI Video Generation is reserved for Pro & Ultra plans**\n\nYour current plan (**${effectivePlan.toUpperCase()}**) does not include AI Video Generation.\n\n- **Plan Pro (12,559 FCFA / year)** : Unlocks **Tchoumi Titan** & AI Video Studio\n- **Plan Ultra (29,900 FCFA / year)** : Unlocks **Tchoumi Sovereign** & Priority HD Video\n\nClick **Upgrade** in the modal that just opened (or go to **Settings > Account & Plan**) to activate your Pro access with the Founder.`
            : `🎬 **La génération de vidéo IA est réservée aux formules Pro et Ultra**\n\nVotre formule actuelle (**${effectivePlan.toUpperCase()}**) n'inclut pas encore la création de vidéo.\n\n- **Plan Pro (12 559 FCFA / an)** : Débloque **Tchoumi Titan** & la Génération de Vidéo IA\n- **Plan Ultra (29 900 FCFA / an)** : Débloque **Tchoumi Sovereign** & la Vidéo HD prioritaire\n\nValidez votre passage au **Plan Pro** dans la fenêtre qui vient de s'ouvrir (ou dans **Paramètres > Compte & Abonnement**) pour débloquer cette fonctionnalité.`;
        assistantMessage.content = responseContent;
        setRequestedUpgradePlan('pro');
      } else if (isDirectImageRequest) {
        responseContent = await generateImage(content);
        assistantMessage.content = responseContent;
      } else {
        const selectedDef = getModelById(settings.selectedModel);
        const safeModelId = hasPlanAccess(effectivePlan, selectedDef.requiredPlan)
          ? selectedDef.id
          : 'tchoumi-pulse';
        const effectiveModelId = isDirectVideoRequest ? 'tchoumi-titan' : safeModelId;
        const effectiveCustomInstructions = isDirectVideoRequest
          ? `${settings.customInstructions || ''}\n\n[STUDIO VIDÉO PRO ACTIF] L'utilisateur dispose du Plan ${effectivePlan.toUpperCase()}. Produis un dossier complet de production vidéo prêt à tourner/générer : 1) Concept & direction artistique, 2) Découpage scène par scène (timecodes, mouvements de caméra, lumière, ambiance sonore/voix off), 3) Prompt vidéo haute précision optimisé prêt à copier pour le rendu vidéo.`
          : settings.customInstructions;

        // Stream response via server-side /api/chat SSE endpoint
        const streamResult = await callGeminiStream(
          updatedMessages,
          effectiveModelId,
          (chunkText, chunkThoughts) => {
            latestStreamedText = chunkText;
            latestStreamedThoughts = chunkThoughts || "";
            const streamingAssistantMsg: Message = {
              ...assistantMessage,
              content: chunkText,
              ...(chunkThoughts ? { thoughts: chunkThoughts } : {}),
            };
            // Update local state during streaming immediately
            if (user) {
              setChats(prev => prev.map(c => 
                c.id === currentChatId 
                  ? { ...c, messages: [...updatedMessages, streamingAssistantMsg] } 
                  : c
              ));
            } else {
              setGuestChats(prev => prev.map(c => 
                c.id === currentChatId 
                  ? { ...c, messages: [...updatedMessages, streamingAssistantMsg] } 
                  : c
              ));
            }
          },
          abortControllerRef.current?.signal,
          effectiveCustomInstructions
        );

        responseContent = streamResult.text;
        responseThoughts = streamResult.thoughts;

        // Check if Gemini suggested an image or returned an action
        if (responseContent.includes('"action"') && (responseContent.includes('dalle') || responseContent.includes('text2im') || responseContent.includes('image'))) {
          try {
            const parsed = JSON.parse(responseContent);
            let promptToUse = content;
            if (parsed.action_input) {
              if (typeof parsed.action_input === 'string') {
                try {
                  const inner = JSON.parse(parsed.action_input);
                  if (inner.prompt) promptToUse = inner.prompt;
                } catch {
                  promptToUse = parsed.action_input;
                }
              } else if (parsed.action_input.prompt) {
                promptToUse = parsed.action_input.prompt;
              }
            }
            const generatedUrl = await generateImage(promptToUse);
            responseContent = `Voici la photo générée :\n\n![](${generatedUrl})`;
          } catch {
            const generatedUrl = await generateImage(content);
            responseContent = `Voici la photo générée :\n\n![](${generatedUrl})`;
          }
        }

        assistantMessage.content = responseContent;
        if (responseThoughts) {
          assistantMessage.thoughts = responseThoughts;
        }
      }

      // Final update after stream or image generation
      await saveChatState(currentChatId, [...updatedMessages, assistantMessage]);

    } catch (err: any) {
      if (!latestStreamedText.trim()) {
        await saveChatState(currentChatId, updatedMessages);
      } else {
        await saveChatState(currentChatId, [
          ...updatedMessages,
          {
            ...assistantMessage,
            content: latestStreamedText,
            ...(latestStreamedThoughts ? { thoughts: latestStreamedThoughts } : {}),
          },
        ]);
      }

      if (err.message !== "Generation aborted") {
        const readableError = err.message?.includes('projects/')
          ? "Une erreur de synchronisation est survenue lors de l'enregistrement de la discussion."
          : formatFriendlyErrorMessage(err);
        setError(readableError);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setWasInterrupted(true);
    }
  };

  const handleContinueGeneration = async () => {
    if (!activeChat || activeChat.messages.length === 0) return;
    
    const lastMessage = activeChat.messages[activeChat.messages.length - 1];
    if (lastMessage.role !== 'assistant') return;

    setIsLoading(true);
    setError(null);
    setWasInterrupted(false);
    abortControllerRef.current = new AbortController();

    try {
      const streamResult = await callGeminiStream(
        activeChat.messages,
        settings.selectedModel || 'gemini-4-hydrogen',
        (chunkText, chunkThoughts) => {
          const updatedMessages = activeChat.messages.map((m, idx) => 
            idx === activeChat.messages.length - 1 
              ? {
                  ...m,
                  content: lastMessage.content + chunkText,
                  ...(chunkThoughts ? { thoughts: (lastMessage.thoughts || '') + chunkThoughts } : {}),
                }
              : m
          );

          if (user) {
            setChats(prev => prev.map(c => 
              c.id === activeChatId ? { ...c, messages: updatedMessages } : c
            ));
          } else {
            setGuestChats(prev => prev.map(c => 
              c.id === activeChatId ? { ...c, messages: updatedMessages } : c
            ));
          }
        },
        abortControllerRef.current?.signal,
        settings.customInstructions
      );

      const finalMessages = activeChat.messages.map((m, idx) => 
        idx === activeChat.messages.length - 1 
          ? {
              ...m,
              content: lastMessage.content + streamResult.text,
              ...(streamResult.thoughts ? { thoughts: (lastMessage.thoughts || '') + streamResult.thoughts } : {}),
            }
          : m
      );

      if (user) {
        await setDoc(doc(db, 'users', user.uid, 'chats', activeChatId!), sanitizeForFirestore({
          messages: finalMessages,
          updatedAt: Date.now(),
          userId: user.uid,
        }), { merge: true });
      } else {
        setGuestChats(prev => prev.map(c => 
          c.id === activeChatId ? { ...c, messages: finalMessages } : c
        ));
      }
    } catch (err: any) {
      if (err.message !== "Generation aborted") {
        setError(formatFriendlyErrorMessage(err));
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleEditMessage = async (id: string, newContent: string) => {
    if (!activeChatId || !activeChat) return;

    const messageIndex = activeChat.messages.findIndex(m => m.id === id);
    if (messageIndex === -1) return;

    // Truncate history after the edited message
    const updatedMessages = activeChat.messages.slice(0, messageIndex + 1).map(m => 
      m.id === id ? { ...m, content: newContent } : m
    );

    const updatedTitle = messageIndex === 0 ? newContent.slice(0, 30) + (newContent.length > 30 ? '...' : '') : activeChat.title;

    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid, 'chats', activeChatId), sanitizeForFirestore({
          messages: updatedMessages,
          title: updatedTitle,
          updatedAt: Date.now(),
          userId: user.uid,
        }), { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/chats/${activeChatId}`);
      }
    } else {
      setGuestChats(prev => prev.map(c => 
        c.id === activeChatId 
          ? { ...c, messages: updatedMessages, title: updatedTitle } 
          : c
      ));
    }

    // Re-trigger generation using the truncated history
    handleSendMessage(newContent, undefined, updatedMessages);
  };

  const handleRetryMessage = async (messageId?: string) => {
    if (!activeChatId || !activeChat || activeChat.messages.length === 0) return;

    setError(null);
    setWasInterrupted(false);

    let targetIndex = activeChat.messages.length - 1;
    if (messageId) {
      const foundIdx = activeChat.messages.findIndex(m => m.id === messageId);
      if (foundIdx !== -1) {
        targetIndex = foundIdx;
      }
    }

    // If the targeted message is an assistant message, we locate the user prompt right before it
    let userMsgIndex = targetIndex;
    if (activeChat.messages[targetIndex].role === 'assistant') {
      userMsgIndex = targetIndex - 1;
    }

    if (userMsgIndex < 0) return;
    const userMsg = activeChat.messages[userMsgIndex];

    // Truncate history to the user message
    const truncatedHistory = activeChat.messages.slice(0, userMsgIndex + 1);

    // Re-trigger generation
    await handleSendMessage(userMsg.content, userMsg.attachments, truncatedHistory);
  };

  const handleSaveVoiceTranscript = async (turns: VoiceTranscriptTurn[]) => {
    if (!turns || turns.length === 0) return;

    const now = Date.now();
    const voiceMessages: Message[] = turns.map((t, index) => ({
      id: generateId(),
      role: t.role,
      content: t.text,
      timestamp: now + index,
    }));

    const firstUserLine = turns.find((t) => t.role === 'user')?.text || turns[0].text;
    const defaultTitle = firstUserLine.slice(0, 32) + (firstUserLine.length > 32 ? '...' : '');

    if (!activeChatId || !activeChat) {
      const newChatId = generateId();
      const newChat: Chat = {
        id: newChatId,
        title: defaultTitle || 'Tchoumi Voice',
        messages: voiceMessages,
        createdAt: now,
      };

      if (user) {
        try {
          await setDoc(
            doc(db, 'users', user.uid, 'chats', newChatId),
            sanitizeForFirestore({ ...newChat, userId: user.uid })
          );
          setActiveChatId(newChatId);
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/chats/${newChatId}`);
        }
      } else {
        setGuestChats((prev) => [newChat, ...prev]);
        setActiveChatId(newChatId);
      }
      return;
    }

    const updatedMessages = [...activeChat.messages, ...voiceMessages];
    const updatedTitle =
      activeChat.title && activeChat.title !== 'Nouveau Chat'
        ? activeChat.title
        : defaultTitle || 'Tchoumi Voice';

    if (user) {
      try {
        await setDoc(
          doc(db, 'users', user.uid, 'chats', activeChatId),
          sanitizeForFirestore({
            messages: updatedMessages,
            title: updatedTitle,
            updatedAt: now,
            userId: user.uid,
          }),
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/chats/${activeChatId}`);
      }
    } else {
      setGuestChats((prev) =>
        prev.map((c) =>
          c.id === activeChatId ? { ...c, messages: updatedMessages, title: updatedTitle } : c
        )
      );
    }
  };

  if (!isAuthReady) return null;

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#0e0f13]">
      <AnimatePresence>
        {isAppLoading && <LoadingScreen key="loading" language={settings.language} />}
      </AnimatePresence>

      {/* Login Prompt Modal */}
      <AnimatePresence>
        {showLoginPrompt && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="relative max-w-md w-full bg-[#0d0e17] p-6 sm:p-8 rounded-3xl border border-indigo-500/20 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden"
            >
              {/* Subtle ambient light gradient */}
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

              {/* Close Button */}
              <button
                onClick={() => setShowLoginPrompt(false)}
                className="absolute top-4 right-4 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors border border-white/5"
                title="Fermer"
              >
                <X size={18} />
              </button>

              {/* Header */}
              <div className="flex flex-col items-center text-center space-y-4 pt-2">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 p-0.5 shadow-xl shadow-indigo-500/25 flex items-center justify-center">
                    <div className="w-full h-full bg-[#0a0b12] rounded-[14px] flex items-center justify-center overflow-hidden">
                      <img 
                        src={AI_AVATAR_URL} 
                        alt="Logo" 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          if (target.parentElement) {
                            target.parentElement.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-indigo-600/20 text-indigo-400"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg></div>`;
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-indigo-600 border-2 border-[#0d0e17] flex items-center justify-center text-white">
                    <Sparkles size={11} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                    {translations[settings.language].loginModal.welcome}
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-400 max-w-xs mx-auto leading-relaxed">
                    {translations[settings.language].loginModal.subtitle}
                  </p>
                </div>
              </div>

              {/* Value propositions */}
              <div className="my-5 p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-2.5 text-left">
                <div className="flex items-center gap-2.5 text-xs text-gray-300">
                  <div className="w-5 h-5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                    <Cloud size={12} />
                  </div>
                  <span className="font-normal text-gray-200">{translations[settings.language].loginModal.benefit1}</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-gray-300">
                  <div className="w-5 h-5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                    <Zap size={12} />
                  </div>
                  <span className="font-normal text-gray-200">{translations[settings.language].loginModal.benefit2}</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-gray-300">
                  <div className="w-5 h-5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                    <ShieldCheck size={12} />
                  </div>
                  <span className="font-normal text-gray-200">{translations[settings.language].loginModal.benefit3}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => {
                    loginWithGoogle();
                    setShowLoginPrompt(false);
                  }}
                  className="w-full py-3.5 px-4 bg-white hover:bg-gray-100 text-gray-900 rounded-xl font-semibold text-sm flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg shadow-white/10 cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>{translations[settings.language].loginModal.googleSignIn}</span>
                </button>

                <button
                  onClick={() => setShowLoginPrompt(false)}
                  className="w-full py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-xs font-medium cursor-pointer"
                >
                  {translations[settings.language].loginModal.guestMode}
                </button>
              </div>

              {/* Footer Trust Note */}
              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-center gap-1.5 text-[11px] text-gray-500">
                <Lock size={11} className="text-gray-400" />
                <span>
                  {settings.language === 'en'
                    ? "Google OAuth Authentication • No password required"
                    : "Authentification Google OAuth • Aucun mot de passe requis"}
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <div
        className={`fixed md:relative z-40 h-full transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${
          isSidebarOpen
            ? 'translate-x-0 w-64 sm:w-[272px]'
            : '-translate-x-full md:translate-x-0 w-64 sm:w-[272px] md:w-0'
        }`}
      >
        <Sidebar
          chats={currentChats}
          activeChatId={activeChatId}
          language={settings.language}
          user={user}
          plan={settings.plan || 'free'}
          onNewChat={() => {
            setActiveView('chat');
            handleNewChat();
          }}
          onSelectChat={(id) => {
            // Auto-delete previous empty chat if switching
            if (activeChatId && activeChatId !== id) {
              const prevChat = currentChats.find(c => c.id === activeChatId);
              if (prevChat && prevChat.messages.length === 0) {
                handleDeleteChat(activeChatId);
              }
            }
            setActiveChatId(id);
            setActiveView('chat');
            if (window.innerWidth < 768) setIsSidebarOpen(false);
          }}
          onDeleteChat={handleDeleteChat}
          onOpenSettings={(cat) => {
            if (cat) setSettingsCategory(cat);
            setActiveView('settings');
          }}
          onQuickImageMode={() => {
            setActiveView('chat');
            handleNewChat();
          }}
          onLogin={() => setShowLoginPrompt(true)}
          onClose={() => setIsSidebarOpen(false)}
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 min-w-0 h-full relative overflow-hidden">
        <ChatArea
          messages={activeChat?.messages || []}
          settings={settings}
          userPhotoURL={user?.photoURL}
          userEmail={user?.email}
          isLoggedIn={!!user}
          settingsCategory={settingsCategory}
          onSettingsCategoryChange={setSettingsCategory}
          onSendMessage={handleSendMessage}
          onUpdateSettings={setSettings}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onLogin={() => setShowLoginPrompt(true)}
          isSidebarOpen={isSidebarOpen}
          isLoading={isLoading}
          error={error}
          activeView={activeView}
          onViewChange={setActiveView}
          onClearHistory={handleClearHistory}
          onStopGeneration={handleStopGeneration}
          onContinueGeneration={handleContinueGeneration}
          onEditMessage={handleEditMessage}
          onRetry={handleRetryMessage}
          onOpenLiveVoice={() => setShowLiveVoice(true)}
          requestedUpgradePlan={requestedUpgradePlan}
          onClearRequestedUpgradePlan={() => setRequestedUpgradePlan(null)}
          wasInterrupted={wasInterrupted}
        />
      </main>

      <LiveVoiceModal
        isOpen={showLiveVoice}
        language={settings.language}
        customInstructions={settings.customInstructions}
        onClose={() => setShowLiveVoice(false)}
        onSaveTranscript={handleSaveVoiceTranscript}
      />
    </div>
  );
}


