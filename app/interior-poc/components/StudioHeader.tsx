import Link from "next/link";
import FilippucciLogo from "@/app/components/FilippucciLogo";
import ThemeToggle from "./ThemeToggle";
import UserMenu from "./UserMenu";

type StudioSection = "demo" | "catalogo" | "listini";

interface StudioHeaderProps {
  active?: StudioSection;
}

const navItems: Array<{ href: string; label: string; section: StudioSection }> = [
  { href: "/interior-poc", label: "Demo", section: "demo" },
  { href: "/catalogo", label: "Catalogo", section: "catalogo" },
  { href: "/listini", label: "Preventivo", section: "listini" },
];

export default function StudioHeader({ active }: StudioHeaderProps) {
  return (
    <header className="studio-header sticky top-0 z-20">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-wrap items-center gap-4 sm:gap-7">
          <Link href="/interior-poc" aria-label="Filipucci Home Design · Demo">
            <FilippucciLogo className="h-9 w-36 shrink-0 sm:h-10 sm:w-40" />
          </Link>

          <nav aria-label="Navigazione principale" className="flex flex-wrap items-center gap-1">
            {navItems.map((item) => {
              const isActive = active === item.section;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors sm:px-3.5 ${
                    isActive
                      ? "studio-nav-active bg-[var(--accent)] text-[var(--accent-ink)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <UserMenu />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
