'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Asistente de voz. Orbe flotante (logo naranja + blur) presente en todas las páginas.
//  · Toca el orbe → abre el modo conversación (escucha, responde por voz, y vuelve a escuchar).
//  · Mantén presionado el orbe → walkie-talkie: hablas mientras sostienes, sueltas y responde.
//  · Entrada "desde fuera": la PWA abre con ?voz=1 y el orbe arranca escuchando solo.
// Reusa /api/transcribe (Groq Whisper) y /api/chat (agente, NDJSON en streaming). La voz de
// respuesta usa /api/speak (nube) y, si no hay proveedor, la voz del navegador.

type Estado = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

type Turno = { role: 'user' | 'assistant'; text: string };

const SILENCE_MS = 1300; // corta la grabación tras este silencio (tras detectar voz)
const MAX_REC_MS = 15000; // tope duro por si nunca hay silencio
const VOICE_ON_KEY = 'voz:activada'; // recuerda si prefieres voz o texto

export function VoiceOrb() {
  const [open, setOpen] = useState(false);
  const [estado, setEstado] = useState<Estado>('idle');
  const [turns, setTurns] = useState<Turno[]>([]);
  const [partial, setPartial] = useState(''); // texto del agente mientras llega
  const [aviso, setAviso] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [conversando, setConversando] = useState(false); // modo conversación continua

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

  // Reproduce la respuesta por voz. Nube (/api/speak) y, si no hay proveedor, navegador.
  const speak = useCallback(async (text: string): Promise<void> => {
    if (!voiceOnRef.current || !text.trim()) return;
    // 1) Voz de nube.
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
        await new Promise<void>((resolve) => {
          const a = new Audio(url);
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
    // 2) Voz del navegador (gratis).
    try {
      if ('speechSynthesis' in window) {
        await new Promise<void>((resolve) => {
          const u = new SpeechSynthesisUtterance(text);
          u.lang = 'es-ES';
          const es = speechSynthesis.getVoices().find((v) => v.lang.startsWith('es'));
          if (es) u.voice = es;
          u.onend = u.onerror = () => resolve();
          speechSynthesis.speak(u);
        });
      }
    } catch {
      /* silencio si no hay TTS */
    }
  }, []);

  // ── Pipeline de un turno: grabar → transcribir → agente → hablar ────────────
  const enviarTexto = useCallback(
    async (texto: string) => {
      setTurns((p) => [...p, { role: 'user', text: texto }]);
      setEstado('thinking');
      setPartial('');
      let assistant = '';
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
      setEstado('speaking');
      await speak(assistant);
      setEstado('idle');
      // Modo conversación: vuelve a escuchar solo.
      if (convRef.current) setTimeout(() => startListeningRef.current(), 250);
    },
    [speak],
  );

  const finishRecording = useCallback(async (blob: Blob) => {
    if (blob.size === 0) {
      setEstado('idle');
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
      if (res.ok && j.text) {
        await enviarTexto(j.text);
      } else {
        setAviso(j.message ?? 'No te entendí. Inténtalo de nuevo.');
        setEstado('idle');
      }
    } catch {
      setAviso('No pude procesar el audio.');
      setEstado('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enviarTexto]);

  // Graba con detección de silencio (VAD ligero): corta sola tras hablar.
  const startListening = useCallback(async () => {
    if (recRef.current || audioRef.current) {
      try {
        audioRef.current?.pause();
      } catch {
        /* no-op */
      }
    }
    setAviso(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      let hablo = false;
      const tick = () => {
        if (!recRef.current) return;
        an.getByteFrequencyData(data);
        let sum = 0;
        for (const v of data) sum += v;
        const avg = sum / data.length;
        if (avg > 12) {
          lastLoud = Date.now();
          hablo = true;
        }
        const now = Date.now();
        const silencio = now - lastLoud > SILENCE_MS;
        // No auto-cortar en walkie-talkie (se corta al soltar); sí en conversación.
        if (!heldRef.current && hablo && silencio) {
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
  }, [finishRecording, stopStream]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const stopListening = useCallback(() => {
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
    stopListening();
    stopStream();
    try {
      audioRef.current?.pause();
      speechSynthesis?.cancel();
    } catch {
      /* no-op */
    }
    setEstado('idle');
    setOpen(false);
  }, [stopListening, stopStream]);

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
              {partial && <p className="voice-line voice-assistant voice-partial">{partial}</p>}
              {turns.length === 0 && !partial && (
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
