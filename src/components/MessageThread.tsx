import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { Message, MessageCategory, Role } from "@/types";
import {
  markThreadSeen,
  sendMessage,
  subscribeMessages,
} from "@/services/platform/messagesApi";
import { markMessageNotificationsSeen } from "@/services/platform/notificationsApi";
import {
  isBunnyConfigured,
  uploadFileToBunny,
  UploadError,
} from "@/services/platform/bunnyUploadApi";
import { downscaleImage } from "@/lib/image";
import { viewImages } from "@/stores/imageViewerStore";
import { alertDialog } from "@/stores/dialogStore";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";

/** Format an elapsed-seconds count as m:ss for the recording indicator. */
function fmtElapsed(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Per-category bubble styling + attention-flash colour for coach broadcasts. */
const CATEGORY: Record<MessageCategory, { bubble: string; flash: string }> = {
  message: { bubble: "", flash: "" },
  announcement: { bubble: "border border-brand/60 bg-brand/15 text-white", flash: "rgba(229,82,15,0.55)" },
  offer: { bubble: "border border-success/60 bg-success/15 text-white", flash: "rgba(34,197,94,0.5)" },
  reminder: { bubble: "border border-warn/60 bg-warn/15 text-white", flash: "rgba(245,158,11,0.5)" },
  update: { bubble: "border border-sky-400/60 bg-sky-400/15 text-white", flash: "rgba(56,189,248,0.5)" },
};

/**
 * Canonical 1:1 chat thread — shared by the coach and client screens. ONE layout
 * everywhere: a full-height flex column whose message list scrolls internally and
 * whose composer sits in-flow at the bottom. The parent must give it height
 * (the desktop split card, or the standalone page's full-height wrapper).
 * Real-time via Firestore `onSnapshot`; marks the other party's messages seen on open.
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
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const voice = useVoiceRecorder();
  // Pinned to newest? Stays true on open / after sending; flips false on scroll-up.
  const stick = useRef(true);

  // Real-time thread subscription.
  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    stick.current = true;
    const unsub = subscribeMessages(clientId, (msgs) => {
      setMessages(msgs);
      setLoading(false);
    });
    return unsub;
  }, [clientId]);

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

  // Mark the other party's messages seen + auto-scroll to newest when appropriate.
  useEffect(() => {
    if (!clientId || messages.length === 0) return;
    if (messages.some((m) => m.fromRole !== meRole && !m.seenAt)) {
      void markThreadSeen(clientId, meRole);
      // Clear the matching in-app notifications so the bell/feed stay in sync.
      void markMessageNotificationsSeen(clientId, meRole === "coach" ? "coach" : "client");
    }
    const lastMine = messages[messages.length - 1]?.fromRole === meRole;
    if (stick.current || lastMine) {
      const id = requestAnimationFrame(scrollToBottom);
      return () => cancelAnimationFrame(id);
    }
  }, [clientId, meRole, messages, scrollToBottom]);

  const doSend = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setBody(""); // optimistic clear; onSnapshot reflects the sent message
    try {
      await sendMessage(clientId, { id: meId, role: meRole }, text);
      stick.current = true;
    } catch {
      setBody(text); // restore on failure
    } finally {
      setSending(false);
    }
  };

  // Upload a file (image downscaled to WebP; others as-is) and send it as an
  // attachment alongside any typed text. Shared by the file picker + voice notes.
  const uploadAndSend = async (file: File, opts?: { downscale?: boolean }) => {
    setUploading(true);
    try {
      const blob =
        opts?.downscale && file.type.startsWith("image/")
          ? new File([await downscaleImage(file)], file.name, { type: "image/webp" })
          : file;
      const { url, kind, name, size } = await uploadFileToBunny(blob, { folder: `Forma/${clientId}/messages` });
      await sendMessage(clientId, { id: meId, role: meRole }, body, { attachment: { url, kind, name, size } });
      setBody("");
      stick.current = true;
    } catch (err) {
      await alertDialog({ title: t("messages.title"), message: t(`upload.${err instanceof UploadError ? err.code : "failed"}`) });
    } finally {
      setUploading(false);
    }
  };

  const onAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await uploadAndSend(file, { downscale: true });
  };

  const startVoice = async () => {
    if (!(await voice.start())) await alertDialog({ title: t("messages.title"), message: t("messages.micDenied") });
  };
  const stopVoice = async () => {
    const file = await voice.stop();
    if (file) await uploadAndSend(file);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="message-thread">
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1 py-2">
        {loading ? (
          <p className="m-auto py-8 text-center text-sm text-earth-muted">{t("auth.working")}</p>
        ) : messages.length === 0 ? (
          <p className="m-auto py-10 text-center text-sm text-earth-muted">{t("messages.noMessages")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m) => {
            const mine = m.fromRole === meRole;
            const cat = m.broadcast && m.category ? m.category : null;
            const style = cat ? CATEGORY[cat] : null;
            const flash = cat && !mine ? "flash-attn" : "";
            const bubbleClass = style?.bubble || (mine ? "bg-brand text-slate-950" : "bg-surface-raised text-white");
            const media = !!m.attachment && m.attachment.kind !== "file";
            return (
              <div key={m.id} className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`} data-testid="message-bubble">
                {!mine && (
                  <Avatar name={peer?.name || ""} photoUrl={peer?.photoUrl} size="xs" rounded="rounded-full" className="mb-5 shrink-0" />
                )}
                <div className={`flex min-w-0 flex-col ${mine ? "items-end" : "items-start"}`}>
                  {media && m.attachment ? (
                    <>
                      <div className="w-fit max-w-full">
                        <Attachment attachment={m.attachment} onLoad={onMediaLoad} />
                      </div>
                      {m.body && (
                        <div className={`mt-1 w-fit max-w-full rounded-2xl px-3 py-2 text-sm ${bubbleClass}`}>
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div
                      className={`w-fit max-w-full rounded-2xl px-3 py-2 text-sm ${bubbleClass} ${flash}`}
                      style={flash ? ({ "--flash": style?.flash } as CSSProperties) : undefined}
                    >
                      {cat && (
                        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide opacity-80">
                          {t(`messages.category.${cat}`)}
                        </span>
                      )}
                      {m.attachment && <Attachment attachment={m.attachment} />}
                      {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    </div>
                  )}
                  <span className="mt-1 flex items-center gap-1.5 px-1 text-[10px] text-earth-subtle">
                    <span dir="ltr">{new Date(m.createdAt).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}</span>
                    {mine && <span>· {m.seenAt ? t("messages.seen") : t("messages.sent")}</span>}
                  </span>
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>

      {/* Composer — in-flow at the bottom of the full-height column. */}
      <div className="shrink-0 border-t border-line bg-surface-card px-1 pb-1 pt-2">
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
              <span className="font-mono tabular-nums" dir="ltr">{fmtElapsed(voice.seconds)}</span>
              <span className="truncate">{t("messages.recording")}</span>
            </div>
            <button
              type="button"
              data-testid="voice-send"
              disabled={uploading}
              onClick={() => void stopVoice()}
              className="btn-primary h-11 w-11 shrink-0 px-0 disabled:opacity-40"
              aria-label={t("messages.stopRecording")}
            >
              <Icon name={uploading ? "timer" : "check"} size={20} />
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept="image/*,video/*,application/pdf" className="hidden" onChange={(e) => void onAttach(e)} />
            {isBunnyConfigured() && (
              <button
                type="button"
                data-testid="message-attach"
                disabled={uploading || sending}
                onClick={() => fileRef.current?.click()}
                className="icon-btn h-11 w-11 shrink-0 disabled:opacity-40"
                aria-label={t("messages.attach")}
              >
                <Icon name={uploading ? "timer" : "image"} size={20} />
              </button>
            )}
            {isBunnyConfigured() && voice.supported && (
              <button
                type="button"
                data-testid="voice-record"
                disabled={uploading || sending}
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
              placeholder={t("messages.placeholder")}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void doSend(); } }}
            />
            <button
              type="button"
              data-testid="message-send"
              disabled={!body.trim() || sending}
              onClick={() => void doSend()}
              className="btn-primary h-11 w-11 shrink-0 px-0 disabled:opacity-40"
              aria-label={t("messages.send")}
            >
              <Icon name="chevron" size={20} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Renders a message attachment: tappable image, inline video, or file link. */
function Attachment({ attachment, onLoad }: { attachment: NonNullable<Message["attachment"]>; onLoad?: () => void }) {
  const { url, kind, name } = attachment;
  if (kind === "image") {
    return (
      <button type="button" className="mb-1 block" onClick={() => viewImages(url)}>
        <img src={url} alt={name ?? ""} className="max-h-60 rounded-xl object-cover" loading="lazy" onLoad={onLoad} />
      </button>
    );
  }
  if (kind === "video") {
    return <video src={url} controls className="mb-1 max-h-60 rounded-xl" onLoadedMetadata={onLoad} />;
  }
  if (kind === "audio") {
    return <audio src={url} controls className="mb-1 w-60 max-w-full" onLoadedMetadata={onLoad} />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-2 text-[13px] underline">
      <Icon name="download" size={16} /> {name ?? "file"}
    </a>
  );
}
