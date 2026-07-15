import { NavLink, Outlet } from "react-router";
import { Logo } from "@/components/ui/Logo";
import { ThemeApplier } from "@/features/profile/ThemeApplier";

const tabs = [
  { to: "/", label: "Home", icon: HomeIcon },
  { to: "/schedule", label: "Schedule", icon: CalendarIcon },
  { to: "/explore/anime", label: "Explore", icon: CompassIcon, match: "/explore" },
  { to: "/profile", label: "Profile", icon: UserIcon },
];

/**
 * Bottom tab bar on mobile, sidebar on desktop (§6) — mirrors the future
 * native app's layout.
 */
export function AppShell() {
  return (
    <div className="min-h-dvh md:flex">
      <ThemeApplier />

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:border-line md:px-4 md:py-6 shrink-0 sticky top-0 h-dvh">
        <Logo />
        <nav className="mt-8 flex flex-col gap-1">
          {tabs.map((tab) => (
            <NavItem key={tab.to} {...tab} />
          ))}
        </nav>
        <p className="mt-auto text-xs text-ink-faint">
          Data from AniList · Phase 4
        </p>
      </aside>

      {/* Content */}
      <main className="flex-1 pb-20 md:pb-8">
        <div className="mx-auto max-w-5xl px-4 pt-6 md:px-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom tabs */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {tabs.map((tab) => (
          <MobileTab key={tab.to} {...tab} />
        ))}
      </nav>
    </div>
  );
}

interface TabProps {
  to: string;
  label: string;
  icon: (props: { active: boolean }) => React.ReactNode;
  match?: string;
}

function NavItem({ to, label, icon: Icon }: TabProps) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
          isActive
            ? "bg-raised text-signal font-semibold"
            : "text-ink-soft hover:text-ink hover:bg-raised/60"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon active={isActive} />
          {label}
        </>
      )}
    </NavLink>
  );
}

function MobileTab({ to, label, icon: Icon }: TabProps) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${
          isActive ? "text-signal font-semibold" : "text-ink-faint"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon active={isActive} />
          {label}
        </>
      )}
    </NavLink>
  );
}

/* Minimal inline icons — no icon dependency for four glyphs. */

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-8.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.15 : 0}
      />
    </svg>
  );
}

function CalendarIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="4"
        y="5.5"
        width="16"
        height="15"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.15 : 0}
      />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CompassIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="8.5"
        stroke="currentColor"
        strokeWidth="1.8"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.15 : 0}
      />
      <path
        d="m15.5 8.5-2 5-5 2 2-5 5-2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        cx="12"
        cy="8"
        r="3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.15 : 0}
      />
      <path
        d="M5 20c.8-3.2 3.6-5 7-5s6.2 1.8 7 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
