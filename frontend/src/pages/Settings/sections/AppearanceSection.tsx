/**
 * Settings → Appearance. Real theme control: explicit light/dark, or follow
 * the OS (the default). Same persisted preference the TopBar toggle uses.
 */
import React from 'react';
import { Radio, Space, Typography } from 'antd';
import { BulbOutlined, MoonOutlined, LaptopOutlined } from '@ant-design/icons';
import { useCoopTheme } from '../../../theme-provider';
import { CoopCard } from '../../../components/ui';
import type { ThemeMode } from '../../../theme';

const OPTIONS: { value: ThemeMode; label: string; blurb: string; icon: React.ReactNode }[] = [
  { value: 'system', label: 'System', blurb: 'Follow your device (light or dark, automatically).', icon: <LaptopOutlined /> },
  { value: 'light', label: 'Light', blurb: 'Always use the light theme.', icon: <BulbOutlined /> },
  { value: 'dark', label: 'Dark', blurb: 'Always use the dark theme.', icon: <MoonOutlined /> },
];

const AppearanceSection: React.FC = () => {
  const { colors, mode, setMode } = useCoopTheme();

  return (
    <CoopCard title="Appearance" subtitle="Theme and display preferences.">
      <Radio.Group value={mode} onChange={(e) => setMode(e.target.value as ThemeMode)}>
        <Space direction="vertical" size={14}>
          {OPTIONS.map((o) => (
            <Radio key={o.value} value={o.value}>
              <Space align="start">
                <span style={{ color: colors.primary, fontSize: 16 }}>{o.icon}</span>
                <span>
                  <Typography.Text strong>{o.label}</Typography.Text>
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                    {o.blurb}
                  </Typography.Text>
                </span>
              </Space>
            </Radio>
          ))}
        </Space>
      </Radio.Group>
    </CoopCard>
  );
};

export default AppearanceSection;
