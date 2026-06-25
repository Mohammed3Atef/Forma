import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Message, MessageCategory, Role } from "@/types";
import {
  listMessages,
  markThreadSeen,
  sendMessage,
} from "@/services/platform/messagesApi";
import {
  isBunnyConfigured,
  uploadFileToBunny,
  UploadError,
} from "@/services/platform/bunnyUploadApi";
import { downscaleImage } from "@/lib/image";
import { viewImages } from "@/stores/imageViewerStore";
import { alertDialog } from "@/stores/dialogStore";
import { Icon } from "@/components/Icon";

/** Per-category bubble styling + attention-flash colour for coach broadcasts. */
const CATEGORY: Record<MessageCategory, { bubble: string; flash: string }> = {
  message: { bubble: "", flash: "" },
  announcement: {
    bubble: "border border-brand/60 bg-brand/15 text-white",
    flash: "rgba(174,126,86,0.55)",
  },
  offer: {
    bubble: "border border-success/60 bg-success/15 text-white",
    flash: "rgba(34,197,94,0.5)",
  },
  reminder: {
    bubble: "border border-warn/60 bg-warn/15 text-white",
    flash: "rgba(245,158,11,0.5)",
  },
  update: {
    bubble: "border border-sky-400/60 bg-sky-400/15 text-white",
    flash: "rgba(56,189,248,0.5)",
  },
};

/**
 * 1:1 chat thread for a client, shared by the client and coach screens. `meRole`
 * aligns bubbles (mine right) and drives the seen-receipt. Input is pinned above
 * the bottom nav. Broadcast messages are colour-coded by category and pulse to
 * draw the recipient's attention. Polls every 20s; marks seen on open.
 */
export function MessageThread({
  clientId,
  meId,
  meRole,
  embedded = false,
}: {
  clientId: string;
  meId: string;
  meRole: Role;
  /** Render inside a fixed-height pane (desktop split view): the messages
   *  scroll within their own container and the composer sticks to the pane
   *  bottom, instead of the page window + a viewport-fixed composer. */
  embedded?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const q = useQuery({
    queryKey: ["messages", clientId],
    queryFn: () => listMessages(clientId),
    enabled: !!clientId,
    refetchInterval: 20_000,
  });
  const messages = q.data ?? [];
  // Are we pinned to the newest message? Stays true on open / after sending;
  // flips false when the user scrolls up so lazy-loading media can't yank them.
  const stick = useRef(true);

  const scrollToBottom = useCallback(() => {
    if (embedded) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    } else {
      window.scrollTo({ top: document.documentElement.scrollHeight });
      const main = document.querySelector("main");
      main?.scrollTo({ top: main.scrollHeight });
    }
    stick.current = true;
  }, [embedded]);

  // Reset the pin whenever the thread changes (component is reused across routes).
  useEffect(() => {
    stick.current = true;
  }, [clientId]);

  // Track distance from the bottom so we only auto-scroll while already there.
  useEffect(() => {
    const target: HTMLElement | Window | null = embedded ? scrollRef.current : window;
    if (!target) return;
    const onScroll = () => {
      if (embedded && scrollRef.current) {
        const el = scrollRef.current;
        stick.current = el.scrollHeight - (el.scrollTop + el.clientHeight) < 120;
      } else {
        stick.current = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight) < 120;
      }
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [embedded]);

  // Re-pin after a message's image/video loads and grows the thread (the initial
  // scroll happens before media has height) — only while still at the bottom.
  const onMediaLoad = useCallback(() => {
    if (stick.current) scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => {
    if (!clientId) return;
    if (messages.some((m) => m.fromRole !== meRole && !m.seenAt)) {
      void markThreadSeen(clientId, meRole).then(() =>
        qc.invalidateQueries({ queryKey: ["messages", clientId] }),
      );
    }
    if (messages.length === 0) return;
    // Jump to the newest message on open, when I send, or while I'm already at
    // the bottom. Deferred a frame so it runs AFTER the route-change
    // <ScrollToTop> (which resets to top synchronously) and after layout.
    const lastMine = messages[messages.length - 1]?.fromRole === meRole;
    if (stick.current || lastMine) {
      const id = requestAnimationFrame(scrollToBottom);
      return () => cancelAnimationFrame(id);
    }
  }, [clientId, meRole, messages, qc, scrollToBottom]);

  const send = useMutation({
    mutationFn: () => sendMessage(clientId, { id: meId, role: meRole }, body),
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries({ queryKey: ["messages", clientId] });
    },
  });

  // Upload a picked file to the CDN and send it as an attachment (image / video
  // / document). Images are downscaled first; the current text becomes a caption.
  const onAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const isImage = file.type.startsWith("image/");
      const blob = isImage
        ? new File([await downscaleImage(file)], file.name, {
            type: "image/webp",
          })
        : file;
      const { url, kind, name, size } = await uploadFileToBunny(blob, {
        folder: `Forma/${clientId}/messages`,
      });
      await sendMessage(clientId, { id: meId, role: meRole }, body, {
        attachment: { url, kind, name, size },
      });
      setBody("");
      void qc.invalidateQueries({ queryKey: ["messages", clientId] });
    } catch (err) {
      await alertDialog({
        title: t("messages.title"),
        message: t(
          `upload.${err instanceof UploadError ? err.code : "failed"}`,
        ),
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={embedded ? "flex h-full min-h-0 flex-col" : "contents"}>
      {/* Fill the area below the header and bottom-anchor the messages, so a short
          thread sits just above the composer (no empty gap) and a long one scrolls.
          pb clears the fixed composer; main already adds pb-28 for the bottom nav.
          When embedded, the messages scroll inside their own pane container. */}
      <div
        ref={scrollRef}
        className={
          embedded
            ? "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 py-2"
            : "flex min-h-[calc(100dvh-12rem)] flex-col justify-end gap-2 pb-8 pt-2"
        }
      >
        {q.isLoading ? (
          <p className="py-8 text-center text-sm text-earth-muted">
            {t("auth.working")}
          </p>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-earth-muted">
            {t("messages.noMessages")}
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.fromRole === meRole;
            const cat = m.broadcast && m.category ? m.category : null;
            const style = cat ? CATEGORY[cat] : null;
            // Colour + pulse a broadcast for its recipient (not the sender's own copy).
            const flash = cat && !mine ? "flash-attn" : "";
            const bubbleClass =
              style?.bubble ||
              (mine
                ? "bg-brand text-slate-950"
                : "bg-surface-raised text-white");
            // Image/video render bare (no bubble background); a caption gets its own bubble.
            const media = !!m.attachment && m.attachment.kind !== "file";
            return (
              <div
                key={m.id}
                className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                data-testid="message-bubble"
              >
                {media && m.attachment ? (
                  <>
                    <div className="max-w-[80%] w-fit">
                      <Attachment attachment={m.attachment} onLoad={onMediaLoad} />
                    </div>
                    {m.body && (
                      <div className={`mt-1 max-w-[80%] w-fit rounded-2xl px-3 py-2 text-sm ${bubbleClass}`}>
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    className={`max-w-[80%] w-fit rounded-2xl px-3 py-2 text-sm ${bubbleClass} ${flash}`}
                    style={
                      flash
                        ? ({ "--flash": style?.flash } as CSSProperties)
                        : undefined
                    }
                  >
                    {cat && (
                      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide opacity-80">
                        {t(`messages.category.${cat}`)}
                      </span>
                    )}
                    {m.attachment && <Attachment attachment={m.attachment} />}
                    {m.body && (
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    )}
                  </div>
                )}
                <span className="mt-1 flex items-center gap-1.5 px-1 text-[10px] text-earth-subtle">
                  <span dir="ltr">
                    {new Date(m.createdAt).toLocaleTimeString(i18n.language, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {mine && (
                    <span>
                      · {m.seenAt ? t("messages.seen") : t("messages.sent")}
                    </span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Composer: pinned above the bottom nav on mobile; sticky to the pane
          bottom when embedded in the desktop split view. */}
      <div
        className={
          embedded
            ? "sticky bottom-0 border-t border-line bg-surface-card px-1 pt-2"
            : "fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md bg-gradient-to-t from-black from-60% to-transparent px-5 pb-[78px] pt-4"
        }
      >
        <div className={`flex items-end gap-2 pt-2 ${embedded ? "" : "bg-surface"}`}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,application/pdf"
            className="hidden"
            onChange={(e) => void onAttach(e)}
          />
          {isBunnyConfigured() && (
            <button
              type="button"
              data-testid="message-attach"
              disabled={uploading || send.isPending}
              onClick={() => fileRef.current?.click()}
              className="icon-btn h-11 w-11 shrink-0 disabled:opacity-40"
              aria-label={t("messages.attach")}
            >
              <Icon name={uploading ? "timer" : "image"} size={20} />
            </button>
          )}
          <textarea
            className="input max-h-32 min-h-11 flex-1 resize-none py-2.5"
            data-testid="message-input"
            rows={1}
            placeholder={t("messages.placeholder")}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button
            type="button"
            data-testid="message-send"
            disabled={!body.trim() || send.isPending}
            onClick={() => send.mutate()}
            className="btn-primary h-11 w-11 shrink-0 px-0 disabled:opacity-40"
            aria-label={t("messages.send")}
          >
            <Icon name="chevron" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Renders a message attachment: tappable image, inline video, or file link.
 * `onLoad` fires once the media has dimensions so the thread can re-pin to the
 * bottom (media loads after the initial scroll). */
function Attachment({
  attachment,
  onLoad,
}: {
  attachment: NonNullable<Message["attachment"]>;
  onLoad?: () => void;
}) {
  const { url, kind, name } = attachment;
  if (kind === "image") {
    return (
      <button
        type="button"
        className="mb-1 block"
        onClick={() => viewImages(url)}
      >
        <img
          src={url}
          alt={name ?? ""}
          className="max-h-60 rounded-xl object-cover"
          loading="lazy"
          onLoad={onLoad}
        />
      </button>
    );
  }
  if (kind === "video") {
    return <video src={url} controls className="mb-1 max-h-60 rounded-xl" onLoadedMetadata={onLoad} />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mb-1 flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-2 text-[13px] underline"
    >
      <Icon name="download" size={16} /> {name ?? "file"}
    </a>
  );
}
