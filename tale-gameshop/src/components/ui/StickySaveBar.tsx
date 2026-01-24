import React from "react";

type StickySaveBarProps = {
  isVisible: boolean;
  onSave: () => void;
  onCancel: () => void;
  onReset?: () => void;
  isSaving?: boolean;
};

const StickySaveBar: React.FC<StickySaveBarProps> = ({
  isVisible,
  onSave,
  onCancel,
  onReset,
  isSaving,
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="admin-sticky-bar">
      <div>
        <strong>Unsaved changes</strong>
        <div className="muted">Don&apos;t forget to save your updates.</div>
      </div>
      <div className="flex gap-3">
        {onReset && (
          <button className="btn btn-outline" onClick={onReset}>
            Reset
          </button>
        )}
        <button className="btn btn-outline" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={onSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
};

export default StickySaveBar;
