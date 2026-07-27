import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { Bell, CheckCheck, MessageSquare, X } from "lucide-preact";
import { api } from "../api";
import { useEditor } from "../context";

interface StudioNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  design_id: string | null;
  design_name: string | null;
  comment_id: string | null;
  read_at: string | null;
  created_at: string;
}

export function NotificationCenter() {
  const { navigate } = useEditor();
  const [items, setItems] = useState<StudioNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api<StudioNotification[]>("GET", "/api/notifications?limit=100")); }
    catch { /* offline and reconnect states keep the last inbox snapshot */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    const show = () => { setOpen(true); void load(); };
    window.addEventListener("ddone:open-notifications", show);
    return () => { window.clearInterval(timer); window.removeEventListener("ddone:open-notifications", show); };
  }, [load]);

  const unread = useMemo(() => items.filter((item) => !item.read_at).length, [items]);
  const markRead = async (item: StudioNotification) => {
    if (!item.read_at) {
      await api("PATCH", `/api/notifications/${item.id}`, { read: true });
      setItems((current) => current.map((value) => value.id === item.id ? { ...value, read_at: new Date().toISOString() } : value));
    }
    if (item.design_id) navigate(`/design/${item.design_id}`);
    setOpen(false);
    if (item.comment_id) window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("ddone:open-right-panel", { detail: { tab: "review" } }));
      window.dispatchEvent(new CustomEvent("ddone:focus-comment", { detail: { commentId: item.comment_id } }));
    }, 250);
  };

  const markAll = async () => {
    await api("POST", "/api/notifications/read-all", {});
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
  };

  return (
    <>
      <button onClick={() => { setOpen((value) => !value); void load(); }} title="Notifiche" class="absolute right-[172px] top-2 z-[72] grid h-8 w-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 shadow-sm cursor-pointer hover:bg-zinc-50">
        <Bell size={14} />
        {unread > 0 && <span class="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-500 px-1 text-center text-[7px] font-bold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div class="absolute right-4 top-12 z-[120] flex max-h-[70vh] w-[360px] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
          <header class="flex items-center justify-between border-b border-zinc-200 px-4 py-3"><div><strong class="text-xs text-zinc-800">Notifiche</strong><span class="ml-2 text-[8px] text-zinc-400">{unread} non lette</span></div><div class="flex gap-1"><button title="Segna tutte come lette" disabled={unread === 0} onClick={() => void markAll()} class="grid h-8 w-8 place-items-center rounded-lg border-0 bg-transparent text-zinc-500 cursor-pointer disabled:opacity-30"><CheckCheck size={14} /></button><button onClick={() => setOpen(false)} class="grid h-8 w-8 place-items-center rounded-lg border-0 bg-transparent text-zinc-500 cursor-pointer"><X size={14} /></button></div></header>
          <div class="overflow-y-auto p-2">
            {items.map((item) => <button key={item.id} onClick={() => void markRead(item)} class={`mb-1 flex w-full gap-3 rounded-xl border-0 p-3 text-left cursor-pointer ${item.read_at ? "bg-white" : "bg-violet-50"}`}><span class={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${item.read_at ? "bg-zinc-100 text-zinc-500" : "bg-violet-600 text-white"}`}><MessageSquare size={13} /></span><span class="min-w-0"><strong class="block truncate text-[10px] text-zinc-800">{item.title}</strong><span class="mt-1 line-clamp-2 block text-[8px] leading-relaxed text-zinc-500">{item.body}</span><span class="mt-1 block text-[7px] text-zinc-400">{item.design_name ?? "Workspace"} · {new Date(item.created_at).toLocaleString("it-IT")}</span></span></button>)}
            {!loading && items.length === 0 && <p class="p-8 text-center text-[9px] text-zinc-400">Nessuna notifica.</p>}
            {loading && items.length === 0 && <p class="p-8 text-center text-[9px] text-zinc-400">Aggiornamento…</p>}
          </div>
        </div>
      )}
    </>
  );
}