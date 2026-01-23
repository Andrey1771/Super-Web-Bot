import React from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumbs?: string[];
  primaryAction?: React.ReactNode;
};

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  breadcrumbs,
  primaryAction,
}) => {
  return (
    <div className="admin-page-header">
      <div>
        {breadcrumbs && (
          <div className="admin-page-header__breadcrumbs">
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb}>
                {crumb}
                {index < breadcrumbs.length - 1 && " → "}
              </span>
            ))}
          </div>
        )}
        <h1 className="admin-page-header__title">{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {primaryAction && <div>{primaryAction}</div>}
    </div>
  );
};

export default PageHeader;
