import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Contact, SuggestionCard as SuggestionCardType } from '@/types';
import { getSettings, addCall, updateContact } from '@/lib/storage';
import { fetchSuggestions } from '@/lib/gemini';
import { Phone, X, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import PostCallModal from '@/components/PostCallModal';
import { v4 } from '@/lib/uuid';

export default function CallScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const contact = (location.state as any)?.contact as Contact | undefined;

  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [callActive, setCallActive] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [suggestions, setSuggestions] = useState<SuggestionCardType[]>([]);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [showPostCall, setShowPostCall] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(Date.now());
  const transcriptAccRef = useRef('');

  // Timer
  useEffect(() => {
    if (!callActive) return;
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [callActive]);

  // Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += t + ' ';
        } else {
          interim += t;
        }
      }
      if (final) {
        transcriptAccRef.current += final;
        setTranscript(transcriptAccRef.current);
      }
      setInterimText(interim);
    };

    recognition.onend = () => {
      if (callActive) {
        try { recognition.start(); } catch {}
      }
    };

    recognition.onerror = () => {};

    try { recognition.start(); } catch {}

    return () => {
      try { recognition.stop(); } catch {}
    };
  }, []);

  // Restart recognition reference to callActive
  useEffect(() => {
    if (!callActive && recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
  }, [callActive]);

  // MediaRecorder
  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ audio: true }).then(stream => {
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordingBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start(1000);
    }).catch(() => {});
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript, interimText]);

  // AI Suggestions
  useEffect(() => {
    if (!callActive) return;
    const settings = getSettings();
    if (!settings.groqApiKey) return;
    const rate = (settings.suggestionRefreshRate || 10) * 1000;

    const fetchAI = async () => {
      if (!transcriptAccRef.current.trim()) return;
      try {
        const cards = await fetchSuggestions(settings.groqApiKey, transcriptAccRef.current, settings.salesScript);
        setSuggestions(cards);
        setSuggestionsError('');
      } catch {
        setSuggestionsError('Suggestions unavailable');
      }
    };

    const id = setInterval(fetchAI, rate);
    // Fetch once after initial delay
    const initialTimeout = setTimeout(fetchAI, 5000);
    return () => { clearInterval(id); clearTimeout(initialTimeout); };
  }, [callActive]);

  const endCall = useCallback(() => {
    setCallActive(false);
    try { recognitionRef.current?.stop(); } catch {}
    try { mediaRecorderRef.current?.stop(); } catch {}
    setShowPostCall(true);
  }, []);

  const handlePostCallDone = (notes: string, actions: string[]) => {
    if (contact) {
      const callId = v4();
      const now = new Date().toISOString();
      const filename = `${new Date().toISOString().slice(0,10)}-${contact.name.replace(/\s+/g, '')}.webm`;

      addCall({
        id: callId,
        contact_id: contact.id,
        contact_name: contact.name,
        started_at: new Date(startTimeRef.current).toISOString(),
        ended_at: now,
        duration_seconds: seconds,
        transcript: transcriptAccRef.current,
        recording_filename: filename,
        recording_drive_url: '',
        notes,
        actions_taken: actions,
      });

      updateContact(contact.id, {
        called: true,
        call_date: now,
        notes: notes || contact.notes,
        not_interested: actions.includes('not_interested'),
        follow_up_date: '', // handled in modal
      });
    }
    navigate('/');
  };

  // Download recording
  useEffect(() => {
    if (recordingBlob && contact) {
      const filename = `${new Date().toISOString().slice(0,10)}-${contact.name.replace(/\s+/g, '')}.webm`;
      const url = URL.createObjectURL(recordingBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [recordingBlob]);

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const dismissSuggestion = (idx: number) => {
    setSuggestions(prev => prev.filter((_, i) => i !== idx));
  };

  if (!contact) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">No contact selected. Go back to the queue.</p>
          <Button onClick={() => navigate('/')} className="mt-4">Go to Queue</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Top Bar */}
      <div className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0 bg-card/50">
        <div className="flex items-center gap-4">
          <h1 className="font-bold text-lg">{contact.name}</h1>
          <span className="font-mono text-sm text-muted-foreground">{contact.phone}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-lg tabular-nums">{formatTime(seconds)}</span>
          <Button onClick={endCall} variant="destructive" className="font-semibold gap-2 rounded-lg">
            <Phone className="w-4 h-4 rotate-[135deg]" />
            End Call
          </Button>
        </div>
      </div>

      {/* Panels */}
      <div className="flex-1 flex min-h-0">
        {/* Transcript */}
        <div className="w-[65%] border-r border-border flex flex-col relative">
          {callActive && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
              <span className="w-2 h-2 rounded-full bg-destructive rec-pulse" />
              <span className="text-xs font-semibold text-destructive">REC</span>
            </div>
          )}
          {!speechSupported && (
            <div className="bg-warning/20 border-b border-warning/30 px-4 py-2 text-sm text-warning">
              Live transcription requires Chrome or Edge
            </div>
          )}
          <div ref={transcriptRef} className="flex-1 overflow-y-auto p-6 transcript-scroll">
            {!transcript && !interimText ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Mic className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">Listening... Start speaking to see the transcript</p>
              </div>
            ) : (
              <div className="whitespace-pre-wrap">
                <span className="text-foreground">{transcript}</span>
                {interimText && <span className="text-muted-foreground italic">{interimText}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Suggestions */}
        <div className="w-[35%] flex flex-col p-4 gap-3 overflow-y-auto">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">AI Suggestions</h3>
          {!getSettings().groqApiKey ? (
            <div className="glass-card p-4 text-center text-sm text-muted-foreground">
              Add your Groq API key in Settings to enable AI suggestions
            </div>
          ) : suggestionsError ? (
            <div className="glass-card p-4 text-center text-sm text-warning">{suggestionsError}</div>
          ) : !transcript.trim() ? (
            <div className="glass-card p-4 text-center text-sm text-muted-foreground">Suggestions paused — waiting for transcript</div>
          ) : suggestions.length === 0 ? (
            <div className="glass-card p-4 text-center text-sm text-muted-foreground">
              <div className="w-6 h-6 border-2 border-primary/40 border-t-primary rounded-full animate-spin mx-auto mb-2" />
              Generating suggestions...
            </div>
          ) : null}
          <AnimatePresence mode="popLayout">
            {suggestions.map((card, idx) => (
              <motion.div
                key={`${card.type}-${card.title}-${idx}`}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                className={`glass-card p-4 relative ${
                  card.type === 'response' ? 'suggestion-response' : card.type === 'objection' ? 'suggestion-objection' : 'suggestion-insight'
                }`}
              >
                <button onClick={() => dismissSuggestion(idx)} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[10px] uppercase font-bold tracking-wider ${
                    card.type === 'response' ? 'text-primary' : card.type === 'objection' ? 'text-warning' : 'text-purple'
                  }`}>{card.type}</span>
                </div>
                <h4 className="font-semibold text-sm mb-1">{card.title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{card.body}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Post-Call Modal */}
      {showPostCall && (
        <PostCallModal
          contact={contact}
          transcript={transcriptAccRef.current}
          recordingBlob={recordingBlob}
          duration={seconds}
          onDone={handlePostCallDone}
        />
      )}
    </div>
  );
}
