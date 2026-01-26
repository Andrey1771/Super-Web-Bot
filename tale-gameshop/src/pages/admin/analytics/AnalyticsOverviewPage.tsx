import React, { useEffect, useMemo, useState } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { DataGrid } from "devextreme-react";
import { Column } from "devextreme-react/data-grid";
import PageHeader from "../../../components/layout/PageHeader";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import { useAdminHeader } from "../../../components/layout/AdminHeaderContext";
import { useNavigate } from "react-router-dom";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type { IAdminAnalyticsService } from "../../../iterfaces/i-admin-analytics-service";
import type { AnalyticsOverview, AnalyticsProvider, AnalyticsSettings } from "../../../types/analytics";

const AnalyticsOverviewPage: React.FC = () => {
  const adminAnalyticsService = container.get<IAdminAnalyticsService>(IDENTIFIERS.IAdminAnalyticsService);
  const { setHeaderActions, setPageTitle } = useAdminHeader();
  const navigate = useNavigate();

  const [provider, setProvider] = useState<AnalyticsProvider>("ga4");
  const [range, setRange] = useState("7d");
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [settings, setSettings] = useState<AnalyticsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPageTitle("Analytics overview");
    setHeaderActions([]);
  }, [setHeaderActions, setPageTitle]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await adminAnalyticsService.getSettings();
        setSettings(response);
      } catch (fetchError) {
        console.error(fetchError);
        setSettings(null);
      }
    };

    fetchSettings();
  }, [adminAnalyticsService]);

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await adminAnalyticsService.getOverview(provider, range);
        setOverview(response);
      } catch (fetchError: any) {
        console.error(fetchError);
        setOverview(null);
        const message = fetchError?.response?.data ?? "Unable to load analytics overview.";
        setError(String(message));
      } finally {
        setLoading(false);
      }
    };

    if (settings?.isEnabled) {
      fetchOverview();
    } else {
      setLoading(false);
      setOverview(null);
    }
  }, [adminAnalyticsService, provider, range, settings?.isEnabled]);

  const totals = overview?.totals;

  const seriesOptions = useMemo(() => {
    const categories = overview?.timeseries.map((point) => point.date) ?? [];
    return {
      chart: { type: "line", height: 320 },
      title: { text: "Users & Sessions" },
      xAxis: { categories },
      yAxis: { title: { text: "Count" } },
      series: [
        { name: "Users", data: overview?.timeseries.map((point) => point.users) ?? [] },
        { name: "Sessions", data: overview?.timeseries.map((point) => point.sessions) ?? [] },
      ],
    };
  }, [overview?.timeseries]);

  const displayRevenue = totals ? totals.revenue.toFixed(2) : "—";

  return (
    <div className="admin-grid">
      <PageHeader
        title="Analytics overview"
        description="Track storefront performance and engagement trends."
        breadcrumbs={["Analytics", "Overview"]}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Source</label>
            <select value={provider} onChange={(event) => setProvider(event.target.value as AnalyticsProvider)} className="p-2 border rounded">
              <option value="ga4">Google Analytics 4</option>
              <option value="yandex">Yandex Metrika</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Range</label>
            <select value={range} onChange={(event) => setRange(event.target.value)} className="p-2 border rounded">
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>
        </div>
      </Card>

      {!settings?.isEnabled ? (
        <EmptyState
          title="Analytics not connected"
          description="Enable analytics in settings to see data here."
          action={
            <button className="btn btn-primary" onClick={() => navigate("/admin/analytics/settings")}>Open settings</button>
          }
        />
      ) : loading ? (
        <div className="admin-grid admin-grid--3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={`loading-card-${index}`}>
              <div className="skeleton h-6" />
              <div className="skeleton h-10 mt-3" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <EmptyState
          title="Unable to load analytics"
          description={error}
          action={
            <button className="btn btn-primary" onClick={() => navigate("/admin/analytics/settings")}>Check settings</button>
          }
        />
      ) : (
        <>
          <div className="admin-grid admin-grid--3">
            <Card>
              <h3>Users</h3>
              <div className="text-2xl font-semibold">{totals ? totals.users : "—"}</div>
            </Card>
            <Card>
              <h3>Sessions</h3>
              <div className="text-2xl font-semibold">{totals ? totals.sessions : "—"}</div>
            </Card>
            <Card>
              <h3>Pageviews</h3>
              <div className="text-2xl font-semibold">{totals ? totals.pageviews : "—"}</div>
            </Card>
            <Card>
              <h3>Purchases</h3>
              <div className="text-2xl font-semibold">{totals ? totals.purchases : "—"}</div>
            </Card>
            <Card>
              <h3>Revenue</h3>
              <div className="text-2xl font-semibold">{displayRevenue}</div>
            </Card>
            <Card>
              <h3>Conversion rate</h3>
              <div className="text-2xl font-semibold">
                {totals && totals.sessions > 0 ? `${((totals.purchases / totals.sessions) * 100).toFixed(2)}%` : "—"}
              </div>
            </Card>
          </div>

          <div className="admin-grid admin-grid--2">
            <Card>
              <HighchartsReact highcharts={Highcharts} options={seriesOptions} />
            </Card>
            <Card>
              <h3>Top pages</h3>
              <DataGrid dataSource={overview?.topPages ?? []} showBorders={true} allowColumnResizing={true}>
                <Column dataField="name" caption="Page" />
                <Column dataField="value" caption="Views" />
              </DataGrid>
            </Card>
          </div>

          <Card>
            <h3>Top games</h3>
            <DataGrid dataSource={overview?.topItems ?? []} showBorders={true} allowColumnResizing={true}>
              <Column dataField="name" caption="Game" />
              <Column dataField="value" caption="Views" />
            </DataGrid>
          </Card>
        </>
      )}
    </div>
  );
};

export default AnalyticsOverviewPage;
