import React, { useEffect, useState } from "react";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import { IApiClient } from "../../../iterfaces/i-api-client";
import HighchartsReact from "highcharts-react-official";
import Highcharts from "highcharts";
import { DataGrid } from "devextreme-react";
import { Column, MasterDetail, GroupPanel } from "devextreme-react/cjs/data-grid";

//TODO Вынести в отдельный файл и следить за тем, чтобы не было повторного вызова
import Drilldown from 'highcharts/modules/drilldown';
if (!Highcharts.Chart.prototype.addSeriesAsDrilldown) {
    Drilldown(Highcharts);
}

interface GameEntry {
    gameId: string;
    name: string;
    count: number;
}

interface GroupedGameEntry {
    name: string;
    totalCount: number;
    games: { gameId: string; count: number }[];
}

const UserStatsPage: React.FC = () => {
    const [groupedGames, setGroupedGames] = useState<GroupedGameEntry[]>([]);
    const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await apiClient.api.get("api/Cart");
                console.log("Fetched Data:", res);

                const gameCountMap: Record<string, GameEntry> = {};

                // Шагаем по данным и считаем количество каждого gameId
                res.data.forEach((userCart: { cartGames: { gameId: string; name: string }[] }) => {
                    userCart.cartGames.forEach((game) => {
                        if (!gameCountMap[game.gameId]) {
                            gameCountMap[game.gameId] = { gameId: game.gameId, name: game.name, count: 0 };
                        }
                        gameCountMap[game.gameId].count += 1;
                    });
                });

                // Преобразуем в массив и сортируем по gameId
                const sortedGames = Object.values(gameCountMap).sort((a, b) => a.gameId.localeCompare(b.gameId));

                // Группируем по name
                const groupedMap: Record<string, GroupedGameEntry> = {};

                sortedGames.forEach(({ gameId, name, count }) => {
                    if (!groupedMap[name]) {
                        groupedMap[name] = { name, totalCount: 0, games: [] };
                    }
                    groupedMap[name].totalCount += count;
                    groupedMap[name].games.push({ gameId, count });
                });
                const groupedData = Object.values(groupedMap);

                setGroupedGames(groupedData);
            } catch (error) {
                console.error("Error loading table data:", error);
            }
        };

        fetchData();
    }, []);

    // Формируем данные для графика
    const chartData = groupedGames.map(({ name, totalCount }) => ({
        name,
        y: totalCount,
        drilldown: name,
    }));

    // Формируем данные для drilldown
    const drilldownData = groupedGames.map(({ name, games }) => ({
        id: name,
        name: `Number of games with this name: ${name} and ID`,
        data: games.map(({ gameId, count }) => [gameId, count]),
    }));

    const options = {
        chart: {
            type: "pie",
        },
        title: {
            text: "Distribution of games by categories in users' carts",
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
                    format: "{point.name}: {point.y}",
                },
            },
        },
        series: [
            {
                name: "Games",
                colorByPoint: true,
                data: chartData,
            },
        ],
        drilldown: {
            series: drilldownData,
        },
    };

    const DetailTemplate = (props: any) => {
        const { games } = props.data.data;

        return (
            <React.Fragment>
                <DataGrid
                    dataSource={games}
                    showBorders={true}
                    keyExpr="gameId"
                >
                    <Column dataField="gameId" caption="Game ID" />
                    <Column dataField="count" caption="Количество" />
                </DataGrid>
            </React.Fragment>
        );
    };

    return (
        <div className="p-8 flex gap-4">
            {/* Блок с таблицей */}
            <div className="w-1/2">
                <h2 className="text-xl font-bold mb-4">📋 Table of games</h2>
                <DataGrid
                    dataSource={groupedGames.map(gGames => {
                        return {
                            name: gGames.name,
                            totalCount: gGames.totalCount,
                            games: gGames.games.map(games => `Game: ${games.gameId} Count: ${games.count}`)
                        };
                    })}

                    keyExpr="name"
                    showBorders={true}
                    allowColumnReordering={true}
                    allowColumnResizing={true}
                >
                    <GroupPanel visible={true} />
                    <Column dataField="name" caption="Категория игр" />
                    <Column dataField="totalCount" caption="Всего игр" />
                    <Column dataField="games" caption="Игры подробнее" />

                    {/* Разворачиваем ячейки для подробностей */}
                    {/*<MasterDetail enabled={true} component={DetailTemplate} />*/}
                </DataGrid>
            </div>

            {/* Блок с диаграммой */}
            <div className="w-1/2">
                <h2 className="text-xl font-bold mb-4">📊 Game statistics</h2>
                <HighchartsReact highcharts={Highcharts} options={options} />
            </div>
        </div>
    );
};

export default UserStatsPage;
