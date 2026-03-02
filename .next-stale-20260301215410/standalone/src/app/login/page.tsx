import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSession } from "@/lib/auth";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect("/app");
  }

  return (
    <div className="paper-shell flex items-center justify-center">
      <div className="paper-panel paper-panel-strong w-full max-w-md p-8">
        <p className="paper-badge">Admin access</p>
        <h1 className="mt-5 font-serif text-5xl leading-none">Login to WebBook</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--paper-muted)]">
          Single-author access controls the editor, publishing routes, and code execution management.
        </p>
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
