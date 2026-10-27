/**
 * Settings → Company (UXDS 15.6). The only identity-editable section is the
 * business profile; the signed-in Clerk account is shown read-only.
 */
import React, { useEffect } from 'react';
import { Alert, Col, Divider, Form, Input, InputNumber, Row, Space, Switch, Typography } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import { useUser } from '@clerk/react';
import CoopSelect from '../../../components/ui/CoopSelect';
import { CoopButton, CoopCard, CoopLoading } from '../../../components/ui';
import { CURRENCY_OPTIONS, TIMEZONE_OPTIONS } from '../useSettings';
import type { BusinessSettings, BusinessSettingsUpdate } from '../useSettings';

interface CompanyFormValues {
  name: string;
  industry?: string;
  currency: string;
  owner_email?: string;
  address?: string;
  phone?: string;
  tax_id?: string;
  website?: string;
  timezone?: string;
  tax_enabled?: boolean;
  tax_rate?: number;
  tax_label?: string;
}

export interface CompanySectionProps {
  settings: BusinessSettings | null;
  loading: boolean;
  saving: boolean;
  save: (updates: BusinessSettingsUpdate) => Promise<BusinessSettings>;
  messageApi: MessageInstance;
}

const CompanySection: React.FC<CompanySectionProps> = ({ settings, loading, saving, save, messageApi }) => {
  const [form] = Form.useForm<CompanyFormValues>();
  const { user } = useUser();

  useEffect(() => {
    if (!settings) return;
    form.setFieldsValue({
      name: settings.name,
      industry: settings.industry ?? undefined,
      currency: settings.currency,
      owner_email: settings.owner_email ?? undefined,
      address: settings.address ?? undefined,
      phone: settings.phone ?? undefined,
      tax_id: settings.tax_id ?? undefined,
      website: settings.website ?? undefined,
      timezone: settings.timezone ?? undefined,
      tax_enabled: settings.tax_enabled,
      tax_rate: settings.tax_rate,
      tax_label: settings.tax_label,
    });
  }, [settings, form]);

  const handleSave = async () => {
    const values = await form.validateFields();
    // Only send fields that actually changed to keep the PATCH minimal.
    const updates: Record<string, unknown> = {};
    (Object.keys(values) as (keyof CompanyFormValues)[]).forEach((k) => {
      const v = values[k];
      const current = settings?.[k];
      if ((v ?? null) !== (current ?? null)) updates[k] = v ?? null;
    });
    if (Object.keys(updates).length === 0) {
      messageApi.info('No changes to save.');
      return;
    }
    try {
      await save(updates);
      messageApi.success('Company settings saved');
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const handleReset = () => {
    if (!settings) return;
    form.setFieldsValue({
      name: settings.name,
      industry: settings.industry ?? undefined,
      currency: settings.currency,
      owner_email: settings.owner_email ?? undefined,
      address: settings.address ?? undefined,
      phone: settings.phone ?? undefined,
      tax_id: settings.tax_id ?? undefined,
      website: settings.website ?? undefined,
      timezone: settings.timezone ?? undefined,
      tax_enabled: settings.tax_enabled,
      tax_rate: settings.tax_rate,
      tax_label: settings.tax_label,
    });
    messageApi.info('Changes reset to last saved values.');
  };

  return (
    <CoopCard
      title="Company Settings"
      extra={
        <Space>
          <CoopButton variant="secondary" onClick={handleReset} disabled={loading || saving}>
            Reset
          </CoopButton>
          <CoopButton onClick={handleSave} loading={saving} disabled={loading}>
            Save Changes
          </CoopButton>
        </Space>
      }
    >
      {loading ? (
        <CoopLoading height={240} label="Loading company settings…" />
      ) : (
        <Form form={form} layout="vertical" requiredMark>
          {/* Clerk identity — read-only, separate from business data */}
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
            message="Signed-in account"
            description={
              <Space direction="vertical" size={0}>
                <Typography.Text>
                  {user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'Unknown'}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {user?.primaryEmailAddress?.emailAddress ?? ''} · managed by Clerk, not editable here
                </Typography.Text>
              </Space>
            }
          />

          <Divider style={{ marginTop: 0 }}>Business Identity</Divider>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Company Name"
                name="name"
                rules={[{ required: true, message: 'Company name is required' }]}
              >
                <Input placeholder="e.g. Kano Textiles" maxLength={255} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Industry" name="industry">
                <Input placeholder="e.g. Retail, Services" maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Currency"
                name="currency"
                rules={[{ required: true, message: 'Currency is required' }]}
              >
                <CoopSelect
                  options={CURRENCY_OPTIONS.map((c) => ({ value: c, label: c }))}
                  placeholder="Select currency"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Business Contact Email"
                name="owner_email"
                rules={[{ type: 'email', message: 'Enter a valid email address' }]}
              >
                <Input placeholder="billing@company.com" maxLength={255} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Phone" name="phone">
                <Input placeholder="+234…" maxLength={20} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Tax ID" name="tax_id">
                <Input placeholder="VAT / TIN (optional)" maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Website" name="website">
                <Input placeholder="https://…" maxLength={255} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Timezone" name="timezone">
                <CoopSelect
                  options={TIMEZONE_OPTIONS.map((t) => ({ value: t, label: t }))}
                  placeholder="Select timezone"
                  showSearch
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="Address" name="address">
                <Input.TextArea rows={2} placeholder="Business address" maxLength={500} />
              </Form.Item>
            </Col>
          </Row>

          <Divider>Tax</Divider>
          <Typography.Paragraph type="secondary" style={{ marginTop: -4, fontSize: 12.5 }}>
            Tax is added <strong>on top</strong> of the line subtotal (exclusive), and the rate is
            recorded on each order as it is raised — changing it later never reprices an existing
            order or an invoice a customer already holds. Revenue reports stay net of tax.
          </Typography.Paragraph>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item
                label="Charge tax on orders"
                name="tax_enabled"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Rate (%)" name="tax_rate">
                <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Label on invoices" name="tax_label">
                <Input placeholder="VAT" maxLength={20} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      )}
    </CoopCard>
  );
};

export default CompanySection;
