# Zero-Trust Workspace — Full UI Port and Redesign

Rebuild the entire appbuilder frontend in this project with a new design system, keeping every existing capability and every existing backend contract intact. Your FastAPI backend is untouched.

## Design direction

Slate command surface built on your palette:

- Canvas `#0F172A`, panel/border family around `#334155`, signal accent `#F59E0B`.
- Amber is reserved for meaning, not decoration: write access, pending elevations, staleness, and the AI action itself. Read-only and out-of-scope states stay muted slate; blocked/denied states use a restrained red.
- Type: a grotesk UI face paired with a true mono for paths, SHAs, branches, and audit hashes. Paths and identifiers always render mono — they are the product.
- Density over whitespace. Hairline 1px dividers, sharp-ish 6px radii, no glow, no gradient hero. It should read as an instrument panel, not a marketing page.
- Every classification (PUBLIC / INTERNAL / RESTRICTED / SECRET) and access level (read / write) gets one consistent chip component used identically in the tree, admin scope editor, and audit log.

## Screens

**Sign in** — Split layout: the form on one side, a plain-language explanation of the zero-trust model on the other (scoped tree, skeletonized dependencies, sanitized AI egress, session-TTL key vault). Keeps the stub-email flow and the "replace with OIDC before pilot" notice.

**Story picker** — When more than one story is assigned, a card list with story key, title, status, and acceptance-criteria count.

**Developer workspace** — Three-column shell under a compact top bar.
- Left: scoped file tree with read/write chips, collapsible dirs, and a visible "this is everything you can see" scope footer showing file count.
- Center: Monaco editor with stub-driven IntelliSense, read-only lock treatment, dirty indicator, and the existing save / stale-SHA conflict handling.
- Right: tabbed rail — Story (brief, acceptance criteria, branch, staleness warning) and AI (BYOK connect form, instruction composer, last route indicator, blocked-reason surface, elevation request).
- Diff review as a full-height side-by-side modal with clear Discard / Apply actions.
- Top bar: story key, active path, read-only badge, Save, Submit story, Admin link, Sign out.

**Admin console** — All five tabs rebuilt, no capability dropped:
1. Scopes — repository/story selector, path classification editor, per-path read/write assignment, auto-scope suggestion with reasoning.
2. Elevations — approve/deny queue with TTL selection and requester context.
3. LLM config — provider, base URL, model, key state, active toggle, and the test-connection action.
4. Audit — filterable log explorer with mono hash/actor/action columns.
5. Context — project selector and project context / knowledge-base view.

## Technical notes

- This project runs TanStack Router (file-based), not react-router-dom. Routes map as: `/` (sign in or redirect), `/work` and `/work/$storyId`, `/admin` with tab state in the URL search params so admin views are linkable.
- `src/api/client.ts` ports over as-is in shape: same endpoints, same `ApiError`, same `sessionStorage` token handling, base URL from `VITE_API_BASE` (defaults to `/api`). No endpoint renames.
- Auth context ports to a client-side provider; admin routes render only for `role === "admin"`.
- Monaco via `@monaco-editor/react`, loaded client-side only so SSR does not break.
- The old hand-written `styles.css` is replaced by design tokens in `src/styles.css` plus shadcn components; no hardcoded color utilities in components.
- Server-side data fetching is not introduced — all reads go to your FastAPI backend from the browser, exactly as today. You will need CORS allowed for the preview origin, or a dev proxy pointed at your backend.
- The backend, migrations, and Python code from the archive are not copied into this project.

## Out of scope

Backend changes, OIDC, and any change to VFS, sanitizer, or vault behavior.
