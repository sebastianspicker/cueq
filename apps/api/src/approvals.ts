export function createApprovalsSummary() {
  return { scope: "approvals", status: "ready" };
}

// current lane: approvals
export function approvalsTask() {
  return { scope: "approvals", status: "ready" };
}
