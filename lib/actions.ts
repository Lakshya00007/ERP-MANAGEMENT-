"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRequiredString(formData: FormData, key: string) {
  const value = readString(formData, key);

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function readInteger(formData: FormData, key: string) {
  const value = readString(formData, key);
  return value ? Number.parseInt(value, 10) : null;
}

export async function createSchoolAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const supabase = createSupabaseAdminClient();
  const payload = {
    school_name: readRequiredString(formData, "school_name"),
    contact_person: readString(formData, "contact_person"),
    phone: readString(formData, "phone"),
    email: readString(formData, "email"),
    address: readString(formData, "address"),
    city: readString(formData, "city"),
    state: readString(formData, "state"),
    notes: readString(formData, "notes"),
    status: readString(formData, "status") ?? "Active",
  };

  const { data, error } = await supabase.from("schools").insert(payload).select("id").single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog({
    actorId: user.id,
    action: "school.created",
    entityType: "school",
    entityId: data.id,
    details: { school_name: payload.school_name },
  });

  revalidatePath("/schools");
  redirect(`/schools/${data.id}`);
}

export async function updateSchoolAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const supabase = createSupabaseAdminClient();
  const id = readRequiredString(formData, "id");
  const payload = {
    school_name: readRequiredString(formData, "school_name"),
    contact_person: readString(formData, "contact_person"),
    phone: readString(formData, "phone"),
    email: readString(formData, "email"),
    address: readString(formData, "address"),
    city: readString(formData, "city"),
    state: readString(formData, "state"),
    notes: readString(formData, "notes"),
    status: readString(formData, "status") ?? "Active",
  };

  const { error } = await supabase.from("schools").update(payload).eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog({
    actorId: user.id,
    action: "school.updated",
    entityType: "school",
    entityId: id,
    details: payload,
  });

  revalidatePath("/schools");
  revalidatePath(`/schools/${id}`);
}

export async function createDeviceAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const supabase = createSupabaseAdminClient();
  const payload = {
    school_id: readRequiredString(formData, "school_id"),
    device_id: readRequiredString(formData, "device_id"),
    device_name: readString(formData, "device_name"),
    os: readString(formData, "os"),
    app_version: readString(formData, "app_version"),
    status: readString(formData, "status") ?? "Active",
  };

  const { data, error } = await supabase.from("devices").insert(payload).select("id,device_id").single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog({
    actorId: user.id,
    action: "device.registered",
    entityType: "device",
    entityId: data.device_id,
    details: payload,
  });

  revalidatePath("/devices");
}

export async function updateDeviceStatusAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const supabase = createSupabaseAdminClient();
  const deviceId = readRequiredString(formData, "device_id");
  const status = readRequiredString(formData, "status");

  const { error } = await supabase.from("devices").update({ status }).eq("device_id", deviceId);

  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog({
    actorId: user.id,
    action: "device.status_updated",
    entityType: "device",
    entityId: deviceId,
    details: { status },
  });

  revalidatePath("/devices");
}

export async function createPaymentAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const supabase = createSupabaseAdminClient();
  const payload = {
    school_id: readRequiredString(formData, "school_id"),
    license_id: readString(formData, "license_id"),
    amount: readInteger(formData, "amount"),
    payment_date: readString(formData, "payment_date"),
    due_date: readString(formData, "due_date"),
    payment_mode: readString(formData, "payment_mode"),
    status: readString(formData, "status") ?? "Pending",
    notes: readString(formData, "notes"),
  };

  const { data, error } = await supabase.from("payments").insert(payload).select("id").single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog({
    actorId: user.id,
    action: "payment.added",
    entityType: "payment",
    entityId: data.id,
    details: payload,
  });

  revalidatePath("/payments");
}

export async function updatePaymentStatusAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const supabase = createSupabaseAdminClient();
  const id = readRequiredString(formData, "id");
  const status = readRequiredString(formData, "status");

  const { error } = await supabase.from("payments").update({ status }).eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog({
    actorId: user.id,
    action: "payment.status_updated",
    entityType: "payment",
    entityId: id,
    details: { status },
  });

  revalidatePath("/payments");
}
