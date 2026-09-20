/**
 * Admin console (product owner) — a cross-tenant view for the Co-op team.
 *
 * Gated to the platform-admin allow-list (the backend 403s every /platform/*
 * data route for anyone else; this page also redirects non-admins). The
 * admin/normal switch in the header lets the owner step out of the product-wide
 * view and back into their own business.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Col, Row, Segmented, Statistic, Table, Tabs, Tag } from 'antd';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, fb, biz, lic] = await Promise.all([
        api.get<Overview>('/platform/overview'),
        api.get<{ items: FeedbackItem[] }>('/platform/feedback', { params: { limit: 100 } }),
        api.get<{ items: BusinessItem[] }>('/platform/businesses', { params: { limit: 200 } }),
        api.get<{ items: LicenseItem[] }>('/platform/licenses', { params: { limit: 200 } }),
      ]);
      setOverview(ov.data);
      setFeedback(fb.data.items);
      setBusinesses(biz.data.items);
      setLicenses(lic.data.items);
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
