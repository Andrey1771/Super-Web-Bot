import React from "react";
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IKeycloakService } from "../../iterfaces/i-keycloak-service";
import type { IUrlService } from "../../iterfaces/i-url-service";
import PageHeader from "../../components/layout/PageHeader";
import Card from "../../components/ui/Card";
import { useAdminHeader } from "../../components/layout/AdminHeaderContext";
import { useToast } from "../../components/ui/ToastProvider";

type TokenProfile = {
  email?: string;
  preferred_username?: string;
  sub?: string;
  realm_access?: { roles?: string[] };
};

const ProfilePage: React.FC = () => {
  const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
  const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const { addToast } = useToast();

  React.useEffect(() => {
    setPageTitle("Profile");
    setHeaderActions([]);
  }, [setHeaderActions, setPageTitle]);

  const token = keycloakService.keycloak.tokenParsed as TokenProfile | undefined;
  const role = token?.realm_access?.roles?.includes("admin") ? "Admin" : "User";
  const accountUrl = `${urlService.keycloak.url}realms/${urlService.keycloak.realm}/account`;

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      addToast("Copied to clipboard", "success");
    } catch (error) {
      console.error("Copy failed", error);
      addToast("Copy failed", "error");
    }
  };

  return (
    <div className="admin-grid">
      <PageHeader
        title="Profile"
        description="Review your admin account details."
        breadcrumbs={["Account", "Profile"]}
      />

      <Card>
        <h3>Account details</h3>
        <p>
          <strong>Name:</strong> {token?.preferred_username ?? "—"}
        </p>
        <p>
          <strong>Email:</strong> {token?.email ?? "—"}
        </p>
        <div className="flex items-center gap-2">
          <p className="admin-table__cell-truncate" title={token?.sub ?? "—"}>
            <strong>User ID:</strong> {token?.sub ?? "—"}
          </p>
          {token?.sub && (
            <button className="btn btn-outline" onClick={() => handleCopy(token.sub ?? "")}>
              Copy user id
            </button>
          )}
        </div>
        <p>
          <strong>Role:</strong> {role}
        </p>
        <div className="mt-4">
          <a className="btn btn-outline" href={accountUrl} target="_blank" rel="noreferrer">
            Open Keycloak account
          </a>
        </div>
      </Card>
    </div>
  );
};

export default ProfilePage;
