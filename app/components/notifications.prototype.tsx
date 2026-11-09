// PROTOTYPE — throwaway. Four radically different shapes for in-app
// Notifications, switchable via ?variant= on every page of the app layout.
// Answers the wayfinder ticket "What should Notifications look like in the
// app?" (seemike/cohort-005-project#4). Read state is in-memory only.
//
//   A  Bell + dropdown     — bell in the sidebar header, unread count, popover list
//   B  Inbox page          — "Notifications" nav item opening a full-page inbox
//   C  Feed + toasts       — no chrome indicator; "What's new" feed on the home
//                            page, toast on page load and when one arrives
//   D  In context          — unread counts on the nav items / courses they belong
//                            to, hover for the list; no central place at all
//
// The floating bar's "+ new" button simulates one arriving live.

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router";
import { toast } from "sonner";
import {
  Bell,
  CheckCheck,
  CircleHelp,
  CornerDownRight,
  Inbox,
  MessageCircleReply,
  Sparkles,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { UserRole } from "~/db/schema";
import type {
  ProtoEvent,
  ProtoNotification,
} from "~/lib/notifications.prototype.server";
import { PrototypeSwitcher } from "~/components/prototype-switcher";

export const VARIANTS = [
  { key: "A", name: "Bell + dropdown" },
  { key: "B", name: "Inbox page" },
  { key: "C", name: "Feed + toasts" },
  { key: "D", name: "In context" },
];

// ─── State ───

interface Store {
  items: ProtoNotification[];
  unreadCount: number;
  role: UserRole | null;
  markRead: (id: string) => void;
  markAllRead: (filter?: (n: ProtoNotification) => boolean) => void;
  simulate: () => ProtoNotification | null;
  open: (n: ProtoNotification) => void;
}

const Ctx = createContext<Store | null>(null);

export function useProto() {
  const s = useContext(Ctx);
  if (!s) throw new Error("ProtoProvider missing");
  return s;
}

export function useVariant() {
  const [params] = useSearchParams();
  return params.get("variant") ?? "A";
}

export function ProtoProvider({
  seed,
  role,
  children,
}: {
  seed: ProtoNotification[];
  role: UserRole | null;
  children: React.ReactNode;
}) {
  const [items, setItems] = useState(seed);
  const navigate = useNavigate();
  const counter = useRef(0);

  // Switching user in the DevUI reloads the layout with a new seed.
  useEffect(() => setItems(seed), [seed]);

  // Ordinary app links drop ?variant=; put the last one back so the chosen
  // variant survives navigation.
  const [params, setParams] = useSearchParams();
  const variantParam = params.get("variant");
  useEffect(() => {
    try {
      if (variantParam) sessionStorage.setItem("proto-variant", variantParam);
      else {
        const remembered = sessionStorage.getItem("proto-variant");
        if (remembered)
          setParams(
            (p) => {
              p.set("variant", remembered);
              return p;
            },
            { replace: true, preventScrollReset: true }
          );
      }
    } catch {}
  }, [variantParam, setParams]);

  const store: Store = {
    items,
    role,
    unreadCount: items.filter((n) => !n.read).length,
    markRead: (id) =>
      setItems((xs) => xs.map((n) => (n.id === id ? { ...n, read: true } : n))),
    markAllRead: (filter) =>
      setItems((xs) =>
        xs.map((n) => (!filter || filter(n) ? { ...n, read: true } : n))
      ),
    simulate: () => {
      if (seed.length === 0) return null;
      const base = seed[counter.current % seed.length];
      counter.current += 1;
      const n: ProtoNotification = {
        ...base,
        id: `live-${counter.current}`,
        minutesAgo: 0,
        read: false,
      };
      setItems((xs) => [n, ...xs]);
      return n;
    },
    open: (n) => {
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      const p = new URLSearchParams(window.location.search);
      p.delete("inbox");
      navigate(`${n.href}?${p}`);
    },
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

// ─── Shared bits ───

function ago(m: number) {
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

const EVENT_META: Record<
  ProtoEvent,
  { icon: React.ReactNode; verb: string; tint: string }
> = {
  new_question: {
    icon: <CircleHelp className="size-4" />,
    verb: "asked a Question",
    tint: "text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300",
  },
  question_answered: {
    icon: <Sparkles className="size-4" />,
    verb: "answered your Question",
    tint: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  new_reply: {
    icon: <MessageCircleReply className="size-4" />,
    verb: "replied in a Thread you're in",
    tint: "text-sky-600 bg-sky-100 dark:bg-sky-900/30 dark:text-sky-300",
  },
};

function headline(n: ProtoNotification) {
  return (
    <>
      <span className="font-semibold">{n.actorName}</span>{" "}
      {EVENT_META[n.event].verb}
    </>
  );
}

function CountPill({ n, className }: { n: number; className?: string }) {
  if (n === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-5 text-white",
        className
      )}
    >
      {n > 9 ? "9+" : n}
    </span>
  );
}

function SignedOutNote() {
  return (
    <div className="p-4 text-sm text-muted-foreground">
      Pick a Student or Instructor in the DevUI panel to see Notifications.
    </div>
  );
}

// ─── Variant A: bell + dropdown ───

export function BellDropdown() {
  const { items, unreadCount, open, markAllRead } = useProto();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isOpen]);

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        title="Notifications"
      >
        <Bell className="size-5" />
        <CountPill n={unreadCount} className="absolute -right-1.5 -top-1" />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="font-semibold">Notifications</span>
            <button
              onClick={() => markAllRead()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            {items.length === 0 && <SignedOutNote />}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setIsOpen(false);
                  open(n);
                }}
                className={cn(
                  "flex w-full gap-3 border-b px-4 py-3 text-left text-sm last:border-0 hover:bg-muted/60",
                  !n.read && "bg-primary/5"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                    EVENT_META[n.event].tint
                  )}
                >
                  {EVENT_META[n.event].icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">{headline(n)}</span>
                  <span className="block truncate text-muted-foreground">
                    “{n.excerpt}”
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {n.lessonTitle} · {ago(n.minutesAgo)}
                  </span>
                </span>
                {!n.read && (
                  <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Variant B: inbox page ───

export function InboxNavItem() {
  const { unreadCount } = useProto();
  const [params, setParams] = useSearchParams();
  const active = params.get("inbox") === "1";
  return (
    <button
      onClick={() =>
        setParams((p) => {
          p.set("inbox", "1");
          return p;
        })
      }
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Inbox className="size-4" />
      Notifications
      <CountPill n={unreadCount} className="ml-auto" />
    </button>
  );
}

export function InboxPage() {
  const { items, open, markRead, markAllRead, unreadCount } = useProto();
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const [course, setCourse] = useState<number | null>(null);

  const courseList = Array.from(
    new Map(items.map((n) => [n.courseId, n.courseTitle])).entries()
  );
  const shown = items.filter(
    (n) => (tab === "all" || !n.read) && (course === null || n.courseId === course)
  );
  const groups: [string, ProtoNotification[]][] = [
    ["Today", shown.filter((n) => n.minutesAgo < 1440)],
    ["Yesterday", shown.filter((n) => n.minutesAgo >= 1440 && n.minutesAgo < 2880)],
    ["Earlier", shown.filter((n) => n.minutesAgo >= 2880)],
  ];

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount} unread
          </p>
        </div>
        <button
          onClick={() => markAllRead()}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <CheckCheck className="size-4" /> Mark all read
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="mr-4 inline-flex rounded-md border p-0.5">
          {(["unread", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded px-3 py-1 text-sm capitalize",
                tab === t ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCourse(null)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs",
            course === null && "border-primary bg-primary/10"
          )}
        >
          All courses
        </button>
        {courseList.map(([id, title]) => (
          <button
            key={id}
            onClick={() => setCourse(id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              course === id && "border-primary bg-primary/10"
            )}
          >
            {title}
          </button>
        ))}
      </div>

      {items.length === 0 && <SignedOutNote />}
      {shown.length === 0 && items.length > 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          You're all caught up.
        </div>
      )}

      {groups
        .filter(([, ns]) => ns.length > 0)
        .map(([label, ns]) => (
          <section key={label} className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </h2>
            <ul className="divide-y rounded-lg border">
              {ns.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "group flex items-start gap-4 p-4",
                    !n.read && "bg-primary/5"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full",
                      EVENT_META[n.event].tint
                    )}
                  >
                    {EVENT_META[n.event].icon}
                  </span>
                  <button onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                    <div className="text-sm">{headline(n)}</div>
                    <div className="mt-1 rounded-md bg-muted/60 px-3 py-2 text-sm">
                      {n.excerpt}
                    </div>
                    <div className="mt-1.5 text-xs text-muted-foreground">
                      {n.courseTitle} › {n.lessonTitle} · {ago(n.minutesAgo)}
                    </div>
                  </button>
                  {!n.read && (
                    <button
                      onClick={() => markRead(n.id)}
                      className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100"
                    >
                      Mark read
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

// ─── Variant C: feed + toasts ───

export function useToastOnLoad(variant: string) {
  const { unreadCount, items } = useProto();
  const shown = useRef(false);
  useEffect(() => {
    if (variant !== "C" || shown.current || unreadCount === 0) return;
    shown.current = true;
    const first = items.find((n) => !n.read)!;
    toast(`${unreadCount} new since your last visit`, {
      description: `${first.actorName} ${EVENT_META[first.event].verb}, and more`,
      icon: <Bell className="size-4" />,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);
}

export function toastFor(n: ProtoNotification, open: (n: ProtoNotification) => void) {
  toast(`${n.actorName} ${EVENT_META[n.event].verb}`, {
    description: `“${n.excerpt}” — ${n.lessonTitle}`,
    icon: EVENT_META[n.event].icon,
    action: { label: "View", onClick: () => open(n) },
    duration: 8000,
  });
}

export function WhatsNewFeed() {
  const { items, open, markAllRead, unreadCount } = useProto();
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl px-8 pt-8">
      <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <Sparkles className="size-4 text-primary" /> What's new
            {unreadCount > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                {unreadCount} new
              </span>
            )}
          </h2>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead()}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss all
            </button>
          )}
        </div>
        <ol className="relative ml-2 border-l pl-5">
          {shown.map((n) => (
            <li key={n.id} className="relative pb-3 last:pb-0">
              <span
                className={cn(
                  "absolute -left-[29px] top-0.5 flex size-4 items-center justify-center rounded-full ring-4 ring-background",
                  n.read ? "bg-muted-foreground/30" : "bg-primary"
                )}
              />
              <button
                onClick={() => open(n)}
                className={cn(
                  "text-left text-sm hover:underline",
                  n.read && "text-muted-foreground"
                )}
              >
                {headline(n)} on <em>{n.lessonTitle}</em>
                <span className="ml-2 text-xs text-muted-foreground">
                  {ago(n.minutesAgo)}
                </span>
              </button>
            </li>
          ))}
        </ol>
        {items.length > 5 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-2 text-xs text-primary hover:underline"
          >
            {expanded ? "Show less" : `Show ${items.length - 5} older`}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Variant D: in context ───

function Flyout({
  ns,
  children,
}: {
  ns: ProtoNotification[];
  children: React.ReactNode;
}) {
  const { open } = useProto();
  return (
    <span className="group/flyout relative ml-auto">
      {children}
      <span className="invisible absolute left-full top-1/2 z-50 ml-3 w-80 -translate-y-1/2 rounded-lg border bg-popover p-2 text-popover-foreground opacity-0 shadow-2xl transition group-hover/flyout:visible group-hover/flyout:opacity-100">
        {ns.map((n) => (
          <span
            key={n.id}
            role="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              open(n);
            }}
            className="flex cursor-pointer gap-2 rounded-md p-2 text-left text-xs font-normal hover:bg-muted"
          >
            <CornerDownRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block">{headline(n)}</span>
              <span className="block truncate text-muted-foreground">
                {n.lessonTitle} · {ago(n.minutesAgo)}
              </span>
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

/** Badges keyed by nav `to`, for the sidebar's nav items. */
export function useNavBadges(): Record<string, React.ReactNode> {
  const { items, role } = useProto();
  const unread = items.filter((n) => !n.read);
  if (unread.length === 0) return {};
  if (role === UserRole.Instructor) {
    const questions = unread.filter((n) => n.event === "new_question");
    const replies = unread.filter((n) => n.event !== "new_question");
    return {
      "/instructor/questions": questions.length ? (
        <Flyout ns={questions}>
          <CountPill n={questions.length} />
        </Flyout>
      ) : null,
      "/instructor": replies.length ? (
        <Flyout ns={replies}>
          <CountPill n={replies.length} />
        </Flyout>
      ) : null,
    };
  }
  return {
    "/dashboard": (
      <Flyout ns={unread}>
        <CountPill n={unread.length} />
      </Flyout>
    ),
  };
}

/** Badges keyed by courseId, for the sidebar's Recent Courses. */
export function useCourseBadges(): Record<number, React.ReactNode> {
  const { items } = useProto();
  const byCourse = new Map<number, ProtoNotification[]>();
  for (const n of items.filter((n) => !n.read)) {
    byCourse.set(n.courseId, [...(byCourse.get(n.courseId) ?? []), n]);
  }
  return Object.fromEntries(
    Array.from(byCourse.entries()).map(([id, ns]) => [
      id,
      <Flyout key={id} ns={ns}>
        <span className="inline-flex size-2.5 rounded-full bg-red-600" />
      </Flyout>,
    ])
  );
}

// ─── Switcher with "simulate arrival" ───

export function NotificationsSwitcher() {
  const { simulate, open } = useProto();
  const variant = useVariant();
  return (
    <PrototypeSwitcher
      variants={VARIANTS}
      extra={
        <button
          onClick={() => {
            const n = simulate();
            if (n && variant === "C") toastFor(n, open);
          }}
          className="ml-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs hover:bg-white/30"
          title="Simulate a Notification arriving while the page is open"
        >
          + new
        </button>
      }
    />
  );
}

/** Where the main area shows something other than the route (B's inbox, C's feed). */
export function useMainOverride(): {
  replace: React.ReactNode | null;
  above: React.ReactNode | null;
} {
  const variant = useVariant();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  useToastOnLoad(variant);
  if (variant === "B" && params.get("inbox") === "1")
    return { replace: <InboxPage />, above: null };
  if (variant === "C" && (pathname === "/dashboard" || pathname === "/instructor"))
    return { replace: null, above: <WhatsNewFeed /> };
  return { replace: null, above: null };
}
