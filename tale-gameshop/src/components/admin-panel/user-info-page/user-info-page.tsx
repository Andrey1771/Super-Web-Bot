import React, {useEffect, useState} from "react";

import 'devextreme/dist/css/dx.light.css';
import {DataGrid} from "devextreme-react";
import {Column, FilterRow, Paging, Sorting} from "devextreme-react/data-grid";
import container from "../../../inversify.config";
import type {IApiClient} from "../../../iterfaces/i-api-client";
import IDENTIFIERS from "../../../constants/identifiers";
import { IAdminService } from "../../../iterfaces/i-admin-service";

const UserInfoPage: React.FC = () => {
    const [data, setData] = useState([
        { id: 1, name: 'Alice', age: 25, city: 'New York' },
        { id: 2, name: 'Bob', age: 30, city: 'San Francisco' },
        { id: 3, name: 'Charlie', age: 35, city: 'Los Angeles' },
        { id: 4, name: 'David', age: 28, city: 'Chicago' }
    ]);

    const adminService = container.get<IAdminService>(IDENTIFIERS.IAdminService);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await adminService.getAllMappedLoginEvents();
                console.log(res);
                setData(res);
            } catch (error) {
                console.error("Error load data of table:", error);
            }
        };

        fetchData();
    }, []);

    return (
        <div>
            <h2>DevExtreme DataGrid Example</h2>
            <DataGrid
                dataSource={data}
                showRowLines={true}
                showColumnLines={true}
                height={"auto"}
            >
                <Sorting mode="multiple" />
                <Paging pageSize={10} />
                <FilterRow visible={true} />
                <Column dataField="id" caption="ID" />
                <Column dataField="name" caption="Name" />
                <Column dataField="age" caption="Age" />
                <Column dataField="city" caption="City" />
            </DataGrid>
        </div>
    );
};

export default UserInfoPage;