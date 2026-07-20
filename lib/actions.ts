"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { getDb } from "@/lib/db";

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
  const parsed = value ? Number.parseInt(value, 10) : null;
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createSchoolAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const db = getDb();
  const id = randomUUID();
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

  await db.transaction((tx) => [
    tx`
      insert into schools (
        id, school_name, contact_person, phone, email, address, city, state, notes, status
      )
      values (
        ${id}, ${payload.school_name}, ${payload.contact_person}, ${payload.phone}, ${payload.email},
        ${payload.address}, ${payload.city}, ${payload.state}, ${payload.notes}, ${payload.status}
      )
    `,
    tx`
      insert into audit_logs (id, actor_id, action, entity_type, entity_id, details)
      values (
        ${randomUUID()}, ${user.id}, ${"school.created"}, ${"school"}, ${id},
        ${JSON.stringify({ school_name: payload.school_name })}::jsonb
      )
    `,
  ]);

  revalidatePath("/schools");
  redirect(`/schools/${id}`);
}

export async function updateSchoolAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const db = getDb();
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

  await db.transaction((tx) => [
    tx`
      update schools
      set
        school_name = ${payload.school_name},
        contact_person = ${payload.contact_person},
        phone = ${payload.phone},
        email = ${payload.email},
        address = ${payload.address},
        city = ${payload.city},
        state = ${payload.state},
        notes = ${payload.notes},
        status = ${payload.status}
      where id = ${id}
    `,
    tx`
      insert into audit_logs (id, actor_id, action, entity_type, entity_id, details)
      values (
        ${randomUUID()}, ${user.id}, ${"school.updated"}, ${"school"}, ${id},
        ${JSON.stringify(payload)}::jsonb
      )
    `,
  ]);

  revalidatePath("/schools");
  revalidatePath(`/schools/${id}`);
}

export async function createDeviceAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const db = getDb();
  const id = randomUUID();
  const payload = {
    school_id: readRequiredString(formData, "school_id"),
    device_id: readRequiredString(formData, "device_id"),
    device_name: readString(formData, "device_name"),
    os: readString(formData, "os"),
    app_version: readString(formData, "app_version"),
    status: readString(formData, "status") ?? "Active",
  };

  await db.transaction((tx) => [
    tx`
      insert into devices (id, school_id, device_id, device_name, os, app_version, status)
      values (
        ${id}, ${payload.school_id}, ${payload.device_id}, ${payload.device_name},
        ${payload.os}, ${payload.app_version}, ${payload.status}
      )
    `,
    tx`
      insert into audit_logs (id, actor_id, action, entity_type, entity_id, details)
      values (
        ${randomUUID()}, ${user.id}, ${"device.registered"}, ${"device"}, ${payload.device_id},
        ${JSON.stringify(payload)}::jsonb
      )
    `,
  ]);

  revalidatePath("/devices");
  revalidatePath(`/schools/${payload.school_id}`);
}

export async function updateDeviceStatusAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const db = getDb();
  const deviceId = readRequiredString(formData, "device_id");
  const status = readRequiredString(formData, "status");

  await db.transaction((tx) => [
    tx`
      update devices
      set status = ${status}
      where device_id = ${deviceId}
    `,
    tx`
      insert into audit_logs (id, actor_id, action, entity_type, entity_id, details)
      values (
        ${randomUUID()}, ${user.id}, ${"device.status_updated"}, ${"device"}, ${deviceId},
        ${JSON.stringify({ status })}::jsonb
      )
    `,
  ]);

  revalidatePath("/devices");
}

export async function createPaymentAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const db = getDb();
  const id = randomUUID();
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

  await db.transaction((tx) => [
    tx`
      insert into payments (
        id, school_id, license_id, amount, payment_date, due_date, payment_mode, status, notes
      )
      values (
        ${id}, ${payload.school_id}, ${payload.license_id}, ${payload.amount},
        ${payload.payment_date}, ${payload.due_date}, ${payload.payment_mode}, ${payload.status},
        ${payload.notes}
      )
    `,
    tx`
      insert into audit_logs (id, actor_id, action, entity_type, entity_id, details)
      values (
        ${randomUUID()}, ${user.id}, ${"payment.added"}, ${"payment"}, ${id},
        ${JSON.stringify(payload)}::jsonb
      )
    `,
  ]);

  revalidatePath("/payments");
  revalidatePath(`/schools/${payload.school_id}`);
}

export async function updatePaymentStatusAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const db = getDb();
  const id = readRequiredString(formData, "id");
  const status = readRequiredString(formData, "status");

  await db.transaction((tx) => [
    tx`
      update payments
      set status = ${status}
      where id = ${id}
    `,
    tx`
      insert into audit_logs (id, actor_id, action, entity_type, entity_id, details)
      values (
        ${randomUUID()}, ${user.id}, ${"payment.status_updated"}, ${"payment"}, ${id},
        ${JSON.stringify({ status })}::jsonb
      )
    `,
  ]);

  revalidatePath("/payments");
}
