/**
 * ValidationSummary — stage 3 of the import wizard (spec item 6).
 *
 * The read-only validation pass result: "Your data is almost ready." with
 * exact counts (valid, duplicates, unknown refs, bad rows) and the first row
 * errors. Nothing has been written yet — the user still has to press Import.
 */
import React from 'react';
import { CheckCircleFilled, ExclamationCircleFilled } from '@ant-design/icons';
import { radius, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { CoopCard } from '../../components/ui';
import type { ValidationPayload } from '../types';

export interface ValidationSummaryProps {
  validation: ValidationPayload;
}

const ValidationSummary: React.FC<ValidationSummaryProps> = ({ validation }) => {
  const { colors } = useCoopTheme();

  const dupTotal = Object.values(validation.duplicates).reduce((a, b) => a + b, 0);
  const unknownTotal = Object.values(validation.unknown_refs).reduce((a, b) => a + b, 0);
  const ambiguousTotal = Object.values(validation.ambiguous ?? {}).reduce((a, b) => a + b, 0);
  const errorTotal = validation.total_rows - validation.valid_rows;
  const clean = errorTotal === 0 && dupTotal === 0 && unknownTotal === 0 && ambiguousTotal === 0;

  const stat = (label: string, value: number, tone: 'ok' | 'warn' | 'bad') => (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: radius.md,
        background:
          tone === 'bad' ? 'rgba(186,26,26,0.06)' : tone === 'warn' ? 'rgba(224,161,6,0.06)' : 'rgba(46,158,91,0.07)',
        color: tone === 'bad' ? colors.errorText : tone === 'warn' ? colors.warningText : colors.onSurfaceVariant,
      }}
    >
      <div style={{ ...type.sectionHeading, fontSize: 22, color: tone === 'bad' ? colors.error : colors.onSurface }}>
        {value.toLocaleString()}
      </div>
      {label}
    </div>
  );

  return (
    <CoopCard
      title={clean ? 'Your data is ready to import' : 'Your data is almost ready'}
      subtitle="Co-op checked every row before writing anything. Review the summary, then import."
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          marginBottom: validation.errors.length ? 16 : 0,
          ...type.bodyCompact,
        }}
      >
        {stat('rows valid', validation.valid_rows, 'ok')}
        {stat('duplicate rows (skipped)', dupTotal, dupTotal ? 'warn' : 'ok')}
        {stat('unknown references', unknownTotal, unknownTotal ? 'warn' : 'ok')}
        {ambiguousTotal > 0 && stat('need disambiguation (name/phone)', ambiguousTotal, 'warn')}
        {stat('rows with problems', errorTotal, errorTotal ? 'bad' : 'ok')}
      </div>

      {validation.warnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {validation.warnings.map((w) => (
            <div key={w} style={{ display: 'flex', gap: 8, ...type.bodyCompact, fontSize: 12, color: colors.onSurfaceVariant }}>
              <ExclamationCircleFilled style={{ color: colors.warning, marginTop: 2 }} />
              {w}
            </div>
          ))}
        </div>
      )}

      {validation.errors.length > 0 && (
        <div>
          <div style={{ ...type.labelCaps, color: colors.onSurfaceMuted, marginBottom: 8 }}>
            First {validation.errors.length} row{validation.errors.length > 1 ? 's' : ''} with problems
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {validation.errors.map((e) => (
              <div
                key={`${e.row}-${e.detail}`}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: radius.md,
                  background: 'rgba(186,26,26,0.06)',
                  ...type.bodyCompact,
                  fontSize: 12,
                }}
              >
                <CheckCircleFilled style={{ color: colors.error, marginTop: 2 }} />
                <span style={{ color: colors.error, fontWeight: 700 }}>Row {e.row}</span>
                <span style={{ color: colors.onSurfaceVariant }}>{e.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </CoopCard>
  );
};

export default ValidationSummary;
