import { useEffect, useState } from "preact/hooks";
import { ShieldCheck, UserPlus, X } from "lucide-preact";
import { api } from "../api";
import { useSession, type Role } from "../session";

interface Member {
  id: string;
  email: string;
  name: string;
  role: Role;
  created_at: string;
}

export function WorkspaceSettings({ onClose }: { onClose: () => void }) {
  const { activeOrganization } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "EDITOR" | "VIEWER">("EDITOR");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = async () => {
    setLoading(true);
    try {
      setMembers(await api<Member[]>("GET", "/api/organization/members"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load members");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMembers();
  }, [activeOrganization?.id]);

  const addMember = async (event: Event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api("POST", "/api/organization/members", { email, role });
      setEmail("");
      await loadMembers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add member");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div class="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm grid place-items-center p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section class="w-full max-w-2xl max-h-[85vh] overflow-hidden bg-white rounded-2xl shadow-2xl border border-zinc-200 flex flex-col">
        <header class="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <div>
            <h2 class="text-base font-semibold text-zinc-900 m-0">Workspace members</h2>
            <p class="text-xs text-zinc-400 m-0 mt-1">{activeOrganization?.name} · roles and access</p>
          </div>
          <button class="w-8 h-8 grid place-items-center rounded-lg border-0 bg-zinc-100 text-zinc-500 cursor-pointer hover:bg-zinc-200" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div class="p-5 overflow-y-auto">
          <form class="grid sm:grid-cols-[1fr_130px_auto] gap-2 mb-5" onSubmit={addMember}>
            <input
              required
              type="email"
              value={email}
              onInput={(event) => setEmail((event.target as HTMLInputElement).value)}
              placeholder="Registered user email"
              class="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-accent"
            />
            <select
              value={role}
              onChange={(event) => setRole((event.target as HTMLSelectElement).value as typeof role)}
              class="h-10 rounded-lg border border-zinc-300 px-2 text-sm bg-white outline-none focus:border-accent"
            >
              <option value="ADMIN">Admin</option>
              <option value="EDITOR">Editor</option>
              <option value="VIEWER">Viewer</option>
            </select>
            <button
              disabled={submitting}
              class="h-10 inline-flex items-center justify-center gap-1.5 rounded-lg border-0 bg-accent text-white px-4 text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              <UserPlus size={14} /> {submitting ? "Adding…" : "Add"}
            </button>
          </form>

          <p class="text-[11px] text-zinc-400 leading-relaxed mb-4">
            The email must already have a DDone Design account. Adding it again updates the member role.
          </p>

          {error && <div class="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 mb-4">{error}</div>}

          {loading ? (
            <div class="py-10 text-center text-xs text-zinc-400">Loading members…</div>
          ) : (
            <div class="border border-zinc-200 rounded-xl overflow-hidden">
              {members.map((member, index) => (
                <div
                  key={member.id}
                  class={`flex items-center gap-3 px-4 py-3 ${index > 0 ? "border-t border-zinc-100" : ""}`}
                >
                  <span class="w-9 h-9 rounded-full bg-zinc-100 grid place-items-center text-xs font-bold text-zinc-500 uppercase">
                    {member.name.slice(0, 1)}
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-zinc-800 m-0 truncate">{member.name}</p>
                    <p class="text-[11px] text-zinc-400 m-0 truncate">{member.email}</p>
                  </div>
                  <span class="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-500">
                    <ShieldCheck size={11} /> {member.role}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
