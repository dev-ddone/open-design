import { useEffect, useMemo, useState } from "preact/hooks";
import {
  Ban,
  Check,
  Mail,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  X,
} from "lucide-preact";
import { api } from "../api";
import { useSession, type Role } from "../session";

interface Client {
  id: string;
  name: string;
}

interface ClientPermission {
  client_id: string;
  client_name?: string;
  role: "EDITOR" | "VIEWER";
}

interface Member {
  id: string;
  email: string;
  name: string;
  role: Role;
  all_clients: boolean;
  created_at: string;
  clients: ClientPermission[];
}

interface Invitation {
  id: string;
  email: string;
  role: "ADMIN" | "EDITOR" | "VIEWER";
  client_permissions: ClientPermission[];
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  email_sent_at: string | null;
  created_at: string;
  invited_by_name: string;
}

function AccessEditor({
  clients,
  role,
  allClients,
  permissions,
  onRoleChange,
  onAllClientsChange,
  onPermissionsChange,
}: {
  clients: Client[];
  role: "ADMIN" | "EDITOR" | "VIEWER";
  allClients: boolean;
  permissions: ClientPermission[];
  onRoleChange: (role: "ADMIN" | "EDITOR" | "VIEWER") => void;
  onAllClientsChange: (value: boolean) => void;
  onPermissionsChange: (permissions: ClientPermission[]) => void;
}) {
  const effectiveAll = role === "ADMIN" || allClients;
  const toggleClient = (clientId: string, checked: boolean) => {
    if (checked) {
      onPermissionsChange([...permissions, { client_id: clientId, role: role === "VIEWER" ? "VIEWER" : "EDITOR" }]);
    } else {
      onPermissionsChange(permissions.filter((permission) => permission.client_id !== clientId));
    }
  };
  const setClientRole = (clientId: string, clientRole: "EDITOR" | "VIEWER") => {
    onPermissionsChange(
      permissions.map((permission) => permission.client_id === clientId ? { ...permission, role: clientRole } : permission),
    );
  };

  return (
    <div class="space-y-3">
      <div class="grid sm:grid-cols-2 gap-3">
        <label class="text-xs font-medium text-zinc-600">
          Workspace role
          <select
            value={role}
            onChange={(event) => {
              const next = (event.target as HTMLSelectElement).value as typeof role;
              onRoleChange(next);
              if (next === "ADMIN") onAllClientsChange(true);
            }}
            class="mt-1.5 w-full h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-accent"
          >
            <option value="ADMIN">Administrator</option>
            <option value="EDITOR">Editor</option>
            <option value="VIEWER">Viewer</option>
          </select>
        </label>
        <label class="text-xs font-medium text-zinc-600">
          Scope
          <select
            value={effectiveAll ? "all" : "selected"}
            disabled={role === "ADMIN"}
            onChange={(event) => onAllClientsChange((event.target as HTMLSelectElement).value === "all")}
            class="mt-1.5 w-full h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-accent disabled:bg-zinc-100"
          >
            <option value="all">All clients</option>
            <option value="selected">Selected clients only</option>
          </select>
        </label>
      </div>

      {!effectiveAll && (
        <div class="rounded-xl border border-zinc-200 overflow-hidden max-h-52 overflow-y-auto">
          {clients.length === 0 ? (
            <div class="p-4 text-xs text-zinc-400 text-center">Create a client before assigning scoped access.</div>
          ) : clients.map((client, index) => {
            const permission = permissions.find((item) => item.client_id === client.id);
            return (
              <div key={client.id} class={`flex items-center gap-3 px-3 py-2.5 ${index ? "border-t border-zinc-100" : ""}`}>
                <input
                  type="checkbox"
                  checked={Boolean(permission)}
                  onChange={(event) => toggleClient(client.id, (event.target as HTMLInputElement).checked)}
                  class="accent-[#6d5dfc]"
                />
                <span class="min-w-0 flex-1 text-xs font-medium text-zinc-700 truncate">{client.name}</span>
                {permission && (
                  <select
                    value={permission.role}
                    onChange={(event) => setClientRole(client.id, (event.target as HTMLSelectElement).value as "EDITOR" | "VIEWER")}
                    class="h-8 rounded-md border border-zinc-200 bg-white px-2 text-[11px] outline-none focus:border-accent"
                  >
                    <option value="EDITOR">Editor</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function WorkspaceSettings({ onClose }: { onClose: () => void }) {
  const { activeOrganization } = useSession();
  const [tab, setTab] = useState<"members" | "invite">("members");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "EDITOR" | "VIEWER">("EDITOR");
  const [allClients, setAllClients] = useState(true);
  const [permissions, setPermissions] = useState<ClientPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedMembers, loadedInvitations, loadedClients] = await Promise.all([
        api<Member[]>("GET", "/api/organization/members"),
        api<Invitation[]>("GET", "/api/organization/invitations"),
        api<Client[]>("GET", "/api/clients"),
      ]);
      setMembers(loadedMembers);
      setInvitations(loadedInvitations);
      setClients(loadedClients);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load workspace settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [activeOrganization?.id]);

  useEffect(() => {
    if (!selectedMember) return;
    if (selectedMember.role === "OWNER") return;
    setRole(selectedMember.role as "ADMIN" | "EDITOR" | "VIEWER");
    setAllClients(selectedMember.all_clients);
    setPermissions(selectedMember.clients.map((permission) => ({
      client_id: permission.client_id,
      role: permission.role,
    })));
  }, [selectedMemberId]);

  const resetInviteForm = () => {
    setEmail("");
    setRole("EDITOR");
    setAllClients(true);
    setPermissions([]);
  };

  const sendInvitation = async (event: Event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await api("POST", "/api/organization/invitations", {
        email,
        role,
        all_clients: allClients,
        clients: permissions,
      });
      setMessage(`Invitation sent to ${email}`);
      resetInviteForm();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send invitation");
    } finally {
      setSubmitting(false);
    }
  };

  const saveMemberAccess = async () => {
    if (!selectedMember || selectedMember.role === "OWNER") return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await api("PUT", `/api/organization/members/${selectedMember.id}/access`, {
        role,
        all_clients: allClients,
        clients: permissions,
      });
      setMessage(`Access updated for ${selectedMember.name}`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update member access");
    } finally {
      setSubmitting(false);
    }
  };

  const revokeInvitation = async (invitation: Invitation) => {
    if (!confirm(`Revoke the invitation sent to ${invitation.email}?`)) return;
    try {
      await api("DELETE", `/api/organization/invitations/${invitation.id}`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to revoke invitation");
    }
  };

  return (
    <div class="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm grid place-items-center p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section class="w-full max-w-4xl max-h-[90vh] overflow-hidden bg-white rounded-2xl shadow-2xl border border-zinc-200 flex flex-col">
        <header class="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <div>
            <h2 class="text-base font-semibold text-zinc-900 m-0">Workspace access</h2>
            <p class="text-xs text-zinc-400 m-0 mt-1">{activeOrganization?.name} · email invitations and client permissions</p>
          </div>
          <div class="flex items-center gap-2">
            <button title="Refresh" class="w-8 h-8 grid place-items-center rounded-lg border-0 bg-zinc-100 text-zinc-500 cursor-pointer hover:bg-zinc-200" onClick={() => void load()}><RefreshCw size={15} /></button>
            <button class="w-8 h-8 grid place-items-center rounded-lg border-0 bg-zinc-100 text-zinc-500 cursor-pointer hover:bg-zinc-200" onClick={onClose}><X size={16} /></button>
          </div>
        </header>

        <div class="flex border-b border-zinc-200 px-5">
          <button onClick={() => setTab("members")} class={`px-3 py-3 text-xs font-semibold border-x-0 border-t-0 bg-transparent cursor-pointer ${tab === "members" ? "text-accent border-b-2 border-accent" : "text-zinc-400 border-b-2 border-transparent"}`}>Members</button>
          <button onClick={() => setTab("invite")} class={`px-3 py-3 text-xs font-semibold border-x-0 border-t-0 bg-transparent cursor-pointer ${tab === "invite" ? "text-accent border-b-2 border-accent" : "text-zinc-400 border-b-2 border-transparent"}`}>Invite by email</button>
        </div>

        {error && <div class="mx-5 mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">{error}</div>}
        {message && <div class="mx-5 mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700">{message}</div>}

        <div class="p-5 overflow-y-auto flex-1">
          {loading ? (
            <div class="py-16 text-center text-xs text-zinc-400">Loading access settings…</div>
          ) : tab === "invite" ? (
            <div class="grid lg:grid-cols-[1fr_0.9fr] gap-6">
              <form class="space-y-4" onSubmit={sendInvitation}>
                <div class="rounded-xl border border-zinc-200 p-4">
                  <div class="flex items-center gap-2 mb-4"><Mail size={16} class="text-accent" /><h3 class="m-0 text-sm font-semibold text-zinc-800">New invitation</h3></div>
                  <label class="block text-xs font-medium text-zinc-600 mb-4">
                    Email address
                    <input required type="email" value={email} onInput={(event) => setEmail((event.target as HTMLInputElement).value)} placeholder="collaborator@example.com" class="mt-1.5 w-full h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-accent" />
                  </label>
                  <AccessEditor clients={clients} role={role} allClients={allClients} permissions={permissions} onRoleChange={setRole} onAllClientsChange={setAllClients} onPermissionsChange={setPermissions} />
                  <button disabled={submitting} class="mt-4 w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-lg border-0 bg-accent text-white px-4 text-xs font-semibold cursor-pointer disabled:opacity-60">
                    <UserPlus size={14} /> {submitting ? "Sending…" : "Send invitation"}
                  </button>
                </div>
              </form>

              <div>
                <h3 class="m-0 mb-3 text-sm font-semibold text-zinc-800">Recent invitations</h3>
                <div class="border border-zinc-200 rounded-xl overflow-hidden">
                  {invitations.length === 0 ? (
                    <div class="p-8 text-center text-xs text-zinc-400">No invitations sent yet.</div>
                  ) : invitations.map((invitation, index) => {
                    const pending = !invitation.accepted_at && !invitation.revoked_at && new Date(invitation.expires_at) > new Date();
                    return (
                      <div key={invitation.id} class={`flex items-center gap-3 px-3 py-3 ${index ? "border-t border-zinc-100" : ""}`}>
                        <span class={`w-8 h-8 rounded-full grid place-items-center ${pending ? "bg-violet-50 text-violet-600" : invitation.accepted_at ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-400"}`}>
                          {invitation.accepted_at ? <Check size={14} /> : pending ? <Mail size={14} /> : <Ban size={14} />}
                        </span>
                        <div class="min-w-0 flex-1">
                          <p class="m-0 text-xs font-medium text-zinc-700 truncate">{invitation.email}</p>
                          <p class="m-0 mt-0.5 text-[10px] text-zinc-400">{invitation.role} · {invitation.client_permissions.length ? `${invitation.client_permissions.length} clients` : "all clients"}</p>
                        </div>
                        {pending && <button onClick={() => void revokeInvitation(invitation)} class="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] text-zinc-500 cursor-pointer hover:text-red-500 hover:border-red-200">Revoke</button>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div class="grid lg:grid-cols-[0.85fr_1.15fr] gap-5">
              <div class="border border-zinc-200 rounded-xl overflow-hidden self-start">
                {members.map((member, index) => (
                  <button
                    key={member.id}
                    onClick={() => setSelectedMemberId(member.id)}
                    class={`w-full flex items-center gap-3 px-4 py-3 text-left border-x-0 border-b-0 cursor-pointer ${index ? "border-t border-zinc-100" : "border-t-0"} ${selectedMemberId === member.id ? "bg-accent/5" : "bg-white hover:bg-zinc-50"}`}
                  >
                    <span class="w-9 h-9 rounded-full bg-zinc-100 grid place-items-center text-xs font-bold text-zinc-500 uppercase">{member.name.slice(0, 1)}</span>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-medium text-zinc-800 m-0 truncate">{member.name}</p>
                      <p class="text-[11px] text-zinc-400 m-0 truncate">{member.email}</p>
                    </div>
                    <span class="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-500"><ShieldCheck size={11} /> {member.role}</span>
                  </button>
                ))}
              </div>

              <div class="rounded-xl border border-zinc-200 p-5 min-h-72">
                {!selectedMember ? (
                  <div class="h-full min-h-64 grid place-items-center text-center text-xs text-zinc-400">
                    <div><SlidersHorizontal size={28} class="mx-auto mb-3 text-zinc-300" />Select a member to inspect access.</div>
                  </div>
                ) : selectedMember.role === "OWNER" ? (
                  <div>
                    <h3 class="m-0 text-sm font-semibold text-zinc-800">{selectedMember.name}</h3>
                    <p class="mt-1 text-xs text-zinc-400">Workspace owner</p>
                    <div class="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">Owner access includes all clients and cannot be reduced here.</div>
                  </div>
                ) : (
                  <div>
                    <h3 class="m-0 text-sm font-semibold text-zinc-800">Edit access for {selectedMember.name}</h3>
                    <p class="mt-1 mb-5 text-xs text-zinc-400">{selectedMember.email}</p>
                    <AccessEditor clients={clients} role={role} allClients={allClients} permissions={permissions} onRoleChange={setRole} onAllClientsChange={setAllClients} onPermissionsChange={setPermissions} />
                    <button disabled={submitting} onClick={() => void saveMemberAccess()} class="mt-5 w-full h-10 rounded-lg border-0 bg-accent text-white text-xs font-semibold cursor-pointer disabled:opacity-60">{submitting ? "Saving…" : "Save member access"}</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
