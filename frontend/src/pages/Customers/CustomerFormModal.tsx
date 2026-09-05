/**
 * Add/Edit Customer modal (Stitch coop_customer_workflows_modals).
 *
 * UI refactor only — same fields, same validation, same tenant-scoped email
 * rules. Presentation per the design: full-width "Create New Customer" /
 * "Update Customer" card form, "Save Customer" confirm, and — in edit mode
 * — the destructive "Delete Customer" action with the design's workflow
 * confirmation.
 */
import React, { useEffect, useState } from 'react';
import { Col, Form, Input, Row } from 'antd';
import { DeleteOutlined, WarningOutlined } from '@ant-design/icons';
import { radius, spacing, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import type { Customer, CustomerFormValues } from './useCustomers';
import CoopModal from '../../components/ui/CoopModal';

export interface CustomerFormModalProps {
  open: boolean;
  /** null = create mode; a Customer = edit mode. */
  customer: Customer | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: CustomerFormValues) => Promise<void>;
  /** Edit mode only: destructive delete (handled by the caller). */
  onDelete?: () => void;
  deleting?: boolean;
}

const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  open,
  customer,
  submitting,
  onCancel,
  onSubmit,
  onDelete,
  deleting = false,
}) => {
  const { colors } = useCoopTheme();
  const [form] = Form.useForm<CustomerFormValues>();
  const editing = Boolean(customer);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (customer) {
      form.setFieldsValue({
        full_name: customer.full_name,
        email: customer.email,
        phone: customer.phone ?? undefined,
        company: customer.company ?? undefined,
        address: customer.address ?? undefined,
      });
    } else {
      form.resetFields();
    }
  }, [open, customer, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    await onSubmit(values);
  };

  return (
    <>
      <CoopModal
        title={editing ? 'Update Customer' : 'Create New Customer'}
        open={open}
        onOk={handleOk}
        onCancel={onCancel}
        okText="Save Customer"
        cancelText="Cancel"
        confirmLoading={submitting}
        footerExtra={
          editing && onDelete ? (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                border: 'none',
                background: 'transparent',
                color: colors.error,
                fontWeight: 600,
                fontSize: 13.5,
                cursor: 'pointer',
                padding: '6px 8px',
                borderRadius: radius.md,
              }}
            >
              <DeleteOutlined />
              Delete Customer
            </button>
          ) : undefined
        }
        destroyOnClose
        width={640}
      >
        <Form form={form} layout="vertical" requiredMark>
          <Form.Item
            label="Full Name"
            name="full_name"
            rules={[
              { required: true, message: 'Full name is required' },
              { max: 255, message: 'Name must be at most 255 characters' },
            ]}
          >
            <Input placeholder="Jane Doe" />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Email is required' },
              { type: 'email', message: 'Enter a valid email address' },
              { max: 255, message: 'Email must be at most 255 characters' },
            ]}
          >
            <Input placeholder="jane@company.com" />
          </Form.Item>

          <Row gutter={spacing.md}>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Phone"
                name="phone"
                rules={[{ max: 20, message: 'Phone must be at most 20 characters' }]}
              >
                <Input placeholder="+1 (555) 000-0000" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Company"
                name="company"
                rules={[{ max: 255, message: 'Company must be at most 255 characters' }]}
              >
                <Input placeholder="Acme Corp" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="Address"
            name="address"
            rules={[{ max: 500, message: 'Address must be at most 500 characters' }]}
          >
            <Input.TextArea rows={3} maxLength={500} showCount placeholder="123 Business Rd, Suite 100…" />
          </Form.Item>
        </Form>
      </CoopModal>

      {/* Destructive workflow confirmation (Stitch design) */}
      <CoopModal
        tone="danger"
        title="Delete Customer"
        open={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onOk={() => {
          setDeleteOpen(false);
          onDelete?.();
        }}
        confirmLoading={deleting}
        cancelText="Cancel"
        okText="Delete"
        danger
        width={440}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingTop: 4 }}>
          <span
            aria-hidden
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: 'rgba(186, 26, 26, 0.1)',
              color: colors.error,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 17,
              flexShrink: 0,
            }}
          >
            <WarningOutlined />
          </span>
          <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>
            Are you sure you want to delete {customer?.full_name}? This is permanent and cannot be
            restored. Their order history is retained for reporting.
          </div>
        </div>
      </CoopModal>
    </>
  );
};

export default CustomerFormModal;
