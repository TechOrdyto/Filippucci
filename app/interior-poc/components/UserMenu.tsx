"use client";

import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

function getInitials(value: string) {
  const initials = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "U";
}

export default function UserMenu() {
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (status === "loading") {
    return <div className="h-9 w-24 animate-pulse rounded-xl bg-[var(--surface-muted)]" aria-hidden="true" />;
  }

  if (status !== "authenticated" || !session.user) return null;

  const displayName = session.user.name || session.user.email || "Utente";
  const initials = getInitials(displayName);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--accent-strong)]"
        >
          {initials}
        </span>
        {displayName}
      </button>
      {isOpen && (
        <div
          role="menu"
          aria-label="Menu utente"
          className="panel absolute right-0 top-[calc(100%+0.6rem)] z-50 min-w-36 rounded-xl p-1.5 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSigningOut ? "Uscita…" : "Esci"}
          </button>
        </div>
      )}
    </div>
  );
}
