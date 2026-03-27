import React, { useEffect, useMemo, useState } from "react";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import { IApiClient } from "../../../iterfaces/i-api-client";
import HighchartsReact from "highcharts-react-official";
import Highcharts from "highcharts";
import { DataGrid } from "devextreme-react";
import { Column } from "devextreme-react/cjs/data-grid";
import PageHeader from "../../layout/PageHeader";
import Card from "../../ui/Card";
import EmptyState from "../../ui/EmptyState";
import { useAdminHeader } from "../../layout/AdminHeaderContext";

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
    const [loading, setLoading] = useState(true);
    const [chartType, setChartType] = useState<"pie" | "bar">("pie");
    const [groupBy, setGroupBy] = useState<"name" | "gameId">("name");
    const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
    const { setHeaderActions, setPageTitle } = useAdminHeader();

    useEffect(() => {
        setPageTitle("Game Statistics");
        setHeaderActions([]);
    }, [setHeaderActions, setPageTitle]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await apiClient.api.get("api/Cart");
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
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const totalCarts = groupedGames.reduce((sum, entry) => sum + entry.totalCount, 0);
    const topCategory = groupedGames.sort((a, b) => b.totalCount - a.totalCount)[0];
    const avgItemsPerCart = groupedGames.length ? (totalCarts / groupedGames.length).toFixed(2) : "—";

    const chartData = useMemo(() => {
        if (groupBy === "name") {
            return groupedGames.map(({ name, totalCount }) => ({
                name: name || "Unnamed",
                y: totalCount,
                drilldown: name || "Unnamed",
            }));
        }
        const flatGames = groupedGames.flatMap((entry) =>
            entry.games.map((game) => ({
                name: game.gameId,
                y: game.count,
            }))
        );
        return flatGames;
    }, [groupBy, groupedGames]);

    const drilldownData = groupedGames.map(({ name, games }) => ({
        id: name || "Unnamed",
        name: `Games inside ${name || "Unnamed"}`,
        data: games.map(({ gameId, count }) => [gameId, count]),
    }));

    const options = {
        chart: {
            type: chartType,
        },
        title: {
            text: "Game distribution in carts",
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
        drilldown: chartType === "pie" ? { series: drilldownData } : undefined,
    };

    return (
        <div className="admin-grid">
            <PageHeader
                title="Game statistics"
                description="Track cart activity, top categories, and distribution trends."
                breadcrumbs={["Analytics", "Game statistics"]}
            />

            <div className="admin-grid admin-grid--3">
                <Card>
                    <h3>Total carts</h3>
                    <div className="text-2xl font-semibold">{loading ? "—" : totalCarts}</div>
                </Card>
                <Card>
                    <h3>Unique users</h3>
                    <div className="text-2xl font-semibold">—</div>
                </Card>
                <Card>
                    <h3>Top category</h3>
                    <div className="text-2xl font-semibold">{topCategory?.name || "Unnamed"}</div>
                </Card>
                <Card>
                    <h3>Avg items / cart</h3>
                    <div className="text-2xl font-semibold">{avgItemsPerCart}</div>
                </Card>
                <Card>
                    <h3>Active campaigns</h3>
                    <div className="text-2xl font-semibold">—</div>
                </Card>
                <Card>
                    <h3>Revenue impact</h3>
                    <div className="text-2xl font-semibold">—</div>
                </Card>
            </div>

            {loading ? (
                <Card>
                    <div className="skeleton h-12" />
                    <div className="skeleton h-12 mt-3" />
                    <div className="skeleton h-12 mt-3" />
                </Card>
            ) : groupedGames.length === 0 ? (
                <EmptyState title="No analytics yet" description="Once carts are active, stats will appear here." />
            ) : (
                <div className="admin-grid admin-grid--2">
                    <Card>
                        <div className="flex items-center justify-between">
                            <h3>Top categories</h3>
                            <button className="btn btn-outline">View all</button>
                        </div>
                        <DataGrid
                            dataSource={groupedGames.map((gGames) => ({
                                name: gGames.name || "Unnamed",
                                totalCount: gGames.totalCount,
                            }))}
                            keyExpr="name"
                            showBorders={true}
                            allowColumnReordering={true}
                            allowColumnResizing={true}
                        >
                            <Column dataField="name" caption="Category" />
                            <Column dataField="totalCount" caption="Items in carts" />
                        </DataGrid>
                    </Card>

                    <Card>
                        <div className="flex items-center justify-between gap-2">
                            <h3>Distribution</h3>
                            <div className="flex gap-2">
                                <select
                                    value={groupBy}
                                    onChange={(event) => setGroupBy(event.target.value as typeof groupBy)}
                                    className="w-full p-2 border rounded"
                                >
                                    <option value="name">Group by category</option>
                                    <option value="gameId">Group by game ID</option>
                                </select>
                                <button
                                    className="btn btn-outline"
                                    onClick={() => setChartType((prev) => (prev === "pie" ? "bar" : "pie"))}
                                >
                                    {chartType === "pie" ? "Bar" : "Pie"}
                                </button>
                            </div>
                        </div>
                        <HighchartsReact highcharts={Highcharts} options={options} />
                    </Card>
                </div>
            )}
        </div>
    );
};

export default UserStatsPage;
