import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-px font-mono text-[10px] font-medium uppercase leading-4 tracking-[0.08em] whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-raised text-muted-foreground",
        write: "border-primary/45 bg-primary/12 text-primary",
        read: "border-border bg-surface-raised text-muted-foreground",
        success: "border-success/40 bg-success/12 text-success",
        danger: "border-danger/45 bg-danger/12 text-danger",
        info: "border-class-internal/40 bg-class-internal/12 text-class-internal",
        secret: "border-class-secret/45 bg-class-secret/12 text-class-secret",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type ChipProps = VariantProps<typeof chipVariants> & {
  children: ReactNode;
  className?: string | undefined;
  title?: string | undefined;
};

export function Chip({ tone, className, children, title }: ChipProps) {
  return (
    <span title={title} className={cn(chipVariants({ tone }), className)}>
      {children}
    </span>
  );
}

export function AccessChip({
  access,
  className,
}: {
  access: string;
  className?: string;
}) {
  const write = access === "write";
  return (
    <Chip
      tone={write ? "write" : "read"}
      className={className}
      title={
        write
          ? "You may edit and commit this file on your branch"
          : "Visible for context only — commits are rejected"
      }
    >
      {write ? "write" : "read"}
    </Chip>
  );
}

const CLASSIFICATION_TONE: Record<string, ChipProps["tone"]> = {
  public: "neutral",
  internal: "info",
  restricted: "write",
  secret: "secret",
};

export function ClassificationChip({ label }: { label: string }) {
  const key = label.toLowerCase();
  return <Chip tone={CLASSIFICATION_TONE[key] ?? "neutral"}>{label}</Chip>;
}

const STATUS_TONE: Record<string, ChipProps["tone"]> = {
  ok: "success",
  approved: "success",
  merged: "success",
  done: "success",
  pending: "write",
  in_progress: "write",
  review: "write",
  denied: "danger",
  blocked: "danger",
  error: "danger",
  failed: "danger",
  expired: "danger",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <Chip tone={STATUS_TONE[status?.toLowerCase()] ?? "neutral"}>
      {status || "—"}
    </Chip>
  );
}
