"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import FilippucciLogo from "@/app/components/FilippucciLogo";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/interior-poc";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): string | null => {
    if (!email.trim()) return "Inserisci l'email.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return "Formato email non valido.";
    if (!password) return "Inserisci la password.";
    if (password.length < 8) return "La password deve avere almeno 8 caratteri.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Credenziali non valide.");
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Errore durante il login. Riprova.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="studio-shell min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex items-center justify-between border-b border-[var(--border)] pb-6">
          <FilippucciLogo className="h-10 w-40 sm:h-12 sm:w-48" />

          <div className="hidden text-right sm:block">
            <p className="eyebrow">Filipucci Home Design</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Interior Studio</p>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-10 lg:py-14">
          <section className="panel w-full max-w-[440px] rounded-2xl p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow mb-3">Accesso</p>
                <h2 className="display-title text-3xl leading-none text-[var(--text)]">
                  Entra nello studio
                </h2>
              </div>
              <span className="soft-badge inline-flex min-h-10 w-[88px] items-center justify-center rounded-full px-3 py-1.5 text-center text-[10px] font-bold uppercase leading-4 tracking-[0.12em]">
                Area privata
              </span>
            </div>

            <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">
              Inserisci le tue credenziali per accedere.
            </p>

            {error && (
              <div
                role="alert"
                className="mt-5 rounded-xl border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm text-[var(--danger)]"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-soft)]"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field-shell w-full rounded-xl px-3.5 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-soft)]"
                  placeholder="nome@esempio.it"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-soft)]"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field-shell w-full rounded-xl px-3.5 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-soft)]"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="primary-action w-full rounded-xl py-3.5 text-sm font-semibold"
              >
                {isSubmitting ? "Accesso in corso..." : "Accedi allo studio"}
              </button>
            </form>

            <div className="mt-7 border-t border-[var(--border)] pt-5">
              <p className="text-xs leading-5 text-[var(--text-soft)]">
                Demo · utenti autorizzati: admin, designer e viewer
              </p>
            </div>
          </section>
        </div>

        <footer className="flex flex-col gap-2 border-t border-[var(--border)] pt-5 text-[11px] text-[var(--text-soft)] sm:flex-row sm:items-center sm:justify-between">
          <span>Filipucci Home Design · Interior Studio</span>
          <span>Planimetria · Catalogo · Render</span>
        </footer>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
