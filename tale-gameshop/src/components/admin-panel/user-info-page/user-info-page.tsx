import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REMOTE_PAGING } from "../../../hooks/use-grid-window";

import "devextreme/dist/css/dx.light.css";
import { DataGrid } from "devextreme-react";
import { Column, Paging, Scrolling, Sorting, type DataGridRef } from "devextreme-react/data-grid";
import CustomStore from "devextreme/data/custom_store";
import container from "../../../inversify.config";
import { IAdminService } from "../../../iterfaces/i-admin-service";
import IDENTIFIERS from "../../../constants/identifiers";
import PageHeader from "../../layout/PageHeader";
import Card from "../../ui/Card";
import Drawer from "../../ui/Drawer";
import EmptyState from "../../ui/EmptyState";
import { useToast } from "../../ui/ToastProvider";
import { useAdminHeader } from "../../layout/AdminHeaderContext";

/**
 * Настройки грида — снаружи компонента. devextreme-react сравнивает свойства по ссылке:
 * объект, записанный прямо в разметке, создаётся заново на каждый рендер, грид считает это
 * сменой настроек и перечитывает данные, а загрузка вызывает следующий рендер.
 */
const COLUMN_CHOOSER = { enabled: true };
const INFINITE_SCROLLING = { mode: "infinite" as const, showScrollbar: "always" as const };
const HIDDEN_PAGER = { visible: false };

const UserInfoPage: React.FC = () => {
    // Запрос не прошёл. Без этого признака ошибка выглядела как «событий нет»: тост уезжал
    // через четыре секунды, а на экране оставалось честное с виду пустое состояние.
    const [loadFailed, setLoadFailed] = useState(false);
    const [reloadTick, setReloadTick] = useState(0);
    const [loadedCount, setLoadedCount] = useState(0);
    const [selectedRow, setSelectedRow] = useState<any | null>(null);
    const [eventType, setEventType] = useState("");
    const [userFilter, setUserFilter] = useState("");
    const [clientIdFilter, setClientIdFilter] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const gridRef = useRef<DataGridRef | null>(null);
    const { addToast } = useToast();
    const { setPageTitle } = useAdminHeader();

    const adminService = container.get<IAdminService>(IDENTIFIERS.IAdminService);

    // Событие журнала → строка таблицы. Подробности Keycloak держит во вложенном объекте,
    // а таблице нужны плоские поля.
/** Как называется поле события на языке человека. Остальные показываем как есть. */
const FIELD_LABELS: Record<string, string> = {
    time: "Time",
    type: "Event",
    userId: "User ID",
    username: "Username",
    clientId: "Client",
    ipAddress: "IP address",
    realmId: "Realm",
    auth_method: "Auth method",
    auth_type: "Auth type",
    code_id: "Code ID",
    redirect_uri: "Redirect URI",
    consent: "Consent",
    sessionId: "Session",
    error: "Error",
};

/** Порядок: сначала то, ради чего событие открывают, потом технические подробности. */
const FIELD_ORDER = ["time", "type", "username", "userId", "clientId", "ipAddress", "error"];

/**
 * Событие в виде подписей и значений.
 *
 * Раньше здесь печатался сырой объект строки: время показывалось числом вроде 1788483999876,
 * а вложенный details выводился как «[object Object]». Подробности из details уже разложены
 * по строке (см. toRow), поэтому сам объект здесь не нужен — как и внутренний ключ строки.
 */
const describeEvent = (row: Record<string, any>): Array<{ label: string; value: React.ReactNode }> => {
    const hidden = new Set(["rowId", "details"]);
    const keys = [
        ...FIELD_ORDER.filter((key) => key in row),
        ...Object.keys(row).filter((key) => !FIELD_ORDER.includes(key) && !hidden.has(key)),
    ];

    const entries: Array<{ label: string; value: React.ReactNode }> = [];

    for (const key of keys) {
        if (hidden.has(key)) {
            continue;
        }
        const raw = row[key];
        if (raw === null || raw === undefined || raw === "") {
            continue;
        }

        let value: React.ReactNode = String(raw);
        if (key === "time") {
            const stamp = Number(raw);
            value = Number.isFinite(stamp) ? new Date(stamp).toLocaleString() : String(raw);
        } else if (typeof raw === "object") {
            // Не «[object Object]»: вложенное показываем как есть, читаемым текстом.
            value = <pre className="login-details__json">{JSON.stringify(raw, null, 2)}</pre>;
        }

        entries.push({ label: FIELD_LABELS[key] ?? key, value });
    }

    return entries;
};

const toRow = (item: any, index: number) => {
        const merged = { ...item, ...item.details };
        return {
            ...merged,
            rowId: `${merged.userId ?? "unknown"}__${merged.time ?? "unknown"}__${merged.clientId ?? ""}__${merged.code_id ?? ""}__${merged.type ?? ""}__${index}`,
        };
    };

    // Перезагрузка: пересобираем источник — таблица сама заберёт первое окно.
    const fetchData = useCallback(() => {
        setLoadFailed(false);
        setReloadTick((tick) => tick + 1);
    }, []);

    /**
     * Источник строк. Окно и фильтры уходят в Keycloak: раньше страница забирала пятьсот
     * последних событий разом и отбирала нужные в браузере — на живом магазине это и медленно,
     * и неверно, потому что «не нашлось» могло означать «не попало в эти пятьсот».
     */
    const gridSource = useMemo(() => {
        const filters = {
            type: eventType,
            user: userFilter,
            client: clientIdFilter,
            dateFrom: startDate,
            dateTo: endDate,
        };

        return new CustomStore({
            key: "rowId",
            load: async (options: { skip?: number; take?: number }) => {
                try {
                    const skip = options.skip ?? 0;
                    const take = options.take ?? 100;
                    const events = await adminService.getLoginEventsPage({ skip, take, ...filters });
                    setLoadFailed(false);
                    setLoadedCount(skip + events.length);
                    return events.map((item: any, index: number) => toRow(item, skip + index));
                } catch (error) {
                    console.error("Error loading table data:", error);
                    setLoadFailed(true);
                    addToast("Failed to load login history", "error");
                    throw error;
                }
            },
        });
    }, [adminService, addToast, clientIdFilter, endDate, eventType, reloadTick, startDate, userFilter]);

    // Клиентского фильтра здесь больше нет: отбор идёт в Keycloak, а в браузер приезжает
    // только окно строк. Свободный поиск по всему тексту убран сознательно — Keycloak его
    // не умеет, а фильтровать загруженный кусок значило бы говорить «не найдено» о том,
    // что просто не попало в окно.


    const copyValue = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            addToast("Copied to clipboard", "success");
        } catch (error) {
            console.error("Copy failed", error);
            addToast("Copy failed", "error");
        }
    };

    // useCallback здесь по-прежнему нужен: обработчики уходят в кнопки шапки страницы, и
    // пересоздание на каждом рендере зря перерисовывало бы её вместе с таблицей.
    const handleShowColumns = useCallback(() => {
        // instance() — метод, а не свойство: обращение к нему как к полю давало undefined,
        // и кнопка «Columns» всегда отвечала «unavailable», ничего не открывая.
        const instance = gridRef.current?.instance();
        if (instance) {
            instance.showColumnChooser();
        } else {
            addToast("Column chooser unavailable", "error");
        }
    }, [addToast]);

    const exportCsv = useCallback(async () => {
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
        // Выгружаем не показанное окно, а выборку по текущим фильтрам — до пятисот событий
        // (столько за раз отдаёт Keycloak). Если упёрлись в потолок, честно предупреждаем.
        const exported = await adminService.getLoginEventsPage({
            skip: 0,
            take: 500,
            type: eventType,
            user: userFilter,
            client: clientIdFilter,
            dateFrom: startDate,
            dateTo: endDate,
        });

        const rows = exported.map((raw: any) => {
            const item = { ...raw, ...raw.details };
            return [
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
            ];
        });

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
        if (exported.length >= 500) {
            addToast("Exported the first 500 events — narrow the filters for the rest.", "info");
        }
    }, [addToast, adminService, clientIdFilter, endDate, eventType, startDate, userFilter]);

    useEffect(() => {
        setPageTitle("Login History");
    }, [setPageTitle]);

    return (
        <div className="admin-grid">
            <PageHeader
                title="Login history"
                description="Track authentication events with filters and detailed records."
                breadcrumbs={["Customers", "Login history"]}
                primaryAction={
                    <>
                        <button className="btn btn-primary" type="button" onClick={exportCsv}>Export CSV</button>
                        <button className="btn btn-outline" type="button" onClick={fetchData}>Refresh</button>
                    </>
                }
            />

            <Card>
                <div className="admin-grid admin-grid--3">
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
                        {/* «All events» — это то, что показано по умолчанию: Keycloak пишет не
                            только входы людей, но и выдачу токенов и вход сервисных клиентов. */}
                        <option value="">All events</option>
                        <option value="LOGIN">LOGIN — вход пользователя</option>
                        <option value="LOGOUT">LOGOUT — выход</option>
                        <option value="REGISTER">REGISTER — регистрация</option>
                        <option value="CODE_TO_TOKEN">CODE_TO_TOKEN — обмен кода на токен</option>
                        <option value="REFRESH_TOKEN">REFRESH_TOKEN — продление сессии</option>
                        <option value="CLIENT_LOGIN">CLIENT_LOGIN — вход сервисного клиента</option>
                        <option value="LOGIN_ERROR">LOGIN_ERROR — неудачный вход</option>
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
                {/* Выбор колонок относится к этой таблице, поэтому и стоит над ней. */}
                <div className="mb-3 flex justify-end">
                    <button className="btn btn-outline" type="button" onClick={handleShowColumns}>
                        Columns
                    </button>
                </div>
                {/* Своего скелета у страницы нет: строки грузит грид окнами и сам показывает
                    это в таблице. Прежний флаг загрузки снимать было некому. */}
                {loadFailed ? (
                    <EmptyState
                        title="Failed to load login history"
                        description="The server did not answer. It may be restarting — try again in a moment."
                        action={<button className="btn btn-primary" type="button" onClick={fetchData}>Try again</button>}
                    />
                ) : (
                    <DataGrid
                            dataSource={gridSource}
                            remoteOperations={REMOTE_PAGING}
                            noDataText="No login events for these filters."
                            showBorders={true}
                            showRowLines={true}
                            showColumnLines={true}
                            height="650px"
                            width="100%"
                            allowColumnResizing={true}
                            columnResizingMode="widget"
                            columnChooser={COLUMN_CHOOSER}
                            columnAutoWidth={true}
                            columnHidingEnabled={true}
                            wordWrapEnabled={false}
                            scrolling={INFINITE_SCROLLING}
                            pager={HIDDEN_PAGER}
                            ref={gridRef}
                            onRowClick={(event) => setSelectedRow(event.data)}
                            onRowPrepared={(event: any) => {
                                if (event.rowType !== "data") {
                                    return;
                                }
                                event.rowElement.style.cursor = "pointer";
                                if (selectedRow && event.data?.rowId === selectedRow.rowId) {
                                    event.rowElement.classList.add("admin-table__row-selected");
                                }
                            }}
                        >
                            {/* Порядок задаёт Keycloak — свежие сверху. Сортировка по
                                загруженному куску показывала бы не то. */}
                            <Sorting mode="none" />
                            <Paging enabled={true} pageSize={100} />

                            {/* Порядок колонок: сначала «когда и что», потом «с кем», потом техника.
                                Событие и время стояли последними, за краем экрана, — и пустые
                                ячейки выглядели потерянными данными, хотя объясняются типом
                                события: у CODE_TO_TOKEN нет имени пользователя, у CLIENT_LOGIN
                                нет способа входа. Keycloak кладёт в каждое событие свой набор
                                подробностей, а колонки здесь — объединение всех наборов. */}
                            <Column dataField="time" caption="Time" dataType="datetime" format="yyyy-MM-dd HH:mm:ss" minWidth={170} />
                            <Column dataField="type" caption="Event" minWidth={150} />
                            <Column dataField="username" caption="Username" minWidth={180} />
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
                            <Column dataField="clientId" caption="Client ID" minWidth={160} />
                            <Column dataField="ipAddress" caption="IP Address" minWidth={140} />
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
                            <Column dataField="realmId" caption="Realm ID" minWidth={160} />
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

                {!loadFailed && (
                    <p className="text-xs text-gray-500 mt-3">
                        {loadedCount} event{loadedCount === 1 ? "" : "s"} loaded · scroll for more
                    </p>
                )}
            </Card>

            <Drawer
                isOpen={Boolean(selectedRow)}
                title="Login details"
                onClose={() => setSelectedRow(null)}
            >
                {selectedRow && (
                    <dl className="login-details">
                        {describeEvent(selectedRow).map(({ label, value }) => (
                            <React.Fragment key={label}>
                                <dt className="login-details__label">{label}</dt>
                                <dd className="login-details__value">{value}</dd>
                            </React.Fragment>
                        ))}
                    </dl>
                )}
            </Drawer>
        </div>
    );
};

export default UserInfoPage;
