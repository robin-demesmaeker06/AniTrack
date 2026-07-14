import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";

export function AuthLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Logo size="text-2xl" />
      <div className="mt-6 w-full max-w-sm rounded-lg border border-line bg-surface p-6">
        <h1 className="font-display text-lg font-bold">{title}</h1>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function GoogleButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-line-strong bg-raised px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-signal/60 disabled:opacity-50"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M21.6 12.2c0-.7-.06-1.4-.18-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z"
          opacity=".9"
        />
        <path
          fill="currentColor"
          d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
          opacity=".7"
        />
        <path
          fill="currentColor"
          d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9L6.4 14Z"
          opacity=".5"
        />
        <path
          fill="currentColor"
          d="M12 6c1.5 0 2.8.5 3.8 1.5L18.7 5A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.7 9.4 6 12 6Z"
          opacity=".8"
        />
      </svg>
      Continue with Google
    </button>
  );
}

export function Divider() {
  return (
    <div className="my-4 flex items-center gap-3 text-xs text-ink-faint">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
