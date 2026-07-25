import { useState } from "preact/hooks";
import { Layers3, LockKeyhole, UsersRound } from "lucide-preact";
import { useSession } from "../session";

export function AuthScreen() {
  const { login, register } = useSession();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("DDone");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: Event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") await login(email, password);
      else await register({ name, organizationName, email, password });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to continue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main class="min-h-screen bg-[#f4f4f6] grid lg:grid-cols-[1.1fr_0.9fr]">
      <section class="hidden lg:flex flex-col justify-between bg-[#111113] text-white p-14 overflow-hidden relative">
        <div class="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-[#6d5dfc]/25 blur-3xl" />
        <div class="relative">
          <div class="flex items-center gap-3 font-semibold text-lg">
            <span class="w-10 h-10 grid place-items-center rounded-xl bg-[#6d5dfc]">
              <Layers3 size={22} />
            </span>
            DDone Design
          </div>
        </div>
        <div class="relative max-w-xl">
          <p class="text-[#9d93ff] uppercase tracking-[0.22em] text-xs font-bold mb-5">Self-hosted creative workspace</p>
          <h1 class="text-5xl leading-[1.08] font-semibold tracking-tight m-0">
            Design, collaborate and keep every client separated.
          </h1>
          <p class="text-zinc-400 text-lg leading-relaxed mt-6 max-w-lg">
            A private Canva-like editor with organizations, permissions, realtime collaboration and reusable visual elements.
          </p>
          <div class="grid grid-cols-2 gap-4 mt-10">
            <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
              <UsersRound class="text-[#9d93ff] mb-3" size={24} />
              <strong class="block text-sm">Realtime teams</strong>
              <span class="text-xs text-zinc-500">Shared projects and cursors</span>
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
            <span class="w-9 h-9 grid place-items-center rounded-lg bg-[#6d5dfc] text-white">
              <Layers3 size={19} />
            </span>
            DDone Design
          </div>
          <h2 class="text-3xl font-semibold tracking-tight text-zinc-950 m-0">
            {mode === "login" ? "Welcome back" : "Create your workspace"}
          </h2>
          <p class="text-sm text-zinc-500 mt-2 mb-8">
            {mode === "login"
              ? "Sign in to access your designs and clients."
              : "Create the first owner account and organization."}
          </p>

          <form class="flex flex-col gap-4" onSubmit={submit}>
            {mode === "register" && (
              <>
                <label class="text-sm font-medium text-zinc-700">
                  Your name
                  <input
                    required
                    minLength={2}
                    value={name}
                    onInput={(event) => setName((event.target as HTMLInputElement).value)}
                    class="mt-1.5 w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white outline-none focus:border-[#6d5dfc] focus:ring-4 focus:ring-[#6d5dfc]/10"
                    autocomplete="name"
                  />
                </label>
                <label class="text-sm font-medium text-zinc-700">
                  Organization
                  <input
                    required
                    minLength={2}
                    value={organizationName}
                    onInput={(event) => setOrganizationName((event.target as HTMLInputElement).value)}
                    class="mt-1.5 w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white outline-none focus:border-[#6d5dfc] focus:ring-4 focus:ring-[#6d5dfc]/10"
                    autocomplete="organization"
                  />
                </label>
              </>
            )}
            <label class="text-sm font-medium text-zinc-700">
              Email
              <input
                required
                type="email"
                value={email}
                onInput={(event) => setEmail((event.target as HTMLInputElement).value)}
                class="mt-1.5 w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white outline-none focus:border-[#6d5dfc] focus:ring-4 focus:ring-[#6d5dfc]/10"
                autocomplete="email"
              />
            </label>
            <label class="text-sm font-medium text-zinc-700">
              Password
              <input
                required
                type="password"
                minLength={8}
                value={password}
                onInput={(event) => setPassword((event.target as HTMLInputElement).value)}
                class="mt-1.5 w-full h-11 px-3.5 rounded-xl border border-zinc-300 bg-white outline-none focus:border-[#6d5dfc] focus:ring-4 focus:ring-[#6d5dfc]/10"
                autocomplete={mode === "login" ? "current-password" : "new-password"}
              />
            </label>

            {error && <div class="rounded-xl bg-red-50 border border-red-200 px-3.5 py-3 text-sm text-red-700">{error}</div>}

            <button
              disabled={submitting}
              class="h-11 rounded-xl border-0 bg-[#6d5dfc] text-white font-semibold cursor-pointer hover:bg-[#5c4de8] disabled:opacity-60 disabled:cursor-wait mt-2"
              type="submit"
            >
              {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create workspace"}
            </button>
          </form>

          <button
            type="button"
            class="w-full bg-transparent border-0 text-sm text-zinc-500 mt-6 cursor-pointer hover:text-zinc-900"
            onClick={() => {
              setMode((current) => (current === "login" ? "register" : "login"));
              setError(null);
            }}
          >
            {mode === "login" ? "Need an account? Create a workspace" : "Already registered? Sign in"}
          </button>
        </div>
      </section>
    </main>
  );
}
