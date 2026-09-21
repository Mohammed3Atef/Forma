import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Message, MessageCategory, Role } from "@/types";
import { MESSAGE_EDIT_WINDOW_MS, MESSAGE_REACTIONS } from "@/types";
import {
  deleteMessage,
  editMessage,
  listOlderMessages,
  markThreadSeen,
  reactToMessage,
  sendMessage,
  subscribeMessages,
} from "@/services/platform/messagesApi";
import { markMessageNotificationsSeen } from "@/services/platform/notificationsApi";
import { isBunnyConfigured, uploadFileToBunny, UploadError } from "@/services/platform/bunnyUploadApi";
import { getAttachmentKind, type AttachmentKind } from "@/lib/attachmentKind";
import { messagesEqual } from "@/lib/messagesEqual";
import { downscaleImage } from "@/lib/image";
import { viewImages } from "@/stores/imageViewerStore";
import { alertDialog, confirmDelete, confirmDialog } from "@/stores/dialogStore";
import { useVoiceRecorder, type VoiceRecorderError } from "@/hooks/useVoiceRecorder";
import { useIsTabletUp } from "@/hooks/useMediaQuery";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/Sheet";
import { colors } from "@/theme/colors";
import { uid } from "@/lib/utils";

/**
 * A message this device just sent but the poll hasn't echoed back yet.
 * Identity is by `localId` (a client-generated temp id, also sent to the
 * server as `clientMsgId` for idempotent retries) — never by matching body
 * text, so two identical messages sent back-to-back stay distinct and a
 * retry can never silently create a duplicate.
 */
interface PendingMessage {
  localId: string;
  body: string;
  attachment?: { kind: AttachmentKind; previewUrl?: string; name?: string };
  file?: File;
  downscale?: boolean;
  createdAt: number;
  status: "uploading" | "sending" | "failed";
  progress?: number;
}

/** An attachment picked (or recorded) but not yet uploaded — held in the composer until Send. */
interface DraftAttachment {
  file: File;
  kind: AttachmentKind;
  previewUrl?: string;
  downscale?: boolean;
}

/** Coarse-pointer devices (touch) get Enter-inserts-newline; only a device with a real keyboard sends on Enter. */
const isCoarsePointer = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/** Format an elapsed-seconds count as m:ss for the recording indicator. */
function fmtElapsed(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtBytes(n?: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Per-category bubble styling + attention-flash colour for coach broadcasts. */
const CATEGORY: Record<MessageCategory, { bubble: string; flash: string }> = {
  message: { bubble: "", flash: "" },
  announcement: { bubble: "border border-brand/60 bg-brand/15 text-white", flash: `${colors.brandOrange}8c` },
  offer: { bubble: "border border-success/60 bg-success/15 text-white", flash: `${colors.success}80` },
  reminder: { bubble: "border border-warn/60 bg-warn/15 text-white", flash: `${colors.warning}80` },
  update: { bubble: "border border-info/60 bg-info/15 text-white", flash: `${colors.info}80` },
};

type ActionTarget = { message: Message; mine: boolean; editable: boolean };

/**
 * Canonical 1:1 chat thread — shared by the coach and client screens. ONE layout
 * everywhere: a full-height flex column whose message list scrolls internally and
 * whose composer sits in-flow at the bottom. The parent must give it height
 * (the desktop split card, or the standalone page's full-height wrapper).
 * Polls the server (see `messagesApi.ts`) and marks the other party's messages
 * seen on open.
 */
export function MessageThread({
  clientId,
  meId,
  meRole,
  peer,
}: {
  clientId: string;
  meId: string;
  meRole: Role;
  /** The other party, for theirs-message avatars + accessibility. */
  peer?: { name?: string; photoUrl?: string };
}) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  // Server-confirmed sends whose real `id` we already have (from the `send`
  // response) but which the poll hasn't fetched into `messages` yet — kept
  // separate from `messages` (which the poll wholesale-replaces every tick)
  // so this never fights with or duplicates what the poll eventually returns.
  const [justSent, setJustSent] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState<DraftAttachment | null>(null);
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [newBelow, setNewBelow] = useState(0);
  const [actionsFor, setActionsFor] = useState<ActionTarget | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  // Per-message DOM node, keyed by message id — the desktop floating menu
  // measures the exact bubble it belongs to (via `getBoundingClientRect`) so
  // it can position itself with real collision detection instead of guessing
  // with CSS alone.
  const bubbleRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // ≥768px gets a small floating menu anchored to the message it belongs to;
  // narrower viewports keep the bottom-sheet contextual surface (long-press).
  const isTabletUp = useIsTabletUp();
  const voice = useVoiceRecorder({
    onAutoStop: (file) => {
      // 5-minute cap goes to REVIEW (the composer's attachment slot), never
      // straight to send — identical to a manual Stop.
      if (file) setDraftFromFile(file, "audio");
    },
  });
  // Pinned to newest? Stays true on open / after sending; flips false on scroll-up.
  // This ref (not state) is the ONLY thing allowed to gate auto-scroll from
  // background updates (polling, reactions, edits, seen receipts) — see the
  // reconciliation effect below for the rule this enforces.
  const stick = useRef(true);
  // The newest `createdAt` we've already accounted for. Used (not a raw
  // length delta) to detect "a message truly arrived at the bottom" in a way
  // that's immune to `loadOlder` prepending older messages to the front of
  // the same array — a prepend never raises this value.
  const prevNewestAtRef = useRef(0);
  const oldestCursorRef = useRef<number | null>(null);

  const combined = useMemo(() => {
    if (justSent.length === 0) return messages;
    const ids = new Set(messages.map((m) => m.id));
    return [...messages, ...justSent.filter((m) => !ids.has(m.id))];
  }, [messages, justSent]);

  // Drop a `justSent` entry once the poll's own fetch has caught up to it —
  // this is the ONLY pruning `justSent` needs; nothing here is matched by
  // body text, only by the real server `id`.
  useEffect(() => {
    if (justSent.length === 0) return;
    setJustSent((cur) => {
      const ids = new Set(messages.map((m) => m.id));
      const next = cur.filter((jm) => !ids.has(jm.id));
      return next.length === cur.length ? cur : next;
    });
  }, [messages, justSent.length]);

  // Real-time thread subscription.
  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    stick.current = true;
    setNewBelow(0);
    setJustSent([]);
    setHasOlder(false);
    oldestCursorRef.current = null;
    prevNewestAtRef.current = 0;
    const unsub = subscribeMessages(clientId, (msgs) => {
      setMessages(msgs);
      setLoading(false);
      if (oldestCursorRef.current == null && msgs.length > 0) oldestCursorRef.current = msgs[0].createdAt;
      // A full 200-message window with no older-page state yet — there MAY be
      // more; the exact answer comes from `list`'s own `hasMore`, but until
      // the user asks to load older we only need a reasonable default.
      if (msgs.length >= 200) setHasOlder(true);
    });
    return unsub;
  }, [clientId]);

  const loadOlder = async () => {
    if (loadingOlder || oldestCursorRef.current == null) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    try {
      const { messages: older, hasMore } = await listOlderMessages(clientId, oldestCursorRef.current);
      if (older.length > 0) oldestCursorRef.current = older[0].createdAt;
      setHasOlder(hasMore);
      setMessages((cur) => {
        const ids = new Set(cur.map((m) => m.id));
        return [...older.filter((m) => !ids.has(m.id)), ...cur];
      });
      // Preserve scroll position — prepending content above the viewport
      // would otherwise yank the view down to the new top.
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - prevScrollHeight;
      });
    } catch {
      await alertDialog({ title: t("messages.title"), message: t("common.errorGeneric") });
    } finally {
      setLoadingOlder(false);
    }
  };

  // Auto-grow the composer with its content (up to max-h-32) so a long message
  // wraps and expands instead of being clipped inside a fixed one-line box.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    const border = el.offsetHeight - el.clientHeight; // border-box: include borders
    el.style.height = `${Math.min(el.scrollHeight + border, 128)}px`;
  }, [body]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    stick.current = true;
    setNewBelow(0);
  }, []);

  // Only auto-scroll while the user is already near the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stick.current = el.scrollHeight - (el.scrollTop + el.clientHeight) < 120;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const onMediaLoad = useCallback(() => {
    if (stick.current) scrollToBottom();
  }, [scrollToBottom]);

  // The on-screen keyboard resizes the visual viewport without necessarily
  // re-triggering our own scroll/resize logic (and on some Android WebViews,
  // without the layout viewport shrinking at all) — re-pin to the newest
  // message whenever it opens/closes so neither the composer nor the latest
  // bubble ends up hidden behind it.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onVvResize = () => {
      if (stick.current) requestAnimationFrame(scrollToBottom);
    };
    vv.addEventListener("resize", onVvResize);
    return () => vv.removeEventListener("resize", onVvResize);
  }, [scrollToBottom]);

  // Focusing the composer on a touch device opens the keyboard; scroll it
  // (and the newest message) back into view once the viewport has settled,
  // instead of leaving it under the keyboard at its pre-focus scroll offset.
  const onComposerFocus = () => {
    if (!isCoarsePointer()) return;
    stick.current = true;
    requestAnimationFrame(() => requestAnimationFrame(scrollToBottom));
  };

  // Scroll ownership: this is the ONLY place background updates (polling,
  // reactions, edits, seen receipts, pending→confirmed reconciliation) may
  // move the viewport, and it only ever does so when the user is ALREADY
  // pinned near the bottom (`stick.current`). A poll tick that changes
  // nothing visible still gives `combined` a new array reference (see
  // `subscribeMessages` in messagesApi.ts, which re-emits every tick) and
  // therefore still re-runs this effect — so the gate below must hold up
  // under being called far more often than "a message actually changed".
  //
  // Sending your own message is handled separately and unconditionally by
  // `sendPending`'s own `scrollToBottom()` call the moment the pending
  // bubble is queued — this effect intentionally does NOT special-case "the
  // last message is mine", since that used to force a scroll on every single
  // poll tick whenever the thread's newest message happened to be one of
  // ours (i.e. most of the time), which was the actual bug: the user would
  // get yanked back to the bottom while reading old messages.
  useEffect(() => {
    if (!clientId || combined.length === 0) return;
    if (combined.some((m) => m.fromRole !== meRole && !m.seenAt)) {
      void markThreadSeen(clientId, meRole);
      // Clear the matching in-app notifications so the bell/feed stay in sync.
      void markMessageNotificationsSeen(clientId, meRole === "coach" ? "coach" : "client");
    }
    // `combined` is always chronological, so its last element is the newest —
    // count how many messages are newer than the last one we accounted for.
    // A `loadOlder` prepend never raises this value, so it can never be
    // mistaken for "new messages arrived below".
    const newestAt = combined[combined.length - 1]?.createdAt ?? 0;
    const arrivedCount = combined.reduce((n, m) => (m.createdAt > prevNewestAtRef.current ? n + 1 : n), 0);
    prevNewestAtRef.current = Math.max(prevNewestAtRef.current, newestAt);
    if (stick.current) {
      setNewBelow(0);
      const id = requestAnimationFrame(scrollToBottom);
      return () => cancelAnimationFrame(id);
    } else if (arrivedCount > 0) {
      setNewBelow((n) => n + arrivedCount);
    }
  }, [clientId, meRole, combined, scrollToBottom]);

  const revokeDraftUrl = (d: DraftAttachment | null) => {
    if (d?.previewUrl) URL.revokeObjectURL(d.previewUrl);
  };

  // In-flight upload AbortControllers, keyed by the pending message's localId — lets
  // Cancel stop the XHR mid-upload instead of only hiding it client-side.
  const uploadAborts = useRef<Map<string, AbortController>>(new Map());

  const setDraftFromFile = (file: File, kindOverride?: AttachmentKind) => {
    const kind = kindOverride ?? getAttachmentKind({ mimeType: file.type, name: file.name });
    const previewUrl = kind === "image" || kind === "audio" || kind === "video" ? URL.createObjectURL(file) : undefined;
    // SVG is a vector format — rasterizing it through the WebP downscale pass would
    // both lose its vector quality and mismatch its `.svg` extension against the
    // re-encoded bytes once uploaded, so only bitmap images get downscaled.
    const downscale = kind === "image" && file.type !== "image/svg+xml";
    setDraft((cur) => {
      revokeDraftUrl(cur);
      return { file, kind, previewUrl, downscale };
    });
  };

  // Sends ONE message: either a bare attachment or bare text, never both —
  // an attachment + a caption are deliberately two independent messages (see
  // `doSend`), each with its own id/reactions/edit/delete eligibility.
  // `localId` doubles as the server's idempotency key (`clientMsgId`) — a
  // retry of the SAME pending entry can never create a second message.
  // Returns whether the send actually succeeded, so `doSend` can decide
  // whether it's safe to move on to the next message in the sequence.
  const sendPending = async (text: string, attachment: DraftAttachment | null, localId: string, existingProgress?: number): Promise<boolean> => {
    setPending((cur) => {
      const entry: PendingMessage = {
        localId,
        body: text,
        attachment: attachment ? { kind: attachment.kind, previewUrl: attachment.previewUrl, name: attachment.file.name } : undefined,
        file: attachment?.file,
        downscale: attachment?.downscale,
        createdAt: cur.find((pm) => pm.localId === localId)?.createdAt ?? Date.now(),
        status: attachment ? "uploading" : "sending",
        progress: existingProgress,
      };
      const idx = cur.findIndex((pm) => pm.localId === localId);
      if (idx === -1) return [...cur, entry];
      const next = [...cur];
      next[idx] = entry;
      return next;
    });
    stick.current = true;
    requestAnimationFrame(scrollToBottom);

    try {
      let attachmentPayload: Message["attachment"];
      if (attachment) {
        const blob = attachment.downscale
          ? new File([await downscaleImage(attachment.file)], attachment.file.name, { type: "image/webp" })
          : attachment.file;
        const controller = new AbortController();
        uploadAborts.current.set(localId, controller);
        try {
          const { url, kind, name, size, mimeType } = await uploadFileToBunny(blob, {
            folder: `Forma/${clientId}/messages`,
            onProgress: (pct) => setPending((cur) => cur.map((pm) => (pm.localId === localId ? { ...pm, progress: pct } : pm))),
            signal: controller.signal,
          });
          attachmentPayload = { url, kind, name, size, mimeType };
        } finally {
          uploadAborts.current.delete(localId);
        }
        setPending((cur) => cur.map((pm) => (pm.localId === localId ? { ...pm, status: "sending" } : pm)));
      }
      const confirmed = await sendMessage(clientId, { id: meId, role: meRole }, text, { attachment: attachmentPayload, clientMsgId: localId });
      setJustSent((cur) => [...cur, confirmed]);
      setPending((cur) => cur.filter((pm) => pm.localId !== localId));
      return true;
    } catch (err) {
      if (err instanceof UploadError && err.code === "cancelled") {
        // Cancel-in-flight: drop the pending bubble and hand the text/attachment
        // back to the composer instead of leaving it stranded as "failed".
        setPending((cur) => cur.filter((pm) => pm.localId !== localId));
        setBody((cur) => cur || text);
        if (attachment) setDraft((cur) => cur ?? attachment);
        return false;
      }
      setPending((cur) => cur.map((pm) => (pm.localId === localId ? { ...pm, status: "failed" } : pm)));
      if (err instanceof UploadError) {
        await alertDialog({ title: t("messages.title"), message: t(`upload.${err.code}`) });
      }
      return false;
    }
  };

  /** Cancel an in-flight upload for a pending message: aborts the XHR and returns its text/attachment to the composer. */
  const cancelUpload = (localId: string) => {
    uploadAborts.current.get(localId)?.abort();
  };

  // An attachment and a typed caption are sent as TWO independent messages,
  // attachment first — never bundled into one document. They're sent in
  // strict sequence (not in parallel) so slower networks can never reorder
  // them, and each gets its own `clientMsgId` so a retry of either one can
  // never duplicate or touch the other.
  const doSend = async () => {
    const text = body.trim();
    const attachment = draft;
    if (!text && !attachment) return;
    if (sending) return;
    setSending(true);
    setBody("");
    setDraft(null); // composer clears immediately — pending bubble(s) below now carry the send(s)
    try {
      if (attachment) {
        const ok = await sendPending("", attachment, uid("msg"));
        if (!ok) {
          // The attachment failed (or was cancelled) — its own pending bubble
          // already offers Retry/Discard (or, on cancel, reappears as the
          // composer draft). Restore the caption too so it's neither silently
          // sent on its own as if nothing happened, nor silently lost.
          if (text) setBody((cur) => cur || text);
          return;
        }
      }
      if (text) {
        await sendPending(text, null, uid("msg"));
      }
    } finally {
      setSending(false);
    }
  };

  const retryPending = (pm: PendingMessage) => {
    const attachment: DraftAttachment | null = pm.file ? { file: pm.file, kind: pm.attachment?.kind ?? "file", previewUrl: pm.attachment?.previewUrl, downscale: pm.downscale } : null;
    void sendPending(pm.body, attachment, pm.localId, pm.progress);
  };
  const dismissPending = (localId: string) =>
    setPending((cur) => {
      const pm = cur.find((p) => p.localId === localId);
      if (pm?.attachment?.previewUrl) URL.revokeObjectURL(pm.attachment.previewUrl);
      return cur.filter((p) => p.localId !== localId);
    });

  const onAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setDraftFromFile(file);
  };
  const removeDraft = () => {
    revokeDraftUrl(draft);
    setDraft(null);
  };

  const MIC_ERROR_KEY: Record<VoiceRecorderError, string> = {
    insecure: "messages.micInsecure",
    denied: "messages.micDenied",
    notfound: "messages.micNotFound",
    busy: "messages.micBusy",
    unsupported: "messages.micUnsupported",
    failed: "messages.micDenied",
  };
  // One-time explanation before the real OS permission prompt, so the first
  // ask isn't a bare unexplained browser dialog. Persists per-browser (not
  // just per-session) via localStorage; failure to read/write it just means
  // asking again next time, never blocks recording.
  const primeMic = async (): Promise<boolean> => {
    let primed = false;
    try {
      primed = localStorage.getItem("forma.micPrimed") === "1";
    } catch {
      /* ignore */
    }
    if (primed) return true;
    const ok = await confirmDialog({ title: t("messages.micPrimeTitle"), message: t("messages.micPrimeBody"), confirmLabel: t("messages.micPrimeAllow") });
    if (ok) {
      try {
        localStorage.setItem("forma.micPrimed", "1");
      } catch {
        /* ignore */
      }
    }
    return ok;
  };
  const startVoice = async () => {
    if (!(await primeMic())) return;
    if (!(await voice.start())) {
      await alertDialog({ title: t("messages.title"), message: t(MIC_ERROR_KEY[voice.lastError ?? "failed"]) });
    }
  };
  const stopVoice = async () => {
    const file = await voice.stop();
    if (file) setDraftFromFile(file, "audio");
  };

  // ---- edit / delete / react ----
  const openEdit = (m: Message) => {
    setActionsFor(null);
    setEditingId(m.id);
    setEditText(m.body);
    requestAnimationFrame(() => editRef.current?.focus());
  };
  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText("");
  }, []);
  // Depends on `editText` (changes every keystroke) — that's fine: this is
  // only ever passed to the ONE row currently being edited, which already
  // re-renders every keystroke to show the typed text, so a fresh reference
  // here doesn't defeat memoization for the other, non-editing rows.
  const submitEdit = useCallback(async () => {
    if (!editingId) return;
    const text = editText.trim();
    if (!text) return;
    try {
      const updated = await editMessage(clientId, editingId, text);
      setMessages((cur) => cur.map((m) => (m.id === updated.id ? updated : m)));
      setJustSent((cur) => cur.map((m) => (m.id === updated.id ? updated : m)));
      cancelEdit();
    } catch {
      await alertDialog({ title: t("messages.editUnavailable"), message: t("common.errorGeneric") });
    }
  }, [editingId, editText, clientId, t, cancelEdit]);
  const doDelete = async (m: Message) => {
    setActionsFor(null);
    if (!(await confirmDelete(m.body || t("messages.attach")))) return;
    try {
      const updated = await deleteMessage(clientId, m.id);
      setMessages((cur) => cur.map((mm) => (mm.id === updated.id ? updated : mm)));
      setJustSent((cur) => cur.map((mm) => (mm.id === updated.id ? updated : mm)));
    } catch {
      await alertDialog({ title: t("messages.deleteUnavailable"), message: t("common.errorGeneric") });
    }
  };
  const react = async (m: Message, value: string) => {
    const mine = m.reactions?.[meId];
    const next = mine === value ? null : value; // tap the same one again removes it
    try {
      const updated = await reactToMessage(clientId, m.id, next);
      setMessages((cur) => cur.map((mm) => (mm.id === updated.id ? updated : mm)));
      setJustSent((cur) => cur.map((mm) => (mm.id === updated.id ? updated : mm)));
    } catch {
      // Non-fatal — the next poll tick will show the real state either way.
    }
  };

  // Stable across renders (only depends on `meRole`, a fixed prop) — passed
  // to every memoized `MessageRow` so re-rendering the parent never forces
  // every row to re-render just because this closure got a new identity.
  const openActions = useCallback(
    (m: Message) => {
      if (m.deletedAt) return;
      const mine = m.fromRole === meRole;
      const editable = mine && Date.now() - m.createdAt < MESSAGE_EDIT_WINDOW_MS;
      setActionsFor({ message: m, mine, editable });
    },
    [meRole],
  );

  // Shared by the mobile bottom sheet (long-press) and the desktop floating
  // menu (hover 3-dot) — one action list, two presentations, both always
  // scoped to `target.message` alone.
  const renderActionsContent = (target: ActionTarget) => (
    <div className="space-y-3">
      <div className="flex justify-center gap-1.5" data-testid="reaction-picker">
        {MESSAGE_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            data-testid="reaction-pick"
            onClick={() => {
              void react(target.message, emoji);
              setActionsFor(null);
            }}
            className={`flex h-10 w-10 items-center justify-center rounded-full text-xl transition-colors hover:bg-surface-hover ${target.message.reactions?.[meId] === emoji ? "bg-brand/15" : ""}`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="space-y-1">
        {target.editable && (
          <button type="button" data-testid="action-edit" className="row w-full text-start" onClick={() => openEdit(target.message)}>
            <Icon name="edit" size={18} className="text-earth-muted" /> {t("common.edit")}
          </button>
        )}
        {target.editable && (
          <button type="button" data-testid="action-delete" className="row w-full text-start text-danger" onClick={() => void doDelete(target.message)}>
            <Icon name="close" size={18} /> {t("common.delete")}
          </button>
        )}
        {target.message.body && (
          <button
            type="button"
            data-testid="action-copy"
            className="row w-full text-start"
            onClick={async () => {
              try {
                await navigator.clipboard?.writeText(target.message.body);
              } catch {
                /* clipboard blocked — nothing to fall back to here */
              }
              setActionsFor(null);
            }}
          >
            <Icon name="list" size={18} className="text-earth-muted" /> {t("messages.copy")}
          </button>
        )}
        {target.message.attachment && (
          <button
            type="button"
            data-testid="action-open-attachment"
            className="row w-full text-start"
            onClick={() => {
              window.open(target.message.attachment!.url, "_blank", "noopener");
              setActionsFor(null);
            }}
          >
            <Icon name="download" size={18} className="text-earth-muted" /> {t("messages.openAttachment")}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="message-thread">
      {/* Sunken warm-charcoal canvas, distinct from the elevated header above and the composer below. */}
      <div ref={scrollRef} className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-surface px-2 py-3">
        {newBelow > 0 && (
          <button
            type="button"
            data-testid="jump-to-latest"
            onClick={scrollToBottom}
            className="sticky top-1 z-10 mx-auto flex items-center gap-1.5 self-center rounded-full bg-gradient-brand px-3 py-1.5 text-[12px] font-semibold text-brand-ink shadow-deep"
          >
            <Icon name="chevronDown" size={14} /> {t("messages.newBelow", { n: newBelow })}
          </button>
        )}
        {loading ? (
          <p className="m-auto py-8 text-center text-sm text-earth-muted">{t("auth.working")}</p>
        ) : combined.length === 0 && pending.length === 0 ? (
          <p className="m-auto py-10 text-center text-sm text-earth-muted">{t("messages.noMessages")}</p>
        ) : (
          <div className="flex flex-col">
            {hasOlder && (
              <button
                type="button"
                data-testid="load-older"
                disabled={loadingOlder}
                onClick={() => void loadOlder()}
                className="btn-ghost mx-auto mb-2 text-[12px] disabled:opacity-40"
              >
                {loadingOlder ? t("auth.working") : t("messages.loadOlder")}
              </button>
            )}
            {combined.map((m, i) => {
              const mine = m.fromRole === meRole;
              const prev = combined[i - 1];
              const next = combined[i + 1];
              // Grouping only ever changes SPACING and whether the trailing avatar
              // repeats — every bubble below is still keyed by its own `m.id` and
              // every reaction/3-dot/edit/delete/long-press action closes over
              // that exact message, never a "run" of messages.
              const GROUP_WINDOW_MS = 5 * 60 * 1000;
              const closeToPrev = !!prev && !prev.deletedAt && prev.fromRole === m.fromRole && m.createdAt - prev.createdAt < GROUP_WINDOW_MS;
              const closeToNext = !!next && !m.deletedAt && next.fromRole === m.fromRole && next.createdAt - m.createdAt < GROUP_WINDOW_MS;
              const isLastOfGroup = !closeToNext;
              const isFirstOfGroup = !closeToPrev;
              const curDay = new Date(m.createdAt).toDateString();
              const isNewDay = !prev || new Date(prev.createdAt).toDateString() !== curDay;
              const topGap = isNewDay ? "mt-1" : isFirstOfGroup ? "mt-5" : "mt-2";
              return (
                <MessageRow
                  key={m.id}
                  m={m}
                  mine={mine}
                  topGap={topGap}
                  isLastOfGroup={isLastOfGroup}
                  isNewDay={isNewDay}
                  peerName={peer?.name}
                  peerPhotoUrl={peer?.photoUrl}
                  isEditing={editingId === m.id}
                  editText={editText}
                  onEditTextChange={setEditText}
                  onSubmitEdit={submitEdit}
                  onCancelEdit={cancelEdit}
                  editRef={editRef}
                  onOpenActions={openActions}
                  bubbleRefs={bubbleRefs}
                  onMediaLoad={onMediaLoad}
                />
              );
            })}
            {pending.map((pm) => (
              <div key={pm.localId} className="mt-2 flex items-end justify-end gap-2" data-testid="message-bubble-pending">
                <div className="flex min-w-0 max-w-[85%] flex-col items-end">
                  {pm.attachment && (
                    <div className="mb-1 w-fit max-w-full overflow-hidden rounded-xl border border-line-soft">
                      {pm.attachment.kind === "image" && pm.attachment.previewUrl && (
                        <img src={pm.attachment.previewUrl} alt="" className="max-h-40 object-cover opacity-80" />
                      )}
                      {pm.attachment.kind === "audio" && pm.attachment.previewUrl && <audio src={pm.attachment.previewUrl} controls className="w-56" />}
                      {(pm.attachment.kind === "file" || pm.attachment.kind === "video") && (
                        <div className="flex items-center gap-2 px-2.5 py-2 text-[13px] text-earth-muted">
                          <Icon name={pm.attachment.kind === "video" ? "video" : "download"} size={16} /> {pm.attachment.name}
                        </div>
                      )}
                    </div>
                  )}
                  {pm.body && (
                    <div className={`w-fit max-w-full rounded-2xl px-3 py-2 text-sm rounded-ee-[5px] ${pm.status === "failed" ? "border border-danger/50 bg-danger/10 text-earth" : "bg-gradient-brand text-brand-ink opacity-70"}`}>
                      <p className="whitespace-pre-wrap break-words">{pm.body}</p>
                    </div>
                  )}
                  {pm.status === "failed" ? (
                    <span className="mt-1 flex items-center gap-2 px-1 text-[11px] text-danger">
                      {t("messages.sendFailed")}
                      <button type="button" data-testid="message-retry" className="underline" onClick={() => retryPending(pm)}>{t("common.retry")}</button>
                      <button type="button" data-testid="message-discard" className="underline" onClick={() => dismissPending(pm.localId)}>{t("common.delete")}</button>
                    </span>
                  ) : (
                    <span className="mt-1 flex items-center gap-1.5 px-1 text-[10px] text-earth-subtle">
                      <Icon name="rotate" size={11} className="animate-spin" />
                      {pm.status === "uploading" && pm.progress != null ? `${t("upload.uploading")} ${pm.progress}%` : t("messages.sending")}
                      {pm.status === "uploading" && (
                        <button type="button" data-testid="message-cancel-upload" className="underline" onClick={() => cancelUpload(pm.localId)}>
                          {t("common.cancel")}
                        </button>
                      )}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Composer — in-flow at the bottom of the full-height column. The extra
          bottom padding respects the home-indicator/gesture-bar safe area on
          notched phones instead of the composer sitting flush against it. */}
      <div className="shrink-0 border-t border-line bg-surface-card px-2 pb-[calc(0.375rem+env(safe-area-inset-bottom))] pt-2.5">
        {voice.state === "recording" ? (
          <div className="flex items-center gap-2" data-testid="voice-recording">
            <button
              type="button"
              data-testid="voice-cancel"
              onClick={voice.cancel}
              className="icon-btn h-11 w-11 shrink-0 text-danger"
              aria-label={t("messages.cancelRecording")}
            >
              <Icon name="close" size={20} />
            </button>
            <div className="flex flex-1 items-center gap-2 text-sm text-earth-muted">
              <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-danger motion-reduce:animate-none" />
              <span className="font-mono tabular-nums" dir="ltr">{fmtElapsed(voice.seconds)} / {fmtElapsed(voice.maxSeconds)}</span>
              {/* Lightweight live level meter — a single bar whose width tracks input amplitude, not a full waveform history. */}
              <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-hover">
                <span className="block h-full rounded-full bg-danger transition-[width] duration-100" style={{ width: `${Math.round(voice.level * 100)}%` }} />
              </span>
            </div>
            <button type="button" data-testid="voice-stop" onClick={() => void stopVoice()} className="btn-primary h-11 w-11 shrink-0 px-0" aria-label={t("messages.stopRecording")}>
              <Icon name="check" size={20} />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {draft && (
              <div className="flex items-center gap-2 rounded-xl border border-line-soft p-2" data-testid="composer-attachment-preview">
                {draft.kind === "image" && draft.previewUrl && <img src={draft.previewUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />}
                {draft.kind === "audio" && draft.previewUrl && <audio src={draft.previewUrl} controls className="h-9 flex-1" />}
                {(draft.kind === "video" || draft.kind === "file") && (
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-earth-muted">
                    <Icon name={draft.kind === "video" ? "video" : "download"} size={18} className="shrink-0" />
                    <span className="min-w-0 truncate">{draft.file.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-earth-subtle">{fmtBytes(draft.file.size)}</span>
                  </span>
                )}
                {draft.kind === "audio" && (
                  <button type="button" data-testid="voice-rerecord" className="btn-ghost btn-sm shrink-0" onClick={() => { removeDraft(); void startVoice(); }}>
                    {t("messages.reRecord")}
                  </button>
                )}
                <button type="button" data-testid="composer-attachment-remove" onClick={removeDraft} className="icon-btn h-8 w-8 shrink-0 text-danger" aria-label={t("common.delete")}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2.5">
              <input ref={fileRef} type="file" accept="image/*,video/*,application/pdf" className="hidden" onChange={onAttach} />
              {isBunnyConfigured() && (
                <button
                  type="button"
                  data-testid="message-attach"
                  disabled={sending}
                  onClick={() => fileRef.current?.click()}
                  className="icon-btn h-11 w-11 shrink-0 disabled:opacity-40"
                  aria-label={t("messages.attach")}
                >
                  <Icon name="image" size={20} />
                </button>
              )}
              {isBunnyConfigured() && voice.supported && !draft && (
                <button
                  type="button"
                  data-testid="voice-record"
                  disabled={sending}
                  onClick={() => void startVoice()}
                  className="icon-btn h-11 w-11 shrink-0 disabled:opacity-40"
                  aria-label={t("messages.record")}
                >
                  <Icon name="mic" size={20} />
                </button>
              )}
              <textarea
                ref={taRef}
                className="input max-h-32 min-h-11 flex-1 resize-none py-2.5"
                data-testid="message-input"
                rows={1}
                placeholder={draft ? t("messages.captionPlaceholder") : t("messages.placeholder")}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onFocus={onComposerFocus}
                onKeyDown={(e) => {
                  // Touch keyboards get a real newline on Enter — only a device
                  // with an actual keyboard (fine pointer) sends on plain Enter.
                  if (e.key === "Enter" && !e.shiftKey && !isCoarsePointer()) {
                    e.preventDefault();
                    void doSend();
                  }
                }}
              />
              <button
                type="button"
                data-testid="message-send"
                disabled={(!body.trim() && !draft) || sending}
                onClick={() => void doSend()}
                className="btn-primary h-11 w-11 shrink-0 px-0 shadow-deep transition-transform disabled:opacity-40 disabled:shadow-none active:scale-95"
                aria-label={t("messages.send")}
              >
                <Icon name="chevron" size={20} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Message action menu — mobile long-press (`onContextMenu`) opens this
          bottom sheet; desktop hover 3-dot instead opens the collision-aware
          floating menu below, anchored to that exact message. Both share
          `renderActionsContent`, so it's one action list either way. */}
      <Sheet open={!!actionsFor && !isTabletUp} onClose={() => setActionsFor(null)} size="sm" title={t("messages.moreActions")}>
        {actionsFor && renderActionsContent(actionsFor)}
      </Sheet>
      <FloatingActionMenu
        open={!!actionsFor && isTabletUp}
        anchor={actionsFor ? (bubbleRefs.current.get(actionsFor.message.id) ?? null) : null}
        align={actionsFor?.mine ? "end" : "start"}
        onClose={() => setActionsFor(null)}
      >
        {actionsFor && renderActionsContent(actionsFor)}
      </FloatingActionMenu>
    </div>
  );
}

interface MessageRowProps {
  m: Message;
  mine: boolean;
  topGap: string;
  isLastOfGroup: boolean;
  isNewDay: boolean;
  peerName?: string;
  peerPhotoUrl?: string;
  isEditing: boolean;
  /** Only read by the row that's actually `isEditing` — see the memo comparator below. */
  editText: string;
  onEditTextChange: (v: string) => void;
  onSubmitEdit: () => void;
  onCancelEdit: () => void;
  editRef: React.RefObject<HTMLTextAreaElement>;
  /** Stable (only depends on `meRole`) — see `openActions`'s `useCallback` in the parent. */
  onOpenActions: (m: Message) => void;
  /** The parent's ref map itself (a stable `useRef` object) — registering into it doesn't require a prop-identity check. */
  bubbleRefs: MutableRefObject<Map<string, HTMLDivElement>>;
  /** Stable (`useCallback([])` transitively via `scrollToBottom`). */
  onMediaLoad: () => void;
}

/**
 * One message bubble (or its deleted tombstone), memoized so a poll tick that
 * changes nothing about THIS message skips re-rendering it entirely — see
 * `messagesEqual` (`@/lib/messagesEqual`) for why this can't be the default
 * shallow-prop comparison. In a long, actively-open thread this is the
 * difference between re-reconciling one changed bubble every 5s vs. the
 * whole conversation.
 */
const MessageRow = memo(function MessageRow({
  m,
  mine,
  topGap,
  isLastOfGroup,
  isNewDay,
  peerName,
  peerPhotoUrl,
  isEditing,
  editText,
  onEditTextChange,
  onSubmitEdit,
  onCancelEdit,
  editRef,
  onOpenActions,
  bubbleRefs,
  onMediaLoad,
}: MessageRowProps) {
  const { t, i18n } = useTranslation();
  const curDay = new Date(m.createdAt).toDateString();
  const dateLabel = curDay === new Date().toDateString() ? t("common.today") : new Date(m.createdAt).toLocaleDateString(i18n.language, { weekday: "short", month: "short", day: "numeric" });
  const daySeparator = isNewDay && (
    <div className="my-3 flex items-center justify-center" data-testid="date-separator">
      <span className="rounded-full bg-surface-raised px-3 py-1 text-[11px] font-medium text-earth-subtle">{dateLabel}</span>
    </div>
  );

  if (m.deletedAt) {
    return (
      <Fragment>
        {daySeparator}
        <div className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${topGap}`} data-testid="message-bubble-deleted">
          {!mine && <span className="h-6 w-6 shrink-0" />}
          <div className={`w-fit max-w-full rounded-2xl border border-line-soft px-3 py-2 text-sm italic text-earth-subtle ${mine ? "rounded-ee-[5px]" : "rounded-es-[5px]"}`}>
            {t("messages.deletedTombstone")}
          </div>
        </div>
      </Fragment>
    );
  }

  const cat = m.broadcast && m.category ? m.category : null;
  const style = cat ? CATEGORY[cat] : null;
  const flash = cat && !mine ? "flash-attn" : "";
  const bubbleClass = style?.bubble || (mine ? "bg-gradient-brand text-brand-ink" : "bg-surface-hover text-earth");
  const attKind = m.attachment ? getAttachmentKind({ mimeType: m.attachment.mimeType, name: m.attachment.name, fallbackKind: m.attachment.kind }) : null;
  const isVisualMedia = attKind === "image" || attKind === "video";
  const reactionEntries = Object.entries(m.reactions ?? {});
  const reactionCounts = reactionEntries.reduce<Record<string, number>>((acc, [, v]) => {
    acc[v] = (acc[v] ?? 0) + 1;
    return acc;
  }, {});
  const timeStr = new Date(m.createdAt).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });

  // WhatsApp/Messenger-style trailing time — lives INSIDE its own bubble's
  // bottom edge (never a separate floating line), so it's unambiguous which
  // message it belongs to. `overlay` renders it as a small translucent chip
  // over visual media instead of in-flow.
  const timeRow = (overlay: boolean) =>
    !isEditing && (
      <span
        className={
          overlay
            ? "flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm"
            : `mt-0.5 flex items-center gap-1 self-end text-[10px] ${mine ? "text-brand-ink/70" : "text-earth/55"}`
        }
      >
        <span dir="ltr">{timeStr}</span>
        {m.editedAt && !overlay && <span>· {t("messages.edited")}</span>}
        {mine &&
          (overlay ? (
            <Icon name="check" size={10} className={m.seenAt ? "text-brand" : "text-white/70"} />
          ) : (
            <span>· {m.seenAt ? t("messages.seen") : t("messages.sent")}</span>
          ))}
      </span>
    );

  return (
    <Fragment>
      {daySeparator}
      <div
        className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${topGap} ${reactionEntries.length > 0 ? "mb-2.5" : ""}`}
        data-testid="message-bubble"
      >
        {!mine && (isLastOfGroup ? (
          <Avatar name={peerName || ""} photoUrl={peerPhotoUrl} size="xs" rounded="rounded-full" className="mb-5 shrink-0" />
        ) : (
          <span className="w-6 shrink-0" />
        ))}
        <div className={`flex min-w-0 max-w-[85%] flex-col ${mine ? "items-end" : "items-start"}`}>
          <div
            ref={(el) => {
              if (el) bubbleRefs.current.set(m.id, el);
              else bubbleRefs.current.delete(m.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              onOpenActions(m);
            }}
            className="relative"
          >
            {!isEditing && (
              <button
                type="button"
                data-testid="message-actions-trigger"
                aria-label={t("messages.moreActions")}
                onClick={() => onOpenActions(m)}
                className={`absolute -top-2 z-10 hidden h-6 w-6 items-center justify-center rounded-full bg-surface-card text-earth-subtle shadow-deep group-hover:flex md:flex ${mine ? "-start-7" : "-end-7"}`}
              >
                ⋮
              </button>
            )}
            {isEditing ? (
              <div className="w-64 max-w-full space-y-1.5 rounded-2xl border border-brand/40 bg-surface-card p-2">
                <textarea
                  ref={editRef}
                  className="input min-h-16 w-full resize-none text-sm"
                  value={editText}
                  onChange={(e) => onEditTextChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !isCoarsePointer()) {
                      e.preventDefault();
                      onSubmitEdit();
                    } else if (e.key === "Escape") onCancelEdit();
                  }}
                />
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-ghost btn-sm" onClick={onCancelEdit}>{t("common.cancel")}</button>
                  <button type="button" className="btn-primary btn-sm" disabled={!editText.trim()} onClick={onSubmitEdit}>{t("common.save")}</button>
                </div>
              </div>
            ) : isVisualMedia && m.attachment ? (
              // One contained media card — image/video, optional caption
              // INSIDE the same card, time overlaid on the media itself
              // when there's no caption to carry it in-flow instead.
              <div className="relative w-fit max-w-full overflow-hidden rounded-2xl border border-line-soft/60">
                <Attachment attachment={m.attachment} onLoad={onMediaLoad} />
                {m.body ? (
                  <div className={`flex flex-col px-3 py-2 text-sm ${bubbleClass}`}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    {timeRow(false)}
                  </div>
                ) : (
                  <div className="absolute bottom-2 end-2">{timeRow(true)}</div>
                )}
              </div>
            ) : (
              <div
                className={`flex w-fit max-w-full flex-col rounded-2xl px-3 py-2 text-sm ${mine ? "rounded-ee-[5px]" : "rounded-es-[5px]"} ${bubbleClass} ${flash}`}
                style={flash ? ({ "--flash": style?.flash } as CSSProperties) : undefined}
              >
                {cat && (
                  <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide opacity-80">
                    {t(`messages.category.${cat}`)}
                  </span>
                )}
                {m.attachment && <div className="mb-1"><Attachment attachment={m.attachment} /></div>}
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                {timeRow(false)}
              </div>
            )}

            {/* Messenger/WhatsApp-style reaction pill — overlaps THIS bubble's
                bottom corner only; never a full-width row, so it can never
                read as a message of its own. */}
            {reactionEntries.length > 0 && (
              <button
                type="button"
                data-testid="reaction-chip"
                onClick={() => onOpenActions(m)}
                aria-label={t("messages.moreActions")}
                className={`absolute -bottom-2.5 z-10 flex items-center gap-0.5 rounded-full border border-line bg-surface-raised px-1.5 py-0.5 text-[12px] shadow-deep ${mine ? "start-2" : "end-2"}`}
              >
                {Object.keys(reactionCounts).slice(0, 3).map((emoji) => (
                  <span key={emoji}>{emoji}</span>
                ))}
                {reactionEntries.length > 1 && <span className="ms-0.5 font-mono text-[10px] text-earth-subtle">{reactionEntries.length}</span>}
              </button>
            )}
          </div>
        </div>
      </div>
    </Fragment>
  );
},
(prev, next) =>
  messagesEqual(prev.m, next.m) &&
  prev.mine === next.mine &&
  prev.topGap === next.topGap &&
  prev.isLastOfGroup === next.isLastOfGroup &&
  prev.isNewDay === next.isNewDay &&
  prev.peerName === next.peerName &&
  prev.peerPhotoUrl === next.peerPhotoUrl &&
  prev.isEditing === next.isEditing &&
  (!next.isEditing || prev.editText === next.editText));

/**
 * Collision-aware floating menu for the desktop message action menu. Portals
 * to <body> and positions itself with `position: fixed` against the real
 * anchor's bounding rect, so it can never be clipped by the message thread's
 * own `overflow-y-auto` scroller — the previous CSS-only `absolute
 * bottom-full` popover was a child of that scroller and could render above
 * its visible bounds with no way to reach it except scrolling the
 * conversation itself. Renders above the bubble by default, flips below it
 * when there isn't room, and clamps horizontally within the window.
 */
function FloatingActionMenu({
  open,
  anchor,
  align,
  onClose,
  children,
}: {
  open: boolean;
  anchor: HTMLElement | null;
  /** Logical side of the anchor to align the menu's edge to ("end" for outgoing bubbles, "start" for incoming). */
  align: "start" | "end";
  onClose: () => void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; ready: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) {
      setPos(null);
      return;
    }
    const GAP = 8;
    const PAD = 8;
    const place = () => {
      const menu = menuRef.current;
      const a = anchor.getBoundingClientRect();
      const menuW = menu?.offsetWidth ?? 288;
      const menuH = menu?.offsetHeight ?? 320;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rtl = document.dir === "rtl" || getComputedStyle(document.documentElement).direction === "rtl";

      const spaceAbove = a.top;
      const spaceBelow = vh - a.bottom;
      const top =
        spaceAbove >= menuH + GAP || spaceAbove >= spaceBelow
          ? Math.max(PAD, a.top - menuH - GAP)
          : Math.min(Math.max(PAD, vh - menuH - PAD), a.bottom + GAP);

      // `align` is logical; resolve to a physical `left` off the anchor's own
      // edges, then clamp within the window so it never crosses either edge.
      const alignToRightEdge = align === "end" ? !rtl : rtl;
      let left = alignToRightEdge ? a.right - menuW : a.left;
      left = Math.min(Math.max(PAD, left), Math.max(PAD, vw - menuW - PAD));
      setPos({ top, left, ready: true });
    };
    // First pass renders off-screen (invisible) purely so `menuRef` has real
    // dimensions to measure; the second pass places it for real.
    setPos({ top: 0, left: 0, ready: false });
    const id = requestAnimationFrame(place);
    return () => cancelAnimationFrame(id);
  }, [open, anchor, align]);

  // The anchor is about to scroll away from wherever we measured it — close
  // rather than let the menu drift and detach from its message. Also close
  // on Escape or an outside click (there's no backdrop; this is meant to
  // feel light, not modal).
  useEffect(() => {
    if (!open) return;
    const onScroll = () => onClose();
    const onResize = () => onClose();
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !anchor) return null;
  return createPortal(
    <div
      ref={menuRef}
      data-testid="desktop-message-menu"
      className="fixed z-30 w-72 rounded-2xl border border-line bg-surface-raised p-2 shadow-elevated"
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos?.ready ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}

/**
 * Renders a message attachment: tappable image, inline video, audio player, or
 * file link. Recomputes the kind live from `mimeType`/`name` (falling back to
 * the persisted `kind` only if neither is present) rather than trusting the
 * stored `kind` outright — this also self-heals older messages that were
 * misclassified as generic files before the media-type detection fix.
 */
function Attachment({ attachment, onLoad }: { attachment: NonNullable<Message["attachment"]>; onLoad?: () => void }) {
  const { url, name } = attachment;
  const kind = getAttachmentKind({ mimeType: attachment.mimeType, name: attachment.name, fallbackKind: attachment.kind });
  // Image/video render bare here — the caller wraps them in one rounded,
  // clipped media card (see `isVisualMedia` above), so this never rounds or
  // margins itself; `object-contain` never crops content to fill the box.
  if (kind === "image") {
    return (
      <button type="button" className="block w-full" onClick={() => viewImages(url)}>
        <img src={url} alt={name ?? ""} className="block max-h-72 w-full max-w-full object-contain sm:max-h-80" loading="lazy" onLoad={onLoad} />
      </button>
    );
  }
  if (kind === "video") {
    return <video src={url} controls className="block max-h-72 w-full max-w-full bg-black object-contain sm:max-h-80" onLoadedMetadata={onLoad} />;
  }
  if (kind === "audio") {
    return <audio src={url} controls className="w-60 max-w-full" onLoadedMetadata={onLoad} />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-2 text-[13px] underline">
      <Icon name="download" size={16} /> {name ?? "file"}
    </a>
  );
}
