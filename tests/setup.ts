// Isolated placeholders; no external service credentials or real database.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
process.env.REDIS_URL = "redis://127.0.0.1:6379";
process.env.JWT_SECRET =
  "a-test-only-secret-that-is-longer-than-forty-eight-characters-never-use-in-production";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.API_URL = "http://localhost:3333";
process.env.CORS_ORIGINS = "http://localhost:3000";
process.env.DB_SSL = "false";
