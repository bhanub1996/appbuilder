import { KeyRound, Lock, MousePointerSquareDashed, ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" />
          <h3 className="font-display text-sm font-semibold">
            Connect your model
          </h3>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Your key travels once over TLS, is sealed with envelope encryption
          server-side, and expires with this session. It is never returned to
          the browser and never written to disk in the clear.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="provider" className="label-caps">
            Provider
          </Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger id="provider" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI (GPT-4o)</SelectItem>
              <SelectItem value="openai-mini">OpenAI (GPT-4o-mini)</SelectItem>
              <SelectItem value="anthropic">
                Anthropic (Claude 3.5 Sonnet)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="byok-key" className="label-caps">
            API key
          </Label>
          <Input
            id="byok-key"
            type="password"
            autoComplete="off"
            className="font-mono text-xs"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setError(null);
            }}
            placeholder="sk-..."
          />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <Button
          className="w-full"
          disabled={!apiKey || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onConfigureByok(provider, apiKey.trim());
              setApiKey("");
            } catch (err: any) {
              setError(
                err?.code || err?.message || "Could not store key. Verify it.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Sealing key…" : "Store for this session"}
        </Button>
      </div>
    );
  }

  const disabled = !isFileOpen || isReadOnly || busy;

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h3 className="font-display text-sm font-semibold">Ask for a change</h3>
      </div>

      {!isFileOpen && (
        <Hint icon={<MousePointerSquareDashed className="size-4" />}>
          Select a file from the scoped tree to generate an edit for it.
        </Hint>
      )}
      {isFileOpen && isReadOnly && (
        <Hint icon={<Lock className="size-4" />}>
          This file is read-only in your scope. Request write access to generate
          a diff.
        </Hint>
      )}

      <Textarea
        rows={6}
        value={instruction}
        disabled={disabled}
        onChange={(e) => setInstruction(e.target.value)}
        className="resize-none text-[13px]"
        placeholder={
          isFileOpen
            ? "Describe the change you want in this file…"
            : "Open an in-scope file first…"
        }
      />

      <Button
        className="w-full"
        disabled={disabled || !instruction.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            await onSubmit(instruction);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Assembling context…" : "Generate diff"}
      </Button>

      {blocked && (
        <div className="flex gap-2 rounded-sm border border-danger/40 bg-danger/10 p-3 text-xs leading-relaxed text-danger">
          <ShieldAlert className="mt-px size-4 shrink-0" />
          <span>
            The egress check blocked this response
            {blocked ? ` (${blocked})` : ""}. Rephrase it, or edit by hand.
          </span>
        </div>
      )}

      {lastRoute && !blocked && (
        <p className="font-mono text-[11px] text-muted-foreground">
          routed → <span className="text-primary">{lastRoute}</span>
        </p>
      )}

      <p className="border-t border-hairline pt-3 text-[11px] leading-relaxed text-muted-foreground">
        Dependencies are skeletonized before the prompt leaves the server — the
        model sees signatures, never proprietary bodies.
      </p>
    </div>
  );
}

function Hint({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 rounded-sm border border-dashed border-border bg-surface-raised/60 p-3 text-xs leading-relaxed text-muted-foreground">
      <span className="mt-px shrink-0 opacity-70">{icon}</span>
      <span>{children}</span>
    </div>
  );
}
