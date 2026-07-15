import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  useNotificationActions,
  useNotifications,
  useUnreadCount,
} from "./useNotifications";
import { timeAgo } from "@/lib/format";
import { Spinner } from "@/components/ui/Spinner";
import type { AppNotification } from "@/types";

/**
 * Bell + in-app notification center (§6.6). Floats top-right on every
 * authed page; the panel is a dropdown on desktop, near-full-width on
 * mobile. Fed by the notifications table (drop-check writes, we read).
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: unread = 0 } = useUnreadCount();
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-away + Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="fixed right-4 top-4 z-40 md:right-6">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        aria-expanded={open}
        className={`relative flex size-9 items-center justify-center rounded-full border backdrop-blur transition-colors ${
          open
            ? "border-signal bg-raised text-signal"
            : "border-line bg-surface/90 text-ink-soft hover:border-line-strong hover:text-ink"
        }`}
      >
        <BellIcon />
        {unread > 0 && (
          <span className="numeric absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-[10px] font-bold text-on-signal">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && <NotificationPanel onClose={() => setOpen(false)} />}
    </div>
  );
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { data: notifications, isLoading } = useNotifications(true);
  const { markOne, markAll } = useNotificationActions();
  const navigate = useNavigate();
  const hasUnread = notifications?.some((n) => !n.read) ?? false;

  function openNotification(n: AppNotification) {
    if (!n.read) markOne.mutate(n.id);
    if (n.anilistMediaId) {
      const type =
        (n.payload.mediaType as string | undefined)?.toLowerCase() ?? "anime";
      navigate(`/media/${type}/${n.anilistMediaId}`);
      onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 top-11 flex w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-line-strong bg-surface shadow-xl shadow-black/30"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <p className="font-display text-sm font-bold">Notifications</p>
        {hasUnread && (
          <button
            onClick={() => markAll.mutate()}
            className="text-xs font-semibold text-signal hover:text-signal-strong"
          >
            Mark all read
          </button>
        )}
      </header>

      <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-10 text-signal">
            <Spinner />
          </div>
        ) : !notifications || notifications.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-soft">
            Nothing yet. New episodes and chapter updates for your library
            land here.
          </p>
        ) : (
          <ul>
            {notifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onOpen={() => openNotification(n)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function describe(n: AppNotification): { line: string; icon: string } {
  const number = n.payload.number as number | undefined;
  switch (n.type) {
    case "NEW_EPISODE":
      return { line: number != null ? `Episode ${number} aired` : "New episode", icon: "▶" };
    case "NEW_CHAPTER":
      // §9: approximate — "Updated", never a precise chapter claim.
      return {
        line: number != null ? `Updated — ${number} chapters out` : "Updated",
        icon: "▤",
      };
    case "SYNC_ERROR":
      return { line: "AniList sync failed — will retry", icon: "!" };
  }
}

function NotificationItem({
  notification,
  onOpen,
}: {
  notification: AppNotification;
  onOpen: () => void;
}) {
  const title = (notification.payload.title as string | undefined) ?? "Untitled";
  const { line, icon } = describe(notification);

  return (
    <li className="border-b border-line last:border-b-0">
      <button
        onClick={onOpen}
        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-raised/60 ${
          notification.read ? "opacity-60" : ""
        }`}
      >
        <span
          aria-hidden="true"
          className={`numeric mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${
            notification.type === "SYNC_ERROR"
              ? "bg-danger/15 text-danger"
              : "bg-signal-dim/40 text-signal-strong"
          }`}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">
            {title}
          </span>
          <span className="mt-0.5 block text-xs text-ink-soft">{line}</span>
          <span className="numeric mt-1 block text-[11px] text-ink-faint">
            {timeAgo(notification.createdAt)}
          </span>
        </span>
        {!notification.read && (
          <span
            className="mt-1.5 size-2 shrink-0 rounded-full bg-signal"
            aria-label="Unread"
          />
        )}
      </button>
    </li>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 10a6 6 0 0 1 12 0c0 3.6.9 5.4 1.8 6.5.3.4 0 1-.5 1H4.7c-.5 0-.8-.6-.5-1C5.1 15.4 6 13.6 6 10Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9.8 20a2.4 2.4 0 0 0 4.4 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
