import React, {useEffect, useState} from "react";
import container from "../../../inversify.config";
import {IAdminService} from "../../../iterfaces/i-admin-service";
import IDENTIFIERS from "../../../constants/identifiers";
import {IApiClient} from "../../../iterfaces/i-api-client";
import HighchartsReact from "highcharts-react-official";
import Highcharts from "highcharts";

//TODO Вынести в отдельный файл и следить за тем, чтобы не было повторного вызова
import Drilldown from 'highcharts/modules/drilldown';
if (!Highcharts.Chart.prototype.addSeriesAsDrilldown) {
    Drilldown(Highcharts);
}

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
            text: 'Пример Pie Chart с Drilldown',
        },
        accessibility: {
            announceNewData: {
                enabled: true,
            },
        },
        plotOptions: {
            series: {
                dataLabels: {
                    enabled: true,
                    format: '{point.name}: {point.y}%',
                },
            },
        },
        series: [
            {
                name: 'Категории',
                colorByPoint: true,
                data: [
                    {
                        name: 'Категория A',
                        y: 40,
                        drilldown: 'categoryA', // Указываем drilldown ID
                    },
                    {
                        name: 'Категория B',
                        y: 30,
                        drilldown: 'categoryB',
                    },
                    {
                        name: 'Категория C',
                        y: 20,
                        drilldown: 'categoryC',
                    },
                ],
            },
        ],
        drilldown: {
            series: [
                {
                    id: 'categoryA',
                    name: 'Детализация A',
                    data: [
                        ['A1', 20],
                        ['A2', 10],
                        ['A3', 10],
                    ],
                },
                {
                    id: 'categoryB',
                    name: 'Детализация B',
                    data: [
                        ['B1', 15],
                        ['B2', 10],
                        ['B3', 5],
                    ],
                },
                {
                    id: 'categoryC',
                    name: 'Детализация C',
                    data: [
                        ['C1', 10],
                        ['C2', 5],
                        ['C3', 5],
                    ],
                },
            ],
        },
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
