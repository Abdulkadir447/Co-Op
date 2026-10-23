/**
 * Settings → About. Version + environment facts only — honest, with no
 * invented claims. Licensing: the codebase is proprietary (All Rights
 * Reserved, see the LICENSE file at the repository root); business
 * activation keys live in Settings → Licence.
 */
import React from 'react';
import { Descriptions, Space, Typography } from 'antd';
import pkg from '../../../../package.json';
import { CoopCard } from '../../../components/ui';
import { isLocalAvailable } from '../../../sync/localDb';

const AboutSection: React.FC = () => {
  const environment = import.meta.env.DEV ? 'development' : 'production';
  const desktop = isLocalAvailable();

  return (
    <CoopCard title="About" subtitle="Application version and environment.">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Product">Co-op — Your Business Advisor</Descriptions.Item>
          <Descriptions.Item label="Version">{pkg.version}</Descriptions.Item>
          <Descriptions.Item label="Environment">{environment}</Descriptions.Item>
          <Descriptions.Item label="Desktop app">
            {desktop ? 'Running (offline-first local database active)' : 'Not running (browser mode)'}
          </Descriptions.Item>
          <Descriptions.Item label="Licensing">
            Proprietary — All Rights Reserved (see the LICENSE file). Activate your
            business key under Settings → Licence.
          </Descriptions.Item>
        </Descriptions>
        <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
          Co-op works offline and syncs when you're back online. Run your business anywhere.
        </Typography.Text>
      </Space>
    </CoopCard>
  );
};

export default AboutSection;
