import React, { useEffect, useState } from "react";

import "devextreme/dist/css/dx.light.css";
import { DataGrid } from "devextreme-react";
import { Column, FilterRow, Paging, Sorting } from "devextreme-react/data-grid";
import container from "../../../inversify.config";
import { IAdminService } from "../../../iterfaces/i-admin-service";
import IDENTIFIERS from "../../../constants/identifiers";

const UserInfoPage: React.FC = () => {
    const [data, setData] = useState([]);

    const adminService = container.get<IAdminService>(IDENTIFIERS.IAdminService);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await adminService.getAllMappedLoginEvents();
                console.log("Fetched Data:", res);

                // Преобразуем данные, добавляя поля из details
                const transformedData = res.map((item: any) => ({
                    ...item, // Копируем основные поля
                    ...item.details, // Добавляем поля из details
                }));

                setData(transformedData);
            } catch (error) {
                console.error("Error loading table data:", error);
            }
        };

        fetchData();
    }, []);

    return (
        <div className="p-2">
            <h2>Список логинов пользователей</h2>
            <DataGrid
                dataSource={data}
                showBorders={true}
                showRowLines={true}
                showColumnLines={true}
                height="600px"
                width="100%"
                keyExpr="userId"
                allowColumnResizing={true}
                columnResizingMode="widget"
                columnChooser={{ enabled: true }}
                columnAutoWidth={true}
                wordWrapEnabled={true}
                scrolling={{ mode: "virtual" }}
            >
                <Sorting mode="multiple" />
                <Paging pageSize={10} />
                <FilterRow visible={true} />

                <Column dataField="userId" caption="User ID" />
                <Column dataField="username" caption="Username" />
                <Column dataField="clientId" caption="Client ID" />
                <Column dataField="auth_method" caption="Auth Method" />
                <Column dataField="auth_type" caption="Auth Type" />
                <Column dataField="code_id" caption="Code ID" />
                <Column dataField="consent" caption="Consent" />
                <Column dataField="redirect_uri" caption="Redirect URI" />
                <Column dataField="response_mode" caption="Response Mode" />
                <Column dataField="response_type" caption="Response Type" />
                <Column dataField="ipAddress" caption="IP Address" />
                <Column dataField="realmId" caption="Realm ID" />
                <Column dataField="time" caption="Timestamp" dataType="datetime" format="yyyy-MM-dd HH:mm:ss" />
                <Column dataField="type" caption="Event Type" />
            </DataGrid>
        </div>
    );
};

export default UserInfoPage;
