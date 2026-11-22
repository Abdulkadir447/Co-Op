/**
 * Reports — detail table (one per report section).
 * Numeric columns right-align with tabular figures; empty tables show a
 * calm, honest empty state.
 */
import React from 'react';
import type { ReportTable as ReportTableType } from './reportConfig';
import { useCoopTheme } from '../../theme-provider';
import { radius, type } from '../../theme';

const ReportTable: React.FC<{ table: ReportTableType }> = ({ table }) => {
  const { colors } = useCoopTheme();

  return (
    <div
      style={{
        background: colors.surfaceContainerLowest,
        border: `1px solid ${colors.borderSubtle}`,
        borderRadius: radius.lg,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 18px 10px', ...type.titleMd, color: colors.onSurface }}>
        {table.title}
      </div>
      {table.rows.length === 0 ? (
        <div style={{ padding: '8px 18px 20px', ...type.bodyCompact, color: colors.onSurfaceMuted }}>
          Nothing to show for this period (or these filters).
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', ...type.bodyCompact }}>
            <thead>
              <tr style={{ background: colors.surfaceContainerLow }}>
                {table.columns.map((c, i) => (
                  <th
                    key={c}
                    style={{
                      padding: '9px 14px',
                      textAlign: table.numeric_cols.includes(i) ? 'right' : 'left',
                      ...type.labelCaps,
                      color: colors.outline,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, ri) => (
                <tr key={ri} style={{ borderTop: `1px solid ${colors.borderSubtle}` }}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{
                        padding: '9px 14px',
                        textAlign: table.numeric_cols.includes(ci) ? 'right' : 'left',
                        color: ci === 0 ? colors.onSurface : colors.onSurfaceVariant,
                        fontWeight: ci === 0 ? 600 : 400,
                        fontVariantNumeric: table.numeric_cols.includes(ci) ? 'tabular-nums' : undefined,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {cell === null || cell === undefined || cell === '' ? '—' : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ReportTable;
