/**
 * Report an issue — where an owner tells the Co-op team something is wrong,
 * at any time.
 *
 * The counterpart to the periodic feedback prompt (FeedbackModal): feedback is
 * something Co-op *asks for* on a three-week cadence, this is raised the moment
 * something breaks. A report POSTs to /support/issues, which stores it against
 * the business and emails the support inbox; the page then lists what this
 * business has already sent, so the same problem is not reported twice.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Input, Select } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { useUser } from '@clerk/react';
import { radius, spacing, type as typeScale } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import PageHeader from '../../components/layout/PageHeader';
import { CoopButton, CoopEmptyState, CoopLoading } from '../../components/ui';
import { useApiClient } from '../../services/api/client';

interface IssueReport {
  id: number;
  category: string;
  severity: string;
  subject: string;
  status: string;
  created_at: string | null;
}

const CATEGORIES = [
  { value: 'bug', label: 'Something is broken' },
  { value: 'data', label: 'Data looks wrong' },
  { value: 'import', label: 'CSV import' },
  { value: 'billing', label: 'Billing or subscription' },
  { value: 'performance', label: 'Slow or freezing' },
  { value: 'feature', label: 'Feature request' },
  { value: 'other', label: 'Something else' },
];

const SEVERITIES = [
  { value: 'low', label: 'Low — a minor annoyance' },
  { value: 'normal', label: 'Normal — I can work around it' },
  { value: 'high', label: 'High — it blocks my work' },
  { value: 'critical', label: 'Critical — I cannot use Co-op' },
];

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));
const STATUS_LABEL: Record<string, string> = {
  new: 'Received',
  triaged: 'In progress',
  resolved: 'Resolved',
};

const SupportPage: React.FC = () => {
  const { colors } = useCoopTheme();
  const api = useApiClient();
  const { user } = useUser();

  const [category, setCategory] = useState('bug');
  const [severity, setSeverity] = useState('normal');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [reports, setReports] = useState<IssueReport[] | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<IssueReport[]>('/support/issues');
      setReports(data);
    } catch {
      setReports([]); // the form still works if the history cannot be read
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  // Prefill the reply-to from the signed-in account; it stays editable.
  useEffect(() => {
    const email = user?.primaryEmailAddress?.emailAddress;
    if (email) setContactEmail((prev) => prev || email);
  }, [user]);

  const label = (text: string, hint?: string) => (
    <div style={{ marginBottom: 6 }}>
      <span style={{ ...typeScale.labelCaps, color: colors.onSurfaceVariant }}>{text}</span>
      {hint && (
        <span style={{ ...typeScale.bodyCompact, color: colors.outline, marginLeft: 6 }}>
          {hint}
        </span>
      )}
    </div>
  );

  const submit = async () => {
    if (subject.trim().length < 3) {
      setError('Please add a short subject so we know what this is about.');
      return;
    }
    if (description.trim().length < 10) {
      setError('Please describe the problem — a sentence or two is plenty.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.post('/support/issues', {
        category,
        severity,
        subject: subject.trim(),
        description: description.trim(),
        contact_email: contactEmail.trim() || null,
        platform: 'web',
      });
      setSubject('');
      setDescription('');
      setSent(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const card: React.CSSProperties = {
    background: colors.surfaceContainerLowest,
    border: `1px solid ${colors.surfaceContainerHigh}`,
    borderRadius: radius.lg,
    padding: spacing.lg,
  };

  return (
    <div>
      <PageHeader
        title="Report an issue"
        subtitle="Something wrong? Tell us — it goes straight to the Co-op team."
      />

      <div style={{ display: 'grid', gap: spacing.md, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div style={card}>
          {sent && (
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              message="Thanks — your report is with us."
              description="We read every report. If you left a reply-to address we'll email you when there's news."
              style={{ marginBottom: spacing.md }}
              closable
              onClose={() => setSent(false)}
            />
          )}

          <div style={{ display: 'grid', gap: spacing.md, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div>
              {label('What is it about?')}
              <Select
                value={category}
                onChange={setCategory}
                options={CATEGORIES}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              {label('How badly is it affecting you?')}
              <Select
                value={severity}
                onChange={setSeverity}
                options={SEVERITIES}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ marginTop: spacing.md }}>
            {label('Subject', '(required)')}
            <Input
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Stock count doubled after my CSV import"
              maxLength={200}
            />
          </div>

          <div style={{ marginTop: spacing.md }}>
            {label('What happened?', '(required)')}
            <Input.TextArea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (error) setError('');
              }}
              placeholder={
                'Tell us what you did, what you expected, and what happened instead. ' +
                'Screenshots are not needed — the more detail, the faster we can fix it.'
              }
              autoSize={{ minRows: 5, maxRows: 12 }}
              maxLength={8000}
            />
          </div>

          <div style={{ marginTop: spacing.md }}>
            {label('Where should we reply?', '(optional)')}
            <Input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="you@yourbusiness.com"
              maxLength={255}
            />
          </div>

          {error && (
            <div style={{ ...typeScale.bodyCompact, color: colors.error, marginTop: spacing.sm }}>
              {error}
            </div>
          )}

          <div style={{ marginTop: spacing.lg }}>
            <CoopButton onClick={submit} loading={submitting} disabled={submitting}>
              Send report
            </CoopButton>
          </div>
        </div>

        <div style={card}>
          <div style={{ ...typeScale.labelCaps, color: colors.onSurfaceVariant, marginBottom: spacing.sm }}>
            Your recent reports
          </div>
          {reports === null ? (
            <CoopLoading />
          ) : reports.length === 0 ? (
            <CoopEmptyState
              title="Nothing sent yet"
              description="Reports you send from this page appear here."
            />
          ) : (
            <div style={{ display: 'grid', gap: spacing.sm }}>
              {reports.slice(0, 10).map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: spacing.xs,
                    padding: `${spacing.sm}px 0`,
                    borderTop: `1px solid ${colors.surfaceContainerHigh}`,
                  }}
                >
                  <span style={{ ...typeScale.bodyDefault, color: colors.onSurface }}>{r.subject}</span>
                  <span style={{ ...typeScale.bodyCompact, color: colors.outline }}>
                    {CATEGORY_LABEL[r.category] || r.category} ·{' '}
                    {STATUS_LABEL[r.status] || r.status}
                    {r.created_at ? ` · ${new Date(r.created_at).toLocaleDateString()}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportPage;
