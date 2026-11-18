/**
 * ImportDropzone — stage 1 of the import wizard (spec item 1).
 *
 * Large drag & drop target for .csv / .xlsx. Nothing is written until the
 * user reviews the mapping and explicitly confirms.
 */
import React, { useRef, useState } from 'react';
import { InboxOutlined, UploadOutlined } from '@ant-design/icons';
import { message } from 'antd';
import { radius, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { CoopButton } from '../../components/ui';

export interface ImportDropzoneProps {
  onFile: (file: File) => void;
  busy: boolean;
}

const ACCEPT = '.csv,.xlsx,.txt';

const ImportDropzone: React.FC<ImportDropzoneProps> = ({ onFile, busy }) => {
  const { colors } = useCoopTheme();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = (file: File | undefined) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.txt')) {
      message.error('Use a .csv or .xlsx file.');
      return;
    }
    onFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        accept(e.dataTransfer.files?.[0]);
      }}
      style={{
        border: `2px dashed ${dragOver ? colors.primary : colors.outlineVariant}`,
        borderRadius: radius.xl,
        padding: '56px 24px',
        textAlign: 'center',
        background: dragOver ? colors.primaryFixed : colors.surfaceContainerLow,
        transition: 'all 150ms',
      }}
    >
      <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e) => accept(e.target.files?.[0])} />
      <span
        aria-hidden
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: colors.primaryFixed,
          color: colors.onPrimaryFixedVariant,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          marginBottom: 16,
        }}
      >
        <InboxOutlined />
      </span>
      <div style={{ ...type.titleMd, color: colors.onSurface, marginBottom: 6 }}>
        Drop your spreadsheet here
      </div>
      <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, marginBottom: 18 }}>
        CSV or Excel (.xlsx) export — products, customers or sales history.
      </div>
      <CoopButton icon={<UploadOutlined />} loading={busy} onClick={() => inputRef.current?.click()}>
        {busy ? 'Reading file…' : 'Browse files'}
      </CoopButton>
      <div style={{ ...type.bodyCompact, fontSize: 12, color: colors.onSurfaceMuted, marginTop: 14 }}>
        Excel: first worksheet only, clean tables. Nothing is written until you review the mapping.
      </div>
    </div>
  );
};

export default ImportDropzone;
