"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "@/app/(app)/notifications/actions";

type Notification = {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  tournament_id: string | null;
  created_at: string;
};

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function NotificationsBell({
  notifications,
}: {
  notifications: Notification[];
}) {
  const [open, setOpen] = useState(false);
  const [optimistic, setOptimistic] = useState<Set<string>>(new Set());
  const [allRead, setAllRead] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const isRead = (n: Notification) => n.is_read || optimistic.has(n.id) || allRead;
  const unreadCount = notifications.filter((n) => !isRead(n)).length;

  function handleOpen() {
    setOpen((v) => !v);
  }

  function handleMarkRead(id: string) {
    setOptimistic((prev) => new Set(prev).add(id));
    startTransition(() => {
      markNotificationRead(id);
    });
  }

  function handleMarkAll() {
    setAllRead(true);
    startTransition(() => {
      markAllNotificationsRead();
    });
  }

  // Close on outside click
  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!ref.current?.contains(e.relatedTarget as Node)) {
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative" onBlur={handleBlur} tabIndex={-1}>
      <button
        onClick={handleOpen}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Notifications"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(320px,calc(100vw-2rem))] rounded-xl border border-border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold text-foreground">
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No notifications
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map((n) => {
                  const href = n.tournament_id
                    ? `/tournaments/${n.tournament_id}`
                    : "/dashboard";
                  const read = isRead(n);
                  return (
                    <li key={n.id}>
                      <Link
                        href={href}
                        onClick={() => {
                          if (!read) handleMarkRead(n.id);
                          setOpen(false);
                        }}
                        className={`flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50 ${
                          read ? "opacity-60" : ""
                        }`}
                      >
                        {!read && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        )}
                        <span
                          className={`text-foreground ${read ? "ml-5" : ""}`}
                        >
                          {n.message}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
