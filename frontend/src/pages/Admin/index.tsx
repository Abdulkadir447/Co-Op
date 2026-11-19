/**
 * Admin console (product owner) — a cross-tenant view for the Co-op team.
 *
 * Gated to the platform-admin allow-list (the backend 403s every /platform/*
 * data route for anyone else; this page also redirects non-admins). The
 * admin/normal switch in the header lets the owner step out of the product-wide
 * view and back into their own business.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Col, Row, Segmented, Space, Statistic, Table, Tabs, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Navigate, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { CoopCard, CoopErrorState, CoopLoading } from '../../components/ui';
import { useApiClient } from '../../services/api/client';
import { useAdminMode, useIsPlatformAdmin, setAdminMode } from '../../hooks/usePlatformAdmin';

interface Overview {
  businesses: number;
  members: number;
  feedback_responses: number;
  licenses_total: number;
  licenses_active: number;
  payments_success: number;
  payments_pending: number;
}

interface FeedbackItem {
  id: number;
  business_name: string | null;
  rating: number | null;
  overall: string | null;
  issues: string | null;
  created_at: string | null;
}

interface BusinessItem {
  id: number;
  name: string;
  owner_email: string | null;
  currency: string | null;
  plan: string;
  created_at: string | null;
}

/**
 * The five numbers an accelerator or investor asks for. The backend computes
 * them from the ledgers (businesses, invoices, audit_log, ai_usage, payments)
 * and returns the definition of each one, so this screen can never show a
 * figure nobody can explain.
 */
interface InvestorMetrics {
  as_of: string;
  window_days: number;
  headline: string;
  businesses: {
    total: number;
    new_last_7_days: number;
    new_previous_7_days: number;
    signup_growth_pct_week_over_week: number | null;
  };
  activation: { eligible_businesses: number; activated: number; rate_pct: number | null; definition: string };
  engagement: {
    active_last_7_days: number;
    active_previous_7_days: number;
    week_over_week_retention_pct: number | null;
    definition: string;
  };
  revenue: {
    currency: string | string[];
    mrr: number;
    previous_window_mrr: number;
    mrr_growth_pct: number | null;
    paying_businesses: number;
    arpu: number | null;
    definition: string;
  };
  ai: {
    credits_used: number;
    requests: number;
    credits_per_paying_business: number | null;
    definition: string;
  };
}

interface LicenseItem {
  id: number;
  business_name: string | null;
  plan: string;
  seats: number;
  fingerprint: string;
  expires_at: string | null;
  revoked_at: string | null;
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString() : '—';

const AdminConsole: React.FC = () => {
  const api = useApiClient();
  const navigate = useNavigate();
  const isAdmin = useIsPlatformAdmin();
  const mode = useAdminMode();

  const [overview, setOverview] = useState<Overview | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [businesses, setBusinesses] = useState<BusinessItem[]>([]);
  const [licenses, setLicenses] = useState<LicenseItem[]>([]);
  const [metrics, setMetrics] = useState<InvestorMetrics | null>(null);
  const [messageApi, messageCtx] = message.useMessage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, fb, biz, lic, met] = await Promise.all([
        api.get<Overview>('/platform/overview'),
        api.get<{ items: FeedbackItem[] }>('/platform/feedback', { params: { limit: 100 } }),
        api.get<{ items: BusinessItem[] }>('/platform/businesses', { params: { limit: 200 } }),
        api.get<{ items: LicenseItem[] }>('/platform/licenses', { params: { limit: 200 } }),
        api.get<InvestorMetrics>('/platform/investor-metrics'),
      ]);
      setOverview(ov.data);
      setFeedback(fb.data.items);
      setBusinesses(biz.data.items);
      setLicenses(lic.data.items);
      setMetrics(met.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load the admin console');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  // Still resolving the admin check.
  if (isAdmin === null) return <CoopLoading label="Checking access…" />;
  // Not on the allow-list — the console is not for this user.
  if (!isAdmin) return <Navigate to="/" replace />;

  const switcher = (
    <Segmented
      value={mode}
      onChange={(value) => {
        if (value === 'normal') {
          setAdminMode('normal');
          navigate('/');
        } else {
          setAdminMode('admin');
        }
      }}
      options={[
        { label: 'Admin view', value: 'admin' },
        { label: 'Normal view', value: 'normal' },
      ]}
    />
  );

  const feedbackCols: ColumnsType<FeedbackItem> = [
    { title: 'Business', dataIndex: 'business_name', render: (v: string | null) => v || '—' },
    {
      title: 'Rating',
      dataIndex: 'rating',
      width: 90,
      render: (v: number | null) =>
        v ? <Tag color="gold">{v} / 5</Tag> : <span style={{ opacity: 0.5 }}>—</span>,
    },
    {
      title: 'Comment',
      dataIndex: 'overall',
      ellipsis: true,
      render: (v: string | null, row) => v || row.issues || '—',
    },
    { title: 'Date', dataIndex: 'created_at', width: 120, render: fmtDate },
  ];

  const businessCols: ColumnsType<BusinessItem> = [
    { title: 'Business', dataIndex: 'name' },
    { title: 'Owner email', dataIndex: 'owner_email', render: (v: string | null) => v || '—' },
    {
      title: 'Plan',
      dataIndex: 'plan',
      width: 130,
      render: (v: string) => <Tag color={v === 'free' ? 'default' : 'geekblue'}>{v}</Tag>,
    },
    { title: 'Currency', dataIndex: 'currency', width: 100, render: (v: string | null) => v || '—' },
    { title: 'Joined', dataIndex: 'created_at', width: 120, render: fmtDate },
  ];

  const licenseCols: ColumnsType<LicenseItem> = [
    { title: 'Business', dataIndex: 'business_name', render: (v: string | null) => v || '—' },
    { title: 'Plan', dataIndex: 'plan', width: 130, render: (v: string) => <Tag color="geekblue">{v}</Tag> },
    { title: 'Seats', dataIndex: 'seats', width: 80 },
    {
      title: 'Fingerprint',
      dataIndex: 'fingerprint',
      ellipsis: true,
      render: (v: string) => <code style={{ fontSize: 12 }}>{v.slice(0, 16)}…</code>,
    },
    { title: 'Expires', dataIndex: 'expires_at', width: 120, render: fmtDate },
    {
      title: 'Status',
      width: 110,
      render: (_: unknown, row) =>
        row.revoked_at ? (
          <Tag color="red">revoked</Tag>
        ) : row.expires_at && new Date(row.expires_at) < new Date() ? (
          <Tag color="orange">expired</Tag>
        ) : (
          <Tag color="green">active</Tag>
        ),
    },
  ];

  return (
    <div>
      {messageCtx}
      <PageHeader
        title="Admin console"
        subtitle="Product-wide view — Co-op team only."
        actions={switcher}
      />

      {mode === 'normal' ? (
        <Alert
          type="info"
          showIcon
          message="Normal view is on"
          description="Admin tools are hidden while you browse as a normal owner. Switch back to Admin view any time from the account menu."
          style={{ marginTop: 8 }}
        />
      ) : error ? (
        <CoopErrorState title="Unable to load the admin console" detail={error} onRetry={() => void load()} />
      ) : loading || !overview ? (
        <CoopLoading label="Loading product data…" />
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
            <Col xs={12} md={8} lg={4}>
              <CoopCard><Statistic title="Businesses" value={overview.businesses} /></CoopCard>
            </Col>
            <Col xs={12} md={8} lg={4}>
              <CoopCard><Statistic title="Team members" value={overview.members} /></CoopCard>
            </Col>
            <Col xs={12} md={8} lg={4}>
              <CoopCard><Statistic title="Feedback" value={overview.feedback_responses} /></CoopCard>
            </Col>
            <Col xs={12} md={8} lg={4}>
              <CoopCard>
                <Statistic title="Active licences" value={overview.licenses_active} suffix={`/ ${overview.licenses_total}`} />
              </CoopCard>
            </Col>
            <Col xs={12} md={8} lg={4}>
              <CoopCard><Statistic title="Paid" value={overview.payments_success} /></CoopCard>
            </Col>
            <Col xs={12} md={8} lg={4}>
              <CoopCard><Statistic title="Pending" value={overview.payments_pending} /></CoopCard>
            </Col>
          </Row>

          <CoopCard flush bodyPadding={0} style={{ marginTop: 16 }}>
            <Tabs
              tabBarStyle={{ paddingLeft: 16, paddingRight: 16 }}
              items={[
                {
                  key: 'metrics',
                  label: 'Fundraising',
                  children: metrics ? (
                    <div style={{ padding: 16 }}>
                      <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <div>
                          <Typography.Text type="secondary">
                            The five numbers an accelerator asks for, computed from the ledgers
                            (not typed in by hand). Window: last {metrics.window_days} days.
                          </Typography.Text>
                          <div
                            style={{
                              marginTop: 8, padding: 12, borderRadius: 8,
                              background: 'rgba(0,0,0,0.03)', fontFamily: 'monospace',
                              display: 'flex', justifyContent: 'space-between', gap: 12,
                              alignItems: 'center', flexWrap: 'wrap',
                            }}
                          >
                            <span>{metrics.headline}</span>
                            <Button
                              size="small"
                              onClick={() => {
                                void navigator.clipboard
                                  .writeText(metrics.headline)
                                  .then(() => messageApi.success('Copied — paste it into the traction field'))
                                  .catch(() => messageApi.error('Could not copy; select the text instead'));
                              }}
                            >
                              Copy
                            </Button>
                          </div>
                        </div>

                        <Row gutter={[16, 16]}>
                          <Col xs={12} md={8} lg={6}>
                            <CoopCard>
                              <Statistic title="Businesses" value={metrics.businesses.total} />
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                {metrics.businesses.new_last_7_days} new this week vs{' '}
                                {metrics.businesses.new_previous_7_days} last
                                {metrics.businesses.signup_growth_pct_week_over_week !== null
                                  ? ` (${metrics.businesses.signup_growth_pct_week_over_week > 0 ? '+' : ''}${metrics.businesses.signup_growth_pct_week_over_week}%)`
                                  : ' (no base to compare)'}
                              </Typography.Text>
                            </CoopCard>
                          </Col>
                          <Col xs={12} md={8} lg={6}>
                            <CoopCard>
                              <Statistic
                                title="Activation"
                                value={metrics.activation.rate_pct ?? '—'}
                                suffix={metrics.activation.rate_pct !== null ? '%' : ''}
                              />
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                {metrics.activation.definition}
                              </Typography.Text>
                            </CoopCard>
                          </Col>
                          <Col xs={12} md={8} lg={6}>
                            <CoopCard>
                              <Statistic
                                title="MRR"
                                value={metrics.revenue.mrr}
                                precision={2}
                                prefix={Array.isArray(metrics.revenue.currency) ? '' : `${metrics.revenue.currency} `}
                              />
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                {metrics.revenue.paying_businesses} paying
                                {metrics.revenue.arpu !== null ? ` · ARPU ${metrics.revenue.arpu.toFixed(2)}` : ''}
                              </Typography.Text>
                            </CoopCard>
                          </Col>
                          <Col xs={12} md={8} lg={6}>
                            <CoopCard>
                              <Statistic
                                title="Weekly retention"
                                value={metrics.engagement.week_over_week_retention_pct ?? '—'}
                                suffix={metrics.engagement.week_over_week_retention_pct !== null ? '%' : ''}
                              />
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                {metrics.engagement.active_last_7_days} active now,{' '}
                                {metrics.engagement.active_previous_7_days} last week
                              </Typography.Text>
                            </CoopCard>
                          </Col>
                        </Row>

                        <CoopCard title="How each number is calculated">
                          <Space direction="vertical" size={6}>
                            <Typography.Text style={{ fontSize: 13 }}>
                              <strong>Activation</strong> — {metrics.activation.definition}.
                            </Typography.Text>
                            <Typography.Text style={{ fontSize: 13 }}>
                              <strong>Engagement</strong> — a business that {metrics.engagement.definition}.
                            </Typography.Text>
                            <Typography.Text style={{ fontSize: 13 }}>
                              <strong>Revenue</strong> — {metrics.revenue.definition}.
                            </Typography.Text>
                            <Typography.Text style={{ fontSize: 13 }}>
                              <strong>AI usage</strong> — {metrics.ai.definition}: {metrics.ai.credits_used}{' '}
                              credits across {metrics.ai.requests} turns
                              {metrics.ai.credits_per_paying_business !== null
                                ? `, ${metrics.ai.credits_per_paying_business} per paying business`
                                : ''}.
                            </Typography.Text>
                          </Space>
                        </CoopCard>
                      </Space>
                    </div>
                  ) : (
                    <CoopLoading label="Loading metrics…" />
                  ),
                },
                {
                  key: 'feedback',
                  label: `Feedback (${feedback.length})`,
                  children: (
                    <Table<FeedbackItem>
                      rowKey="id"
                      size="middle"
                      columns={feedbackCols}
                      dataSource={feedback}
                      pagination={{ pageSize: 10, hideOnSinglePage: true }}
                    />
                  ),
                },
                {
                  key: 'businesses',
                  label: `Businesses (${businesses.length})`,
                  children: (
                    <Table<BusinessItem>
                      rowKey="id"
                      size="middle"
                      columns={businessCols}
                      dataSource={businesses}
                      pagination={{ pageSize: 10, hideOnSinglePage: true }}
                    />
                  ),
                },
                {
                  key: 'licenses',
                  label: `Licences (${licenses.length})`,
                  children: (
                    <Table<LicenseItem>
                      rowKey="id"
                      size="middle"
                      columns={licenseCols}
                      dataSource={licenses}
                      pagination={{ pageSize: 10, hideOnSinglePage: true }}
                    />
                  ),
                },
              ]}
            />
          </CoopCard>
        </>
      )}
    </div>
  );
};

export default AdminConsole;
