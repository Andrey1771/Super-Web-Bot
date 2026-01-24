import React from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action }) => {
  return (
    <div className="admin-empty">
      <div className="text-4xl">📭</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
};

export default EmptyState;
