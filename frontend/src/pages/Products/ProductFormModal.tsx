/**
 * Add/Edit Product modal (Stitch coop_create_product +
 * coop_product_management_states).
 *
 * UI refactor only — same form fields, same validation, same business
 * rules (SKU locked on update; initial stock only on create; stock moves
 * via Inventory afterwards). New presentation: "Pricing Details" group
 * with $ prefixes, the honest "Generate Product Description" AI box, the
 * "Delete Product" footer action in edit mode, and design-matched hints.
 */
import React, { useEffect } from 'react';
import { Col, Form, Input, InputNumber, Row } from 'antd';
import { DollarOutlined, DeleteOutlined } from '@ant-design/icons';
import { radius, spacing, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import type { Product, ProductFormValues } from './useProducts';
import CoopModal from '../../components/ui/CoopModal';
import AiNoticeBox from '../../components/ui/AiNoticeBox';

export interface ProductFormModalProps {
  open: boolean;
  /** null = create mode; a Product = edit mode. */
  product: Product | null;
  onCancel: () => void;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  /** Edit mode only: opens the destructive delete confirmation. */
  onDelete?: () => void;
}

const hintStyle = (color: string): React.CSSProperties => ({ ...type.bodyCompact, fontSize: 12, color });

const ProductFormModal: React.FC<ProductFormModalProps> = ({
  open,
  product,
  onCancel,
  onSubmit,
  onDelete,
}) => {
  const { colors } = useCoopTheme();
  const [form] = Form.useForm<ProductFormValues>();
  const editing = Boolean(product);

  useEffect(() => {
    if (!open) return;
    if (product) {
      form.setFieldsValue({
        sku: product.sku,
        name: product.name,
        description: product.description ?? undefined,
        category: product.category ?? undefined,
        unit_price: product.unit_price,
        cost_price: product.cost_price ?? undefined,
        reorder_level: product.reorder_level,
        // NOTE: current_stock is intentionally NOT editable after creation.
        // Stock changes only via Inventory -> Adjust Stock (audit trail).
      });
    } else {
      form.resetFields();
    }
  }, [open, product, form]);

  const costPrice = Form.useWatch('cost_price', form);
  const unitPrice = Form.useWatch('unit_price', form);
  const costExceedsPrice =
    typeof costPrice === 'number' && typeof unitPrice === 'number' && costPrice > unitPrice;

  const handleOk = async () => {
    const values = await form.validateFields();
    await onSubmit(values);
  };

  return (
    <CoopModal
      title={editing ? 'Update Product' : 'Create New Product'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText={editing ? 'Save Changes' : 'Create Product'}
      okButtonProps={
        editing
          ? undefined
          : {
              icon: (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              ),
            }
      }
      footerExtra={
        editing && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
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
            Delete Product
          </button>
        ) : undefined
      }
      width={640}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark
        initialValues={{ current_stock: 0, reorder_level: 5 }}
      >
        <Form.Item
          label="Product Name"
          name="name"
          rules={[
            { required: true, message: 'Product name is required' },
            { max: 255, message: 'Name must be at most 255 characters' },
          ]}
        >
          <Input placeholder="e.g. Premium Widget X" />
        </Form.Item>

        <Row gutter={spacing.md}>
          <Col xs={24} sm={12}>
            <Form.Item
              label={
                <span>
                  SKU{' '}
                  <span style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline, fontWeight: 400 }}>
                    *Must be unique
                  </span>
                </span>
              }
              name="sku"
              rules={[
                { required: true, message: 'SKU is required' },
                { min: 3, max: 50, message: 'SKU must be 3–50 characters' },
              ]}
            >
              <Input placeholder="PRD-001" disabled={editing} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              label="Category"
              name="category"
              rules={[{ max: 100, message: 'Category must be at most 100 characters' }]}
            >
              <Input placeholder="e.g. Beverages" />
            </Form.Item>
          </Col>
        </Row>

        {/* Pricing Details group (Stitch create-product pattern) */}
        <div
          style={{
            borderRadius: radius.lg,
            background: colors.surfaceContainerLow,
            border: `1px solid ${colors.borderSubtle}`,
            padding: '14px 16px 2px',
            marginBottom: spacing.md,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              marginBottom: 12,
              color: colors.primary,
              fontWeight: 600,
              fontSize: 13.5,
            }}
          >
            <DollarOutlined />
            Pricing Details
          </div>
          <Row gutter={spacing.md}>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Selling Price"
                name="unit_price"
                rules={[{ required: true, message: 'Selling price is required' }]}
              >
                <InputNumber min={0.01} step={0.01} precision={2} style={{ width: '100%' }} prefix="$" placeholder="0.00" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Cost Price"
                name="cost_price"
                extra={
                  costExceedsPrice ? (
                    <span style={hintStyle(colors.warning)}>
                      Cost price is higher than the selling price — this product would sell at a loss.
                    </span>
                  ) : undefined
                }
              >
                <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} prefix="$" placeholder="Optional" />
              </Form.Item>
            </Col>
          </Row>
        </div>

        <Row gutter={spacing.md}>
          {!editing && (
            <Col xs={24} sm={12}>
              <Form.Item
                label="Current Stock"
                name="current_stock"
                rules={[{ required: true }]}
                extra={<span style={hintStyle(colors.outline)}>After creation, adjust stock via Inventory.</span>}
              >
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          )}
          <Col xs={24} sm={12}>
            <Form.Item
              label="Reorder Level"
              name="reorder_level"
              rules={[{ required: true }]}
              extra={<span style={hintStyle(colors.outline)}>Alert when stock falls below this number</span>}
            >
              <InputNumber min={0} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label="Description"
          name="description"
          rules={[{ max: 1000, message: 'Description must be at most 1000 characters' }]}
        >
          <Input.TextArea rows={3} maxLength={1000} showCount placeholder="Write product description here" />
        </Form.Item>

        {editing ? (
          <AiNoticeBox
            compact
            title="Up next: pricing & stock suggestions"
            description="Ask Zeno is available now. Product-level recommendations — price and stock adjustments based on your sales velocity — are still on the roadmap."
          />
        ) : (
          <AiNoticeBox
            compact
            title="Generate description (coming soon)"
            description="Auto-generating a description from the title and category is still on the roadmap. Ask Zeno is available now for questions about your catalog."
          />
        )}
      </Form>
    </CoopModal>
  );
};

export default ProductFormModal;
