/**
 * cueq — Landing / Dashboard page
 *
 * This is a placeholder. The real dashboard will show:
 * - Today's Soll/Ist balance
 * - Quick actions (clock in/out, request leave)
 * - Open approvals (for leads)
 * - Notifications
 *
 * See: docs/product-specs/new-user-onboarding.md
 */
export default function Home() {
  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '2rem' }}>
      <h1>cueq</h1>
      <p>
        Integriertes Zeiterfassungs-, Abwesenheits- und Dienstplansystem
        <br />
        <em>Integrated time-tracking, absence &amp; shift-planning system</em>
      </p>
      <hr />
      <p>
        <strong>Status:</strong> Skeleton — Phase 0 (Harness Foundation)
      </p>
      <ul>
        <li>
          API: <a href="http://localhost:3001/health">Health Check</a>
        </li>
        <li>
          API Docs: <a href="http://localhost:3001/api/docs">OpenAPI / Swagger</a>
        </li>
      </ul>
    </main>
  );
}
