function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const jwtSecret = process.env.JWT_SECRET ?? "development-only-change-this-secret-now";

if (nodeEnv === "production" && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must contain at least 32 characters in production");
}

export const config = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: int(process.env.PORT, 3006),
  appUrl: process.env.APP_URL ?? "http://localhost:3006",
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://open_design:open_design@localhost:5432/open_design",
  jwtSecret,
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "ddone_design_session",
  sessionTtlDays: int(process.env.SESSION_TTL_DAYS, 14),
  registrationEnabled: bool(process.env.REGISTRATION_ENABLED, true),
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
    collections: (process.env.ICONIFY_COLLECTIONS ?? "tabler,ph,heroicons,bi,material-symbols")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  },
  bootstrap: {
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    name: process.env.BOOTSTRAP_ADMIN_NAME ?? "DDone Admin",
    organizationName: process.env.BOOTSTRAP_ORGANIZATION_NAME ?? "DDone",
  },
} as const;
