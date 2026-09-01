import { useState } from "react";

type Props = {
  isFileOpen: boolean;
  isReadOnly: boolean;
  byokConfigured: boolean;
  onConfigureByok: (provider: string, key: string) => Promise<void>;
  onSubmit: (instruction: string) => Promise<void>;
  lastRoute: string | null;
  blocked: string | null;
};

export default function AiPanel({
  isFileOpen,
  isReadOnly,
  byokConfigured,
  onConfigureByok,
  onSubmit,
  lastRoute,
  blocked,
}: Props) {
  const [instruction, setInstruction] = useState("");
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!byokConfigured) {
    return (
      <div className="panel">
        <h3>Connect your model</h3>
        <p className="muted">
          Your key is sent once over TLS, encrypted server-side, and held only
          for this session. It is never returned to the browser.
        </p>
        <label htmlFor="provider">Provider</label>
        <select
          id="provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          <option value="openai">OpenAI (GPT-4o)</option>
          <option value="openai-mini">OpenAI (GPT-4o-mini)</option>
          <option value="anthropic">Anthropic (Claude 3.5 Sonnet)</option>
        </select>
        <label htmlFor="key">API key</label>
        <input
          id="key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            setError(null);
          }}
          placeholder="sk-..."
        />
        {error && (
          <p style={{ color: "#ef4444", fontSize: "12px", margin: "4px 0" }}>
            {error}
          </p>
        )}
        <button
          disabled={!apiKey || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onConfigureByok(provider, apiKey.trim());
              setApiKey("");
            } catch (err: any) {
              setError(err?.code || err?.message || "Failed to connect key. Please verify.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Storing key..." : "Store for this session"}
        </button>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>Ask for a change</h3>
      {!isFileOpen ? (
        <div style={{ background: "var(--canvas)", padding: "10px", borderRadius: "6px", border: "1px dashed var(--border)", marginBottom: "10px", fontSize: "12px", color: "var(--text-muted)" }}>
          👈 <strong>Select a file</strong> from the left sidebar to generate an AI edit for that file.
        </div>
      ) : isReadOnly ? (
        <div style={{ background: "var(--canvas)", padding: "10px", borderRadius: "6px", border: "1px dashed var(--border)", marginBottom: "10px", fontSize: "12px", color: "var(--text-muted)" }}>
          🔒 <strong>Read-Only File</strong>: You have read-only scope for this file. Request write access to generate diffs.
        </div>
      ) : null}

      <textarea
        rows={5}
        value={instruction}
        disabled={!isFileOpen || isReadOnly || busy}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder={isFileOpen ? "Describe the code changes you want to apply to this file..." : "Select an in-scope file on the left first..."}
      />
      <button
        disabled={!isFileOpen || isReadOnly || busy || !instruction.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            await onSubmit(instruction);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Analyzing & generating diff..." : "Generate diff"}
      </button>

      {blocked && (
        <p className="error">
          Request blocked by the output check. Rephrase and try again, or edit
          by hand.
        </p>
      )}
      {lastRoute && !blocked && (
        <p className="fine-print">
          Routed to <strong>{lastRoute}</strong>. Trivial edits run on the
          in-house model at no cost to you.
        </p>
      )}
    </div>
  );
}
