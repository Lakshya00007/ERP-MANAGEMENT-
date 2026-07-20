import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

async function loadEnvFile(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");

    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
      let value = trimmed.slice(trimmed.indexOf("=") + 1).trim();

      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];

    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = "true";
    }
  }

  return args;
}

async function promptHidden(question) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const value = await rl.question(question);
    rl.close();
    return value;
  }

  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = "";

    function cleanup() {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
    }

    function onData(buffer) {
      const char = buffer.toString("utf8");

      if (char === "\u0003") {
        cleanup();
        process.exit(130);
      }

      if (char === "\r" || char === "\n") {
        cleanup();
        resolve(value);
        return;
      }

      if (char === "\u007f") {
        value = value.slice(0, -1);
        return;
      }

      value += char;
    }

    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function main() {
  await loadEnvFile(path.join(rootDir, ".env.local"));
  await loadEnvFile(path.join(rootDir, ".env"));

  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL. Add it to .env.local or export it before creating an admin.");
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const email = (args.email ?? (await rl.question("Email: "))).trim().toLowerCase();
  const fullName = (args.name ?? (await rl.question("Full name: "))).trim() || null;
  const role = (args.role ?? (await rl.question("Role [Owner]: "))).trim() || "Owner";
  rl.close();

  if (!email) {
    throw new Error("Email is required.");
  }

  if (!["Owner", "Admin", "Support"].includes(role)) {
    throw new Error("Role must be Owner, Admin, or Support.");
  }

  const password = args.password ?? process.env.ADMIN_CREATE_PASSWORD ?? (await promptHidden("Password: "));

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const sql = neon(databaseUrl);
  const [admin] = await sql`
    insert into admin_users (id, email, password_hash, full_name, role, status)
    values (gen_random_uuid(), ${email}, ${passwordHash}, ${fullName}, ${role}, ${"Active"})
    on conflict (email) do update
    set password_hash = excluded.password_hash,
        full_name = excluded.full_name,
        role = excluded.role,
        status = ${"Active"},
        updated_at = now()
    returning email, role
  `;

  console.log(`Admin account ready: ${admin.email} (${admin.role}).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
