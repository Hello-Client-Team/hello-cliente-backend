// Prisma's client is a Proxy, so node:test mock.method cannot wrap it; patch by assignment.
const restores: (() => void)[] = [];
export function patch(target: object, key: string, value: unknown) {
  const obj = target as Record<string, unknown>;
  const original = obj[key];
  obj[key] = value;
  restores.push(() => {
    obj[key] = original;
  });
}
export function restoreAll() {
  while (restores.length) restores.pop()!();
}
