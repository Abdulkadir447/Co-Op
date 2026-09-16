/**
 * CoopModal — the Co-op dialog primitive (Stage R1 elevation Level 3).
 *
 * Wraps antd Modal (portals, focus trap, keyboard) with the Co-op chrome:
 * 16px radius, transparent header/footer, 18px semibold title, and
 * CoopButton footer (primary confirm + secondary discard). `danger`
 * renders a destructive confirm.
 */
import React from 'react';
import { Modal } from 'antd';
import type { ModalProps } from 'antd';
import { useCoopTheme } from '../../theme-provider';
import CoopButton, { CoopButtonProps } from './CoopButton';

export interface CoopModalProps extends Omit<ModalProps, 'okText' | 'cancelText' | 'okButtonProps' | 'cancelButtonProps'> {
  okText?: string;
  cancelText?: string;
  /** Extra props for the confirm CoopButton (e.g. disabled/loading). */
  okButtonProps?: Partial<CoopButtonProps>;
  /** Extra props for the cancel CoopButton. */
  cancelButtonProps?: Partial<CoopButtonProps>;
  /** Render the confirm button in the destructive variant. */
  danger?: boolean;
  /** 'danger' adds the destructive red top border (delete confirmations). */
  tone?: 'default' | 'danger';
  /** Node rendered at the start of the footer (e.g. a "Delete" action). */
  footerExtra?: React.ReactNode;
  /** Hide the footer entirely (fully custom footers). */
  hideFooter?: boolean;
}

const CoopModal: React.FC<CoopModalProps> = ({
  title,
  children,
  open,
  onOk,
  onCancel,
  okText = 'Save',
  cancelText = 'Discard',
  confirmLoading,
  okButtonProps,
  cancelButtonProps,
  danger = false,
  tone = 'default',
  footerExtra,
  hideFooter = false,
  width = 520,
  ...rest
}) => {
  const { colors } = useCoopTheme();
  const isDangerTone = tone === 'danger';
  return (
    <Modal
      title={
        typeof title === 'string' ? (
          <span style={{ fontSize: 18, fontWeight: 600 }}>{title}</span>
        ) : (
          title
        )
      }
      open={open}
      onCancel={onCancel}
      width={width}
      centered
      destroyOnHidden
      maskClosable={false}
      styles={{
        content: {
          padding: '24px 24px 20px',
          position: 'relative',
          overflow: 'hidden',
          borderTop: isDangerTone ? `3px solid ${colors.error}` : 'none',
        },
        header: { marginBottom: 8 },
        footer: { marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12 },
      }}
      footer={
        hideFooter
          ? null
          : [
              footerExtra ? <span key="extra" style={{ marginLeft: 'auto' }}>{footerExtra}</span> : null,
              <CoopButton key="cancel" variant="secondary" onClick={onCancel} {...cancelButtonProps}>
                {cancelText}
              </CoopButton>,
              <CoopButton
                key="ok"
                variant={danger || isDangerTone ? 'danger' : 'primary'}
                loading={confirmLoading}
                onClick={onOk}
                {...okButtonProps}
              >
                {okText}
              </CoopButton>,
            ]
      }
      {...rest}
    >
      {children}
    </Modal>
  );
};

export default CoopModal;
