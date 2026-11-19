/**
 * ImportComplete — stage 4 of the import wizard (spec items 7/11).
 *
 * The commit result: created / skipped counts, warnings, any skipped-row
 * errors, and the CTA into the Day 1 Morning Briefing (the "Co-op already
 * understands my business" moment).
 */
import React from 'react';
import { ExclamationCircleFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { radius, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { CoopButton, CoopCard, CoopEmptyState } from '../../components/ui';
import type { CommitPayload } from '../types';

export interface ImportCompleteProps {
  result: CommitPayload;
  onRestart: () => void;
}

const ImportComplete: React.FC<ImportCompleteProps> = ({ result, onRestart }) => {
  const { colors } = useCoopTheme();
  const navigate = useNavigate();
  const createdTotal = Object.values(result.created).reduce((a, b) => a + b, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {createdTotal === 0 ? (
        <CoopCard>
          <CoopEmptyState
            title="Nothing was imported"
            description={
              result.errors.length > 0
                ? 'Every row had a problem — see the details below.'
                : 'All rows already existed or were skipped. See the skipped counts below.'
            }
          />
        </CoopCard>
      ) : (
        <CoopCard
          title="Import complete"
          subtitle={`Co-op imported ${createdTotal.toLocaleString()} record${createdTotal === 1 ? '' : 's'} from ${result.total_rows.toLocaleString()} rows (batch #${result.batch_id}).`}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 12,
              marginBottom: 16,
              ...type.bodyCompact,
            }}
          >
            {Object.entries(result.created)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    padding: '12px 16px',
                    borderRadius: radius.md,
                    background: colors.primaryFixed,
                    color: colors.onPrimaryFixedVariant,
                  }}
                >
                  <div style={{ ...type.sectionHeading, fontSize: 22, color: colors.onPrimaryFixedVariant }}>
                    {v.toLocaleString()}
                  </div>
                  {k.replace(/_/g, ' ')}
                </div>
              ))}
            {Object.entries(result.skipped)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => (
                <div
                  key={k}
                  style={{
                          padding: '12px 16px',
                          borderRadius: radius.md,
                          background: colors.surfaceContainerLow,
                          color: colors.onSurfaceVariant,
                        }}
                >
                  <div style={{ ...type.sectionHeading, fontSize: 22, color: colors.onSurface }}>
                    {v.toLocaleString()}
                  </div>
                  {k.replace(/_/g, ' ')} skipped
                </div>
              ))}
          </div>

          {result.warnings.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {result.warnings.map((w) => (
                <div
                  key={w}
                  style={{ display: 'flex', gap: 8, ...type.bodyCompact, fontSize: 12, color: colors.onSurfaceVariant }}
                >
                  <ExclamationCircleFilled style={{ color: colors.warning, marginTop: 2 }} />
                  {w}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <CoopButton variant="secondary" onClick={onRestart}>
              Import another file
            </CoopButton>
            <CoopButton onClick={() => navigate('/briefing')}>View your Day 1 Briefing</CoopButton>
          </div>
        </CoopCard>
      )}

      {result.errors.length > 0 && (
        <CoopCard title="Rows that couldn't be imported" subtitle="These rows were skipped — fix them in the source file and re-import.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {result.errors.map((e) => (
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
                <span style={{ color: colors.error, fontWeight: 700 }}>Row {e.row}</span>
                <span style={{ color: colors.onSurfaceVariant }}>{e.detail}</span>
              </div>
            ))}
          </div>
        </CoopCard>
      )}
    </div>
  );
};

export default ImportComplete;
