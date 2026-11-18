/**
 * MappingTable — stage 2 of the import wizard (spec item 5).
 *
 * Shows the AI's suggested column -> Co-op field mapping with a confidence
 * badge per column. Uncertain columns are flagged "Needs review". The user
 * can re-target or ignore any column. The AI is an assistant, not the
 * authority — nothing is imported until the user confirms after validation.
 */
import React from 'react';
import { radius, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { CoopBadge, CoopCard } from '../../components/ui';
import type { MappingSuggestion, SchemaPayload } from '../types';

export interface MappingTableProps {
  suggestions: MappingSuggestion[];
  entity: string;
  schemas: SchemaPayload | null;
  /** { source_column: target_field_key | null } — user-editable. */
  mapping: Record<string, string | null>;
  onMappingChange: (mapping: Record<string, string | null>) => void;
}

const CONFIDENCE_VARIANT: Record<MappingSuggestion['label'], 'primary' | 'info' | 'warning'> = {
  High: 'primary',
  Medium: 'info',
  Review: 'warning',
};

const MappingTable: React.FC<MappingTableProps> = ({
  suggestions,
  entity,
  schemas,
  mapping,
  onMappingChange,
}) => {
  const { colors } = useCoopTheme();
  const fields = schemas?.datasets[entity]?.fields ?? {};
  const matched = suggestions.filter((s) => mapping[s.column]).length;
  const needsReview = suggestions.filter((s) => !mapping[s.column]).length;
  const requiredMissing = Object.entries(fields)
    .filter(([, f]) => f.required)
    .filter(([key]) => !suggestions.some((s) => mapping[s.column] === key)).length;

  const setField = (column: string, field: string | null) =>
    onMappingChange({ ...mapping, [column]: field });

  return (
    <CoopCard
      title="Check the column mapping"
      subtitle="Co-op suggested these matches — adjust any of them, or ignore a column."
    >
      <div style={{ ...type.bodyCompact, marginBottom: 12, color: colors.onSurfaceVariant }}>
        <strong style={{ color: colors.onSurface }}>{matched}</strong> of {suggestions.length} columns
        matched
        {needsReview > 0 ? (
          <> — <strong style={{ color: colors.warningText }}>{needsReview} need your review</strong></>
        ) : (
          ' ✓'
        )}
        {requiredMissing > 0 && (
          <> · <strong style={{ color: colors.error }}>{requiredMissing} required field{requiredMissing > 1 ? 's' : ''} unmapped</strong></>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {suggestions.map((s) => {
          const unmapped = !mapping[s.column];
          return (
            <div
              key={s.column}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: radius.md,
                border: `1px solid ${unmapped ? 'rgba(224, 161, 6, 0.45)' : colors.borderSubtle}`,
                background: unmapped ? 'rgba(224, 161, 6, 0.06)' : 'transparent',
              }}
            >
              <span
                style={{
                  ...type.bodyCompact,
                  fontWeight: 600,
                  color: colors.onSurface,
                  minWidth: 140,
                  maxWidth: 220,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {s.column}
              </span>
              <span aria-hidden style={{ color: colors.outline }}>→</span>
              <select
                value={mapping[s.column] ?? ''}
                onChange={(e) => setField(s.column, e.target.value || null)}
                aria-label={`Target field for ${s.column}`}
                style={{
                  flex: 1,
                  minWidth: 180,
                  border: `1px solid ${colors.outlineVariant}`,
                  borderRadius: radius.md,
                  padding: '6px 10px',
                  background: colors.surfaceContainerLowest,
                  color: colors.onSurface,
                  fontSize: 13,
                }}
              >
                <option value="">— Ignore this column —</option>
                {Object.entries(fields).map(([k, f]) => (
                  <option key={k} value={k}>
                    {f.label}
                    {f.required ? ' *' : ''}
                  </option>
                ))}
              </select>
              <CoopBadge variant={CONFIDENCE_VARIANT[s.label]}>
                {unmapped ? 'Needs review' : s.label}
              </CoopBadge>
              {s.hints[0] && (
                <span style={{ ...type.bodyCompact, fontSize: 11.5, color: colors.outline, width: '100%', marginLeft: 44 }}>
                  {s.hints[0]}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </CoopCard>
  );
};

export default MappingTable;
