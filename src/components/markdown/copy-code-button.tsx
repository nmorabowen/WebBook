"use client";

import { Check, Copy } from "lucide-react";
import { useState, useTransition } from "react";

type CopyCodeButtonProps = {
  code: string;
};

export function CopyCodeButton({ code }: CopyCodeButtonProps) {
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const copy = () => {
    startTransition(async () => {
      try {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      } catch {
        setCopied(false);
      }
    });
  };

  return (
    <button
      type="button"
      className="code-block-copy-button"
      onClick={copy}
      disabled={isPending}
      aria-label={copied ? "Code copied" : "Copy code"}
      title={copied ? "Copied" : "Copy code"}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}
