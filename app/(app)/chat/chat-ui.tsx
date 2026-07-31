'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import type { ChatMessage } from '@/lib/chat';

type Msg = { role: 'user' | 'assistant'; text: string; tools?: string[]; image?: string };
type Event = { type: string; text?: string; message?: string; name?: string };
type Attached = { mediaType: 'image/jpeg'; data: string; preview: string };

const toolLabels: Record<string, string> = {
  crear_tarea: 'creó una tarea',
  completar: 'completó una tarea',
  reprogramar: 'reprogramó una tarea',
  consultar: 'consultó tu información',
  buscar: 'buscó',
  registrar_movimiento: 'registró un movimiento',
  documentar: 'documentó',
  gestionar_evento: 'gestionó un evento',
  deshacer: 'deshizo la última acción',
};

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
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if ((!text && images.length === 0) || busy) return;
    const sentImages = images;
    setInput('');
    setImages([]);
    setMessages((prev) => [
      ...prev,
      { role: 'user', text, image: sentImages[0]?.preview },
      { role: 'assistant', text: '', tools: [] },
    ]);
    setBusy(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: text,
          images: sentImages.map((i) => ({ mediaType: i.mediaType, data: i.data })),
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

  return (
    <div className="chat">
      <div className="chat-log">
        {messages.length === 0 && (
          <p className="muted chat-hint">
            Pídeme algo: &ldquo;recuérdame llamar a Carlos mañana a las 4&rdquo;, &ldquo;¿qué
            tengo hoy?&rdquo;, o mándame una foto y dime qué hacer con ella.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.tools && m.tools.length > 0 && (
              <div className="tool-trace">
                {m.tools.map((t, j) => (
                  <span key={j}>· {toolLabels[t] ?? t}</span>
                ))}
              </div>
            )}
            <div className={`bubble bubble-${m.role}`}>
              {m.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.image} alt="adjunto" className="chat-img" />
              )}
              {m.text || (busy && i === messages.length - 1 ? '…' : '')}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

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

      <form onSubmit={send} className="chat-input">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={onPick}
        />
        <button
          type="button"
          className="chat-attach"
          onClick={() => fileRef.current?.click()}
          aria-label="Adjuntar imagen"
          disabled={busy}
        >
          📎
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe…"
          className="field"
          aria-label="Mensaje"
        />
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? '…' : 'Enviar'}
        </button>
      </form>
    </div>
  );
}
