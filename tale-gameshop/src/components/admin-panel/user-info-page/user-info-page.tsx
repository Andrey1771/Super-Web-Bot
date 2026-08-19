import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import "devextreme/dist/css/dx.light.css";
import { DataGrid } from "devextreme-react";
import { Column, Paging, Sorting } from "devextreme-react/data-grid";
import container from "../../../inversify.config";
import { IAdminService } from "../../../iterfaces/i-admin-service";
import IDENTIFIERS from "../../../constants/identifiers";
import PageHeader from "../../layout/PageHeader";
import Card from "../../ui/Card";
import Drawer from "../../ui/Drawer";
import EmptyState from "../../ui/EmptyState";
import useDebouncedValue from "../../../hooks/useDebouncedValue";
import { useToast } from "../../ui/ToastProvider";
import { useAdminHeader } from "../../layout/AdminHeaderContext";

const UserInfoPage: React.FC = () => {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRow, setSelectedRow] = useState<any | null>(null);
    const [search, setSearch] = useState("");
    const [eventType, setEventType] = useState("");
    const [userFilter, setUserFilter] = useState("");
    const [clientIdFilter, setClientIdFilter] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const gridRef = useRef<DataGrid<any, any> | null>(null);
    const { addToast } = useToast();
    const debouncedSearch = useDebouncedValue(search, 300);
    const { setHeaderActions, setPageTitle } = useAdminHeader();

    const adminService = container.get<IAdminService>(IDENTIFIERS.IAdminService);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await adminService.getAllMappedLoginEvents();
            const transformedData = res.map((item: any, index: number) => {
                const merged = {
                    ...item,
                    ...item.details,
                };
                return {
                    ...merged,
                    rowId: `${merged.userId ?? "unknown"}__${merged.time ?? "unknown"}__${merged.clientId ?? ""}__${merged.code_id ?? ""}__${merged.type ?? ""}__${index}`,
                };
            });

            setData(transformedData);
        } catch (error) {
            console.error("Error loading table data:", error);
            addToast("Failed to load login history", "error");
        } finally {
            setLoading(false);
        }
    }, [adminService, addToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredData = useMemo(() => {
        return data.filter((item) => {
            const matchesSearch =
                !debouncedSearch ||
                `${item.userId ?? ""} ${item.username ?? ""} ${item.clientId ?? ""}`
                    .toLowerCase()
                    .includes(debouncedSearch.toLowerCase());
            const matchesEvent = !eventType || item.type === eventType;
            const matchesUser =
                !userFilter || `${item.username ?? ""}`.toLowerCase().includes(userFilter.toLowerCase());
            const matchesClient =
                !clientIdFilter || `${item.clientId ?? ""}`.toLowerCase().includes(clientIdFilter.toLowerCase());
            const matchesStart = !startDate || new Date(item.time) >= new Date(startDate);
            const matchesEnd = !endDate || new Date(item.time) <= new Date(endDate);

            return matchesSearch && matchesEvent && matchesUser && matchesClient && matchesStart && matchesEnd;
        });
    }, [data, debouncedSearch, eventType, userFilter, clientIdFilter, startDate, endDate]);

    const copyValue = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            addToast("Copied to clipboard", "success");
        } catch (error) {
            console.error("Copy failed", error);
            addToast("Copy failed", "error");
        }
    };

    // useCallback обязателен: эти две функции сидят в зависимостях эффекта, который ставит кнопки в
    // шапку. Пересоздаваясь на каждом рендере, они запускали эффект → setHeaderActions → перерисовку
    // лейаута → перерисовку страницы → снова эффект. Бесконечный цикл: вкладка «лагала», а потом
    // навигация переставала коммититься — URL менялся, контент нет.
    const handleShowColumns = useCallback(() => {
        const instance = gridRef.current?.instance;
        if (instance?.showColumnChooser) {
            instance.showColumnChooser();
        } else {
            addToast("Column chooser unavailable", "error");
        }
    }, [addToast]);

    const exportCsv = useCallback(() => {
        const headers = [
            "User ID",
            "Username",
            "Client ID",
            "Auth Method",
            "Auth Type",
            "Code ID",
            "Consent",
            "Redirect URI",
            "Response Mode",
            "Response Type",
            "IP Address",
            "Realm ID",
            "Timestamp",
            "Event Type",
        ];
        const rows = filteredData.map((item) => [
            item.userId ?? "",
            item.username ?? "",
            item.clientId ?? "",
            item.auth_method ?? "",
            item.auth_type ?? "",
            item.code_id ?? "",
            item.consent ?? "",
            item.redirect_uri ?? "",
            item.response_mode ?? "",
            item.response_type ?? "",
            item.ipAddress ?? "",
            item.realmId ?? "",
            item.time ?? "",
            item.type ?? "",
        ]);

        const csvContent = [headers, ...rows]
            .map((row) => row.map((cell) => `"${String(cell).replace(/\"/g, '""')}"`).join(","))
            .join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `login-history-${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        addToast("Export started", "success");
    }, [addToast, filteredData]);

    useEffect(() => {
        setPageTitle("Login History");
        setHeaderActions([
            {
                type: "button",
                id: "login-columns",
                label: "Columns",
                variant: "outline",
                onClick: handleShowColumns,
            },
            {
                type: "button",
                id: "login-export",
                label: "Export CSV",
                variant: "primary",
                onClick: exportCsv,
            },
            {
                type: "button",
                id: "login-refresh",
                label: "Refresh",
                variant: "outline",
                onClick: fetchData,
            },
        ]);
        return () => setHeaderActions([]);
    }, [exportCsv, fetchData, handleShowColumns, setHeaderActions, setPageTitle]);

    return (
        <div className="admin-grid">
            <PageHeader
                title="Login history"
                description="Track authentication events with filters and detailed records."
                breadcrumbs={["Users", "Login history"]}
            />

            <Card>
                <div className="admin-grid admin-grid--3">
                    <div className="admin-topbar__search">
                        <span>🔎</span>
                        <input
                            type="text"
                            placeholder="Search user, client, or ID..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </div>
                    <input
                        type="text"
                        placeholder="User / Email"
                        value={userFilter}
                        onChange={(event) => setUserFilter(event.target.value)}
                        className="w-full p-2 border rounded"
                    />
                    <input
                        type="text"
                        placeholder="Client ID"
                        value={clientIdFilter}
                        onChange={(event) => setClientIdFilter(event.target.value)}
                        className="w-full p-2 border rounded"
                    />
                    <select
                        value={eventType}
                        onChange={(event) => setEventType(event.target.value)}
                        className="w-full p-2 border rounded"
                    >
                        <option value="">Event type</option>
                        <option value="LOGIN">LOGIN</option>
                        <option value="LOGOUT">LOGOUT</option>
                        <option value="REGISTER">REGISTER</option>
                    </select>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(event) => setStartDate(event.target.value)}
                        className="w-full p-2 border rounded"
                    />
                    <input
                        type="date"
                        value={endDate}
                        onChange={(event) => setEndDate(event.target.value)}
                        className="w-full p-2 border rounded"
                    />
                </div>

            </Card>

            <Card>
                {loading ? (
                    <div className="space-y-3">
                        <div className="skeleton h-10" />
                        <div className="skeleton h-10" />
                        <div className="skeleton h-10" />
                    </div>
                ) : filteredData.length === 0 ? (
                    <EmptyState
                        title="No login events"
                        description="Try adjusting filters or check back later."
                    />
                ) : (
                    <DataGrid
                            dataSource={filteredData}
                            showBorders={true}
                            showRowLines={true}
                            showColumnLines={true}
                            height="650px"
                            width="100%"
                            keyExpr="rowId"
                            allowColumnResizing={true}
                            columnResizingMode="widget"
                            columnChooser={{ enabled: true }}
                            columnAutoWidth={true}
                            columnHidingEnabled={true}
                            wordWrapEnabled={false}
                            scrolling={{ mode: "virtual", showScrollbar: "always", useNative: true }}
                            pager={{ visible: false }}
                            ref={gridRef}
                            onRowClick={(event) => setSelectedRow(event.data)}
                        >
                            <Sorting mode="multiple" />
                            <Paging enabled={false} />

                            <Column
                                dataField="userId"
                                caption="User ID"
                                minWidth={200}
                                cellRender={(cellData: any) => (
                                    <span className="admin-table__cell-truncate" title={cellData.value}>
                                        {cellData.value}
                                    </span>
                                )}
                            />
                            <Column dataField="username" caption="Username" minWidth={180} />
                            <Column dataField="clientId" caption="Client ID" minWidth={160} />
                            <Column dataField="auth_method" caption="Auth Method" minWidth={140} />
                            <Column dataField="auth_type" caption="Auth Type" minWidth={120} />
                            <Column dataField="code_id" caption="Code ID" minWidth={150} />
                            <Column dataField="consent" caption="Consent" minWidth={140} />
                            <Column
                                dataField="redirect_uri"
                                caption="Redirect URI"
                                width={240}
                                cellRender={(cellData: any) => (
                                    <span title={cellData.value} className="admin-table__cell-truncate">
                                        {cellData.value}
                                    </span>
                                )}
                            />
                            <Column dataField="response_mode" caption="Response Mode" minWidth={140} />
                            <Column dataField="response_type" caption="Response Type" minWidth={140} />
                            <Column dataField="ipAddress" caption="IP Address" minWidth={140} />
                            <Column dataField="realmId" caption="Realm ID" minWidth={160} />
                            <Column dataField="time" caption="Timestamp" dataType="datetime" format="yyyy-MM-dd HH:mm:ss" minWidth={170} />
                            <Column dataField="type" caption="Event Type" minWidth={120} />
                            <Column
                                caption="Actions"
                                width={110}
                                cellRender={(cellData: any) => (
                                    <button
                                        className="btn btn-outline"
                                        aria-label="Copy user id"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            copyValue(cellData.data.userId);
                                        }}
                                    >
                                        Copy
                                    </button>
                                )}
                            />
                        </DataGrid>
                )}
            </Card>

            <Drawer
                isOpen={Boolean(selectedRow)}
                title="Login details"
                onClose={() => setSelectedRow(null)}
            >
                {selectedRow && (
                    <div className="space-y-3">
                        {Object.entries(selectedRow).map(([key, value]) => (
                            <div key={key}>
                                <strong>{key}</strong>
                                <div className="muted break-all">{String(value)}</div>
                            </div>
                        ))}
                    </div>
                )}
            </Drawer>
        </div>
    );
};

export default UserInfoPage;
