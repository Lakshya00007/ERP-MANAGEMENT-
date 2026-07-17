"use client";

import { FormEvent, useMemo, useState } from "react";
import { KeyRound, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";

type Option = {
  id?: string;
  school_name?: string;
  device_id?: string;
};

type LicenseGeneratorProps = {
  schools: Option[];
  devices: Option[];
};

type GenerateResult = {
  licenseId: string;
  licenseKey: string;
};

export function LicenseGenerator({ schools, devices }: LicenseGeneratorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const deviceIds = useMemo(
    () => Array.from(new Set(devices.map((device) => device.device_id).filter(Boolean))),
    [devices],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData(event.currentTarget);
    const features = {
      attendance: formData.get("attendance") === "on",
      accounts: formData.get("accounts") === "on",
      exams: formData.get("exams") === "on",
      library: formData.get("library") === "on",
    };

    const response = await fetch("/api/licenses/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schoolId: formData.get("schoolId"),
        deviceId: formData.get("deviceId"),
        plan: formData.get("plan"),
        expiresAt: formData.get("expiresAt") || null,
        maintenanceUntil: formData.get("maintenanceUntil") || null,
        maxUsers: Number(formData.get("maxUsers") || 10),
        features,
      }),
    });

    const body = (await response.json()) as { error?: string } & Partial<GenerateResult>;
    setLoading(false);

    if (!response.ok || !body.licenseId || !body.licenseKey) {
      setError(body.error ?? "Unable to generate license");
      return;
    }

    setResult({ licenseId: body.licenseId, licenseKey: body.licenseKey });
    router.refresh();
    event.currentTarget.reset();
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-slate-700" />
        <h2 className="text-lg font-bold">Generate New License</h2>
      </div>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">School</span>
          <select
            name="schoolId"
            required
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500"
          >
            <option value="">Select school</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.school_name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Device ID</span>
          <input
            name="deviceId"
            list="license-device-ids"
            required
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500"
          />
          <datalist id="license-device-ids">
            {deviceIds.map((deviceId) => (
              <option key={deviceId} value={deviceId} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Plan</span>
          <select
            name="plan"
            defaultValue="Annual"
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500"
          >
            <option>Trial</option>
            <option>Monthly</option>
            <option>Annual</option>
            <option>Lifetime</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Max Users</span>
          <input
            name="maxUsers"
            type="number"
            min="1"
            defaultValue="10"
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Expires</span>
          <input
            name="expiresAt"
            type="date"
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Maintenance Until</span>
          <input
            name="maintenanceUntil"
            type="date"
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500"
          />
        </label>
        <fieldset className="md:col-span-2">
          <legend className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Features</legend>
          <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-4">
            {["attendance", "accounts", "exams", "library"].map((feature) => (
              <label key={feature} className="flex items-center gap-2 text-sm font-medium capitalize text-slate-700">
                <input name={feature} type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300" />
                {feature}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:bg-slate-400"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Generating" : "Generate License"}
          </button>
        </div>
      </form>
      {error ? (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}
      {result ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-emerald-900">License generated: {result.licenseId}</p>
            <CopyButton value={result.licenseKey} label="Copy key" />
          </div>
          <code className="block max-h-28 overflow-auto rounded-md bg-white p-3 text-xs text-slate-700">
            {result.licenseKey}
          </code>
        </div>
      ) : null}
    </section>
  );
}
