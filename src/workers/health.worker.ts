import { db } from "../config/database.js";
import { env } from "../config/env.js";
import { safeGet } from "../security/safe-http.js";
import { serializable } from "../shared/transaction.js";
export interface HealthJob {
  projectId: string;
  url: string;
}
export function nextHealthState(
  status: "APPROVED" | "SUSPENDED",
  failures: number,
  success: boolean,
  threshold: number,
) {
  const nextFailures = success ? 0 : failures + 1;
  return {
    failures: nextFailures,
    status:
      status === "APPROVED" && nextFailures >= threshold
        ? ("SUSPENDED" as const)
        : status,
  };
}
export async function checkProject(job: HealthJob, leaseToken: string) {
  const now = new Date();
  const claimed = await serializable(async (tx) => {
    const p = await tx.project.findUnique({ where: { id: job.projectId } });
    if (
      !p ||
      p.productionUrl !== job.url ||
      !["APPROVED", "SUSPENDED"].includes(p.status) ||
      (p.nextHealthCheckAt && p.nextHealthCheckAt > now) ||
      (p.healthLeaseUntil && p.healthLeaseUntil > now)
    )
      return null;
    return tx.project.update({
      where: { id: p.id },
      data: {
        healthLeaseUntil: new Date(Date.now() + 60000),
        healthLeaseToken: leaseToken,
      },
    });
  });
  if (!claimed) return;
  const probe = await safeGet(claimed.productionUrl, env.HEALTH_TIMEOUT_MS);
  await serializable(async (tx) => {
    const current = await tx.project.findUnique({ where: { id: claimed.id } });
    if (!current || current.healthLeaseToken !== leaseToken) return;
    if (
      current.productionUrl !== claimed.productionUrl ||
      current.updatedAt.getTime() !== claimed.updatedAt.getTime() ||
      !["APPROVED", "SUSPENDED"].includes(current.status)
    ) {
      await tx.project.update({
        where: { id: current.id },
        data: { healthLeaseUntil: null, healthLeaseToken: null },
      });
      return;
    }
    const state = nextHealthState(
        current.status as "APPROVED" | "SUSPENDED",
        current.consecutiveFailures,
        probe.result === "SUCCESS",
        env.HEALTH_FAILURE_THRESHOLD,
      ),
      finished = new Date();
    await tx.healthCheck.create({
      data: {
        projectId: current.id,
        checkedUrl: claimed.productionUrl,
        ...probe,
        checkedAt: finished,
      },
    });
    await tx.project.update({
      where: { id: current.id },
      data: {
        consecutiveFailures: state.failures,
        status: state.status,
        lastHealthCheckAt: finished,
        nextHealthCheckAt: new Date(
          Date.now() + env.HEALTH_INTERVAL_HOURS * 3600000,
        ),
        healthLeaseUntil: null,
        healthLeaseToken: null,
        ...(state.status === "SUSPENDED" && current.status === "APPROVED"
          ? {
              suspendedAt: finished,
              suspensionReason: `HEALTHCHECK: ${state.failures} falhas consecutivas`,
            }
          : {}),
      },
    });
  });
}
