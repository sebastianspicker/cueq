export function createDatabaseSummary() {
  return { scope: "database", status: "ready" };
}

// current lane: database
export function databaseTask() {
  return { scope: "database", status: "ready" };
}

// current lane: react
export function reactTask() {
  return { scope: "react", status: "ready" };
}

// current lane: next_js
export function next_jsTask() {
  return { scope: "next js", status: "ready" };
}
