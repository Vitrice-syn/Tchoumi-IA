import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message } from '../types';
import { 
  User, Cpu, Copy, Check, Edit2, Table as TableIcon, 
  Download, Volume2, VolumeX, Image as ImageIcon, 
  Maximize2, X, Sparkles, FileText, Video, Activity,
  RefreshCw, RotateCcw, AlertCircle, CheckCircle2, CornerDownLeft
} from 'lucide-react';
import { AI_AVATAR_URL, USER_AVATAR_URL } from '../constants';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { DataChartRenderer, ChartDataPayload } from './DataChartRenderer';

interface MessageItemProps {
  message: Message;
  userPhotoURL?: string | null;
  onEdit?: (id: string, newContent: string) => void;
  onRetry?: (messageId?: string) => void;
}

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

export const MessageItem: React.FC<MessageItemProps> = ({ message, userPhotoURL, onEdit, onRetry }) => {
  const isAssistant = message.role === 'assistant';
  const [copied, setCopied] = React.useState<string | null>(null);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(message.content);
  const [isSpeaking, setIsSpeaking] = React.useState(false);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);
  const [showMobileActions, setShowMobileActions] = React.useState(false);
  const longPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);

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
    utterance.lang = 'fr-FR';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const frVoice = voices.find(v => v.lang.startsWith('fr') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Premium') || v.name.includes('Thomas') || v.name.includes('Audrey') || v.name.includes('Amelie'))) || voices.find(v => v.lang.startsWith('fr'));
    if (frVoice) {
      utterance.voice = frVoice;
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

  return (
    <div
      className={cn(
        "px-2.5 sm:px-4 md:px-6 lg:px-8 group relative transition-colors w-full flex",
        isAssistant 
          ? "py-4 sm:py-5 bg-[#07080d] border-b border-white/[0.04] justify-start" 
          : "py-2.5 sm:py-3 bg-transparent justify-end"
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

      <div className={cn(
        "flex gap-2.5 sm:gap-3.5 items-start",
        isAssistant 
          ? "flex-row w-full max-w-full" 
          : "flex-row-reverse max-w-[92%] sm:max-w-[80%] md:max-w-[72%] ml-auto"
      )}>
        {/* Avatar */}
        <div className="shrink-0 pt-0.5">
          {isAssistant ? (
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl overflow-hidden bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/20 ring-1 ring-white/10">
              <img 
                src={AI_AVATAR_URL} 
                alt="AI Avatar" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="flex items-center justify-center w-full h-full"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg></div>';
                }}
              />
            </div>
          ) : (
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl overflow-hidden bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-md ring-1 ring-white/10">
              <img 
                src={userPhotoURL || USER_AVATAR_URL} 
                alt="User Avatar" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="flex items-center justify-center w-full h-full"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>';
                }}
              />
            </div>
          )}
        </div>

        {/* Content Box */}
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
            "min-w-0 relative break-words overflow-hidden transition-all",
            !isAssistant 
              ? "bg-[#181928] border border-indigo-500/25 hover:border-indigo-500/40 rounded-2xl rounded-tr-xs p-3.5 sm:p-4 shadow-lg shadow-black/30 text-gray-100 flex-1 select-text cursor-pointer sm:cursor-default" 
              : "flex-1 prose prose-invert max-w-full prose-p:leading-relaxed prose-pre:bg-[#07070b] prose-pre:border prose-pre:border-white/10 prose-code:text-indigo-300"
          )}
        >
        
        {/* User Attachments Preview */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2.5 mb-3 not-prose">
            {message.attachments.map((att, idx) => (
              <div 
                key={idx} 
                onClick={(e) => {
                  e.stopPropagation();
                  if (att.dataUrl && att.type.startsWith('image/')) setPreviewImage(att.dataUrl);
                }}
                className="flex items-center gap-2 p-2 bg-white/5 border border-white/10 rounded-xl max-w-xs cursor-pointer hover:bg-white/10 transition-all group/att"
              >
                {att.type.startsWith('image/') ? (
                  <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white/10 relative">
                    <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/att:opacity-100 flex items-center justify-center transition-opacity">
                      <Maximize2 size={12} className="text-white" />
                    </div>
                  </div>
                ) : att.type.startsWith('video/') ? (
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
                    <Video size={18} />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-indigo-300 shrink-0">
                    <FileText size={18} />
                  </div>
                )}
                <div className="flex flex-col min-w-0 pr-1">
                  <span className="text-xs text-white truncate font-medium">{att.name}</span>
                  <span className="text-[10px] text-gray-400">{(att.size / 1024).toFixed(0)} KB</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* User Action buttons (Desktop hover + Mobile on tap/insist) */}
        {!isAssistant && !isEditing && (
          <>
            {/* Desktop hover bar */}
            <div className="hidden sm:flex absolute top-2 right-2 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 not-prose bg-[#10111a]/90 backdrop-blur-md px-1.5 py-1 rounded-lg border border-white/10 shadow-lg">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy(message.content);
                }}
                className="p-1 hover:bg-white/15 rounded-md text-gray-300 hover:text-white transition-all"
                title="Copier le message"
              >
                {copied === message.content ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                className="p-1 hover:bg-white/15 rounded-md text-gray-300 hover:text-white transition-all"
                title="Modifier le message"
              >
                <Edit2 size={13} />
              </button>
              {onRetry && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry(message.id);
                  }}
                  className="p-1 hover:bg-white/15 rounded-md text-gray-300 hover:text-white transition-all"
                  title="Relancer cette question"
                >
                  <RotateCcw size={13} />
                </button>
              )}
            </div>

            {/* Mobile contextual floating bar (appears only when mobile user taps/insists on the message) */}
            <AnimatePresence>
              {showMobileActions && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 6 }}
                  className="sm:hidden absolute -top-11 right-1 flex items-center gap-1 bg-[#10121d] border border-indigo-500/40 rounded-xl px-2 py-1 shadow-2xl z-30 not-prose backdrop-blur-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => handleCopy(message.content)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 active:bg-white/15 text-gray-200 text-xs font-semibold"
                  >
                    {copied === message.content ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    <span>{copied === message.content ? "Copié" : "Copier"}</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      setShowMobileActions(false);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/30 active:bg-indigo-600/50 text-indigo-300 text-xs font-semibold"
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
          <div className="space-y-3 not-prose">
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full p-3 bg-[#0d0e12] border border-white/15 rounded-xl text-white outline-none focus:ring-1 focus:ring-indigo-500 transition-all resize-none min-h-[100px]"
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
                className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1"
              >
                <CornerDownLeft size={12} />
                <span>Enregistrer & Relancer</span>
              </button>
            </div>
          </div>
        ) : isImageContent ? (
          /* Generated Image Display */
          <div className="not-prose my-3">
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
          /* User text display inside clean styled bubble */
          <div className="text-sm sm:text-base leading-relaxed text-gray-100 whitespace-pre-wrap font-normal">
            {message.content}
          </div>
        ) : (
          <div className="w-full min-w-0 max-w-full overflow-hidden">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                p({ children }) {
                  return <div className="leading-relaxed break-words my-2">{children}</div>;
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
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeString = String(children).replace(/\n$/, '');
                  const lang = match ? match[1].toLowerCase() : '';

                  const isBlock = !inline && (Boolean(match) || codeString.includes('\n'));

                  // Check if it's a Chart Payload JSON block
                  if (isBlock && (lang === 'chart' || lang === 'recharts' || lang === 'json' || className?.includes('chart'))) {
                    try {
                      const trimmed = codeString.trim();
                      if (trimmed.startsWith('{') && (trimmed.includes('"data"') || trimmed.includes('"type"') || trimmed.includes('data:'))) {
                        const parsed: ChartDataPayload = JSON.parse(trimmed);
                        if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
                          return <DataChartRenderer payload={parsed} />;
                        }
                      }
                    } catch (e) {
                      // Not valid chart JSON, fallback to standard syntax highlighter
                    }
                  }
                  
                  if (isBlock) {
                    const displayLang = match ? match[1] : 'code';
                    return (
                      <div className="relative group/code w-full min-w-0 max-w-full rounded-xl overflow-hidden border border-white/10 shadow-lg my-2">
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

            {/* Professional AI Action Toolbar (Audio TTS, Copier, Régénérer) */}
            {!isImageContent && (
              <div className="mt-3.5 pt-2.5 border-t border-white/[0.06] flex items-center flex-wrap gap-2 text-xs not-prose select-none">
                {/* Voice / Audio TTS Button */}
                <button
                  onClick={handleToggleSpeech}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-medium transition-all shadow-sm flex items-center gap-2 border cursor-pointer",
                    isSpeaking 
                      ? "bg-indigo-600 border-indigo-500 text-white animate-pulse shadow-indigo-600/30" 
                      : "bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 hover:text-white border-white/10 hover:border-white/20"
                  )}
                  title={isSpeaking ? "Arrêter la lecture" : "Écouter la réponse à haute voix"}
                >
                  {isSpeaking ? (
                    <>
                      <VolumeX size={14} className="text-white shrink-0" />
                      <span>Arrêter l'audio</span>
                    </>
                  ) : (
                    <>
                      <Volume2 size={14} className="text-indigo-400 shrink-0" />
                      <span>Écouter</span>
                    </>
                  )}
                </button>

                {/* Copy Response Button */}
                <button
                  onClick={() => handleCopy(message.content)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-medium transition-all shadow-sm flex items-center gap-2 border cursor-pointer",
                    copied === message.content
                      ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                      : "bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 hover:text-white border-white/10 hover:border-white/20"
                  )}
                  title="Copier la réponse complète"
                >
                  {copied === message.content ? (
                    <>
                      <Check size={14} className="text-emerald-400 shrink-0" />
                      <span className="text-emerald-300 font-semibold">Copié !</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} className="text-gray-400 shrink-0" />
                      <span>Copier</span>
                    </>
                  )}
                </button>

                {/* Regenerate / Retry Response Button */}
                {onRetry && (
                  <button
                    onClick={() => onRetry(message.id)}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 hover:text-white border border-white/10 hover:border-white/20 transition-all shadow-sm flex items-center gap-2 cursor-pointer group/regen"
                    title="Régénérer cette réponse"
                  >
                    <RefreshCw size={13} className="text-gray-400 group-hover/regen:rotate-180 transition-transform duration-300 shrink-0" />
                    <span>Régénérer</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
};


