'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Tipos mínimos del reconocimiento de voz nativo (no están en el lib de TS) ──
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SRAlternative;
}
interface SRResultList {
  readonly length: number;
  readonly [index: number]: SRResult;
}
interface SREvent {
  readonly resultIndex: number;
  readonly results: SRResultList;
}
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecCtor = new () => SpeechRec;

function getSpeechRecCtor(): SpeechRecCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecCtor;
    webkitSpeechRecognition?: SpeechRecCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Asistente de voz. Orbe flotante (logo naranja + blur) presente en todas las páginas.
//  · Toca el orbe → abre el modo conversación (escucha, responde por voz, y vuelve a escuchar).
//  · Mantén presionado el orbe → walkie-talkie: hablas mientras sostienes, sueltas y responde.
//  · Entrada "desde fuera": la PWA abre con ?voz=1 y el orbe arranca escuchando solo.
// Reusa /api/transcribe (Groq Whisper) y /api/chat (agente, NDJSON en streaming). La voz de
// respuesta usa /api/speak (nube) y, si no hay proveedor, la voz del navegador.

type Estado = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

type Turno = { role: 'user' | 'assistant'; text: string };

// Silencio "prudente" que esperamos tras dejar de hablar antes de dar el turno por
// terminado. Más alto = te deja pensar sin cortarte; más bajo = responde antes.
const END_SILENCE_MS = 1500;
const SILENCE_MS = END_SILENCE_MS; // vía de respaldo (grabación + VAD)
const MIN_SPEECH_MS = 500; // exige algo de voz antes de permitir el corte por silencio
const VAD_THRESHOLD = 7; // nivel para considerar "hay voz" (más bajo = más sensible)
const MAX_REC_MS = 20000; // tope duro por si nunca hay silencio
const NO_SPEECH_TIMEOUT_MS = 8000; // si nunca hablas, cierra la escucha
// Barge-in: interrumpir a Aura mientras habla. Umbral alto + sostenido para que su
// propia voz (con cancelación de eco) no dispare falsos.
const BARGE_THRESHOLD = 20;
const BARGE_SUSTAIN_MS = 260;
const BARGE_GRACE_MS = 350; // ignora el arranque del audio
const VOICE_ON_KEY = 'voz:activada'; // recuerda si prefieres voz o texto

export function VoiceOrb() {
  const [open, setOpen] = useState(false);
  const [estado, setEstado] = useState<Estado>('idle');
  const [turns, setTurns] = useState<Turno[]>([]);
  const [partial, setPartial] = useState(''); // texto del agente mientras llega
  const [aviso, setAviso] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [conversando, setConversando] = useState(false); // modo conversación continua
  const [heard, setHeard] = useState(''); // lo que Aura va oyendo (en vivo)

  const recognitionRef = useRef<SpeechRec | null>(null);
  const recEndTimerRef = useRef<ReturnType<typeof setInterval> | null>(null); // endpointing propio
  const listenAbortRef = useRef(false); // cerrar sin enviar lo escuchado
  const emptyCountRef = useRef(0); // silencios seguidos (para cortar la conversación sin inventar)
  const heardSpeechRef = useRef(false); // ¿el VAD detectó voz real en esta grabación?
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);
  const convRef = useRef(false); // espejo de `conversando` para closures
  const voiceOnRef = useRef(true);
  // Rompe el ciclo grabar → agente → volver a escuchar sin referencias adelantadas.
  const startListeningRef = useRef<() => void>(() => {});
  // Cola de voz: se locuta frase por frase mientras el agente aún responde (menos espera).
  const speakQueueRef = useRef<string[]>([]);
  const speakingRef = useRef(false);
  const cancelSpeakRef = useRef(false);
  // Barge-in: monitor de micrófono mientras Aura habla, para detectar que la interrumpes.
  const bargeStreamRef = useRef<MediaStream | null>(null);
  const bargeAcRef = useRef<AudioContext | null>(null);
  const bargeRafRef = useRef<number | null>(null);
  const interruptedRef = useRef(false);
  const bargeStartRef = useRef<() => void>(() => {});
  const bargeStopRef = useRef<() => void>(() => {});

  useEffect(() => {
    convRef.current = conversando;
  }, [conversando]);
  useEffect(() => {
    voiceOnRef.current = voiceOn;
  }, [voiceOn]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(VOICE_ON_KEY);
      if (v === '0') {
        setVoiceOn(false);
        voiceOnRef.current = false;
      }
    } catch {
      /* no-op */
    }
    // Precarga las voces del navegador (se pueblan de forma asíncrona).
    try {
      window.speechSynthesis?.getVoices();
    } catch {
      /* no-op */
    }
  }, []);

  // ── Utilidades ─────────────────────────────────────────────────────────────
  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve((r.result as string).split(',')[1] ?? '');
      r.readAsDataURL(blob);
    });

  const stopStream = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    acRef.current?.close().catch(() => {});
    acRef.current = null;
  }, []);

  // Locuta UN fragmento. Nube (/api/speak) y, si no hay proveedor, voz del navegador.
  const speakChunk = useCallback(async (text: string): Promise<void> => {
    if (cancelSpeakRef.current || !text.trim()) return;
    // 1) Voz de nube (femenina, natural).
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (cancelSpeakRef.current) return;
        const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
        await new Promise<void>((resolve) => {
          const a = new Audio(url);
          a.volume = 1;
          audioRef.current = a;
          a.onended = a.onerror = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          a.play().catch(() => resolve());
        });
        return;
      }
    } catch {
      /* cae al navegador */
    }
    // 2) Voz del navegador (gratis) — elige una voz de MUJER en español.
    try {
      if ('speechSynthesis' in window) {
        await new Promise<void>((resolve) => {
          const u = new SpeechSynthesisUtterance(text);
          u.lang = 'es-ES';
          u.rate = 1.05;
          u.pitch = 1.1;
          const v = pickFemaleSpanishVoice();
          if (v) u.voice = v;
          u.onend = u.onerror = () => resolve();
          speechSynthesis.speak(u);
        });
      }
    } catch {
      /* silencio si no hay TTS */
    }
  }, []);

  // Corre la cola de voz en orden. Se llama cada vez que se encola una frase.
  const runSpeakQueue = useCallback(async () => {
    if (speakingRef.current) return;
    speakingRef.current = true;
    setEstado('speaking');
    if (convRef.current) bargeStartRef.current(); // permite interrumpir a Aura hablando
    while (speakQueueRef.current.length && !cancelSpeakRef.current) {
      const next = speakQueueRef.current.shift();
      if (next) await speakChunk(next);
    }
    speakingRef.current = false;
    bargeStopRef.current();
  }, [speakChunk]);

  const enqueueSpeak = useCallback(
    (text: string) => {
      if (!voiceOnRef.current || !text.trim()) return;
      cancelSpeakRef.current = false;
      speakQueueRef.current.push(text.trim());
      void runSpeakQueue();
    },
    [runSpeakQueue],
  );

  const stopSpeaking = useCallback(() => {
    cancelSpeakRef.current = true;
    speakQueueRef.current = [];
    speakingRef.current = false;
    try {
      audioRef.current?.pause();
      speechSynthesis?.cancel();
    } catch {
      /* no-op */
    }
  }, []);

  // Espera a que la cola de voz termine de sonar.
  const waitSpeakDone = useCallback(
    () =>
      new Promise<void>((resolve) => {
        const check = () =>
          !speakingRef.current && speakQueueRef.current.length === 0
            ? resolve()
            : setTimeout(check, 120);
        check();
      }),
    [],
  );

  // ── Barge-in: interrumpir a Aura mientras habla ────────────────────────────
  const stopBargeMonitor = useCallback(() => {
    if (bargeRafRef.current) cancelAnimationFrame(bargeRafRef.current);
    bargeRafRef.current = null;
    bargeStreamRef.current?.getTracks().forEach((t) => t.stop());
    bargeStreamRef.current = null;
    bargeAcRef.current?.close().catch(() => {});
    bargeAcRef.current = null;
  }, []);

  const onBargeIn = useCallback(() => {
    interruptedRef.current = true;
    stopBargeMonitor();
    stopSpeaking(); // Aura se calla al instante
    setTimeout(() => startListeningRef.current(), 60); // y te escucha
  }, [stopBargeMonitor, stopSpeaking]);

  const startBargeMonitor = useCallback(async () => {
    stopBargeMonitor();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      bargeStreamRef.current = stream;
      const ac = new AudioContext();
      bargeAcRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const an = ac.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const startedAt = Date.now();
      let loudSince = 0;
      const tick = () => {
        if (!bargeAcRef.current) return;
        an.getByteFrequencyData(data);
        let sum = 0;
        for (const v of data) sum += v;
        const avg = sum / data.length;
        const now = Date.now();
        if (now - startedAt < BARGE_GRACE_MS) {
          bargeRafRef.current = requestAnimationFrame(tick);
          return;
        }
        if (avg > BARGE_THRESHOLD) {
          if (!loudSince) loudSince = now;
          if (now - loudSince > BARGE_SUSTAIN_MS) {
            onBargeIn();
            return;
          }
        } else {
          loudSince = 0;
        }
        bargeRafRef.current = requestAnimationFrame(tick);
      };
      bargeRafRef.current = requestAnimationFrame(tick);
    } catch {
      /* sin micrófono → sin barge-in, no pasa nada */
    }
  }, [stopBargeMonitor, onBargeIn]);

  useEffect(() => {
    bargeStartRef.current = () => void startBargeMonitor();
    bargeStopRef.current = stopBargeMonitor;
  }, [startBargeMonitor, stopBargeMonitor]);

  // ── Pipeline de un turno: grabar → transcribir → agente → hablar ────────────
  const enviarTexto = useCallback(
    async (texto: string) => {
      setTurns((p) => [...p, { role: 'user', text: texto }]);
      setEstado('thinking');
      setPartial('');
      setHeard('');
      cancelSpeakRef.current = false;
      interruptedRef.current = false;
      let assistant = '';
      let spokenLen = 0;
      // Extrae las frases completas aún no locutadas y las encola (para hablar ya).
      const flush = (final: boolean) => {
        const re = /[^.!?…\n]*[.!?…\n]+/g;
        const pending = assistant.slice(spokenLen);
        let m: RegExpExecArray | null;
        let lastEnd = 0;
        while ((m = re.exec(pending))) {
          const frase = cleanForSpeech(m[0]);
          if (frase) enqueueSpeak(frase);
          lastEnd = re.lastIndex;
        }
        spokenLen += lastEnd;
        if (final) {
          const rest = cleanForSpeech(assistant.slice(spokenLen));
          if (rest) enqueueSpeak(rest);
          spokenLen = assistant.length;
        }
      };
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: texto }),
        });
        if (!res.body) throw new Error('sin respuesta');
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const ev = JSON.parse(line) as { type: string; text?: string; message?: string };
              if (ev.type === 'text') {
                assistant += ev.text ?? '';
                setPartial(assistant);
                flush(false); // habla las frases completas apenas llegan
              } else if (ev.type === 'error') {
                assistant += `\n⚠️ ${ev.message ?? ''}`;
              }
            } catch {
              /* línea parcial */
            }
          }
        }
      } catch {
        assistant = 'No pude conectar con el agente. Inténtalo de nuevo.';
      }
      setTurns((p) => [...p, { role: 'assistant', text: assistant }]);
      setPartial('');
      flush(true); // locuta lo que quede
      await waitSpeakDone();
      // Si te interrumpió (barge-in), ya reinició la escucha: no la pises.
      if (interruptedRef.current) {
        interruptedRef.current = false;
        return;
      }
      setEstado('idle');
      // Modo conversación: vuelve a escuchar solo.
      if (convRef.current) setTimeout(() => startListeningRef.current(), 250);
    },
    [enqueueSpeak, waitSpeakDone],
  );

  // Silencio / nada entendible: NO manda nada al agente (así no "inventa"). En modo
  // conversación da un par de oportunidades y luego se detiene con aviso amable.
  const handleNoSpeech = useCallback(() => {
    setHeard('');
    if (convRef.current) {
      emptyCountRef.current += 1;
      if (emptyCountRef.current >= 2) {
        emptyCountRef.current = 0;
        setConversando(false);
        convRef.current = false;
        setEstado('idle');
        setAviso('Te dejé de escuchar. Toca el orbe cuando quieras seguir.');
        return;
      }
      setEstado('idle');
      setTimeout(() => startListeningRef.current(), 200);
      return;
    }
    setEstado('idle');
  }, []);

  const finishRecording = useCallback(async (blob: Blob) => {
    if (listenAbortRef.current) {
      listenAbortRef.current = false;
      setEstado('idle');
      return;
    }
    if (blob.size === 0 || !heardSpeechRef.current) {
      handleNoSpeech();
      return;
    }
    setEstado('thinking');
    try {
      const data = await blobToBase64(blob);
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data, mime: blob.type }),
      });
      const j = (await res.json()) as { text?: string; message?: string };
      if (res.ok && isMeaningful(j.text)) {
        emptyCountRef.current = 0;
        await enviarTexto(j.text);
      } else {
        handleNoSpeech();
      }
    } catch {
      setAviso('No pude procesar el audio.');
      setEstado('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enviarTexto, handleNoSpeech]);

  // Ruta rápida: reconocimiento de voz nativo del navegador. Transcribe al instante,
  // corta solo en silencio y NO inventa (en silencio no devuelve texto).
  const startSpeechRecognition = useCallback((): boolean => {
    const Ctor = getSpeechRecCtor();
    if (!Ctor) return false;
    const clearEndTimer = () => {
      if (recEndTimerRef.current) clearInterval(recEndTimerRef.current);
      recEndTimerRef.current = null;
    };
    try {
      const rec = new Ctor();
      rec.lang = 'es-ES';
      rec.interimResults = true;
      rec.continuous = true; // no cortamos en cada pausa: el endpointing lo hacemos nosotros
      rec.maxAlternatives = 1;
      let finalText = '';
      let lastResultAt = Date.now();
      const startedAt = Date.now();
      recognitionRef.current = rec;
      setEstado('listening');
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const alt = r?.[0];
          if (!alt) continue;
          if (r.isFinal) finalText += alt.transcript;
          else interim += alt.transcript;
        }
        lastResultAt = Date.now(); // hubo actividad de voz → reinicia el conteo de silencio
        setHeard(`${finalText} ${interim}`.trim());
      };
      rec.onerror = () => {
        /* onend se encarga */
      };
      rec.onend = () => {
        clearEndTimer();
        recognitionRef.current = null;
        if (listenAbortRef.current) {
          listenAbortRef.current = false;
          return; // se cerró: no enviar lo escuchado
        }
        const text = finalText.trim();
        if (isMeaningful(text)) {
          emptyCountRef.current = 0;
          void enviarTexto(text);
        } else {
          handleNoSpeech();
        }
      };
      rec.start();
      // Endpointing propio: cierra tras END_SILENCE_MS de silencio (ya habiendo hablado),
      // o si nunca hablas tras NO_SPEECH_TIMEOUT_MS.
      recEndTimerRef.current = setInterval(() => {
        const idle = Date.now() - lastResultAt;
        const haveText = finalText.trim().length > 0;
        if ((haveText && idle > END_SILENCE_MS) || (!haveText && Date.now() - startedAt > NO_SPEECH_TIMEOUT_MS)) {
          clearEndTimer();
          try {
            rec.stop();
          } catch {
            /* no-op */
          }
        }
      }, 200);
      return true;
    } catch {
      clearEndTimer();
      return false;
    }
  }, [enviarTexto, handleNoSpeech]);

  // Escucha. Vía rápida = reconocimiento nativo (tap/conversación). Walkie-talkie (mantener
  // presionado) usa grabación + VAD, para no cortar en las pausas mientras sostienes.
  const startListening = useCallback(async () => {
    if (recRef.current || audioRef.current) {
      try {
        audioRef.current?.pause();
      } catch {
        /* no-op */
      }
    }
    setAviso(null);
    setHeard('');
    heardSpeechRef.current = false;
    listenAbortRef.current = false;
    // Reconocimiento nativo del navegador: instantáneo y no inventa en silencio.
    if (!heldRef.current && startSpeechRecognition()) return;
    try {
      // autoGainControl sube el volumen de micrófonos flojos; noiseSuppression limpia
      // el ruido → mejor transcripción y menos "no te escuché".
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stopStream();
        recRef.current = null;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        await finishRecording(blob);
      };
      rec.start();
      recRef.current = rec;
      setEstado('listening');

      // VAD: monitorea el volumen; corta tras SILENCE_MS de silencio (solo si ya hubo voz).
      const ac = new AudioContext();
      acRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const an = ac.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const startedAt = Date.now();
      let lastLoud = Date.now();
      let speechStart = 0;
      const tick = () => {
        if (!recRef.current) return;
        an.getByteFrequencyData(data);
        let sum = 0;
        for (const v of data) sum += v;
        const avg = sum / data.length;
        const now = Date.now();
        if (avg > VAD_THRESHOLD) {
          lastLoud = now;
          if (!speechStart) speechStart = now;
          heardSpeechRef.current = true;
        }
        // Solo corta si YA hubo voz suficiente y luego vino un silencio sostenido.
        const hubated = speechStart && now - speechStart > MIN_SPEECH_MS;
        const silencio = now - lastLoud > SILENCE_MS;
        // No auto-cortar en walkie-talkie (se corta al soltar); sí en conversación.
        if (!heldRef.current && hubated && silencio) {
          rec.stop();
          return;
        }
        if (now - startedAt > MAX_REC_MS) {
          rec.stop();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setAviso('No pude acceder al micrófono. Revisa los permisos.');
      setEstado('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishRecording, stopStream, startSpeechRecognition]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const stopListening = useCallback(() => {
    if (recEndTimerRef.current) {
      clearInterval(recEndTimerRef.current);
      recEndTimerRef.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      /* no-op */
    }
    try {
      recRef.current?.stop();
    } catch {
      /* no-op */
    }
  }, []);

  // ── Apertura / entrada por PWA (?voz=1) ─────────────────────────────────────
  const abrir = useCallback(
    (conversacion: boolean) => {
      setOpen(true);
      setConversando(conversacion);
      convRef.current = conversacion;
      if (conversacion) setTimeout(() => startListening(), 300);
    },
    [startListening],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('voz') === '1') {
      abrir(true);
      params.delete('voz');
      const url = window.location.pathname + (params.toString() ? `?${params}` : '');
      window.history.replaceState(null, '', url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cerrar = useCallback(() => {
    setConversando(false);
    convRef.current = false;
    listenAbortRef.current = true; // no envíes lo que se estaba escuchando
    stopListening();
    stopStream();
    stopSpeaking();
    stopBargeMonitor();
    setEstado('idle');
    setOpen(false);
  }, [stopListening, stopStream, stopSpeaking, stopBargeMonitor]);

  // ── Gestos del orbe: tap abre conversación, mantener = walkie-talkie ────────
  const onPointerDown = () => {
    heldRef.current = false;
    holdTimer.current = setTimeout(() => {
      heldRef.current = true;
      setOpen(true);
      setConversando(false);
      convRef.current = false;
      startListening();
    }, 260);
  };
  const onPointerUp = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (heldRef.current) {
      // Se soltó tras mantener: cierra el turno del walkie-talkie.
      heldRef.current = false;
      stopListening();
    } else {
      // Fue un toque: abre conversación continua.
      abrir(true);
    }
  };

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    voiceOnRef.current = next;
    try {
      localStorage.setItem(VOICE_ON_KEY, next ? '1' : '0');
      if (!next) speechSynthesis?.cancel();
    } catch {
      /* no-op */
    }
  };

  const label =
    estado === 'listening'
      ? 'Aura te escucha…'
      : estado === 'thinking'
        ? 'Aura piensa…'
        : estado === 'speaking'
          ? 'Aura responde…'
          : 'Aura';

  return (
    <>
      {/* Orbe flotante (todas las páginas). */}
      <button
        type="button"
        className={`voice-orb voice-${estado}`}
        aria-label="Aura, tu asistente de voz — toca para hablar, mantén presionado para dictar"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          if (holdTimer.current) clearTimeout(holdTimer.current);
        }}
      >
        <OrbGlyph estado={estado} />
      </button>

      {open && (
        <div className="voice-panel" role="dialog" aria-modal="true" aria-label="Asistente de voz">
          <div className="voice-panel-backdrop" onClick={cerrar} />
          <div className="voice-panel-card">
            <div className="voice-panel-head">
              <span className="voice-status">{label}</span>
              <div className="voice-head-actions">
                <button
                  type="button"
                  className="voice-mini"
                  aria-pressed={voiceOn}
                  onClick={toggleVoice}
                  title={voiceOn ? 'Silenciar la voz' : 'Activar la voz'}
                >
                  {voiceOn ? '🔊' : '🔇'}
                </button>
                <button type="button" className="voice-mini" onClick={cerrar} aria-label="Cerrar">
                  ✕
                </button>
              </div>
            </div>

            <div className={`voice-bigorb voice-${estado}`} aria-hidden="true">
              <OrbGlyph estado={estado} big />
            </div>

            <div className="voice-transcript">
              {turns.slice(-6).map((t, i) => (
                <p key={i} className={`voice-line voice-${t.role}`}>
                  {t.text}
                </p>
              ))}
              {heard && <p className="voice-line voice-user voice-partial">{heard}</p>}
              {partial && <p className="voice-line voice-assistant voice-partial">{partial}</p>}
              {turns.length === 0 && !partial && !heard && (
                <p className="voice-hint">
                  {conversando
                    ? 'Habla cuando quieras. Te escucho y te respondo.'
                    : 'Toca el micrófono para hablar.'}
                </p>
              )}
            </div>

            {aviso && <p className="voice-aviso">{aviso}</p>}

            <div className="voice-controls">
              {estado === 'listening' ? (
                <button type="button" className="voice-cta voice-cta-stop" onClick={stopListening}>
                  Terminé de hablar
                </button>
              ) : (
                <button
                  type="button"
                  className="voice-cta"
                  onClick={() => startListening()}
                  disabled={estado === 'thinking' || estado === 'speaking'}
                >
                  🎙 Hablar
                </button>
              )}
              <label className="voice-conv-toggle">
                <input
                  type="checkbox"
                  checked={conversando}
                  onChange={(e) => {
                    setConversando(e.target.checked);
                    convRef.current = e.target.checked;
                  }}
                />
                Conversación continua
              </label>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Voces de mujer en español conocidas por plataforma (Apple/Google/Microsoft).
const FEMALE_ES = [
  'mónica', 'monica', 'paulina', 'sabina', 'helena', 'laura', 'dalia', 'elvira',
  'lucia', 'lucía', 'marisol', 'angelica', 'angélica', 'esperanza', 'google español',
];
const MALE_ES = ['jorge', 'diego', 'carlos', 'juan', 'pablo', 'miguel', 'raul', 'raúl'];

/** Elige una voz de MUJER en español del navegador (fallback cuando no hay voz de nube). */
function pickFemaleSpanishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const es = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'));
  if (!es.length) return null;
  const female = es.find((v) => FEMALE_ES.some((n) => v.name.toLowerCase().includes(n)));
  if (female) return female;
  const notMale = es.find((v) => !MALE_ES.some((n) => v.name.toLowerCase().includes(n)));
  return notMale ?? es[0]!;
}

// Frases que Whisper suele "alucinar" a partir de silencio/ruido (no las mandamos al agente).
const HALLUCINATIONS = [
  'gracias por ver',
  'gracias por su atención',
  'subtítulos',
  'suscríbete',
  'suscríbanse',
  'no olvides suscribirte',
];
/** ¿El texto transcrito es de verdad algo dicho por el usuario (y no ruido/alucinación)? */
function isMeaningful(text: string | undefined | null): text is string {
  const t = (text ?? '').trim().toLowerCase();
  if (t.length < 3) return false;
  if (HALLUCINATIONS.some((h) => t.includes(h))) return false;
  // Al menos una letra (evita transcripciones de puro signo o "...").
  if (!/[a-záéíóúñü]/i.test(t)) return false;
  return true;
}

/** Limpia el texto para locutar: sin emojis, sin markdown, espacios normales. */
function cleanForSpeech(s: string): string {
  return s
    .replace(/[*_`#>~]+/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cara del orbe: el logo (círculo naranja) con un glifo que cambia según el estado. */
function OrbGlyph({ estado, big = false }: { estado: Estado; big?: boolean }) {
  const s = big ? 96 : 30;
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" className="voice-glyph" aria-hidden="true">
      {estado === 'listening' ? (
        // Onda de audio.
        <g stroke="#fff" strokeWidth="3" strokeLinecap="round">
          <line x1="14" y1="18" x2="14" y2="30" className="wave w1" />
          <line x1="20" y1="13" x2="20" y2="35" className="wave w2" />
          <line x1="26" y1="16" x2="26" y2="32" className="wave w3" />
          <line x1="32" y1="20" x2="32" y2="28" className="wave w4" />
        </g>
      ) : estado === 'thinking' ? (
        // Tres puntos.
        <g fill="#fff">
          <circle cx="15" cy="24" r="3.2" className="dot d1" />
          <circle cx="24" cy="24" r="3.2" className="dot d2" />
          <circle cx="33" cy="24" r="3.2" className="dot d3" />
        </g>
      ) : (
        // Reposo / hablando: micrófono.
        <g fill="#fff">
          <rect x="20" y="11" width="8" height="17" rx="4" />
          <path
            d="M16 24 a8 8 0 0 0 16 0"
            fill="none"
            stroke="#fff"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <line x1="24" y1="32" x2="24" y2="37" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
