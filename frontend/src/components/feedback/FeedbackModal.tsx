/**
 * FeedbackModal — the periodic "how are we doing?" prompt.
 *
 * Shown by the AppShell three weeks after the paid relationship begins. The
 * first prompt is compulsory (`required`): it cannot be closed, masked-out or
 * ESC'd away, and the "how are you finding Co-op" answer is mandatory. Later
 * prompts are skippable. Answers POST to /feedback; a skip POSTs
 * /feedback/dismiss so the prompt waits for the next three-week window.
 */
import React, { useState } from 'react';
import { Input, Rate } from 'antd';
import CoopModal from '../ui/CoopModal';
import { useCoopTheme } from '../../theme-provider';
import { spacing, type as typeScale } from '../../theme';

export interface FeedbackValues {
  rating?: number;
  overall?: string;
  likes?: string;
  issues?: string;
  improvements?: string;
}

export interface FeedbackModalProps {
  open: boolean;
  /** First prompt = compulsory: no close, no skip, "overall" is required. */
  required: boolean;
  submitting?: boolean;
  onSubmit: (values: FeedbackValues) => void;
  onSkip: () => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({
  open,
  required,
  submitting = false,
  onSubmit,
  onSkip,
}) => {
  const { colors } = useCoopTheme();
  const [rating, setRating] = useState(0);
  const [overall, setOverall] = useState('');
  const [likes, setLikes] = useState('');
  const [issues, setIssues] = useState('');
  const [improvements, setImprovements] = useState('');
  const [error, setError] = useState('');

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

  const field = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    rows = 2,
  ) => (
    <Input.TextArea
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        if (error) setError('');
      }}
      placeholder={placeholder}
      autoSize={{ minRows: rows, maxRows: 5 }}
      style={{ marginBottom: spacing.md }}
    />
  );

  const submit = () => {
    if (required && !overall.trim()) {
      setError('Please tell us how you’re finding Co-op — this first check-in is required.');
      return;
    }
    onSubmit({
      rating: rating || undefined,
      overall: overall.trim() || undefined,
      likes: likes.trim() || undefined,
      issues: issues.trim() || undefined,
      improvements: improvements.trim() || undefined,
    });
  };

  return (
    <CoopModal
      open={open}
      title="How is Co-op working for you?"
      width={560}
      // Compulsory first prompt: no X, no ESC, no mask-dismiss, no skip.
      closable={!required}
      keyboard={!required}
      maskClosable={false}
      onCancel={required ? undefined : onSkip}
      onOk={submit}
      okText={required ? 'Submit feedback' : 'Send feedback'}
      cancelText="Skip for now"
      confirmLoading={submitting}
      okButtonProps={{ disabled: submitting }}
      cancelButtonProps={required ? { style: { display: 'none' } } : undefined}
    >
      <p style={{ ...typeScale.bodyCompact, color: colors.onSurfaceVariant, marginTop: 0 }}>
        {required
          ? 'You’ve been using Co-op for a few weeks now — we’d love your honest thoughts. This first check-in is required, and it only takes a minute.'
          : 'A quick check-in — tell us what’s working and what we should build next. You can skip this one.'}
      </p>

      <div style={{ marginBottom: spacing.md }}>
        {label('Overall, how are you finding it?')}
        <Rate value={rating} onChange={setRating} />
      </div>

      {label('Your thoughts', required ? '(required)' : undefined)}
      {field(overall, setOverall, 'How is Co-op fitting into your business so far?')}

      {label('What do you like most?')}
      {field(likes, setLikes, 'Features, screens, or things that feel right…')}

      {label('Any issues or problems?')}
      {field(issues, setIssues, 'Bugs, confusing parts, anything that got in your way…')}

      {label('What would you love us to add?')}
      {field(improvements, setImprovements, 'Features or improvements you’re wishing for…', 2)}

      {error && (
        <div style={{ ...typeScale.bodyCompact, color: colors.error, marginTop: -4 }}>{error}</div>
      )}
    </CoopModal>
  );
};

export default FeedbackModal;
