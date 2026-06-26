import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * Action bar for bulk operations on a selectable list. Renders only when one or
 * more rows are selected. FIXED + centered at the bottom of the viewport (above
 * the mobile tab bar) so it's always visible — no scrolling to the end of a long
 * list to act on a selection. Centered so it never collides with the corner FAB.
 */
export function BulkActionBar({
  count,
  onClear,
  children,
  className = "",
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  return (
    <div
      data-testid="bulk-action-bar"
      className={`fixed bottom-[88px] left-1/2 z-50 flex w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 items-center gap-2 overflow-x-auto rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-elevated backdrop-blur-md md:bottom-6 ${className}`}
    >
      <span className="shrink-0 text-sm font-semibold" data-testid="bulk-count">
        {t("common.bulk.selected", { n: count })}
      </span>
      <div className="flex flex-1 items-center justify-end gap-2">
        {children}
        <button
          type="button"
          data-testid="bulk-clear"
          onClick={onClear}
          className="chip shrink-0"
        >
          {t("common.bulk.clear")}
        </button>
      </div>
    </div>
  );
}
