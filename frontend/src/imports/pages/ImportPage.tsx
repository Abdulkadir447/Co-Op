/**
 * ImportPage — the Instant Onboarding wizard (v1, spec items 1-7/14).
 *
 *   Upload + Parse ─▶ AI Mapping ─▶ Review ─▶ Validate ─▶ Import ─▶ Complete
 *
 * The AI only suggests; the user reviews; validate is read-only; commit is
 * the single explicit-confirmation write in one transaction.
 */
import React, { useCallback, useState } from 'react';
import { message } from 'antd';
import { spacing } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { useApiClient, ApiError } from '../../services/api/client';
import PageHeader from '../../components/layout/PageHeader';
import { CoopButton } from '../../components/ui';
import ImportDropzone from '../components/ImportDropzone';
import FilePreview from '../components/FilePreview';
import MappingTable from '../components/MappingTable';
import ValidationSummary from '../components/ValidationSummary';
import ImportComplete from '../components/ImportComplete';
import {
  commitImport,
  fetchImportSchema,
  mapImport,
  previewImport,
  validateImport,
} from '../services/importer';
import type {
  CommitPayload,
  MappingSuggestion,
  PreviewPayload,
  SchemaPayload,
  ValidationPayload,
} from '../types';

type Stage = 'upload' | 'mapping' | 'validation' | 'complete';

const LAST_IMPORT_KEY = 'coop:last-import';

const STAGES: Array<{ key: Stage; label: string }> = [
  { key: 'upload', label: 'Upload' },
  { key: 'mapping', label: 'Map' },
  { key: 'validation', label: 'Validate' },
  { key: 'complete', label: 'Import' },
];

const ImportPage: React.FC = () => {
  const { colors } = useCoopTheme();
  const api = useApiClient();

  const [stage, setStage] = useState<Stage>('upload');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [schemas, setSchemas] = useState<SchemaPayload | null>(null);
  const [entity, setEntity] = useState<string>('products');
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [suggestions, setSuggestions] = useState<MappingSuggestion[]>([]);
  const [validation, setValidation] = useState<ValidationPayload | null>(null);
  const [result, setResult] = useState<CommitPayload | null>(null);

  const stageIdx = STAGES.findIndex((s) => s.key === stage);

  const handleFile = useCallback(
    async (f: File) => {
      setBusy(true);
      try {
        const [previewData, schema] = await Promise.all([
          previewImport(api, f),
          fetchImportSchema(api).catch(() => null),
        ]);
        const detected = previewData.entity ?? 'products';
        const mapData = await mapImport(api, detected, previewData.columns, previewData.sample_rows);
        const m: Record<string, string | null> = {};
        mapData.mappings.forEach((s) => {
          m[s.column] = s.field;
        });
        setFile(f);
        setPreview(previewData);
        setSchemas(schema);
        setEntity(detected);
        setMapping(m);
        setSuggestions(mapData.mappings);
        setValidation(null);
        setStage('mapping');
      } catch (e) {
        message.error(e instanceof ApiError ? e.message : 'Could not read the file.');
      } finally {
        setBusy(false);
      }
    },
    [api],
  );

  const runValidation = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    try {
      const v = await validateImport(api, file, { entity, mapping });
      setValidation(v);
      setStage('validation');
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : 'Validation failed.');
    } finally {
      setBusy(false);
    }
  }, [api, file, entity, mapping]);

  const runCommit = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await commitImport(api, file, { entity, mapping });
      setResult(r);
      try {
        sessionStorage.setItem(LAST_IMPORT_KEY, JSON.stringify(r));
      } catch {
        /* non-fatal */
      }
      setStage('complete');
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : 'The import failed and was rolled back.');
    } finally {
      setBusy(false);
    }
  }, [api, file, entity, mapping]);

  const restart = () => {
    setStage('upload');
    setFile(null);
    setPreview(null);
    setSchemas(null);
    setMapping({});
    setSuggestions([]);
    setValidation(null);
    setResult(null);
  };

  const validRows = validation?.valid_rows ?? 0;

  return (
    <div style={{ maxWidth: 960 }}>
      <PageHeader
        title="Import your business data"
        subtitle="Bring your history from your old system. Co-op maps the columns, you confirm, and your Day 1 Briefing is ready."
      />

      {/* Stage indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: spacing.lg }}>
        {STAGES.map((s, i) => {
          const done = i < stageIdx;
          const active = i === stageIdx;
          return (
            <React.Fragment key={s.key}>
              {i > 0 && <span aria-hidden style={{ width: 24, height: 2, background: colors.borderSubtle }} />}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '6px 12px',
                  borderRadius: 9999,
                  background: active ? colors.primary : done ? colors.primaryFixed : colors.surfaceContainerLow,
                  color: active ? colors.onPrimary : done ? colors.onPrimaryFixedVariant : colors.onSurfaceVariant,
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: active ? 'rgba(255,255,255,0.25)' : done ? colors.primary : colors.surfaceContainer,
                    color: active || done ? colors.onPrimary : colors.outline,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {done ? '✓' : i + 1}
                </span>
                {s.label}
              </span>
            </React.Fragment>
          );
        })}
      </div>

      {stage === 'upload' && (
        <ImportDropzone onFile={handleFile} busy={busy} />
      )}

      {stage === 'mapping' && preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          <FilePreview
            preview={preview}
            schemas={schemas}
            entity={entity}
            onEntityChange={(e) => {
              setEntity(e);
              // Re-run the mapper for the newly chosen entity.
              void mapImport(api, e, preview.columns, preview.sample_rows)
                .then((m) => {
                  setSuggestions(m.mappings);
                  const mm: Record<string, string | null> = {};
                  m.mappings.forEach((s) => {
                    mm[s.column] = s.field;
                  });
                  setMapping(mm);
                })
                .catch((e) => message.error(e instanceof ApiError ? e.message : 'Mapping failed.'));
            }}
          />
          <MappingTable
            suggestions={suggestions}
            entity={entity}
            schemas={schemas}
            mapping={mapping}
            onMappingChange={setMapping}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <CoopButton variant="secondary" onClick={restart}>
              Start over
            </CoopButton>
            <CoopButton loading={busy} onClick={runValidation}>
              Validate data
            </CoopButton>
          </div>
        </div>
      )}

      {stage === 'validation' && validation && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          <ValidationSummary validation={validation} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <CoopButton variant="secondary" onClick={() => setStage('mapping')}>
              Back to mapping
            </CoopButton>
            <CoopButton loading={busy} onClick={runCommit}>
              {busy ? 'Importing…' : `Import ${validRows.toLocaleString()} rows`}
            </CoopButton>
          </div>
        </div>
      )}

      {stage === 'complete' && result && (
        <ImportComplete result={result} onRestart={restart} />
      )}
    </div>
  );
};

export default ImportPage;
