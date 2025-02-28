import React, {useEffect, useState} from "react";
import container from "../../../inversify.config";
import {IAdminService} from "../../../iterfaces/i-admin-service";
import IDENTIFIERS from "../../../constants/identifiers";
import {IApiClient} from "../../../iterfaces/i-api-client";
import HighchartsReact from "highcharts-react-official";
import Highcharts from "highcharts";

const UserStatsPage: React.FC = () => {
    const [data, setData] = useState([]);

    const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await apiClient.api.get("api/Cart");
                console.log("Fetched Data:", res);


                setData(res.data);
            } catch (error) {
                console.error("Error loading table data:", error);
            }
        };

        fetchData();
    }, []);



    const options = {
        chart: {
            type: 'pie',
        },
        title: {
            text: 'Пример графика типа Pie',
        },
        series: [
            {
                name: 'Данные',
                data: [
                    { name: 'Категория A', y: 35 },
                    { name: 'Категория B', y: 25 },
                    { name: 'Категория C', y: 20 },
                    { name: 'Категория D', y: 15 },
                    { name: 'Категория E', y: 5 },
                ],
            },
        ],
    };

    return (
        <div className="p-8">
            <div>
                <HighchartsReact highcharts={Highcharts} options={options}/>
            </div>
        </div>
    );
};

export default UserStatsPage;
