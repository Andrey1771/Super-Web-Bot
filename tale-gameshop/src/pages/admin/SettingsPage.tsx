import React from "react";
import PageHeader from "../../components/layout/PageHeader";
import Card from "../../components/ui/Card";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";

const SettingsPage: React.FC = () => {
  const { setHeaderActions, setPageTitle } = useAdminHeader();

  React.useEffect(() => {
    setPageTitle("Settings");
    setHeaderActions([]);
  }, [setHeaderActions, setPageTitle]);

  return (
    <div className="admin-grid">
      <PageHeader
        title="Settings"
        description="Manage admin preferences and system configuration."
        breadcrumbs={["System", "Settings"]}
      />

      <Card>
        <h3>Settings</h3>
        <p className="text-sm text-gray-500">
          Settings are not configured yet. This page will host account and system configuration options.
        </p>
      </Card>
    </div>
  );
};

export default SettingsPage;
