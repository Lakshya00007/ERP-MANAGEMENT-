import { ShieldCheck } from "lucide-react";
import { LoginForm } from "@/app/login/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-950">Vidhya License Manager</h1>
            <p className="text-sm text-slate-500">Private Vidhya Tech admin access</p>
          </div>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
