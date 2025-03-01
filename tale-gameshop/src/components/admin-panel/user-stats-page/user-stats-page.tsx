import React, {useEffect, useState} from "react";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import {IApiClient} from "../../../iterfaces/i-api-client";
import HighchartsReact from "highcharts-react-official";
import Highcharts from "highcharts";

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
        name: `Number of games with this name: '${name}' and ID`,
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

    return (
        <div className="p-8">
            <h2 className="text-xl font-bold mb-4">Statistics of games in user carts</h2>
            <HighchartsReact highcharts={Highcharts} options={options} />
        </div>
    );
};

export default UserStatsPage;

