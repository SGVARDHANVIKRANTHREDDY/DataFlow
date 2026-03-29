/**
 * VirtualTable v11.1
 *
 * Performance: renders only visible rows — handles 100K+ rows without lag.
 * Uses a simple manual virtualization (no external deps needed).
 * For production at >50K rows, swap internals with @tanstack/react-virtual.
 *
 * Accessibility:
 * - aria-rowcount reflects total rows, not visible rows
 * - aria-rowindex on each row
 * - role="grid" for keyboard navigation
 * - Row focus-within styles
 */
"use client";

import {
  useRef, useState, useEffect, useCallback,
  type ReactNode, memo
} from "react";
import { cn } from "@/lib/utils/cn";

export interface VirtualColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  width?: number | string;
  align?: "left" | "right" | "center";
  sortable?: boolean;
}

interface VirtualTableProps<T> {
  data: T[];
  columns: VirtualColumn<T>[];
  rowHeight?: number;
  overscan?: number;
  maxHeight?: number;
  loading?: boolean;
  emptyState?: ReactNode;
  onRowClick?: (row: T, index: number) => void;
  getRowKey: (row: T, index: number) => string | number;
  className?: string;
  "aria-label"?: string;
}

const DEFAULT_ROW_HEIGHT = 48;
const DEFAULT_OVERSCAN = 5;
const DEFAULT_MAX_HEIGHT = 520;

function VirtualTableInner<T>({
  data,
  columns,
  rowHeight = DEFAULT_ROW_HEIGHT,
  overscan = DEFAULT_OVERSCAN,
  maxHeight = DEFAULT_MAX_HEIGHT,
  loading,
  emptyState,
  onRowClick,
  getRowKey,
  className,
  "aria-label": ariaLabel,
}: VirtualTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const totalHeight = data.length * rowHeight;
  const containerHeight = Math.min(maxHeight, totalHeight + 1);

  // Calculate visible range
  const visibleStart = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleEnd = Math.min(
    data.length - 1,
    Math.floor((scrollTop + containerHeight) / rowHeight) + overscan
  );
  const visibleRows = data.slice(visibleStart, visibleEnd + 1);
  const offsetY = visibleStart * rowHeight;

  if (loading) {
    return (
      <div className={cn("overflow-hidden rounded-b-xl", className)}>
        <table className="data-table" role="grid">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={{ width: col.width, textAlign: col.align }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} aria-hidden="true">
                {columns.map((col) => (
                  <td key={col.key}>
                    <div
                      className="skeleton h-3.5 rounded"
                      style={{ width: `${50 + ((i * col.key.length * 3) % 50)}%` }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!data.length && emptyState) {
    return <div>{emptyState}</div>;
  }

  return (
    <div
      ref={containerRef}
      className={cn("overflow-auto virtual-container", className)}
      style={{ maxHeight: containerHeight }}
      onScroll={handleScroll}
    >
      <table
        className="data-table"
        role="grid"
        aria-label={ariaLabel}
        aria-rowcount={data.length}
        style={{ height: totalHeight, tableLayout: "fixed" }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width, textAlign: col.align }}
                scope="col"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody style={{ position: "relative" }}>
          {/* Spacer before visible rows */}
          {offsetY > 0 && (
            <tr aria-hidden="true" style={{ height: offsetY }}>
              <td colSpan={columns.length} />
            </tr>
          )}

          {visibleRows.map((row, relativeIndex) => {
            const absoluteIndex = visibleStart + relativeIndex;
            const key = getRowKey(row, absoluteIndex);

            return (
              <tr
                key={key}
                aria-rowindex={absoluteIndex + 1}
                tabIndex={onRowClick ? 0 : -1}
                onClick={onRowClick ? () => onRowClick(row, absoluteIndex) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row, absoluteIndex);
                        }
                      }
                    : undefined
                }
                className={cn(onRowClick && "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500")}
                style={{ height: rowHeight }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{ textAlign: col.align }}
                  >
                    {col.cell(row, absoluteIndex)}
                  </td>
                ))}
              </tr>
            );
          })}

          {/* Spacer after visible rows */}
          {totalHeight - (offsetY + visibleRows.length * rowHeight) > 0 && (
            <tr
              aria-hidden="true"
              style={{ height: totalHeight - (offsetY + visibleRows.length * rowHeight) }}
            >
              <td colSpan={columns.length} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export const VirtualTable = memo(VirtualTableInner) as typeof VirtualTableInner;
