import { useState } from "react";

import { useAuth } from "../state/auth";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email);
    } catch {
      setError("Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <form className="card auth-card" onSubmit={onSubmit}>
        <h1>Scoped Workspace</h1>
        <p className="muted">
          Sign in to open the story assigned to you. You will see only the files
          that story requires.
        </p>
        <label htmlFor="email">Work email</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy || !email}>
          {busy ? "Signing in..." : "Continue"}
        </button>
        <p className="fine-print">
          Replace this stub with your OIDC provider before any pilot. See
          docs/DEPLOYMENT.md.
        </p>
      </form>
    </div>
  );
}
