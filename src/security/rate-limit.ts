import { redis } from "../config/redis.js";
import { hashToken } from "./tokens.js";
import { AppError } from "../shared/errors.js";
const increment =
  "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n";
export async function checkLimit(key: string, limit: number, seconds: number) {
  const n = Number(
    await redis.eval(increment, 1, `limit:${hashToken(key)}`, seconds),
  );
  if (n > limit)
    throw new AppError(
      429,
      "RATE_LIMITED",
      "Muitas tentativas. Aguarde antes de tentar novamente.",
    );
}
