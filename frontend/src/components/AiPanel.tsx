import { useState } from "react";

type Props = {
  disabled: boolean;
  byokConfigured: boolean;
  onConfigureByok: (provider: string, key: string) => Promise<void>;
  onSubmit: (instruction: string) => Promise<void>;
  lastRoute: string | null;
  blocked: string | null;
};

export default function AiPanel({
  disabled,
  byokConfigured,
  onConfigureByok,
  onSubmit,
  lastRoute,
  blocked,
}: Props) {
  const [instruction, setInstruction] = useState("");
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);

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
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
        </select>
        <label htmlFor="key">API key</label>
        <input
          id="key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste key"
        />
        <button
          disabled={!apiKey || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfigureByok(provider, apiKey);
              setApiKey("");
            } finally {
              setBusy(false);
            }
          }}
        >
          Store for this session
        </button>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>Ask for a change</h3>
      <textarea
        rows={5}
        value={instruction}
        disabled={disabled}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Add a remember-me checkbox below the password field"
      />
      <button
        disabled={disabled || busy || !instruction.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            await onSubmit(instruction);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Generating..." : "Generate diff"}
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
