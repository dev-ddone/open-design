import { CloudOff, RefreshCw, TriangleAlert, Wifi } from "lucide-preact";
import { useEditor } from "../context";

export function CollaborationStatusBanner() {
  const {
    collaborationPhase,
    collaborationReconnectAttempt,
    collaborationLastSyncedAt,
    collaborationLastRemoteChangeAt,
    collaborationLastError,
  } = useEditor();

  if (collaborationPhase === "connected") return null;
  const offline = collaborationPhase === "offline";
  const error = collaborationPhase === "error";
  const connecting = collaborationPhase === "connecting" || collaborationPhase === "reconnecting";
  const tone = offline || error ? "border-amber-200 bg-amber-50 text-amber-800" : "border-sky-200 bg-sky-50 text-sky-800";
  const Icon = offline ? CloudOff : error ? TriangleAlert : connecting ? RefreshCw : Wifi;
  const title = offline
    ? "Stai lavorando offline"
    : error
      ? "Sincronizzazione da verificare"
      : collaborationPhase === "reconnecting"
        ? `Riconnessione realtime · tentativo ${collaborationReconnectAttempt}`
        : "Connessione realtime…";

  return (
    <div class={`absolute left-1/2 top-12 z-[74] flex max-w-xl -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-2 shadow-lg ${tone}`} role="status">
      <Icon size={15} class={connecting ? "animate-spin" : ""} />
      <div class="min-w-0"><strong class="block text-[9px]">{title}</strong><span class="block truncate text-[7px] opacity-75">{collaborationLastError ?? (offline ? "Le modifiche locali verranno sincronizzate appena tornerai online." : "Il documento resta disponibile mentre ristabiliamo il canale.")}</span></div>
      {(collaborationLastSyncedAt || collaborationLastRemoteChangeAt) && <span class="hidden whitespace-nowrap text-[7px] opacity-60 md:block">Ultima sync {collaborationLastSyncedAt ? new Date(collaborationLastSyncedAt).toLocaleTimeString("it-IT") : "—"}</span>}
    </div>
  );
}