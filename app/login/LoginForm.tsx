"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = (await response.json()) as { error?: string };

    setLoading(false);

    if (!response.ok) {
      setError(body.error ?? "Unable to sign in");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-700">Email</span>
        <span className="flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 shadow-sm focus-within:border-slate-500">
          <Mail className="h-4 w-4 text-slate-400" />
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
          />
        </span>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-700">Password</span>
        <span className="flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 shadow-sm focus-within:border-slate-500">
          <LockKeyhole className="h-4 w-4 text-slate-400" />
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
          />
        </span>
      </label>
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
