import { useEffect, useState } from "preact/hooks";
import {
  Building2,
  ChevronDown,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-preact";
import {
  api,
  getActiveClientId,
  setActiveClientId,
  setActiveClientRole,
} from "../api";
import { useSession } from "../session";
import { WorkspaceSettings } from "./workspace-settings";

interface Client {
  id: string;
  name: string;
  slug: string;
  access_role?: "EDITOR" | "VIEWER";
}

export function WorkspaceBar() {
  const {
    user,
    organizations,
    activeOrganization,
    switchOrganization,
    logout,
  } = useSession();
  const [clients, setClients] = useState<Client[]>([]);
  const [activeClientId, setActiveClientState] = useState(getActiveClientId());
  const [showSettings, setShowSettings] = useState(false);
  const canManage = activeOrganization?.role === "OWNER" || activeOrganization?.role === "ADMIN";
  const currentClient = clients.find((client) => client.id === activeClientId) ?? null;
  const effectiveRole = currentClient?.access_role ?? activeOrganization?.role ?? "VIEWER";
  const canCreateClient = canManage || (activeOrganization?.all_clients && activeOrganization.role === "EDITOR");

  useEffect(() => {
    if (!activeOrganization) return;
    api<Client[]>("GET", "/api/clients")
      .then((items) => {
        setClients(items);
        const stored = getActiveClientId();
        const selected = stored ? items.find((item) => item.id === stored) : null;
        if (stored && !selected) {
          setActiveClientId(null);
          setActiveClientRole(null);
          setActiveClientState(null);
        } else {
          setActiveClientRole(selected?.access_role ?? null);
        }
      })
      .catch((error) => console.error("Unable to load clients", error));
  }, [activeOrganization?.id]);

  const selectClient = (id: string) => {
    const value = id || null;
    const client = value ? clients.find((item) => item.id === value) : null;
    setActiveClientId(value);
    setActiveClientRole(client?.access_role ?? null);
    setActiveClientState(value);
    window.location.assign("/");
  };

  const createClient = async () => {
    const name = window.prompt("Client name");
    if (!name?.trim()) return;
    try {
      const client = await api<Client>("POST", "/api/clients", { name: name.trim() });
      setClients((current) => [...current, client].sort((first, second) => first.name.localeCompare(second.name)));
      setActiveClientId(client.id);
      setActiveClientRole(client.access_role ?? null);
      setActiveClientState(client.id);
      window.location.assign("/");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to create client");
    }
  };

  return (
    <>
      <header class="h-12 shrink-0 bg-[#171719] text-white border-b border-black/30 px-3 flex items-center gap-3 z-50">
        <a href="/" class="flex items-center gap-2 no-underline text-white font-semibold text-sm mr-2">
          <span class="w-7 h-7 grid place-items-center rounded-lg bg-[#6d5dfc]">D</span>
          <span class="hidden sm:inline">DDone Design</span>
        </a>

        <div class="h-5 w-px bg-white/10" />

        <label class="relative flex items-center gap-1.5 text-xs text-zinc-300">
          <Building2 size={14} class="text-zinc-500" />
          <select
            class="appearance-none bg-transparent border-0 text-zinc-200 pr-5 outline-none cursor-pointer max-w-40 font-medium"
            value={activeOrganization?.id ?? ""}
            onChange={(event) => switchOrganization((event.target as HTMLSelectElement).value)}
            aria-label="Organization"
          >
            {organizations.map((organization) => (
              <option class="text-zinc-900" key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <ChevronDown size={12} class="absolute right-0 pointer-events-none text-zinc-600" />
        </label>

        <label class="relative hidden md:flex items-center gap-1.5 text-xs text-zinc-300">
          <UserRound size={14} class="text-zinc-500" />
          <select
            class="appearance-none bg-transparent border-0 text-zinc-200 pr-5 outline-none cursor-pointer max-w-44"
            value={activeClientId ?? ""}
            onChange={(event) => selectClient((event.target as HTMLSelectElement).value)}
            aria-label="Client"
          >
            {(activeOrganization?.all_clients || canManage) && <option class="text-zinc-900" value="">All clients</option>}
            {clients.map((client) => (
              <option class="text-zinc-900" key={client.id} value={client.id}>
                {client.name}{client.access_role ? ` · ${client.access_role}` : ""}
              </option>
            ))}
          </select>
          <ChevronDown size={12} class="absolute right-0 pointer-events-none text-zinc-600" />
        </label>

        {canCreateClient && (
          <button
            type="button"
            onClick={createClient}
            class="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-md border border-white/10 bg-white/5 text-[11px] text-zinc-300 cursor-pointer hover:bg-white/10"
          >
            <Plus size={12} /> Client
          </button>
        )}

        <div class="ml-auto flex items-center gap-2 sm:gap-3">
          <span class="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[10px] font-semibold text-zinc-400">
            <ShieldCheck size={12} /> {effectiveRole}
          </span>
          {canManage && (
            <button
              type="button"
              title="Workspace members and invitations"
              onClick={() => setShowSettings(true)}
              class="w-8 h-8 grid place-items-center rounded-lg bg-transparent border-0 text-zinc-500 cursor-pointer hover:bg-white/10 hover:text-white"
            >
              <Settings size={15} />
            </button>
          )}
          <span class="hidden lg:block text-xs text-zinc-400 max-w-40 truncate">{user?.name}</span>
          <button
            type="button"
            title="Sign out"
            onClick={() => void logout()}
            class="w-8 h-8 grid place-items-center rounded-lg bg-transparent border-0 text-zinc-500 cursor-pointer hover:bg-white/10 hover:text-white"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>
      {showSettings && <WorkspaceSettings onClose={() => setShowSettings(false)} />}
    </>
  );
}
