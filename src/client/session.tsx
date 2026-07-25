import { createContext, type ComponentChildren } from "preact";
import { useCallback, useContext, useEffect, useMemo, useState } from "preact/hooks";
import { api, getActiveOrganizationId, setActiveOrganizationId } from "./api";

export type Role = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: Role;
  all_clients: boolean;
}

export interface SessionResponse {
  user: SessionUser;
  organizations: Organization[];
}

interface SessionContextValue {
  loading: boolean;
  user: SessionUser | null;
  organizations: Organization[];
  activeOrganization: Organization | null;
  login(email: string, password: string): Promise<void>;
  register(input: {
    name: string;
    email: string;
    password: string;
    organizationName: string;
  }): Promise<void>;
  logout(): Promise<void>;
  switchOrganization(id: string): void;
  refresh(): Promise<void>;
  applyExternalSession(session: SessionResponse): void;
}

const SessionContext = createContext<SessionContextValue>(null!);

function selectOrganization(organizations: Organization[]): Organization | null {
  const stored = getActiveOrganizationId();
  const selected = organizations.find((organization) => organization.id === stored) ?? organizations[0] ?? null;
  if (selected && selected.id !== stored) setActiveOrganizationId(selected.id);
  return selected;
}

export function SessionProvider({ children }: { children: ComponentChildren }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  const applySession = useCallback((session: SessionResponse | null) => {
    setUser(session?.user ?? null);
    setOrganizations(session?.organizations ?? []);
    if (session) selectOrganization(session.organizations);
  }, []);

  const refresh = useCallback(async () => {
    try {
      applySession(await api<SessionResponse>("GET", "/api/auth/me"));
    } catch {
      applySession(null);
    } finally {
      setLoading(false);
    }
  }, [applySession]);

  useEffect(() => {
    void refresh();
    const expired = () => applySession(null);
    window.addEventListener("ddone:session-expired", expired);
    return () => window.removeEventListener("ddone:session-expired", expired);
  }, [refresh, applySession]);

  const login = useCallback(async (email: string, password: string) => {
    applySession(await api<SessionResponse>("POST", "/api/auth/login", { email, password }));
  }, [applySession]);

  const register = useCallback(async (input: { name: string; email: string; password: string; organizationName: string }) => {
    applySession(await api<SessionResponse>("POST", "/api/auth/register", input));
  }, [applySession]);

  const logout = useCallback(async () => {
    try {
      await api("POST", "/api/auth/logout");
    } finally {
      setActiveOrganizationId(null);
      applySession(null);
    }
  }, [applySession]);

  const activeOrganization = useMemo(() => selectOrganization(organizations), [organizations]);

  const switchOrganization = useCallback((id: string) => {
    setActiveOrganizationId(id);
    window.location.assign("/");
  }, []);

  return (
    <SessionContext.Provider
      value={{
        loading,
        user,
        organizations,
        activeOrganization,
        login,
        register,
        logout,
        switchOrganization,
        refresh,
        applyExternalSession: applySession,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
