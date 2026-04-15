import type { AgentEvent, Collision, CostSummary, CommitGroup } from "./types";

function minsAgo(m: number): string {
  return new Date(Date.now() - m * 60 * 1000).toISOString();
}

let _id = 1000;
function nextId(): number {
  return _id++;
}

// --- Events ---

const claudeAuthEvents: AgentEvent[] = [
  {
    id: nextId(),
    timestamp: minsAgo(45),
    kind: "file_create",
    file_path: "/Users/dev/acme/api-server/src/middleware/auth.ts",
    agent: "claude-code",
    diff: `+import { verify } from 'jsonwebtoken';\n+import { Request, Response, NextFunction } from 'express';\n+\n+export function authMiddleware(req: Request, res: Response, next: NextFunction) {\n+  const token = req.headers.authorization?.split(' ')[1];\n+  if (!token) return res.status(401).json({ error: 'No token provided' });\n+  try {\n+    const decoded = verify(token, process.env.JWT_SECRET!);\n+    req.user = decoded;\n+    next();\n+  } catch {\n+    return res.status(401).json({ error: 'Invalid token' });\n+  }\n+}`,
  },
  {
    id: nextId(),
    timestamp: minsAgo(43),
    kind: "file_create",
    file_path: "/Users/dev/acme/api-server/src/routes/auth.ts",
    agent: "claude-code",
    diff: `+import { Router } from 'express';\n+import { sign } from 'jsonwebtoken';\n+import { hashPassword, verifyPassword } from '../utils/crypto';\n+\n+const router = Router();\n+\n+router.post('/login', async (req, res) => {\n+  const { email, password } = req.body;\n+  const user = await db.users.findByEmail(email);\n+  if (!user || !await verifyPassword(password, user.passwordHash)) {\n+    return res.status(401).json({ error: 'Invalid credentials' });\n+  }\n+  const token = sign({ id: user.id, email }, process.env.JWT_SECRET!, { expiresIn: '24h' });\n+  res.json({ token, user: { id: user.id, email: user.email } });\n+});\n+\n+export default router;`,
  },
  {
    id: nextId(),
    timestamp: minsAgo(40),
    kind: "file_modify",
    file_path: "/Users/dev/acme/api-server/src/index.ts",
    agent: "claude-code",
    diff: `@@ -8,6 +8,8 @@\n import { corsMiddleware } from './middleware/cors';\n+import { authMiddleware } from './middleware/auth';\n+import authRoutes from './routes/auth';\n \n app.use(corsMiddleware);\n+app.use('/api/auth', authRoutes);\n+app.use('/api', authMiddleware);`,
  },
  {
    id: nextId(),
    timestamp: minsAgo(38),
    kind: "file_create",
    file_path: "/Users/dev/acme/api-server/src/middleware/__tests__/auth.test.ts",
    agent: "claude-code",
    diff: `+import { authMiddleware } from '../auth';\n+import { sign } from 'jsonwebtoken';\n+\n+describe('authMiddleware', () => {\n+  it('should reject requests without token', () => {\n+    // test implementation\n+  });\n+  it('should accept valid JWT tokens', () => {\n+    // test implementation\n+  });\n+});`,
  },
];

const claudeDbEvents: AgentEvent[] = [
  {
    id: nextId(),
    timestamp: minsAgo(120),
    kind: "file_modify",
    file_path: "/Users/dev/acme/api-server/src/db/queries.ts",
    agent: "claude-code",
    diff: `@@ -12,15 +12,28 @@\n-export async function getUsers() {\n-  return db.query('SELECT * FROM users');\n-}\n+export async function getUsers(opts: QueryOptions = {}) {\n+  const { limit = 50, offset = 0, orderBy = 'created_at' } = opts;\n+  return db.query(\n+    'SELECT id, email, name FROM users ORDER BY $1 LIMIT $2 OFFSET $3',\n+    [orderBy, limit, offset]\n+  );\n+}`,
  },
  {
    id: nextId(),
    timestamp: minsAgo(118),
    kind: "file_modify",
    file_path: "/Users/dev/acme/api-server/src/db/connection.ts",
    agent: "claude-code",
    diff: `@@ -5,3 +5,8 @@\n+import { Pool } from 'pg';\n+import { createConnectionPool } from './pool';\n+\n+const pool = new Pool({ connectionString: process.env.DATABASE_URL });\n+export { pool };`,
  },
  {
    id: nextId(),
    timestamp: minsAgo(115),
    kind: "file_create",
    file_path: "/Users/dev/acme/api-server/src/db/pool.ts",
    agent: "claude-code",
    diff: `+import { PoolConfig } from 'pg';\n+\n+export function createConnectionPool(config: PoolConfig) {\n+  return new Pool({\n+    ...config,\n+    max: 20,\n+    idleTimeoutMillis: 30000,\n+  });\n+}`,
  },
  {
    id: nextId(),
    timestamp: minsAgo(113),
    kind: "file_modify",
    file_path: "/Users/dev/acme/api-server/src/db/migrations/003_add_indexes.sql",
    agent: "claude-code",
    diff: `+CREATE INDEX idx_users_email ON users(email);\n+CREATE INDEX idx_sessions_user_id ON sessions(user_id);\n+CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);`,
  },
  {
    id: nextId(),
    timestamp: minsAgo(110),
    kind: "file_create",
    file_path: "/Users/dev/acme/api-server/src/utils/phantom-import.ts",
    agent: "claude-code",
    diff: `+import { validateSchema } from 'acme-validator';\n+import { CacheManager } from '@acme/cache-layer';\n+\n+export function validate(data: unknown) {\n+  return validateSchema(data);\n+}`,
  },
  {
    id: nextId(),
    timestamp: minsAgo(108),
    kind: "file_modify",
    file_path: "/Users/dev/acme/api-server/src/db/queries.ts",
    agent: "claude-code",
    diff: `@@ -28,6 +28,15 @@\n+export async function getUserSessions(userId: string) {\n+  return db.query('SELECT * FROM sessions WHERE user_id = $1', [userId]);\n+}`,
  },
  {
    id: nextId(),
    timestamp: minsAgo(105),
    kind: "file_modify",
    file_path: "/Users/dev/acme/api-server/src/db/queries.ts",
    agent: "claude-code",
    diff: `@@ -1,3 +1,4 @@\n+import { pool } from './connection';\n import { QueryOptions } from '../types';`,
  },
];

const cursorProfileEvents: AgentEvent[] = [
  {
    id: nextId(),
    timestamp: minsAgo(90),
    kind: "file_create",
    file_path: "/Users/dev/acme/web-app/src/pages/Profile.tsx",
    agent: "cursor",
    diff: `+import { useState, useEffect } from 'react';\n+import { useAuth } from '../hooks/useAuth';\n+\n+export default function ProfilePage() {\n+  const { user } = useAuth();\n+  const [editing, setEditing] = useState(false);\n+\n+  return (\n+    <div className=\"max-w-2xl mx-auto py-8\">\n+      <h1 className=\"text-2xl font-bold\">{user?.name}</h1>\n+      <p className=\"text-gray-500\">{user?.email}</p>\n+    </div>\n+  );\n+}`,
  },
  {
    id: nextId(),
    timestamp: minsAgo(87),
    kind: "file_create",
    file_path: "/Users/dev/acme/web-app/src/components/ProfileForm.tsx",
    agent: "cursor",
    diff: `+export function ProfileForm({ user, onSave }) {\n+  return (\n+    <form onSubmit={onSave}>\n+      <input name=\"name\" defaultValue={user.name} />\n+      <input name=\"email\" defaultValue={user.email} />\n+      <button type=\"submit\">Save</button>\n+    </form>\n+  );\n+}`,
  },
  {
    id: nextId(),
    timestamp: minsAgo(85),
    kind: "file_modify",
    file_path: "/Users/dev/acme/web-app/src/routes/index.tsx",
    agent: "cursor",
    diff: `@@ -4,6 +4,7 @@\n import Dashboard from '../pages/Dashboard';\n+import ProfilePage from '../pages/Profile';\n \n <Route path=\"/profile\" element={<ProfilePage />} />`,
  },
];

const cursorCollisionEvent: AgentEvent = {
  id: nextId(),
  timestamp: minsAgo(42),
  kind: "file_modify",
  file_path: "/Users/dev/acme/api-server/src/middleware/auth.ts",
  agent: "cursor",
  diff: `@@ -1,5 +1,8 @@\n import { verify } from 'jsonwebtoken';\n+import { RateLimiter } from '../utils/rate-limit';\n+\n+const limiter = new RateLimiter({ windowMs: 60000, max: 100 });`,
};

const windsurfCacheEvents: AgentEvent[] = [
  {
    id: nextId(),
    timestamp: minsAgo(150),
    kind: "file_create",
    file_path: "/Users/dev/acme/api-server/src/cache/redis.ts",
    agent: "windsurf",
    diff: `+import Redis from 'ioredis';\n+\n+const redis = new Redis(process.env.REDIS_URL);\n+\n+export async function cacheGet<T>(key: string): Promise<T | null> {\n+  const val = await redis.get(key);\n+  return val ? JSON.parse(val) : null;\n+}\n+\n+export async function cacheSet(key: string, value: unknown, ttl = 3600) {\n+  await redis.set(key, JSON.stringify(value), 'EX', ttl);\n+}`,
  },
  {
    id: nextId(),
    timestamp: minsAgo(147),
    kind: "file_create",
    file_path: "/Users/dev/acme/api-server/src/cache/middleware.ts",
    agent: "windsurf",
    diff: `+import { cacheGet, cacheSet } from './redis';\n+\n+export function cacheMiddleware(ttl = 300) {\n+  return async (req, res, next) => {\n+    const key = \`cache:\${req.originalUrl}\`;\n+    const cached = await cacheGet(key);\n+    if (cached) return res.json(cached);\n+    res.sendResponse = res.json;\n+    res.json = (body) => {\n+      cacheSet(key, body, ttl);\n+      res.sendResponse(body);\n+    };\n+    next();\n+  };\n+}`,
  },
  {
    id: nextId(),
    timestamp: minsAgo(144),
    kind: "file_modify",
    file_path: "/Users/dev/acme/api-server/src/routes/api.ts",
    agent: "windsurf",
    diff: `@@ -1,6 +1,8 @@\n import { Router } from 'express';\n+import { cacheMiddleware } from '../cache/middleware';\n \n const router = Router();\n+router.use('/public', cacheMiddleware(600));`,
  },
  {
    id: nextId(),
    timestamp: minsAgo(142),
    kind: "file_create",
    file_path: "/Users/dev/acme/api-server/src/cache/__tests__/redis.test.ts",
    agent: "windsurf",
    diff: `+import { cacheGet, cacheSet } from '../redis';\n+\n+describe('redis cache', () => {\n+  it('should store and retrieve values', async () => {\n+    await cacheSet('test-key', { hello: 'world' }, 60);\n+    const result = await cacheGet('test-key');\n+    expect(result).toEqual({ hello: 'world' });\n+  });\n+});`,
  },
  {
    id: nextId(),
    timestamp: minsAgo(140),
    kind: "file_modify",
    file_path: "/Users/dev/acme/api-server/package.json",
    agent: "windsurf",
    diff: `@@ -12,6 +12,7 @@\n     "express": "^4.18.2",\n+    "ioredis": "^5.3.2",\n     "jsonwebtoken": "^9.0.0",`,
  },
];

export const DEMO_EVENTS: AgentEvent[] = [
  ...claudeAuthEvents,
  ...claudeDbEvents,
  ...cursorProfileEvents,
  cursorCollisionEvent,
  ...windsurfCacheEvents,
].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

// --- Commit Groups ---

export const DEMO_COMMIT_GROUPS: CommitGroup[] = [
  {
    commit_hash: "a1b2c3d",
    commit_message: "Implemented JWT authentication middleware",
    agent: "claude-code",
    timestamp: minsAgo(37),
    files: [
      { path: "src/middleware/auth.ts", kind: "file_create", added: 18, removed: 0 },
      { path: "src/routes/auth.ts", kind: "file_create", added: 22, removed: 0 },
      { path: "src/index.ts", kind: "file_modify", added: 4, removed: 0 },
      { path: "src/middleware/__tests__/auth.test.ts", kind: "file_create", added: 14, removed: 0 },
    ],
    confidence_score: 92,
    cost_usd: 1.82,
  },
  {
    commit_hash: "e4f5g6h",
    commit_message: "Refactored database query layer",
    agent: "claude-code",
    timestamp: minsAgo(104),
    files: [
      { path: "src/db/queries.ts", kind: "file_modify", added: 35, removed: 12 },
      { path: "src/db/connection.ts", kind: "file_modify", added: 8, removed: 0 },
      { path: "src/db/pool.ts", kind: "file_create", added: 10, removed: 0 },
      { path: "src/db/migrations/003_add_indexes.sql", kind: "file_create", added: 3, removed: 0 },
      { path: "src/utils/phantom-import.ts", kind: "file_create", added: 6, removed: 0 },
      { path: "src/db/queries.ts", kind: "file_modify", added: 4, removed: 0 },
      { path: "src/db/queries.ts", kind: "file_modify", added: 2, removed: 0 },
    ],
    confidence_score: 54,
    cost_usd: 3.21,
  },
  {
    commit_hash: "i7j8k9l",
    commit_message: "Added user profile page",
    agent: "cursor",
    timestamp: minsAgo(84),
    files: [
      { path: "src/pages/Profile.tsx", kind: "file_create", added: 15, removed: 0 },
      { path: "src/components/ProfileForm.tsx", kind: "file_create", added: 10, removed: 0 },
      { path: "src/routes/index.tsx", kind: "file_modify", added: 2, removed: 0 },
    ],
    confidence_score: 88,
    cost_usd: 0.92,
  },
  {
    commit_hash: "m1n2o3p",
    commit_message: "Optimized API response caching",
    agent: "windsurf",
    timestamp: minsAgo(139),
    files: [
      { path: "src/cache/redis.ts", kind: "file_create", added: 14, removed: 0 },
      { path: "src/cache/middleware.ts", kind: "file_create", added: 16, removed: 0 },
      { path: "src/routes/api.ts", kind: "file_modify", added: 3, removed: 0 },
      { path: "src/cache/__tests__/redis.test.ts", kind: "file_create", added: 10, removed: 0 },
      { path: "package.json", kind: "file_modify", added: 1, removed: 0 },
    ],
    confidence_score: 78,
    cost_usd: 2.14,
  },
];

// --- Collisions ---

export const DEMO_COLLISIONS: Collision[] = [
  {
    file_path: "/Users/dev/acme/api-server/src/middleware/auth.ts",
    agents: ["claude-code", "cursor"],
  },
];

// --- Cost ---

export const DEMO_COST_SUMMARY: CostSummary = {
  total_cost_usd: 13.68,
  agents: [
    {
      agent: "claude-code",
      total_cost_usd: 8.42,
      input_tokens: 245000,
      output_tokens: 18200,
      cache_read_tokens: 120000,
      cache_write_tokens: 45000,
      event_count: 15,
    },
    {
      agent: "cursor",
      total_cost_usd: 3.12,
      input_tokens: 98000,
      output_tokens: 7800,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      event_count: 4,
    },
    {
      agent: "windsurf",
      total_cost_usd: 2.14,
      input_tokens: 72000,
      output_tokens: 5400,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      event_count: 5,
    },
  ],
};
