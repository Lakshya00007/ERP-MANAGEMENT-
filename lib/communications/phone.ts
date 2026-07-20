export type NormalizedPhone = {
  e164: string;
  masked: string;
};

export function maskPhone(phone: string | null | undefined) {
  const value = String(phone ?? "").trim();
  if (!value) {
    return "";
  }

  const visiblePrefix = value.startsWith("+") ? value.slice(0, 3) : value.slice(0, 2);
  const last = value.slice(-4);
  return `${visiblePrefix}${"*".repeat(Math.max(4, value.length - visiblePrefix.length - 4))}${last}`;
}

export function normalizeIndianPhone(value: string | null | undefined): NormalizedPhone {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new Error("Recipient phone is required");
  }

  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    digits = `+${digits.slice(1).replace(/\D/g, "")}`;
  } else {
    digits = digits.replace(/\D/g, "");
  }

  if (digits.startsWith("+91")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("91") && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }

  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new Error("Recipient phone must be a valid Indian mobile number");
  }

  const e164 = `+91${digits}`;
  return { e164, masked: maskPhone(e164) };
}
