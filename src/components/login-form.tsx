"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("webbook-admin");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Unable to login.");
        return;
      }

      router.push("/app");
      router.refresh();
    });
  };

  return (
    <form className="grid gap-5" onSubmit={onSubmit}>
      <div>
        <label className="paper-label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className="paper-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </div>
      <div>
        <label className="paper-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="paper-input"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-[var(--paper-danger)]">{error}</p> : null}
      <button type="submit" className="paper-button" disabled={isPending}>
        {isPending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
