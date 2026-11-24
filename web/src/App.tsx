import { useCallback, useEffect, useRef, useState } from "react";
import type { BusyState, Health, Message, Source, StreamState } from "./lib/types";
import {
  addYouTube,
  clearMessages,
  deleteSource,
  getHealth,
  getMessages,
  getSources,
  streamChat,
  uploadPdf,
} from "./lib/api";
import { plural } from "./lib/format";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { ChatView } from "./components/ChatView";
import { EmptyState } from "./components/EmptyState";
import { AddSourcePanel } from "./components/AddSourcePanel";
import { Modal } from "./components/Modal";
import { SetupContent } from "./components/SetupContent";
import { Toast } from "./components/Toast";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [stream, setStream] = useState<StreamState | null>(null);
  const [busy, setBusy] = useState<BusyState | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string; kind: "error" | "info" } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((text: string, kind: "error" | "info" = "error") => {
    setToast({ id: Date.now(), text, kind });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5200);
  }, []);

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStream(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [nextHealth, nextSources] = await Promise.all([getHealth(), getSources()]);
        if (cancelled) return;
        setHealth(nextHealth);
        setSources(nextSources);
        setActiveId((current) => current ?? nextSources[0]?.id ?? null);
      } catch (error) {
        if (!cancelled) notify(errorText(error));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [notify]);

  useEffect(() => {
    stopStream();
    if (!activeId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    setLoadingMessages(true);

    getMessages(activeId)
      .then((next) => {
        if (!cancelled) setMessages(next);
      })
      .catch((error) => {
        if (!cancelled) notify(errorText(error));
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeId, notify, stopStream]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const activeSource = sources.find((source) => source.id === activeId) ?? null;

  async function refreshHealth() {
    try {
      setHealth(await getHealth());
    } catch (error) {
      notify(errorText(error));
    }
  }

  async function handlePdf(file: File) {
    stopStream();
    setBusy({ kind: "pdf", label: `Reading “${file.name}” — chunking and embedding…` });
    try {
      const source = await uploadPdf(file);
      setSources((current) => [source, ...current.filter((item) => item.id !== source.id)]);
      setActiveId(source.id);
      setAddOpen(false);
      setSidebarOpen(false);
      notify(`Indexed ${plural(source.chunkCount, "passage")} from “${source.title}”`, "info");
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleYouTube(url: string) {
    stopStream();
    setBusy({ kind: "youtube", label: "Fetching captions and indexing the video…" });
    try {
      const source = await addYouTube(url);
      setSources((current) => [source, ...current.filter((item) => item.id !== source.id)]);
      setActiveId(source.id);
      setAddOpen(false);
      setSidebarOpen(false);
      notify(`Indexed ${plural(source.chunkCount, "passage")} from “${source.title}”`, "info");
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(id: string) {
    const remaining = sources.filter((source) => source.id !== id);
    try {
      await deleteSource(id);
      if (activeId === id) {
        stopStream();
        setActiveId(remaining[0]?.id ?? null);
      }
      setSources(remaining);
      notify("Source deleted", "info");
    } catch (error) {
      notify(errorText(error));
    }
  }

  async function handleClear() {
    if (!activeId) return;
    if (stream) stopStream();
    if (!window.confirm("Clear this conversation? The source stays in your library.")) return;
    try {
      await clearMessages(activeId);
      setMessages([]);
      notify("Conversation cleared", "info");
    } catch (error) {
      notify(errorText(error));
    }
  }

  async function handleSend(question: string) {
    if (!activeId || stream) return;

    const optimistic: Message = {
      id: -Date.now(),
      role: "user",
      content: question,
      citations: null,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, optimistic]);
    setStream({ phase: "retrieving", text: "", citations: [] });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(
        activeId,
        question,
        {
          onMeta: (meta) => {
            setHealth((current) => (current ? { ...current, llm: meta.provider } : current));
            setMessages((current) =>
              current.map((message) => (message.id === optimistic.id ? meta.userMessage : message)),
            );
            setStream((current) =>
              current ? { ...current, citations: meta.citations } : current,
            );
          },
          onToken: (text) => {
            setStream((current) =>
              current
                ? { phase: "writing", text: current.text + text, citations: current.citations }
                : current,
            );
          },
          onDone: (message) => {
            setMessages((current) => [...current, message]);
            setStream(null);
          },
          onError: (message) => {
            notify(message);
            setStream(null);
          },
        },
        controller.signal,
      );
    } catch (error) {
      if (!controller.signal.aborted) notify(errorText(error));
      setStream(null);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  return (
    <div className="app">
      {sidebarOpen && <div className="backdrop" onClick={() => setSidebarOpen(false)} />}

      <Sidebar
        sources={sources}
        activeId={activeId}
        health={health}
        open={sidebarOpen}
        onSelect={(id) => {
          setActiveId(id);
          setSidebarOpen(false);
        }}
        onNew={() => setAddOpen(true)}
        onDelete={handleDelete}
        onRefreshStatus={refreshHealth}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="main">
        <TopBar
          source={activeSource}
          canClear={messages.length > 0 || stream !== null}
          onMenu={() => setSidebarOpen(true)}
          onClear={handleClear}
        />

        {activeSource ? (
          <ChatView
            source={activeSource}
            messages={messages}
            stream={stream}
            loading={loadingMessages}
            health={health}
            onSend={handleSend}
            onStop={stopStream}
            onOpenSetup={() => setSetupOpen(true)}
          />
        ) : (
          <EmptyState busy={busy} onPdf={handlePdf} onYouTube={handleYouTube} />
        )}
      </main>

      {addOpen && (
        <Modal
          title="Add a source"
          subtitle="A PDF or a YouTube video with captions."
          onClose={() => setAddOpen(false)}
        >
          <AddSourcePanel
            busy={busy}
            variant="modal"
            onPdf={handlePdf}
            onYouTube={handleYouTube}
          />
        </Modal>
      )}

      {setupOpen && (
        <Modal
          title="Give Study RAG a voice"
          subtitle="Optional — retrieval works without this."
          width={600}
          onClose={() => setSetupOpen(false)}
        >
          <SetupContent />
        </Modal>
      )}

      {toast && <Toast key={toast.id} text={toast.text} kind={toast.kind} />}
    </div>
  );
}
