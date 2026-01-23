import React, { useEffect, useMemo, useRef, useState } from "react";

import "devextreme/dist/css/dx.light.css";
import { DataGrid } from "devextreme-react";
import { Column, FilterRow, Paging, Sorting } from "devextreme-react/data-grid";
import container from "../../../inversify.config";
import { IAdminService } from "../../../iterfaces/i-admin-service";
import IDENTIFIERS from "../../../constants/identifiers";
import PageHeader from "../../layout/PageHeader";
import Card from "../../ui/Card";
import Drawer from "../../ui/Drawer";
import EmptyState from "../../ui/EmptyState";
import useDebouncedValue from "../../../hooks/useDebouncedValue";
import { useToast } from "../../ui/ToastProvider";

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

    const adminService = container.get<IAdminService>(IDENTIFIERS.IAdminService);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await adminService.getAllMappedLoginEvents();
                // Преобразуем данные, добавляя поля из details
                const transformedData = res.map((item: any) => ({
                    ...item,
                    ...item.details,
                }));

                setData(transformedData);
            } catch (error) {
                console.error("Error loading table data:", error);
                addToast("Failed to load login history", "error");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

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

    return (
        <div className="admin-grid">
            <PageHeader
                title="Login history"
                description="Track authentication events with filters and detailed records."
                breadcrumbs={["Users", "Login history"]}
                primaryAction={<button className="btn btn-primary">Export CSV</button>}
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

                <div className="flex justify-end mt-4 gap-2">
                    <button
                        className="btn btn-outline"
                        onClick={() => gridRef.current?.instance?.showColumnChooser()}
                    >
                        Columns
                    </button>
                    <button className="btn btn-outline">Export CSV</button>
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
                        keyExpr="userId"
                        allowColumnResizing={true}
                        columnResizingMode="widget"
                        columnChooser={{ enabled: true }}
                        columnAutoWidth={true}
                        wordWrapEnabled={true}
                        scrolling={{ mode: "virtual" }}
                        pager={{ visible: false }}
                        ref={gridRef}
                        onRowClick={(event) => setSelectedRow(event.data)}
                    >
                        <Sorting mode="multiple" />
                        <Paging pageSize={10} />
                        <FilterRow visible={true} />

                        <Column
                            dataField="userId"
                            caption="User ID"
                            cellRender={(cellData: any) => (
                                <div className="flex items-center gap-2">
                                    <span>{cellData.value}</span>
                                    <button
                                        className="btn btn-outline"
                                        onClick={() => copyValue(cellData.value)}
                                    >
                                        Copy
                                    </button>
                                </div>
                            )}
                        />
                        <Column dataField="username" caption="Username" />
                        <Column
                            dataField="clientId"
                            caption="Client ID"
                            cellRender={(cellData: any) => (
                                <div className="flex items-center gap-2">
                                    <span>{cellData.value}</span>
                                    <button
                                        className="btn btn-outline"
                                        onClick={() => copyValue(cellData.value)}
                                    >
                                        Copy
                                    </button>
                                </div>
                            )}
                        />
                        <Column dataField="auth_method" caption="Auth Method" />
                        <Column dataField="auth_type" caption="Auth Type" />
                        <Column dataField="code_id" caption="Code ID" />
                        <Column dataField="consent" caption="Consent" />
                        <Column
                            dataField="redirect_uri"
                            caption="Redirect URI"
                            cellRender={(cellData: any) => (
                                <span title={cellData.value} className="admin-table__cell-truncate">
                                    {cellData.value}
                                </span>
                            )}
                        />
                        <Column dataField="response_mode" caption="Response Mode" />
                        <Column dataField="response_type" caption="Response Type" />
                        <Column dataField="ipAddress" caption="IP Address" />
                        <Column dataField="realmId" caption="Realm ID" />
                        <Column dataField="time" caption="Timestamp" dataType="datetime" format="yyyy-MM-dd HH:mm:ss" />
                        <Column dataField="type" caption="Event Type" />
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
