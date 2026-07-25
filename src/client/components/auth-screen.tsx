import { useEffect, useMemo, useState } from "preact/hooks";
import { Layers3, LockKeyhole, MailCheck, UsersRound } from "lucide-preact";
import { api } from "../api";
import { useSession, type SessionResponse } from "../session";

type Mode = "login" | "register" | "forgot" | "reset" | "invite";

interface InvitationInfo {
  email: string;
  role: "ADMIN" | "EDITOR" | "VIEWER";
  organization_name: string;
  existing_account: boolean;
  expires_at: string;
  clients: Array<{ id: string; name: string }>;
}

export function AuthScreen() {
  const { login, register, applyExternalSession } = useSession();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const resetToken = params.get("reset");
  const invitationToken = params.get("invite");
  const initialMode: Mode = invitationToken ? "invite" : resetToken ? "reset" : "login";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("DDone");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [tokenLoading, setTokenLoading] = useState(Boolean(resetToken || invitationToken));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (invitationToken) {
      api<InvitationInfo>("GET", `/api/invitations/${encodeURIComponent(invitationToken)}`)
        .then((info) => {
          setInvitation(info);
          setEmail(info.email);
        })
        .catch((caught) => setError(caught instanceof Error ? caught.message : "Invitation is invalid"))
        .finally(() => setTokenLoading(false));
      return;
    }
    if (resetToken) {
      api<{ email: string; name: string }>("GET", `/api/auth/reset-password/${encodeURIComponent(resetToken)}`)
        .then((info) => {
          setEmail(info.email);
          setName(info.name);
        })
        .catch((caught) => setError(caught instanceof Error ? caught.message : "Reset link is invalid"))
        .finally(() => setTokenLoading(false));
    }
  }, [invitationToken, resetToken]);

  const clearFeedback = () => {
    setError(null);
    setMessage(null);
  };

  const finishExternalSession = (session: SessionResponse) => {
    applyExternalSession(session);
    window.history.replaceState({}, "", "/");
    window.location.assign("/");
  };

  const submit = async (event: Event) => {
    event.preventDefault();
    clearFeedback();
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else if (mode === "register") {
        await register({ name, organizationName, email, password });
      } else if (mode === "forgot") {
        await api("POST", "/api/auth/forgot-password", { email });
        setMessage("If an account exists for this email, a reset link has been sent.");
      } else if (mode === "reset") {
        if (!resetToken) throw new Error("Missing reset token");
        if (password !== confirmPassword) throw new Error("Passwords do not match");
        const session = await api<SessionResponse>("POST", "/api/auth/reset-password", {
          token: resetToken,
          password,
        });
        finishExternalSession(session);
      } else if (mode === "invite") {
        if (!invitationToken || !invitation) throw new Error("Missing invitation token");
        if (!invitation.existing_account && password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }
        const session = await api<SessionResponse>(
          "POST",
          `/api/invitations/${encodeURIComponent(invitationToken)}/accept`,
          invitation.existing_account ? { password } : { name, password },
        );
        finishExternalSession(session);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to continue");
    } finally {
      setSubmitting(false);
    }
  };

  const heading = mode === "login"
    ? "Welcome back"
    : mode === "register"
      ? "Create your workspace"
      : mode === "forgot"
        ? "Reset your password"
        : mode === "reset"
          ? "Choose a new password"
          : "Accept your invitation";

  const description = mode === "login"
    ? "Sign in to access your designs and clients."
    : mode === "register"
      ? "Create the first owner account and organization."
      : mode === "forgot"
        ? "Enter the account email and we will send a one-time reset link."
        : mode === "reset"
          ? `Set a new password for ${email || "your account"}.`
          : invitation
            ? `${invitation.organization_name} invited ${invitation.email} as ${invitation.role}.`
            : "Loading invitation details…";

  return (
    <main class="min-h-screen bg-[#f4f4f6] grid lg:grid-cols-[1.1fr_0.9fr]">
      <section class="hidden lg:flex flex-col justify-between bg-[#111113] text-white p-14 overflow-hidden relative">
        <div class="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-[#6d5dfc]/25 blur-3xl" />
        <div class="relative">
          <div class="flex items-center gap-3 font-semibold text-lg">
            <span class="w-10 h-10 grid place-items-center rounded-xl bg-[#6d5dfc]"><Layers3 size={22} /></span>
            DDone Design
          </div>
        </div>
        <div class="relative max-w-xl">
          <p class="text-[#9d93ff] uppercase tracking-[0.22em] text-xs font-bold mb-5">Self-hosted creative workspace</p>
          <h1 class="text-5xl leading-[1.08] font-semibold tracking-tight m-0">Design, collaborate and keep every client separated.</h1>
          <p class="text-zinc-400 text-lg leading-relaxed mt-6 max-w-lg">A private Canva-like editor with organizations, permissions, realtime collaboration and reusable visual elements.</p>
          <div class="grid grid-cols-2 gap-4 mt-10">
            <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
              <UsersRound class="text-[#9d93ff] mb-3" size={24} />
              <strong class="block text-sm">Realtime teams</strong>
              <span class="text-xs text-zinc-500">Shared projects and live cursors</span>
            </div>
            <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
              <LockKeyhole class="text-[#9d93ff] mb-3" size={24} />
              <strong class="block text-sm">Private by default</strong>
              <span class="text-xs text-zinc-500">Your server, data and assets</span>
            </div>
          </div>
        </div>
        <p class="relative text-xs text-zinc-600 m-0">Open source · MIT licensed</p>
      </section>

      <section class="flex items-center justify-center p-6 sm:p-10">
        <div class="w-full max-w-md">
          <div class="lg:hidden flex items-center gap-2 font-semibold mb-10">
            <span class="w-9 h-9 grid place-items-center rounded-lg bg-[#6d5dfc] text-white"><Layers3 size={19} /></span>
            DDone Design
          </div>
          <h2 class="text-3xl font-semibold tracking-tight text-zinc-950 m-0">{heading}</h2>
          <p class="text-sm text-zinc-500 mt-2 mb-8">{description}</p>

          {mode === "invite" && invitation?.clients.length ? (
            <div class="mb-5 rounded-xl border border-violet-200 bg-violet-50 p-4 text-xs text-violet-800">
              <div class="flex items-center gap-2 font-semibold mb-2"><MailCheck size={15} /> Client access</div>
              {invitation.clients.map((client) => <div key={client.id}>• {client.name}</div>)}
            </div>
          ) : null}

          {tokenLoading ? (
            <div class="py-12 text-center text-sm text-zinc-400">Validating secure link…</div>
          ) : (
            <form class="flex flex-col gap-4" onSubmit={submit}>
              {(mode === "register" || (mode === "invite" && invitation && !invitation.existing_account)) && (
                <label class="text-sm font-medium text-zinc-700">
                  Your name
                  <input required minLength={2} value={name} onInput={(event) => setName((event.target as HTMLInputElement).value)} class="mt-1.5 w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white outline-none focus:border-[#6d5dfc] focus:ring-4 focus:ring-[#6d5dfc]/10" autocomplete="name" />
                </label>
              )}

              {mode === "register" && (
                <label class="text-sm font-medium text-zinc-700">
                  Organization
                  <input required minLength={2} value={organizationName} onInput={(event) => setOrganizationName((event.target as HTMLInputElement).value)} class="mt-1.5 w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white outline-none focus:border-[#6d5dfc] focus:ring-4 focus:ring-[#6d5dfc]/10" autocomplete="organization" />
                </label>
              )}

              {mode !== "reset" && mode !== "invite" && (
                <label class="text-sm font-medium text-zinc-700">
                  Email
                  <input required type="email" value={email} onInput={(event) => setEmail((event.target as HTMLInputElement).value)} class="mt-1.5 w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white outline-none focus:border-[#6d5dfc] focus:ring-4 focus:ring-[#6d5dfc]/10" autocomplete="email" />
                </label>
              )}

              {mode !== "forgot" && (
                <label class="text-sm font-medium text-zinc-700">
                  {mode === "invite" && invitation?.existing_account ? "Existing account password" : "Password"}
                  <input required type="password" minLength={8} value={password} onInput={(event) => setPassword((event.target as HTMLInputElement).value)} class="mt-1.5 w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white outline-none focus:border-[#6d5dfc] focus:ring-4 focus:ring-[#6d5dfc]/10" autocomplete={mode === "login" || invitation?.existing_account ? "current-password" : "new-password"} />
                </label>
              )}

              {(mode === "reset" || (mode === "invite" && invitation && !invitation.existing_account)) && (
                <label class="text-sm font-medium text-zinc-700">
                  Confirm password
                  <input required type="password" minLength={8} value={confirmPassword} onInput={(event) => setConfirmPassword((event.target as HTMLInputElement).value)} class="mt-1.5 w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white outline-none focus:border-[#6d5dfc] focus:ring-4 focus:ring-[#6d5dfc]/10" autocomplete="new-password" />
                </label>
              )}

              {error && <div class="rounded-xl bg-red-50 border border-red-200 px-3.5 py-3 text-sm text-red-700">{error}</div>}
              {message && <div class="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-3 text-sm text-emerald-700">{message}</div>}

              <button disabled={submitting || Boolean(error && (resetToken || invitationToken))} class="h-11 rounded-xl border-0 bg-[#6d5dfc] text-white font-semibold cursor-pointer hover:bg-[#5c4de8] disabled:opacity-60 disabled:cursor-wait mt-2" type="submit">
                {submitting
                  ? "Please wait…"
                  : mode === "login"
                    ? "Sign in"
                    : mode === "register"
                      ? "Create workspace"
                      : mode === "forgot"
                        ? "Send reset email"
                        : mode === "reset"
                          ? "Save new password"
                          : "Accept invitation"}
              </button>
            </form>
          )}

          {!resetToken && !invitationToken && (
            <div class="mt-6 flex flex-col gap-2 text-center">
              {mode === "login" && (
                <button type="button" class="bg-transparent border-0 text-sm text-zinc-500 cursor-pointer hover:text-zinc-900" onClick={() => { setMode("forgot"); clearFeedback(); }}>
                  Forgot your password?
                </button>
              )}
              <button
                type="button"
                class="bg-transparent border-0 text-sm text-zinc-500 cursor-pointer hover:text-zinc-900"
                onClick={() => {
                  setMode((current) => current === "register" ? "login" : current === "login" ? "register" : "login");
                  clearFeedback();
                }}
              >
                {mode === "register" ? "Already registered? Sign in" : mode === "login" ? "Need an account? Create a workspace" : "Back to sign in"}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
