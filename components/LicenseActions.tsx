"use client";

import { FormEvent, useState } from "react";
import { Ban, CalendarPlus, CheckCircle2, ShieldOff, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { toInputDate } from "@/lib/format";

type LicenseActionsProps = {
  licenseId: string;
  status: string;
  expiresAt: string | null;
  maintenanceUntil: string | null;
};

type ModalState = "suspend" | "revoke" | null;

export function LicenseActions({ licenseId, status, expiresAt, maintenanceUntil }: LicenseActionsProps) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expiry, setExpiry] = useState(toInputDate(expiresAt));
  const [maintenance, setMaintenance] = useState(toInputDate(maintenanceUntil));

  async function patchStatus(action: string, reason?: string) {
    setMessage(null);
    const response = await fetch(`/api/licenses/${encodeURIComponent(licenseId)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    const body = (await response.json()) as { error?: string; message?: string };

    if (!response.ok) {
      setMessage(body.error ?? "Unable to update license");
      return;
    }

    setModal(null);
    setMessage(body.message ?? "License updated");
    router.refresh();
  }

  async function patchDate(path: "renew" | "maintenance", value: string) {
    setMessage(null);
    const key = path === "renew" ? "expiresAt" : "maintenanceUntil";
    const response = await fetch(`/api/licenses/${encodeURIComponent(licenseId)}/${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value || null }),
    });
    const body = (await response.json()) as { error?: string; message?: string };

    if (!response.ok) {
      setMessage(body.error ?? "Unable to update date");
      return;
    }

    setMessage(body.message ?? "License updated");
    router.refresh();
  }

  function submitReason(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const reason = String(formData.get("reason") ?? "").trim();

    if (!reason || !modal) {
      setMessage("Reason is required");
      return;
    }

    void patchStatus(modal, reason);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status !== "Suspended" && status !== "Revoked" ? (
          <button
            type="button"
            onClick={() => setModal("suspend")}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
          >
            <Ban className="h-4 w-4" />
            Suspend
          </button>
        ) : null}
        {status !== "Revoked" ? (
          <button
            type="button"
            onClick={() => setModal("revoke")}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-800 hover:bg-rose-100"
          >
            <ShieldOff className="h-4 w-4" />
            Revoke
          </button>
        ) : null}
        {status !== "Active" && status !== "Revoked" ? (
          <button
            type="button"
            onClick={() => void patchStatus("reactivate")}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            <CheckCircle2 className="h-4 w-4" />
            Reactivate
          </button>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2">
          <input
            type="date"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void patchDate("renew", expiry)}
            title="Renew expiry"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            <CalendarPlus className="h-4 w-4" />
          </button>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="date"
            value={maintenance}
            onChange={(event) => setMaintenance(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void patchDate("maintenance", maintenance)}
            title="Extend maintenance"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            <Wrench className="h-4 w-4" />
          </button>
        </label>
      </div>
      {message ? <p className="text-xs font-semibold text-slate-600">{message}</p> : null}
      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form onSubmit={submitReason} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold capitalize text-slate-950">{modal} License</h3>
            <p className="mt-1 text-sm text-slate-600">A reason is required and will be written to the audit log.</p>
            <textarea
              name="reason"
              required
              rows={4}
              className="mt-4 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-slate-500"
              placeholder="Reason"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-9 rounded-md bg-slate-950 px-3 text-sm font-bold text-white hover:bg-slate-800"
              >
                Confirm
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
