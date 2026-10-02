import 'dotenv/config';

const env = process.env;

if (env.NODE_ENV === 'production' && !env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

export const config = {
  port: Number(env.PORT ?? 4000),
  databaseUrl: env.DATABASE_URL ?? 'postgres://spaceplan:spaceplan@localhost:5432/spaceplan',
  jwtSecret: env.JWT_SECRET ?? 'dev-secret-change-me',
  accessTokenTtl: '15m' as const,
  refreshTokenTtlDays: 30,
  corsOrigin: (env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
  /** Keep a new version snapshot at most this often while autosaving */
  versionIntervalMs: 10 * 60 * 1000,
  maxVersionsPerProject: 50,
  freeProjectLimit: 10,
  /** AI plan recognition: needs Anthropic credentials (ANTHROPIC_API_KEY, or AI_ENABLED=1 with an `ant auth login` profile) */
  aiEnabled: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.AI_ENABLED === '1'),
};
