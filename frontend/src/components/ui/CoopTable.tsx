/**
 * CoopTable — the Co-op data-grid primitive (Stage R1 "Data List View").
 *
 * Wraps antd Table with the Co-op chrome: transparent header with label-caps
 * uppercase titles (via global styles), hairline row dividers, surface-tint
 * row hover, and the shared "Showing X–Y of Z" pagination footer.
 *
 * The `empty` prop drives the shared CoopEmptyState voice (title,
 * description, optional CTA) so every module's no-data / no-results look is
 * consistent; callers pick which variant applies (catalog empty vs filtered).
 */
import React from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';
import CoopEmptyState from './CoopEmptyState';

export interface CoopTableEmpty {
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}

export interface CoopTableProps<T> extends Omit<TableProps<T>, 'locale'> {
  /** No-data / no-results content. Defaults to a quiet "Nothing here yet". */
  empty?: CoopTableEmpty;
}

function buildEmpty(empty: CoopTableEmpty | undefined) {
  const e = empty ?? { title: 'Nothing here yet', compact: true };
  return <CoopEmptyState {...e} />;
}

/**
 * Between roughly 769px and 1000px the modules' fixed column widths (SKU 120 +
 * product 130 + prices 240 + stock 130 + status 130 + actions 110, plus
 * padding) exceed the content column. Without a scroll container the table
 * either clips or forces the whole page sideways (WCAG 1.4.10).
 * 'max-content' only scrolls when the columns genuinely do not fit, so wide
 * screens are unchanged; callers can still pass their own `scroll`.
 */
const DEFAULT_SCROLL = { x: 'max-content' } as const;

function CoopTableInner<T extends object>(props: CoopTableProps<T>) {
  const { empty, rowKey = 'id', pagination, scroll, ...rest } = props;

  return (
    <Table<T>
      rowKey={rowKey}
      size="middle"
      scroll={scroll ?? DEFAULT_SCROLL}
      pagination={
        pagination === false
          ? false
          : {
              showSizeChanger: false,
              showTotal: (total: number, range: [number, number]) =>
                `Showing ${range[0]}–${range[1]} of ${total}`,
              style: { padding: '8px 16px', margin: 0 },
              ...(typeof pagination === 'object' ? pagination : {}),
            }
      }
      locale={{ emptyText: buildEmpty(empty) }}
      {...rest}
    />
  );
}

const CoopTable = CoopTableInner as <T extends object>(props: CoopTableProps<T>) => React.ReactElement;

export default CoopTable;
