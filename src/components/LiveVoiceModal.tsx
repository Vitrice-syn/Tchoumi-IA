import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Mic,
  MicOff,
  AudioLines,
  Info,
  Volume2,
  Captions,
  RefreshCw,
  AlertCircle,
  PhoneOff,
} from 'lucide-react';
import { Language } from '../types';
import { cn } from '../lib/utils';

export interface VoiceTranscriptTurn {
  role: 'user' | 'assistant';
  text: string;
}

interface LiveVoiceModalProps {
  isOpen: boolean;
  language: Language;
  customInstructions?: string;
  onClose: () => void;
  onSaveTranscript?: (turns: VoiceTranscriptTurn[]) => void;
}

const VOICE_OPTIONS = [
  { id: 'Zephyr', label: 'Zephyr', descFr: 'Clair & naturel', descEn: 'Bright & natural' },
  { id: 'Kore', label: 'Kore', descFr: 'Doux & posé', descEn: 'Warm & calm' },
  { id: 'Puck', label: 'Puck', descFr: 'Dynamique & vif', descEn: 'Upbeat & lively' },
  { id: 'Charon', label: 'Charon', descFr: 'Grave & posé', descEn: 'Deep & steady' },
  { id: 'Fenrir', label: 'Fenrir', descFr: 'Expressif', descEn: 'Expressive' },
] as const;

type ConnectionState = 'intro' | 'connecting' | 'listening' | 'speaking' | 'error';

function float32ToPcm16Base64(float32Array: Float32Array): string {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64Pcm24ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return float32;
}

export const LiveVoiceModal: React.FC<LiveVoiceModalProps> = ({
  isOpen,
  language,
  customInstructions,
  onClose,
  onSaveTranscript,
}) => {
  const [phase, setPhase] = useState<ConnectionState>(() =>
    localStorage.getItem('tchoumi_voice_intro_seen') === '1' ? 'connecting' : 'intro'
  );
  const [selectedVoice, setSelectedVoice] = useState<string>(
    () => localStorage.getItem('tchoumi_voice_name') || 'Zephyr'
  );
  const [isMuted, setIsMuted] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [liveUserText, setLiveUserText] = useState('');
  const [liveAssistantText, setLiveAssistantText] = useState('');
  const [turns, setTurns] = useState<VoiceTranscriptTurn[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isMutedRef = useRef<boolean>(false);
  const isClosedRef = useRef<boolean>(false);
  const hasErrorRef = useRef<boolean>(false);
  const turnsRef = useRef<VoiceTranscriptTurn[]>([]);
  const currentUserTurnRef = useRef<string>('');
  const currentAiTurnRef = useRef<string>('');
  const speakingTimerRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const stopOutputPlayback = useCallback(() => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  const teardownSession = useCallback(() => {
    isClosedRef.current = true;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (speakingTimerRef.current) {
      window.clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = null;
    }

    stopOutputPlayback();

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      sourceNodeRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    inputAnalyserRef.current = null;
    outputAnalyserRef.current = null;

    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close();
        }
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
  }, [stopOutputPlayback]);

  const flushPendingTurns = useCallback(() => {
    const finalTurns = [...turnsRef.current];
    if (currentUserTurnRef.current.trim()) {
      finalTurns.push({ role: 'user', text: currentUserTurnRef.current.trim() });
      currentUserTurnRef.current = '';
    }
    if (currentAiTurnRef.current.trim()) {
      finalTurns.push({ role: 'assistant', text: currentAiTurnRef.current.trim() });
      currentAiTurnRef.current = '';
    }
    turnsRef.current = finalTurns;
    return finalTurns;
  }, []);

  const handleCloseModal = useCallback(() => {
    const finalTurns = flushPendingTurns();
    teardownSession();
    if (finalTurns.length > 0 && onSaveTranscript) {
      onSaveTranscript(finalTurns);
    }
    onClose();
  }, [flushPendingTurns, teardownSession, onSaveTranscript, onClose]);

  const playPcmChunk = useCallback((base64Data: string) => {
    const outputCtx = outputCtxRef.current;
    if (!outputCtx || isClosedRef.current) return;

    if (outputCtx.state === 'suspended') {
      void outputCtx.resume();
    }

    const float32 = base64Pcm24ToFloat32(base64Data);
    if (float32.length === 0) return;

    const audioBuffer = outputCtx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = outputCtx.createBufferSource();
    source.buffer = audioBuffer;

    if (outputAnalyserRef.current) {
      source.connect(outputAnalyserRef.current);
      outputAnalyserRef.current.connect(outputCtx.destination);
    } else {
      source.connect(outputCtx.destination);
    }

    const now = outputCtx.currentTime;
    const startTime = Math.max(nextStartTimeRef.current, now);
    source.start(startTime);
    nextStartTimeRef.current = startTime + audioBuffer.duration;

    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
    };

    setPhase('speaking');
    if (speakingTimerRef.current) {
      window.clearTimeout(speakingTimerRef.current);
    }
    const msUntilIdle = Math.max(250, (nextStartTimeRef.current - now) * 1000 + 180);
    speakingTimerRef.current = window.setTimeout(() => {
      if (!isClosedRef.current && activeSourcesRef.current.size === 0) {
        setPhase('listening');
      }
    }, msUntilIdle);
  }, []);

  const startLiveCall = useCallback(
    async (voiceOverride?: string) => {
      teardownSession();
      isClosedRef.current = false;
      hasErrorRef.current = false;
      setErrorMsg(null);
      setPhase('connecting');

      const voiceToUse = voiceOverride || selectedVoice;
      localStorage.setItem('tchoumi_voice_intro_seen', '1');
      localStorage.setItem('tchoumi_voice_name', voiceToUse);

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            language === 'en'
              ? 'Microphone access is not supported by this browser.'
              : "L'accès au microphone n'est pas pris en charge par ce navigateur."
          );
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (isClosedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const inputCtx = new AudioCtx({ sampleRate: 16000 });
        const outputCtx = new AudioCtx({ sampleRate: 24000 });
        inputCtxRef.current = inputCtx;
        outputCtxRef.current = outputCtx;

        if (inputCtx.state === 'suspended') await inputCtx.resume();
        if (outputCtx.state === 'suspended') await outputCtx.resume();

        const inputAnalyser = inputCtx.createAnalyser();
        inputAnalyser.fftSize = 128;
        inputAnalyserRef.current = inputAnalyser;

        const outputAnalyser = outputCtx.createAnalyser();
        outputAnalyser.fftSize = 128;
        outputAnalyserRef.current = outputAnalyser;

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${wsProtocol}//${window.location.host}/live`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isClosedRef.current) {
            ws.close();
            return;
          }
          ws.send(
            JSON.stringify({
              type: 'start',
              voice: voiceToUse,
              language,
              customInstructions,
            })
          );
        };

        ws.onmessage = (event) => {
          if (isClosedRef.current) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'ready') {
              setPhase('listening');

              // Attach microphone capture once Gemini Live session is ready
              if (!processorRef.current && inputCtxRef.current && streamRef.current) {
                const source = inputCtxRef.current.createMediaStreamSource(streamRef.current);
                sourceNodeRef.current = source;

                const processor = inputCtxRef.current.createScriptProcessor(4096, 1, 1);
                processorRef.current = processor;

                source.connect(inputAnalyser);
                inputAnalyser.connect(processor);
                processor.connect(inputCtxRef.current.destination);

                processor.onaudioprocess = (e) => {
                  if (isClosedRef.current || isMutedRef.current) return;
                  const sock = wsRef.current;
                  if (!sock || sock.readyState !== WebSocket.OPEN) return;
                  const floatData = e.inputBuffer.getChannelData(0);
                  const base64 = float32ToPcm16Base64(floatData);
                  sock.send(JSON.stringify({ type: 'audio', data: base64 }));
                };
              }
            } else if (msg.type === 'audio' && typeof msg.data === 'string') {
              playPcmChunk(msg.data);
            } else if (msg.type === 'interrupted') {
              stopOutputPlayback();
              setPhase('listening');
            } else if (msg.type === 'inputTranscript' && typeof msg.text === 'string') {
              if (currentAiTurnRef.current.trim()) {
                const committed = { role: 'assistant' as const, text: currentAiTurnRef.current.trim() };
                turnsRef.current = [...turnsRef.current, committed];
                setTurns(turnsRef.current);
                currentAiTurnRef.current = '';
              }
              currentUserTurnRef.current += msg.text;
              setLiveUserText(currentUserTurnRef.current);
            } else if (msg.type === 'outputTranscript' && typeof msg.text === 'string') {
              if (currentUserTurnRef.current.trim()) {
                const committed = { role: 'user' as const, text: currentUserTurnRef.current.trim() };
                turnsRef.current = [...turnsRef.current, committed];
                setTurns(turnsRef.current);
                currentUserTurnRef.current = '';
              }
              currentAiTurnRef.current += msg.text;
              setLiveAssistantText(currentAiTurnRef.current);
            } else if (msg.type === 'turnComplete') {
              if (currentUserTurnRef.current.trim()) {
                turnsRef.current = [...turnsRef.current, { role: 'user', text: currentUserTurnRef.current.trim() }];
                currentUserTurnRef.current = '';
              }
              if (currentAiTurnRef.current.trim()) {
                turnsRef.current = [...turnsRef.current, { role: 'assistant', text: currentAiTurnRef.current.trim() }];
                currentAiTurnRef.current = '';
              }
              setTurns([...turnsRef.current]);
            } else if (msg.type === 'error') {
              hasErrorRef.current = true;
              setErrorMsg(
                msg.message ||
                  (language === 'en'
                    ? 'Unable to maintain the live voice connection.'
                    : 'Impossible de maintenir la connexion vocale en direct.')
              );
              setPhase('error');
            }
          } catch {
            // ignore malformed messages
          }
        };

        ws.onerror = () => {
          if (!isClosedRef.current) {
            hasErrorRef.current = true;
            setErrorMsg(
              language === 'en'
                ? 'WebSocket connection to Tchoumi Voice failed.'
                : 'La connexion WebSocket vers Tchoumi Voice a échoué.'
            );
            setPhase('error');
          }
        };

        ws.onclose = () => {
          if (!isClosedRef.current && !hasErrorRef.current) {
            hasErrorRef.current = true;
            setErrorMsg(
              (prev) =>
                prev ||
                (language === 'en'
                  ? 'Live voice session closed.'
                  : 'La session vocale en direct a été fermée.')
            );
            setPhase('error');
          }
        };

        // Audio level visualizer loop
        const freqBuf = new Uint8Array(64);
        const updateLevel = () => {
          if (isClosedRef.current) return;
          let peak = 0;
          const activeAnalyser =
            activeSourcesRef.current.size > 0
              ? outputAnalyserRef.current
              : !isMutedRef.current
                ? inputAnalyserRef.current
                : null;
          if (activeAnalyser) {
            activeAnalyser.getByteFrequencyData(freqBuf);
            let sum = 0;
            for (let i = 0; i < freqBuf.length; i++) sum += freqBuf[i];
            peak = Math.min(1, sum / (freqBuf.length * 110));
          }
          setAudioLevel(peak);
          animFrameRef.current = requestAnimationFrame(updateLevel);
        };
        animFrameRef.current = requestAnimationFrame(updateLevel);
      } catch (err: unknown) {
        const message =
          err instanceof Error && err.name === 'NotAllowedError'
            ? language === 'en'
              ? 'Microphone access denied. Please allow microphone permission in your browser.'
              : "Accès au microphone refusé. Veuillez autoriser le micro dans votre navigateur."
            : err instanceof Error
              ? err.message
              : language === 'en'
                ? 'Failed to start live voice conversation.'
                : 'Impossible de démarrer la conversation vocale.';
        setErrorMsg(message);
        hasErrorRef.current = true;
        setPhase('error');
      }
    },
    [customInstructions, language, playPcmChunk, selectedVoice, stopOutputPlayback, teardownSession]
  );

  useEffect(() => {
    if (!isOpen) {
      teardownSession();
      setLiveUserText('');
      setLiveAssistantText('');
      setTurns([]);
      turnsRef.current = [];
      currentUserTurnRef.current = '';
      currentAiTurnRef.current = '';
      setErrorMsg(null);
      setIsMuted(false);
      return;
    }

    const introSeen = localStorage.getItem('tchoumi_voice_intro_seen') === '1';
    if (introSeen) {
      void startLiveCall();
    } else {
      setPhase('intro');
    }

    return () => {
      teardownSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const isEn = language === 'en';
  const orbScale =
    phase === 'speaking'
      ? 1 + audioLevel * 0.24
      : phase === 'listening' && !isMuted
        ? 1 + audioLevel * 0.14
        : 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[120] bg-[#0e0f13] text-white flex flex-col justify-between overflow-hidden"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 h-16 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            <span className="text-sm font-medium text-gray-200 tracking-tight">
              Tchoumi Voice
            </span>
            {phase !== 'intro' && (
              <span className="text-xs text-gray-400">
                ·{' '}
                {phase === 'connecting'
                  ? isEn
                    ? 'Connecting...'
                    : 'Connexion...'
                  : phase === 'speaking'
                    ? isEn
                      ? 'Speaking'
                      : 'Tchoumi IA parle...'
                    : phase === 'error'
                      ? isEn
                        ? 'Disconnected'
                        : 'Interrompu'
                      : isMuted
                        ? isEn
                          ? 'Muted'
                          : 'Micro coupé'
                        : isEn
                          ? 'Listening'
                          : "À l'écoute..."}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {phase !== 'intro' && (
              <>
                <button
                  type="button"
                  onClick={() => setShowCaptions((v) => !v)}
                  className={cn(
                    'p-2.5 rounded-full transition-colors cursor-pointer',
                    showCaptions
                      ? 'bg-white/[0.1] text-white'
                      : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
                  )}
                  title={isEn ? 'Toggle captions' : 'Afficher/masquer les sous-titres'}
                >
                  <Captions size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    teardownSession();
                    setPhase('intro');
                  }}
                  className="p-2.5 rounded-full text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                  title={isEn ? 'Voice settings' : 'Changer de voix'}
                >
                  <Volume2 size={18} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleCloseModal}
              className="p-2.5 rounded-full text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
              title={isEn ? 'Close' : 'Fermer'}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Center Content */}
        {phase === 'intro' ? (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 flex flex-col items-center">
            <div className="my-auto max-w-md w-full flex flex-col items-center text-center py-2">
              {/* Serene Blue/White Orb (inspired by ChatGPT Voice aesthetic) */}
              <motion.div
                animate={{ scale: [1, 1.03, 1] }}
                transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                className="w-28 h-28 sm:w-32 sm:h-32 rounded-full mb-5 relative shadow-[0_0_60px_rgba(59,130,246,0.35)] shrink-0"
                style={{
                  background:
                    'radial-gradient(circle at 50% 22%, #2563eb 0%, #3b82f6 38%, #93c5fd 62%, #eff6ff 85%, #ffffff 100%)',
                }}
              >
                <div
                  className="absolute inset-0 rounded-full opacity-60 blur-md"
                  style={{
                    background:
                      'radial-gradient(circle at 50% 78%, rgba(255,255,255,0.9) 0%, rgba(147,197,253,0.2) 60%, transparent 100%)',
                  }}
                />
              </motion.div>

              <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight mb-4">
                {isEn ? 'Discover Tchoumi Voice' : 'Découvrez Tchoumi Voice'}
              </h2>

              <div className="space-y-3.5 text-left w-full mb-5">
                <div className="flex items-start gap-3.5">
                  <div className="mt-0.5 text-gray-300 shrink-0">
                    <AudioLines size={18} />
                  </div>
                  <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
                    {isEn
                      ? 'Speak whatever is on your mind. Tchoumi IA listens live, replies out loud, and keeps the conversation flowing naturally.'
                      : 'Dites ce qui vous passe par la tête. Tchoumi IA vous écoute en direct, vous répond à l’oral et entretient naturellement la conversation.'}
                  </p>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="mt-0.5 text-gray-300 shrink-0">
                    <Info size={18} />
                  </div>
                  <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
                    {isEn
                      ? 'Live audio is streamed only while the call is active, and transcripts are saved into your conversation.'
                      : 'Votre micro est utilisé uniquement pendant l’appel en direct et la transcription s’ajoute à votre discussion.'}
                  </p>
                </div>
              </div>

              {/* Voice selector */}
              <div className="w-full">
                <p className="text-xs text-gray-400 mb-2 text-left">
                  {isEn ? 'Select a voice' : 'Choisir une voix'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {VOICE_OPTIONS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVoice(v.id)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border',
                        selectedVoice === v.id
                          ? 'bg-white text-black border-white'
                          : 'bg-[#181a21] text-gray-300 border-white/[0.08] hover:bg-[#22252f]'
                      )}
                    >
                      {v.label} · {isEn ? v.descEn : v.descFr}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-4 max-w-2xl mx-auto w-full text-center relative">
            {/* Audio-reactive glowing blue/white orb */}
            <div className="relative flex items-center justify-center my-6">
              <motion.div
                animate={{
                  scale: orbScale * 1.15,
                  opacity: phase === 'speaking' ? 0.55 : phase === 'listening' && !isMuted ? 0.35 : 0.18,
                }}
                transition={{ duration: 0.12 }}
                className="absolute w-52 h-52 sm:w-64 sm:h-64 rounded-full bg-sky-500/30 blur-3xl pointer-events-none"
              />
              <motion.div
                animate={{ scale: orbScale }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className={cn(
                  'w-40 h-40 sm:w-52 sm:h-52 rounded-full relative shadow-[0_0_80px_rgba(59,130,246,0.4)] transition-opacity',
                  phase === 'error' ? 'opacity-45 grayscale' : 'opacity-100'
                )}
                style={{
                  background:
                    phase === 'speaking'
                      ? 'radial-gradient(circle at 45% 25%, #1d4ed8 0%, #3b82f6 34%, #93c5fd 60%, #ffffff 95%)'
                      : 'radial-gradient(circle at 50% 24%, #2563eb 0%, #3b82f6 38%, #93c5fd 64%, #eff6ff 88%, #ffffff 100%)',
                }}
              />
            </div>

            {/* Error display */}
            {phase === 'error' && errorMsg && (
              <div className="mt-4 max-w-md w-full p-4 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-200 text-sm flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 font-medium text-red-300">
                  <AlertCircle size={18} />
                  <span>{errorMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void startLiveCall()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-xs font-semibold hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <RefreshCw size={14} />
                  <span>{isEn ? 'Retry' : 'Réessayer'}</span>
                </button>
              </div>
            )}

            {/* Live captions */}
            {showCaptions && phase !== 'error' && (
              <div className="mt-6 w-full max-w-xl min-h-[84px] flex flex-col items-center justify-center gap-2 px-2">
                {liveUserText && (
                  <p className="text-xs sm:text-sm text-gray-400 line-clamp-2">
                    <span className="text-gray-500">{isEn ? 'You: ' : 'Vous : '}</span>
                    {liveUserText}
                  </p>
                )}
                {liveAssistantText ? (
                  <p className="text-sm sm:text-base text-gray-100 font-normal leading-relaxed line-clamp-3">
                    {liveAssistantText}
                  </p>
                ) : (
                  turns.length === 0 && (
                    <p className="text-sm text-gray-400">
                      {phase === 'connecting'
                        ? isEn
                          ? 'Starting live voice session...'
                          : 'Démarrage de la conversation vocale...'
                        : isEn
                          ? 'Go ahead, I am listening...'
                          : 'Allez-y, je vous écoute...'}
                    </p>
                  )
                )}
              </div>
            )}
          </div>
        )}

        {/* Bottom Footer / Controls */}
        {phase !== 'intro' ? (
          <div className="shrink-0 pb-8 pt-4 px-6 flex items-center justify-center gap-5">
            <button
              type="button"
              onClick={() => setIsMuted((m) => !m)}
              className={cn(
                'w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer border',
                isMuted
                  ? 'bg-white text-black border-white'
                  : 'bg-[#181a21] text-white border-white/[0.1] hover:bg-[#22252f]'
              )}
              title={isMuted ? (isEn ? 'Unmute' : 'Activer le micro') : isEn ? 'Mute' : 'Couper le micro'}
            >
              {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>

            <button
              type="button"
              onClick={handleCloseModal}
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-red-600/30 cursor-pointer"
              title={isEn ? 'End voice conversation' : 'Terminer la conversation vocale'}
            >
              <PhoneOff size={22} />
            </button>
          </div>
        ) : (
          <div className="shrink-0 w-full bg-[#0e0f13]/95 border-t border-white/[0.06] px-6 py-4">
            <div className="max-w-md mx-auto">
              <button
                type="button"
                onClick={() => void startLiveCall()}
                className="w-full py-3.5 px-6 rounded-full bg-white hover:bg-gray-100 text-black font-semibold text-sm transition-all active:scale-[0.98] shadow-xl cursor-pointer"
              >
                {isEn ? 'Continue & Start Conversation' : 'Continuer et démarrer la conversation'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
