import React from "react";
import { useTranslation } from "react-i18next";

type ModalConfirmProps = {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

const ModalConfirm: React.FC<ModalConfirmProps> = ({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  if (!isOpen) {
    return null;
  }

  return (
    <div className="admin-modal" onClick={onCancel}>
      <div
        className="admin-modal__card"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>{title}</h3>
        <p>{description}</p>
        <div className="flex gap-3 justify-end">
          <button className="btn btn-outline" onClick={onCancel}>
            {cancelLabel ?? t("common.cancel")}
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            {confirmLabel ?? t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalConfirm;
