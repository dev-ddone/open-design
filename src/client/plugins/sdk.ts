export type PluginPermission = "canvas:read" | "canvas:write" | "network" | "assets:read";

export type PluginCommandAction =
  | { type: "open-url"; url: string }
  | { type: "open-panel"; panel: string }
  | { type: "insert-element"; element: Record<string, unknown> }
  | { type: "http-request"; url: string; method: "GET" | "POST" };

export interface PluginCommand {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  action: PluginCommandAction;
}

export interface PluginSetting {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "select";
  required?: boolean;
  options?: string[];
  default?: unknown;
}

export interface StudioPluginManifest {
  schemaVersion: 1;
  key: string;
  name: string;
  version: string;
  description?: string;
  homepage?: string;
  permissions: PluginPermission[];
  commands: PluginCommand[];
  settings: PluginSetting[];
}

export interface InstalledPlugin {
  id: string;
  plugin_key: string;
  name: string;
  manifest: StudioPluginManifest;
  configuration: Record<string, unknown>;
  enabled: boolean;
  client_id: string | null;
  created_at: string;
  updated_at: string;
}

export function parsePluginManifest(value: unknown): StudioPluginManifest {
  let decoded: unknown = value;
  if (typeof value === "string") decoded = JSON.parse(value);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error("Il manifest del plugin deve essere un oggetto JSON.");
  }

  const manifest = decoded as Partial<StudioPluginManifest>;
  if (manifest.schemaVersion !== 1) throw new Error("La versione schema del plugin deve essere 1.");
  if (!manifest.key || !/^[a-z0-9][a-z0-9._-]*$/.test(manifest.key)) throw new Error("Chiave plugin non valida.");
  if (!manifest.name?.trim() || !manifest.version?.trim()) throw new Error("Nome e versione sono obbligatori.");
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  const allowedPermissions = new Set<PluginPermission>(["canvas:read", "canvas:write", "network", "assets:read"]);
  if (permissions.some((permission) => !allowedPermissions.has(permission))) throw new Error("Il manifest richiede un permesso sconosciuto.");
  const commands = Array.isArray(manifest.commands) ? manifest.commands : [];
  for (const command of commands) {
    if (!command.id?.trim() || !command.title?.trim() || !command.action?.type) throw new Error("Comando plugin incompleto.");
    if ((command.action.type === "insert-element") && !permissions.includes("canvas:write")) throw new Error(`Il comando ${command.id} richiede canvas:write.`);
    if ((command.action.type === "http-request") && !permissions.includes("network")) throw new Error(`Il comando ${command.id} richiede network.`);
  }
  return {
    schemaVersion: 1,
    key: manifest.key,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    homepage: manifest.homepage,
    permissions,
    commands,
    settings: Array.isArray(manifest.settings) ? manifest.settings : [],
  };
}

export function pluginConfigurationDefaults(manifest: StudioPluginManifest): Record<string, unknown> {
  return Object.fromEntries(manifest.settings.filter((setting) => setting.default !== undefined).map((setting) => [setting.key, setting.default]));
}

export function interpolatePluginValue(value: unknown, configuration: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    return value.replace(/\{\{\s*settings\.([a-zA-Z0-9._-]+)\s*\}\}/g, (_match, key) => String(configuration[key] ?? ""));
  }
  if (Array.isArray(value)) return value.map((item) => interpolatePluginValue(item, configuration));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, interpolatePluginValue(item, configuration)]));
  return value;
}

export const EXAMPLE_PLUGIN_MANIFEST: StudioPluginManifest = {
  schemaVersion: 1,
  key: "ddone.example.badge",
  name: "Example badge tools",
  version: "1.0.0",
  description: "Esempio di plugin dichiarativo che inserisce un badge configurabile.",
  permissions: ["canvas:write"],
  settings: [{ key: "label", label: "Testo badge", type: "text", default: "NUOVO" }],
  commands: [{
    id: "insert-badge",
    title: "Inserisci badge",
    description: "Aggiunge un badge vettoriale al centro della pagina.",
    action: {
      type: "insert-element",
      element: {
        type: "group",
        objects: [
          { type: "rect", width: 220, height: 76, rx: 18, ry: 18, fill: "#6d5dfc", originX: "center", originY: "center" },
          { type: "textbox", text: "{{settings.label}}", width: 180, fontSize: 28, fontWeight: "700", fill: "#ffffff", textAlign: "center", originX: "center", originY: "center", left: 0, top: -16 },
        ],
        left: 540,
        top: 540,
        originX: "center",
        originY: "center",
      },
    },
  }],
};
