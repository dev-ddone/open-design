function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value: string | undefined, fallback = ""): string[] {
  return (value ?? fallback)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const jwtSecret = process.env.JWT_SECRET ?? "development-only-change-this-secret-now";
const emailDelivery = (process.env.EMAIL_DELIVERY ?? (process.env.SMTP_HOST ? "smtp" : "log")) as
  | "smtp"
  | "log";
const openverseClientId = optional(process.env.OPENVERSE_CLIENT_ID);
const openverseClientSecret = optional(process.env.OPENVERSE_CLIENT_SECRET);

if (nodeEnv === "production" && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must contain at least 32 characters in production");
}
if (nodeEnv === "production" && emailDelivery === "smtp" && !process.env.SMTP_HOST) {
  throw new Error("SMTP_HOST is required when EMAIL_DELIVERY=smtp");
}
if (Boolean(openverseClientId) !== Boolean(openverseClientSecret)) {
  throw new Error("OPENVERSE_CLIENT_ID and OPENVERSE_CLIENT_SECRET must be configured together");
}

export const config = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: int(process.env.PORT, 3006),
  appUrl: (process.env.APP_URL ?? "http://localhost:3006").replace(/\/$/, ""),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://open_design:open_design@localhost:5432/open_design",
  jwtSecret,
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "ddone_design_session",
  sessionTtlDays: int(process.env.SESSION_TTL_DAYS, 14),
  registrationEnabled: bool(process.env.REGISTRATION_ENABLED, true),
  passwordResetTtlMinutes: int(process.env.PASSWORD_RESET_TTL_MINUTES, 30),
  invitationTtlHours: int(process.env.INVITATION_TTL_HOURS, 72),
  email: {
    delivery: emailDelivery,
    host: process.env.SMTP_HOST,
    port: int(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.EMAIL_FROM ?? "DDone Design <noreply@ddone.it>",
    replyTo: process.env.EMAIL_REPLY_TO,
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3",
    localPath: process.env.LOCAL_STORAGE_PATH ?? "./data/uploads",
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "us-east-1",
      bucket: process.env.S3_BUCKET ?? "open-design",
      accessKey: process.env.S3_ACCESS_KEY,
      secretKey: process.env.S3_SECRET_KEY,
      forcePathStyle: bool(process.env.S3_FORCE_PATH_STYLE, true),
    },
  },
  iconify: {
    apiUrl: process.env.ICONIFY_API_URL ?? "https://api.iconify.design",
    collections: list(
      process.env.ICONIFY_COLLECTIONS,
      "tabler,ph,heroicons,bi,material-symbols",
    ),
  },
  elements: {
    cacheTtlSeconds: int(process.env.ELEMENTS_CACHE_TTL_SECONDS, 900),
    requestTimeoutMs: int(process.env.ELEMENTS_REQUEST_TIMEOUT_MS, 8_000),
    maxPerProvider: int(process.env.ELEMENTS_MAX_PER_PROVIDER, 48),
    enabledProviders: list(
      process.env.ELEMENTS_PROVIDERS,
      "builtin,uploads,iconify,openverse,wikimedia,pexels,pixabay,giphy,freesound,jamendo,sketchfab",
    ),
    openverseApiUrl: process.env.OPENVERSE_API_URL ?? "https://api.openverse.org",
    openverseClientId,
    openverseClientSecret,
    openverseToken: optional(process.env.OPENVERSE_API_TOKEN),
    allowedOpenverseLicenses: list(
      process.env.OPENVERSE_LICENSES,
      "cc0,pdm,by,by-sa",
    ),
    wikimediaApiUrl:
      process.env.WIKIMEDIA_API_URL ?? "https://commons.wikimedia.org/w/api.php",
    pexelsApiUrl: process.env.PEXELS_API_URL ?? "https://api.pexels.com",
    pexelsApiKey: optional(process.env.PEXELS_API_KEY),
    pixabayApiUrl: process.env.PIXABAY_API_URL ?? "https://pixabay.com/api/",
    pixabayApiKey: optional(process.env.PIXABAY_API_KEY),
    giphyApiUrl: process.env.GIPHY_API_URL ?? "https://api.giphy.com/v1",
    giphyApiKey: optional(process.env.GIPHY_API_KEY),
    freesoundApiUrl: process.env.FREESOUND_API_URL ?? "https://freesound.org/apiv2",
    freesoundToken: optional(process.env.FREESOUND_API_TOKEN),
    jamendoApiUrl: process.env.JAMENDO_API_URL ?? "https://api.jamendo.com/v3.0",
    jamendoClientId: optional(process.env.JAMENDO_CLIENT_ID),
    sketchfabApiUrl: process.env.SKETCHFAB_API_URL ?? "https://api.sketchfab.com/v3",
    sketchfabToken: optional(process.env.SKETCHFAB_API_TOKEN),
    manifestUrls: list(process.env.ELEMENT_PACK_URLS),
  },
  bootstrap: {
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    name: process.env.BOOTSTRAP_ADMIN_NAME ?? "DDone Admin",
    organizationName: process.env.BOOTSTRAP_ORGANIZATION_NAME ?? "DDone",
  },
} as const;
