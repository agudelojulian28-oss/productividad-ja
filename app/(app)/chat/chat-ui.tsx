'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import type { ChatMessage } from '@/lib/chat';

type Msg = { role: 'user' | 'assistant'; text: string; tools?: string[]; image?: string };
type Event = { type: string; text?: string; message?: string; name?: string };
type Attached = { mediaType: 'image/jpeg'; data: string; preview: string };

const toolLabels: Record<string, string> = {
  consultar: 'consultó tu información',
  buscar: 'buscó',
  crear: 'creó algo',
  actualizar: 'actualizó algo',
  archivar: 'archivó algo',
  mover_agenda: 'movió la agenda del día',
  guardar_imagen: 'guardó una imagen',
  deshacer: 'deshizo la última acción',
};

const SUGGESTIONS = [
  '¿Qué tengo hoy?',
  'Registrar un gasto',
  '¿Cómo van mis finanzas?',
  'Recuérdame algo mañana',
];

/* Íconos de línea (currentColor) — sin emojis, coherente con el sistema de diseño. */
const IconPaperclip = () => (
  <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
    <path
      d="M21 11.5l-8.4 8.4a5 5 0 01-7-7l8.4-8.4a3.3 3.3 0 014.7 4.7l-8.5 8.4a1.6 1.6 0 01-2.3-2.3l7.8-7.7"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const IconMic = () => (
  <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
    <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const IconStop = () => (
  <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor" />
  </svg>
);
const IconSend = () => (
  <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
    <path d="M12 20V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconSpark = () => (
  <svg viewBox="0 0 24 24" fill="none" width="26" height="26" aria-hidden="true">
    <path
      d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" fill="currentColor" />
  </svg>
);

/** Reescala en el navegador (máx. 1536 px, JPEG) para no enviar imágenes enormes. */
async function fileToAttached(file: File): Promise<Attached> {
  const bitmap = await createImageBitmap(file);
  const max = 1536;
  let { width, height } = bitmap;
  if (width > max || height > max) {
    const s = max / Math.max(width, height);
    width = Math.round(width * s);
    height = Math.round(height * s);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { mediaType: 'image/jpeg', data: dataUrl.split(',')[1]!, preview: dataUrl };
}

export function ChatUI({ initial }: { initial: ChatMessage[] }) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [input, setInput] = useState('');
  const [images, setImages] = useState<Attached[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-crece la caja de texto según el contenido (máx. ~6 líneas).
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 148)}px`;
  }, [input]);

  function updateLast(patch: Partial<Msg>) {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      const last = copy[copy.length - 1]!;
      copy[copy.length - 1] = { ...last, ...patch };
      return copy;
    });
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const next: Attached[] = [];
    for (const f of files.slice(0, 5)) {
      if (!f.type.startsWith('image/')) continue;
      try {
        next.push(await fileToAttached(f));
      } catch {
        /* ignora archivos que no se puedan leer */
      }
    }
    setImages((prev) => [...prev, ...next].slice(0, 5));
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve((r.result as string).split(',')[1] ?? '');
      r.readAsDataURL(blob);
    });
  }

  // Graba una nota de voz; al parar, la transcribe y la deja en la caja para revisar.
  async function toggleMic() {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    setMicNote(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        if (blob.size === 0) return;
        setTranscribing(true);
        try {
          const data = await blobToBase64(blob);
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ data, mime: rec.mimeType }),
          });
          const j = (await res.json()) as { text?: string; message?: string };
          if (res.ok && j.text) {
            setInput((prev) => (prev ? prev + ' ' : '') + j.text);
          } else {
            setMicNote(j.message ?? 'No pude transcribir el audio.');
          }
        } catch {
          setMicNote('No pude transcribir el audio.');
        } finally {
          setTranscribing(false);
        }
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      setMicNote('No pude acceder al micrófono. Revisa los permisos.');
    }
  }

  async function sendMessage(text: string, imgs: Attached[]) {
    if ((!text && imgs.length === 0) || busy) return;
    setInput('');
    setImages([]);
    setMessages((prev) => [
      ...prev,
      { role: 'user', text, image: imgs[0]?.preview },
      { role: 'assistant', text: '', tools: [] },
    ]);
    setBusy(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: text,
          images: imgs.map((i) => ({ mediaType: i.mediaType, data: i.data })),
        }),
      });
      if (!res.body) throw new Error('sin respuesta');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let assistant = '';
      const tools: string[] = [];
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: Event;
          try {
            ev = JSON.parse(line) as Event;
          } catch {
            continue;
          }
          if (ev.type === 'text') {
            assistant += ev.text ?? '';
            updateLast({ text: assistant });
          } else if (ev.type === 'tool' && ev.name) {
            tools.push(ev.name);
            updateLast({ tools: [...tools] });
          } else if (ev.type === 'error') {
            assistant += `\n⚠️ ${ev.message ?? ''}`;
            updateLast({ text: assistant });
          }
        }
      }
    } catch {
      updateLast({ text: 'Error de conexión.' });
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input.trim(), images);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envía; Shift+Enter hace salto de línea.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input.trim(), images);
    }
  }

  const empty = messages.length === 0;
  const canSend = (input.trim() || images.length > 0) && !busy;

  return (
    <div className="chat">
      <div className="chat-log">
        {empty && (
          <div className="chat-welcome">
            <div className="chat-welcome-ic" aria-hidden="true">
              <IconSpark />
            </div>
            <h2 className="chat-welcome-title">¿En qué te ayudo?</h2>
            <p className="chat-welcome-sub">
              Pídeme lo que sea por texto, voz o foto: capturar tareas y gastos, revisar tu
              día, mover la agenda…
            </p>
            <div className="chat-suggests">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chat-suggest"
                  onClick={() => void sendMessage(s, [])}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const streaming = busy && i === messages.length - 1 && m.role === 'assistant';
          return (
            <div key={i} className={`msg msg-${m.role}`}>
              {m.tools && m.tools.length > 0 && (
                <div className="tool-trace">
                  {m.tools.map((t, j) => (
                    <span key={j} className="tool-pill">
                      {toolLabels[t] ?? t}
                    </span>
                  ))}
                </div>
              )}
              <div className={`bubble bubble-${m.role}`}>
                {m.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image} alt="adjunto" className="chat-img" />
                )}
                {m.text}
                {streaming && m.text === '' ? (
                  <span className="typing" aria-label="escribiendo">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="chat-dock">
        {images.length > 0 && (
          <div className="chat-attachments">
            {images.map((img, i) => (
              <div key={i} className="chat-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.preview} alt="adjunto" />
                <button
                  type="button"
                  aria-label="Quitar imagen"
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {micNote && (
          <p className="chat-micnote" role="status">
            {micNote}
          </p>
        )}

        <form onSubmit={onSubmit} className="chat-input">
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPick} />
          <button
            type="button"
            className="chat-icbtn"
            onClick={() => fileRef.current?.click()}
            aria-label="Adjuntar imagen"
            disabled={busy}
          >
            <IconPaperclip />
          </button>
          <button
            type="button"
            className={`chat-icbtn${recording ? ' chat-mic-on' : ''}`}
            onClick={toggleMic}
            aria-label={recording ? 'Detener grabación' : 'Grabar nota de voz'}
            disabled={busy || transcribing}
          >
            {recording ? <IconStop /> : <IconMic />}
          </button>
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              recording ? 'Grabando…' : transcribing ? 'Transcribiendo…' : 'Escribe un mensaje…'
            }
            className="chat-ta"
            aria-label="Mensaje"
            rows={1}
          />
          <button
            type="submit"
            className="chat-send"
            disabled={!canSend}
            aria-label="Enviar"
          >
            <IconSend />
          </button>
        </form>
      </div>
    </div>
  );
}
