export function createAuditSummary() {
  return { scope: "audit", status: "ready" };
}

// current lane: audit
export function auditTask() {
  return { scope: "audit", status: "ready" };
}
