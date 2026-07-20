"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/format";

type DeviceOption = {
  device_id: string;
  device_name: string | null;
};

type LicenseOption = {
  license_id: string;
  device_id: string;
  status: string;
};

type TokenRow = {
  id: string;
  device_id: string;
  license_id: string | null;
  token_prefix: string | null;
  status: string;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

type IntegrationRow = {
  id: string;
  channel: "WhatsApp" | "SMS";
  provider: string;
  status: string;
  display_config: Record<string, unknown> | null;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
};

type TemplateRow = {
  id: string;
  channel: "WhatsApp" | "SMS";
  internal_name: string;
  category: string | null;
  provider_template_name: string | null;
  provider_template_id: string | null;
  msg91_flow_id: string | null;
  dlt_template_id: string | null;
  sender_id: string | null;
  status: string;
  updated_at: string;
};

type JobRow = {
  id: string;
  channel: "WhatsApp" | "SMS";
  recipient_name: string | null;
  recipient_phone_masked: string | null;
  status: string;
  provider_message_id: string | null;
  error_message: string | null;
  created_at: string;
};

type BatchRow = {
  id: string;
  channel: "WhatsApp" | "SMS";
  title: string | null;
  total_recipients: number;
  delivered_count: number;
  failed_count: number;
  created_at: string;
};

type Props = {
  schoolId: string;
  gatewayBaseUrl: string;
  providerMode: "mock" | "live";
  devices: DeviceOption[];
  licenses: LicenseOption[];
  tokens: TokenRow[];
  integrations: IntegrationRow[];
  templates: TemplateRow[];
  jobs: JobRow[];
  batches: BatchRow[];
};

const fieldClass =
  "h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500";
const buttonClass =
  "h-10 rounded-md bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300";

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(payload.error ?? "Communication request failed"));
  }
  return payload;
}

export function CommunicationAdminPanel({
  schoolId,
  gatewayBaseUrl,
  providerMode,
  devices,
  licenses,
  tokens,
  integrations,
  templates,
  jobs,
  batches,
}: Props) {
  const [message, setMessage] = useState("");
  const [rawToken, setRawToken] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(devices[0]?.device_id ?? "");
  const matchingLicenses = useMemo(
    () => licenses.filter((license) => !selectedDevice || license.device_id === selectedDevice),
    [licenses, selectedDevice],
  );
  const [selectedLicense, setSelectedLicense] = useState(matchingLicenses[0]?.license_id ?? "");

  const run = async (callback: () => Promise<void>) => {
    setIsBusy(true);
    setMessage("");
    try {
      await callback();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Communication action failed");
    } finally {
      setIsBusy(false);
    }
  };

  const generateToken = () =>
    run(async () => {
      const result = await postJson("/api/admin/communications/device-tokens", {
        schoolId,
        deviceId: selectedDevice,
        licenseId: selectedLicense,
      });
      setRawToken(String(result.rawToken ?? ""));
      setMessage("Device communication token generated. Copy it now; it will not be shown again.");
    });

  const revokeToken = (id: string) =>
    run(async () => {
      const reason = window.prompt("Revocation reason") ?? "";
      await postJson(`/api/admin/communications/device-tokens/${id}/revoke`, { reason });
      setMessage("Token revoked. Refresh to update the list.");
    });

  const saveIntegration = (event: React.FormEvent<HTMLFormElement>, channel: "WhatsApp" | "SMS") =>
    run(async () => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      await postJson("/api/admin/communications/integrations", {
        schoolId,
        channel,
        provider: channel === "WhatsApp" ? "MetaCloud" : "MSG91",
        status: formData.get("status"),
        config: Object.fromEntries(formData.entries()),
      });
      setMessage(`${channel} configuration saved. Secrets were encrypted server-side.`);
    });

  const testIntegration = (channel: "WhatsApp" | "SMS") =>
    run(async () => {
      await postJson("/api/admin/communications/integrations/test", { schoolId, channel });
      setMessage(`${channel} test succeeded in ${providerMode.toUpperCase()} mode. Refresh to update status.`);
    });

  const saveTemplate = (event: React.FormEvent<HTMLFormElement>) =>
    run(async () => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const variableDefinitions = String(formData.get("variableDefinitions") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((name) => ({ name }));
      await postJson("/api/admin/communications/templates", {
        schoolId,
        channel: formData.get("channel"),
        internalName: formData.get("internalName"),
        category: formData.get("category"),
        providerTemplateId: formData.get("providerTemplateId"),
        providerTemplateName: formData.get("providerTemplateName"),
        providerLanguageCode: formData.get("providerLanguageCode"),
        msg91FlowId: formData.get("msg91FlowId"),
        dltTemplateId: formData.get("dltTemplateId"),
        senderId: formData.get("senderId"),
        bodyPreview: formData.get("bodyPreview"),
        variableDefinitions,
        status: formData.get("status"),
      });
      setMessage("Template mapping saved.");
    });

  const findIntegration = (channel: "WhatsApp" | "SMS") =>
    integrations.find((integration) => integration.channel === channel);

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Communication Gateway</h2>
          <p className="text-sm text-slate-500">Manage device tokens, provider configuration, approved templates and masked delivery logs.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${providerMode === "mock" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
          {providerMode.toUpperCase()} MODE
        </span>
      </div>
      {message ? <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-800">{message}</div> : null}
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        Gateway base URL: <span className="font-mono">{gatewayBaseUrl || "Configure COMMUNICATION_GATEWAY_BASE_URL"}</span>
        {gatewayBaseUrl ? <CopyButton value={`${gatewayBaseUrl.replace(/\/+$/, "")}/api/webhooks/whatsapp`} /> : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-3">
          <h3 className="font-bold">Device API Tokens</h3>
          {rawToken ? (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-bold uppercase text-emerald-700">Shown once</p>
              <code className="mt-2 block break-all rounded bg-white p-2 text-xs">{rawToken}</code>
              <CopyButton value={rawToken} />
            </div>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <select className={fieldClass} value={selectedDevice} onChange={(event) => {
              setSelectedDevice(event.target.value);
              const next = licenses.find((license) => license.device_id === event.target.value);
              setSelectedLicense(next?.license_id ?? "");
            }}>
              {devices.map((device) => (
                <option key={device.device_id} value={device.device_id}>{device.device_name ?? device.device_id}</option>
              ))}
            </select>
            <select className={fieldClass} value={selectedLicense} onChange={(event) => setSelectedLicense(event.target.value)}>
              {matchingLicenses.map((license) => (
                <option key={license.license_id} value={license.license_id}>{license.license_id}</option>
              ))}
            </select>
            <button className={buttonClass} disabled={isBusy || !selectedDevice || !selectedLicense} onClick={generateToken} type="button">Generate</button>
          </div>
          <div className="mt-3 divide-y divide-slate-100">
            {tokens.map((token) => (
              <div key={token.id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{token.token_prefix ?? "Stored hash only"}</span>
                  <StatusBadge status={token.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">Device {token.device_id} · Last used {formatDateTime(token.last_used_at)}</p>
                {token.status === "Active" ? (
                  <button className="mt-2 text-xs font-bold text-rose-700 underline" disabled={isBusy} onClick={() => revokeToken(token.id)} type="button">Revoke</button>
                ) : null}
              </div>
            ))}
            {!tokens.length ? <p className="py-3 text-sm text-slate-500">No communication tokens generated.</p> : null}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 p-3">
          <h3 className="font-bold">Provider Status</h3>
          {(["WhatsApp", "SMS"] as const).map((channel) => {
            const integration = findIntegration(channel);
            return (
              <div key={channel} className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <strong>{channel}</strong>
                  <StatusBadge status={integration?.status ?? "Disabled"} />
                </div>
                <p className="mt-1 text-xs text-slate-500">Last test: {formatDateTime(integration?.last_tested_at)} · {integration?.last_test_status ?? "Not tested"}</p>
                {integration?.last_test_error ? <p className="mt-1 text-xs text-rose-700">{integration.last_test_error}</p> : null}
                <button className="mt-2 text-xs font-bold underline" disabled={isBusy || !integration} onClick={() => testIntegration(channel)} type="button">Test {channel}</button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <form className="rounded-md border border-slate-200 p-3" onSubmit={(event) => saveIntegration(event, "WhatsApp")}>
          <h3 className="font-bold">WhatsApp Configuration</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input className={fieldClass} name="phoneNumberId" placeholder="Phone Number ID" />
            <input className={fieldClass} name="wabaId" placeholder="WABA ID" />
            <input className={fieldClass} name="accessToken" placeholder="Access token (not redisplayed)" type="password" />
            <input className={fieldClass} name="displayNumber" placeholder="Business display number" />
            <input className={fieldClass} name="defaultLanguageCode" placeholder="en_US" />
            <select className={fieldClass} name="status" defaultValue="Configured">
              <option>Configured</option>
              <option>Active</option>
              <option>Disabled</option>
            </select>
          </div>
          <button className={`${buttonClass} mt-3`} disabled={isBusy} type="submit">Save WhatsApp</button>
        </form>
        <form className="rounded-md border border-slate-200 p-3" onSubmit={(event) => saveIntegration(event, "SMS")}>
          <h3 className="font-bold">SMS Configuration</h3>
          <p className="mt-1 text-xs font-semibold text-amber-700">External provider charges and DLT registration may apply.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input className={fieldClass} name="authKey" placeholder="MSG91 auth key (not redisplayed)" type="password" />
            <input className={fieldClass} name="senderId" placeholder="Sender ID/Header" />
            <input className={fieldClass} name="principalEntityId" placeholder="DLT Principal Entity ID" />
            <input className={fieldClass} name="countryCode" placeholder="91" />
            <select className={fieldClass} name="status" defaultValue="Configured">
              <option>Configured</option>
              <option>Active</option>
              <option>Disabled</option>
            </select>
          </div>
          <button className={`${buttonClass} mt-3`} disabled={isBusy} type="submit">Save SMS</button>
        </form>
      </div>

      <form className="rounded-md border border-slate-200 p-3" onSubmit={saveTemplate}>
        <h3 className="font-bold">Template Mapping</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <select className={fieldClass} name="channel" defaultValue="WhatsApp">
            <option>WhatsApp</option>
            <option>SMS</option>
          </select>
          <input className={fieldClass} name="internalName" placeholder="Internal name" required />
          <input className={fieldClass} name="category" placeholder="Fee Due / Homework / General Utility" />
          <select className={fieldClass} name="status" defaultValue="Approved">
            <option>Draft</option>
            <option>Pending</option>
            <option>Approved</option>
            <option>Rejected</option>
            <option>Disabled</option>
          </select>
          <input className={fieldClass} name="providerTemplateName" placeholder="WhatsApp template name" />
          <input className={fieldClass} name="providerTemplateId" placeholder="Provider template ID" />
          <input className={fieldClass} name="providerLanguageCode" placeholder="Language code" />
          <input className={fieldClass} name="msg91FlowId" placeholder="MSG91 Flow ID" />
          <input className={fieldClass} name="dltTemplateId" placeholder="DLT Template ID" />
          <input className={fieldClass} name="senderId" placeholder="Sender ID" />
          <input className={fieldClass} name="variableDefinitions" placeholder="Comma-separated variables" />
          <input className={fieldClass} name="bodyPreview" placeholder="Approved template preview" />
        </div>
        <button className={`${buttonClass} mt-3`} disabled={isBusy} type="submit">Save Template</button>
      </form>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-3 py-2">Template</th><th className="px-3 py-2">Channel</th><th className="px-3 py-2">Provider ID</th><th className="px-3 py-2">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {templates.map((template) => (
                <tr key={template.id}>
                  <td className="px-3 py-2 font-semibold">{template.internal_name}<div className="text-xs text-slate-500">{template.category}</div></td>
                  <td className="px-3 py-2">{template.channel}</td>
                  <td className="px-3 py-2 font-mono text-xs">{template.provider_template_name ?? template.msg91_flow_id ?? template.provider_template_id ?? "Not mapped"}</td>
                  <td className="px-3 py-2"><StatusBadge status={template.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-3 py-2">Recipient</th><th className="px-3 py-2">Channel</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Provider</th><th className="px-3 py-2">Date</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-3 py-2">{job.recipient_name ?? "Recipient"}<div className="text-xs text-slate-500">{job.recipient_phone_masked}</div></td>
                  <td className="px-3 py-2">{job.channel}</td>
                  <td className="px-3 py-2"><StatusBadge status={job.status} /></td>
                  <td className="px-3 py-2 font-mono text-xs">{job.provider_message_id ?? job.error_message ?? "-"}</td>
                  <td className="px-3 py-2">{formatDateTime(job.created_at)}</td>
                </tr>
              ))}
              {!jobs.length ? <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={5}>No communication jobs yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Batch</th><th className="px-3 py-2">Channel</th><th className="px-3 py-2">Recipients</th><th className="px-3 py-2">Delivered</th><th className="px-3 py-2">Failed</th><th className="px-3 py-2">Created</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {batches.map((batch) => (
              <tr key={batch.id}>
                <td className="px-3 py-2 font-semibold">{batch.title ?? batch.id}</td>
                <td className="px-3 py-2">{batch.channel}</td>
                <td className="px-3 py-2">{batch.total_recipients}</td>
                <td className="px-3 py-2">{batch.delivered_count}</td>
                <td className="px-3 py-2">{batch.failed_count}</td>
                <td className="px-3 py-2">{formatDateTime(batch.created_at)}</td>
              </tr>
            ))}
            {!batches.length ? <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={6}>No batches yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
