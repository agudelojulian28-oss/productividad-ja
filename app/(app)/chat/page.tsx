'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';

type Msg = { role: 'user' | 'assistant'; text: string; tools?: string[] };
type Event = { type: string; text?: string; message?: string; name?: string };

const toolLabels: Record<string, string> = {
  crear_tarea: 'creó una tarea',
  completar: 'completó una tarea',
  reprogramar: 'reprogramó una tarea',
  consultar: 'consultó tus tareas',
  buscar: 'buscó tareas',
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

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

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const history = messages;
    setMessages([...messages, { role: 'user', text }, { role: 'assistant', text: '', tools: [] }]);
    setBusy(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ history, message: text }),
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
            tengo hoy?&rdquo;, &ldquo;ya terminé el informe&rdquo;.
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
              {m.text || (busy && i === messages.length - 1 ? '…' : '')}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="chat-input">
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
