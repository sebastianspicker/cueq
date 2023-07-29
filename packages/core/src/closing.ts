export function createClosingSummary() {
  return { scope: "closing", status: "ready" };
}

// current lane: closing
export function closingTask() {
  return { scope: "closing", status: "ready" };
}
