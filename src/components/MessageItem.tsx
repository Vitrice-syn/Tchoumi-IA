import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Language, Message } from '../types';
import {
  Copy, Check, Edit2, Table as TableIcon,
  Download, Volume2, VolumeX,
  Maximize2, X, Sparkles, FileText, Video,
  RefreshCw, RotateCcw, AlertCircle, CornerDownLeft, ChevronDown
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { DataChartRenderer, ChartDataPayload } from './DataChartRenderer';

interface MessageItemProps {
  message: Message;
  userPhotoURL?: string | null;
  onEdit?: (id: string, newContent: string) => void;
  onRetry?: (messageId?: string) => void;
  isStreaming?: boolean;
  language?: Language;
}

const GeminiSparkle: React.FC<{ active?: boolean; className?: string }> = ({ active = false, className }) => {
  const gradId = React.useId();
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn(
        "w-5 h-5 shrink-0",
        active && "gemini-star-active",
        className
      )}
    >
      <defs>
        <linearGradient id={gradId} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="55%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <path
        d="M12 2C12.35 7.45 16.55 11.65 22 12C16.55 12.35 12.35 16.55 12 22C11.65 16.55 7.45 12.35 2 12C7.45 11.65 11.65 7.45 12 2Z"
        fill={`url(#${gradId})`}
      />
    </svg>
  );
};

const TableRenderer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const tableRef = React.useRef<HTMLTableElement>(null);
  const [copied, setCopied] = React.useState(false);

  const handleCopyTable = () => {
    if (!tableRef.current) return;
    const text = tableRef.current.innerText;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCSV = () => {
    if (!tableRef.current) return;
    const rows = Array.from(tableRef.current.querySelectorAll('tr'));
    const csvContent = rows
      .map(row => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        return cells.map(cell => `"${(cell.textContent || '').replace(/"/g, '""').trim()}"`).join(',');
      })
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `tableau_tchoumi_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-3 sm:my-5 rounded-xl sm:rounded-2xl border border-white/10 overflow-hidden bg-[#07070a] shadow-xl w-full max-w-full">
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 bg-white/[0.03] border-b border-white/10 text-xs">
        <div className="flex items-center gap-1.5 sm:gap-2 font-medium text-gray-300 min-w-0">
          <TableIcon size={14} className="text-indigo-400 shrink-0" />
          <span className="font-semibold text-xs text-indigo-200 truncate">Tableau</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            onClick={handleCopyTable}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all text-[10px] sm:text-[11px] font-medium cursor-pointer"
            title="Copier le tableau"
          >
            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            <span className="hidden xs:inline sm:inline">{copied ? "Copié" : "Copier"}</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white transition-all text-[10px] sm:text-[11px] font-medium border border-indigo-500/20 cursor-pointer"
            title="Exporter au format CSV"
          >
            <Download size={12} />
            <span className="hidden xs:inline sm:inline">CSV</span>
          </button>
        </div>
      </div>
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 w-full max-w-full -webkit-overflow-scrolling-touch">
        <table ref={tableRef} className="w-full text-left border-collapse text-xs sm:text-sm min-w-full">
          {children}
        </table>
      </div>
    </div>
  );
};

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onEdit,
  onRetry,
  isStreaming = false,
  language = 'fr',
}) => {
  const isAssistant = message.role === 'assistant';
  const [copied, setCopied] = React.useState<string | null>(null);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(message.content);
  const [isSpeaking, setIsSpeaking] = React.useState(false);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);
  const [showMobileActions, setShowMobileActions] = React.useState(false);
  const [showThoughts, setShowThoughts] = React.useState(false);
  const longPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    setEditValue(message.content);
  }, [message.content]);

  // Stop speech when unmounted
  React.useEffect(() => {
    return () => {
      if (isSpeaking && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isSpeaking]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => {
      setCopied(null);
      setShowMobileActions(false);
    }, 1800);
  };

  const handleSaveEdit = () => {
    if (onEdit && editValue.trim() !== message.content) {
      onEdit(message.id, editValue);
    }
    setIsEditing(false);
    setShowMobileActions(false);
  };

  // Mobile long-press / hold detection for user message actions
  const handleTouchStart = () => {
    if (isAssistant) return;
    longPressTimerRef.current = setTimeout(() => {
      setShowMobileActions(true);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(40); } catch {}
      }
    }, 380);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleToggleSpeech = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    // Clean text for natural speech
    const cleanText = message.content
      .replace(/```[\s\S]*?```/g, " Bloc de code omis pour l'écoute. ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\|.*?\|/g, " ")
      .replace(/[#*_~>]/g, "")
      .replace(/\$+(.*?)\$+/g, "$1")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = language === 'en' ? 'en-US' : 'fr-FR';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const targetPrefix = language === 'en' ? 'en' : 'fr';
    const preferredVoice =
      voices.find(
        v =>
          v.lang.startsWith(targetPrefix) &&
          (v.name.includes('Google') ||
            v.name.includes('Natural') ||
            v.name.includes('Premium') ||
            v.name.includes('Thomas') ||
            v.name.includes('Audrey') ||
            v.name.includes('Amelie'))
      ) || voices.find(v => v.lang.startsWith(targetPrefix));
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const isImageContent = message.content.startsWith('data:image') ||
    (message.content.startsWith('http') && (message.content.includes('pollinations.ai') || message.content.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i)));

  const isErrorMessage = isAssistant && (
    message.content.toLowerCase().startsWith('erreur') ||
    message.content.toLowerCase().startsWith('error') ||
    message.content.toLowerCase().includes('quota') ||
    message.content.toLowerCase().includes('limite') ||
    message.content.toLowerCase().includes('surchargé')
  );

  const isThinkingPhase = isAssistant && isStreaming && !message.content.trim();
  const hasThoughts = Boolean(message.thoughts && message.thoughts.trim().length > 0);

  const thinkingLabels = language === 'en'
    ? {
        thinking: 'Tchoumi IA réfléchit...',
        showThinking: 'Show thinking',
        hideThinking: 'Hide thinking',
        listen: 'Listen',
        stopAudio: 'Stop audio',
        copy: 'Copy',
        copied: 'Copied',
        regenerate: 'Regenerate',
      }
    : {
        thinking: 'Tchoumi IA réfléchit...',
        showThinking: 'Afficher le raisonnement',
        hideThinking: 'Masquer le raisonnement',
        listen: 'Écouter',
        stopAudio: "Arrêter l'audio",
        copy: 'Copier',
        copied: 'Copié',
        regenerate: 'Régénérer',
      };

  return (
    <div
      className={cn(
        "group relative w-full transition-colors",
        isAssistant ? "flex justify-start" : "flex justify-end"
      )}
    >
      {/* Lightbox Modal for enlarged image */}
      <AnimatePresence>
        {previewImage && (
          <div
            className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setPreviewImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={previewImage}
                alt="Agrandissement"
                className="rounded-2xl max-h-[80vh] w-auto object-contain shadow-2xl border border-white/10"
              />
              <div className="mt-4 flex items-center gap-3">
                <a
                  href={previewImage}
                  download={`tchoumi_image_${Date.now()}.png`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg transition-all cursor-pointer"
                >
                  <Download size={14} />
                  Télécharger en HD
                </a>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all cursor-pointer"
                  title="Fermer"
                >
                  <X size={18} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Content Container */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
        onClick={() => {
          if (!isAssistant && !isEditing) {
            setShowMobileActions(prev => !prev);
          }
        }}
        className={cn(
          "min-w-0 relative break-words transition-all",
          !isAssistant
            ? isEditing
              ? "w-full max-w-full sm:max-w-[85%]"
              : "max-w-[85%] sm:max-w-[75%] bg-[#173663] hover:bg-[#1a3d70] text-white/95 rounded-3xl px-4 sm:px-5 py-2.5 sm:py-3 shadow-sm select-text cursor-pointer sm:cursor-default"
            : "w-full max-w-full prose prose-invert prose-p:leading-relaxed prose-pre:bg-[#07070b] prose-pre:border prose-pre:border-white/10 prose-code:text-indigo-300"
        )}
      >
        {/* User Attachments Preview */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2.5 not-prose">
            {message.attachments.map((att, idx) => (
              <div
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  if (att.dataUrl && att.type.startsWith('image/')) setPreviewImage(att.dataUrl);
                }}
                className="flex items-center gap-2 p-2 bg-black/25 border border-white/15 rounded-2xl max-w-xs cursor-pointer hover:bg-black/35 transition-all group/att"
              >
                {att.type.startsWith('image/') ? (
                  <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-white/10 relative">
                    <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/att:opacity-100 flex items-center justify-center transition-opacity">
                      <Maximize2 size={12} className="text-white" />
                    </div>
                  </div>
                ) : att.type.startsWith('video/') ? (
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-300 shrink-0">
                    <Video size={18} />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-indigo-200 shrink-0">
                    <FileText size={18} />
                  </div>
                )}
                <div className="flex flex-col min-w-0 pr-1">
                  <span className="text-xs text-white truncate font-medium">{att.name}</span>
                  <span className="text-[10px] text-white/60 tabular-nums">{(att.size / 1024).toFixed(0)} KB</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* User Action buttons (Desktop hover + Mobile on tap/hold) */}
        {!isAssistant && !isEditing && (
          <>
            <div className="hidden sm:flex absolute -left-24 top-1/2 -translate-y-1/2 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 not-prose">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy(message.content);
                }}
                className="p-1.5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors cursor-pointer"
                title={thinkingLabels.copy}
                aria-label={thinkingLabels.copy}
              >
                {copied === message.content ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                className="p-1.5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors cursor-pointer"
                title="Modifier le message"
                aria-label="Modifier le message"
              >
                <Edit2 size={14} />
              </button>
              {onRetry && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry(message.id);
                  }}
                  className="p-1.5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors cursor-pointer"
                  title="Relancer cette question"
                  aria-label="Relancer cette question"
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>

            <AnimatePresence>
              {showMobileActions && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: 6 }}
                  className="sm:hidden absolute -top-11 right-0 flex items-center gap-1 bg-[#141620] border border-white/15 rounded-xl px-2 py-1 shadow-2xl z-30 not-prose backdrop-blur-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => handleCopy(message.content)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 active:bg-white/15 text-gray-200 text-xs font-medium"
                  >
                    {copied === message.content ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    <span>{copied === message.content ? thinkingLabels.copied : thinkingLabels.copy}</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      setShowMobileActions(false);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/30 active:bg-indigo-600/50 text-indigo-200 text-xs font-medium"
                  >
                    <Edit2 size={13} />
                    <span>Modifier</span>
                  </button>
                  <button
                    onClick={() => setShowMobileActions(false)}
                    className="p-1 text-gray-400 hover:text-white rounded-md"
                  >
                    <X size={13} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {isEditing ? (
          <div className="space-y-3 not-prose bg-[#11131b] border border-white/15 rounded-2xl p-3">
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full p-2.5 bg-[#0a0b10] border border-white/10 rounded-xl text-white text-sm sm:text-[15px] outline-none focus:border-indigo-500 transition-colors resize-none min-h-[96px]"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-3.5 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <CornerDownLeft size={12} />
                <span>Enregistrer & Relancer</span>
              </button>
            </div>
          </div>
        ) : isImageContent ? (
          /* Generated Image Display */
          <div className="not-prose my-2">
            <div className="relative group/img rounded-2xl overflow-hidden border border-white/10 shadow-2xl max-w-xl bg-black/60">
              <img
                src={message.content}
                alt="Image générée par Tchoumi IA"
                className="w-full h-auto object-cover max-h-[500px]"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity flex items-end justify-between p-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Sparkles size={14} className="text-indigo-400" />
                    Générée par Tchoumi IA
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewImage(message.content)}
                    className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-xl backdrop-blur-md transition-all shadow-lg cursor-pointer"
                    title="Agrandir"
                  >
                    <Maximize2 size={14} />
                  </button>
                  <a
                    href={message.content}
                    download={`tchoumi_gen_${Date.now()}.png`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold backdrop-blur-md transition-all shadow-lg cursor-pointer"
                    title="Télécharger l'image"
                  >
                    <Download size={14} />
                    <span>Enregistrer</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        ) : !isAssistant ? (
          /* User text display inside sleek right-aligned bubble */
          <div className="text-[15px] leading-relaxed text-white/95 whitespace-pre-wrap font-normal">
            {message.content}
          </div>
        ) : (
          <div className="w-full min-w-0 max-w-full overflow-hidden">
            {/* Gemini-style Thinking / Reflection Header & Collapsible Thoughts */}
            {(isThinkingPhase || hasThoughts || isStreaming) && (
              <div className="not-prose mb-2.5">
                <div className="flex items-center gap-2.5">
                  <GeminiSparkle active={isThinkingPhase || isStreaming} />
                  {hasThoughts ? (
                    <button
                      type="button"
                      onClick={() => setShowThoughts(prev => !prev)}
                      className="inline-flex items-center gap-1.5 text-xs sm:text-[13px] font-medium text-gray-400 hover:text-gray-200 transition-colors cursor-pointer py-1"
                    >
                      <span>
                        {isThinkingPhase
                          ? thinkingLabels.thinking
                          : showThoughts
                            ? thinkingLabels.hideThinking
                            : thinkingLabels.showThinking}
                      </span>
                      <ChevronDown
                        size={14}
                        className={cn(
                          "transition-transform duration-200",
                          showThoughts && "rotate-180"
                        )}
                      />
                    </button>
                  ) : isThinkingPhase ? (
                    <span className="text-xs sm:text-[13px] font-medium text-gray-300 tracking-wide">
                      {thinkingLabels.thinking}
                    </span>
                  ) : null}
                </div>

                {/* Shimmer bars while waiting for the answer during reflection */}
                {isThinkingPhase && !(showThoughts && hasThoughts) && (
                  <div className="mt-3 pl-7 space-y-2.5 max-w-xl" aria-hidden="true">
                    <div className="h-2.5 w-[88%] rounded-full gemini-shimmer-bar" />
                    <div className="h-2.5 w-[70%] rounded-full gemini-shimmer-bar" />
                    <div className="h-2.5 w-[46%] rounded-full gemini-shimmer-bar" />
                  </div>
                )}

                {/* Collapsible Gemini Reasoning Panel */}
                <AnimatePresence initial={false}>
                  {showThoughts && hasThoughts && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                      className="mt-2.5 ml-7 p-3.5 rounded-2xl bg-white/[0.025] border border-white/[0.08] text-xs sm:text-[13px] text-gray-400 leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10"
                    >
                      {message.thoughts}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Main Markdown Response */}
            {message.content.trim().length > 0 && (
              <div className="text-[15px] sm:text-[15.5px] leading-[1.7] text-[#eceef2]">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    p({ children }) {
                      return <div className="leading-[1.7] break-words my-2 first:mt-0 last:mb-0">{children}</div>;
                    },
                    pre({ children }) {
                      return <div className="w-full min-w-0 max-w-full not-prose my-3 sm:my-4">{children}</div>;
                    },
                    table({ children }) {
                      return <TableRenderer>{children}</TableRenderer>;
                    },
                    thead({ children }) {
                      return <thead className="bg-white/[0.06] text-xs uppercase tracking-wider text-indigo-300 font-semibold border-b border-white/10">{children}</thead>;
                    },
                    tbody({ children }) {
                      return <tbody className="divide-y divide-white/5">{children}</tbody>;
                    },
                    tr({ children }) {
                      return <tr className="hover:bg-white/[0.03] transition-colors odd:bg-transparent even:bg-white/[0.015]">{children}</tr>;
                    },
                    th({ children, style }) {
                      return (
                        <th style={style} className="py-2.5 sm:py-3 px-3 sm:px-4 text-[11px] sm:text-xs font-bold text-indigo-300 border-r last:border-r-0 border-white/5 whitespace-nowrap">
                          {children}
                        </th>
                      );
                    },
                    td({ children, style }) {
                      return (
                        <td style={style} className="py-2.5 sm:py-3 px-3 sm:px-4 text-xs sm:text-sm text-gray-200 border-r last:border-r-0 border-white/5 align-top leading-relaxed">
                          {children}
                        </td>
                      );
                    },
                    img({ src, alt }) {
                      if (!src) return null;
                      const isFounderImage = src.includes('/images/tchoumi') || src.includes('tchoumiia.jpg');
                      return (
                        <div className="not-prose my-3 max-w-lg">
                          <div className="group/img relative rounded-2xl overflow-hidden border border-white/15 bg-black/60 shadow-xl">
                            <img
                              src={src}
                              alt={alt || "Image"}
                              onError={(e) => {
                                if (src !== '/images/tchoumiia.jpg') {
                                  (e.currentTarget as HTMLImageElement).src = '/images/tchoumiia.jpg';
                                }
                              }}
                              className="w-full max-h-[380px] object-cover sm:object-contain bg-black/40 hover:scale-[1.02] transition-transform duration-300 cursor-pointer"
                              onClick={() => setPreviewImage(src)}
                            />
                            <div className="p-3 bg-[#0c0d14] border-t border-white/10 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {isFounderImage && (
                                  <span className="px-2 py-0.5 rounded-md bg-amber-400/10 text-amber-300 border border-amber-400/20 text-[10px] font-bold">
                                    Fondateur
                                  </span>
                                )}
                                <span className="text-xs font-semibold text-gray-200 truncate">
                                  {alt || "Tchoumi Chilic Vitrice"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setPreviewImage(src)}
                                  className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs transition-colors cursor-pointer"
                                  title="Agrandir l'image"
                                >
                                  <Maximize2 size={13} />
                                </button>
                                <a
                                  href={src}
                                  download={`tchoumi_photo_${Date.now()}.jpg`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs transition-colors cursor-pointer"
                                  title="Télécharger l'image"
                                >
                                  <Download size={13} />
                                </a>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    },
                    code({ inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      const codeString = String(children).replace(/\n$/, '');
                      const lang = match ? match[1].toLowerCase() : '';

                      const isBlock = !inline && (Boolean(match) || codeString.includes('\n'));

                      if (isBlock && (lang === 'chart' || lang === 'recharts' || lang === 'json' || className?.includes('chart'))) {
                        try {
                          const trimmed = codeString.trim();
                          if (trimmed.startsWith('{') && (trimmed.includes('"data"') || trimmed.includes('"type"') || trimmed.includes('data:'))) {
                            const parsed: ChartDataPayload = JSON.parse(trimmed);
                            if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
                              return <DataChartRenderer payload={parsed} />;
                            }
                          }
                        } catch {
                          // fallback to syntax highlighter
                        }
                      }

                      if (isBlock) {
                        const displayLang = match ? match[1] : 'code';
                        return (
                          <div className="relative group/code w-full min-w-0 max-w-full rounded-xl overflow-hidden border border-white/10 shadow-lg my-3">
                            <div className="flex items-center justify-between px-3 py-1.5 bg-[#0e0f17] border-b border-white/10 text-[11px]">
                              <span className="font-mono uppercase font-semibold text-indigo-300 text-[11px]">
                                {displayLang}
                              </span>
                              <button
                                onClick={() => handleCopy(codeString)}
                                className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition-all border border-white/10 text-[10px] sm:text-xs cursor-pointer"
                                title="Copier le code"
                              >
                                {copied === codeString ? (
                                  <>
                                    <Check size={12} className="text-green-400" />
                                    <span className="text-green-400 font-medium">Copié</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy size={12} />
                                    <span>Copier</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <div className="overflow-x-auto w-full min-w-0 max-w-full scrollbar-thin scrollbar-thumb-white/10 bg-[#07070a] -webkit-overflow-scrolling-touch">
                              <SyntaxHighlighter
                                style={vscDarkPlus as any}
                                language={match ? match[1] : 'text'}
                                PreTag="div"
                                customStyle={{
                                  margin: 0,
                                  padding: '0.875rem 1rem',
                                  fontSize: '0.78rem',
                                  lineHeight: '1.55',
                                  background: '#07070a',
                                  minWidth: '100%',
                                  width: 'max-content',
                                }}
                                codeTagProps={{
                                  style: {
                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                                  }
                                }}
                                {...props}
                              >
                                {codeString}
                              </SyntaxHighlighter>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <code className={cn("bg-white/10 px-1.5 py-0.5 rounded text-indigo-300 font-mono text-xs break-all inline-block align-middle", className)} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}

            {/* Error Message Card with Retry */}
            {isErrorMessage && onRetry && (
              <div className="mt-3 p-3.5 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-between gap-3 text-red-300 text-xs not-prose shadow-lg">
                <div className="flex items-center gap-2.5 min-w-0">
                  <AlertCircle size={16} className="text-red-400 shrink-0" />
                  <span className="truncate">La génération a rencontré un obstacle. Vous pouvez relancer la réponse.</span>
                </div>
                <button
                  onClick={() => onRetry(message.id)}
                  className="px-3.5 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/40 rounded-xl font-bold flex items-center gap-1.5 shrink-0 transition-all active:scale-95 cursor-pointer shadow-md"
                >
                  <RefreshCw size={13} />
                  <span>Réessayer</span>
                </button>
              </div>
            )}

            {/* Minimal Gemini/ChatGPT-style Icon Action Bar */}
            {!isImageContent && !isStreaming && message.content.trim().length > 0 && (
              <div className="mt-2.5 flex items-center gap-1 not-prose select-none">
                <button
                  type="button"
                  onClick={() => handleCopy(message.content)}
                  className={cn(
                    "p-2 rounded-full transition-colors cursor-pointer",
                    copied === message.content
                      ? "text-emerald-400 bg-emerald-500/10"
                      : "text-gray-400 hover:text-white hover:bg-white/[0.08]"
                  )}
                  title={copied === message.content ? thinkingLabels.copied : thinkingLabels.copy}
                  aria-label={thinkingLabels.copy}
                >
                  {copied === message.content ? <Check size={15} /> : <Copy size={15} />}
                </button>

                <button
                  type="button"
                  onClick={handleToggleSpeech}
                  className={cn(
                    "p-2 rounded-full transition-colors cursor-pointer",
                    isSpeaking
                      ? "text-indigo-300 bg-indigo-500/20"
                      : "text-gray-400 hover:text-white hover:bg-white/[0.08]"
                  )}
                  title={isSpeaking ? thinkingLabels.stopAudio : thinkingLabels.listen}
                  aria-label={isSpeaking ? thinkingLabels.stopAudio : thinkingLabels.listen}
                >
                  {isSpeaking ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>

                {onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(message.id)}
                    className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer group/regen"
                    title={thinkingLabels.regenerate}
                    aria-label={thinkingLabels.regenerate}
                  >
                    <RefreshCw size={15} className="group-hover/regen:rotate-180 transition-transform duration-300" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
