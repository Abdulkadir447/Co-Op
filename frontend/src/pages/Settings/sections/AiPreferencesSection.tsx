/**
 * Settings → AI Preferences. The Ask Zeno answer style — persisted on the
 * tenant (backend) and read by the real system prompt, so the preference
 * shapes every AI answer, not just this screen.
 */
import React from 'react';
import { Radio, Space, Typography } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import { CoopCard } from '../../../components/ui';
import { AI_RESPONSE_STYLE_OPTIONS } from '../useSettings';
import type { BusinessSettings, BusinessSettingsUpdate } from '../useSettings';

export interface AiPreferencesSectionProps {
  settings: BusinessSettings | null;
  saving: boolean;
  save: (updates: BusinessSettingsUpdate) => Promise<BusinessSettings>;
  messageApi: MessageInstance;
}

const AiPreferencesSection: React.FC<AiPreferencesSectionProps> = ({ settings, saving, save, messageApi }) => {
  const current = settings?.ai_response_style ?? 'standard';

  const handleChange = async (style: string) => {
    try {
      await save({ ai_response_style: style });
      messageApi.success('AI preferences saved');
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  return (
    <CoopCard
      title="AI Preferences"
      subtitle="How Ask Zeno answers you. Applied to every AI response."
    >
      <Radio.Group value={current} onChange={(e) => void handleChange(e.target.value as string)} disabled={saving}>
        <Space direction="vertical" size={14}>
          {AI_RESPONSE_STYLE_OPTIONS.map((o) => (
            <Radio key={o.value} value={o.value}>
              <span>
                <Typography.Text strong>{o.label}</Typography.Text>
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12.5 }}>
                  {o.blurb}
                </Typography.Text>
              </span>
            </Radio>
          ))}
        </Space>
      </Radio.Group>
    </CoopCard>
  );
};

export default AiPreferencesSection;
