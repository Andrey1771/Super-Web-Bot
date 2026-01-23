import React from "react";
import { Link } from "react-router-dom";
import PageHeader from "../../layout/PageHeader";
import Card from "../../ui/Card";

const AdminPanelPage: React.FC = () => {
    return (
        <div className="admin-grid">
            <PageHeader
                title="Admin overview"
                description="Everything you need to manage the shop, bot, and analytics from one workspace."
                breadcrumbs={["Admin", "Dashboard"]}
                primaryAction={<button className="btn btn-primary">Export report</button>}
            />

            <div className="admin-grid admin-grid--3">
                {[
                    { label: "System status", value: "Operational", helper: "Last updated 2 min ago" },
                    { label: "Orders today", value: "—", helper: "Awaiting live data" },
                    { label: "Active users", value: "—", helper: "Awaiting live data" },
                ].map((card) => (
                    <Card key={card.label}>
                        <h3>{card.label}</h3>
                        <div className="text-2xl font-semibold">{card.value}</div>
                        <p>{card.helper}</p>
                    </Card>
                ))}
            </div>

            <div className="admin-grid admin-grid--2">
                <Card>
                    <h3>Quick navigation</h3>
                    <p>Jump to the most frequently used admin tools.</p>
                    <div className="flex gap-3 flex-wrap">
                        <Link className="btn btn-outline" to="/admin/botChanger">
                            Bot data
                        </Link>
                        <Link className="btn btn-outline" to="/admin/cardAdder">
                            Catalog
                        </Link>
                        <Link className="btn btn-outline" to="/admin/userInfo">
                            Login history
                        </Link>
                        <Link className="btn btn-outline" to="/admin/userStats">
                            Game statistics
                        </Link>
                    </div>
                </Card>
                <Card>
                    <h3>Upcoming tasks</h3>
                    <ul className="space-y-2">
                        <li>• Review new bot templates.</li>
                        <li>• Upload new cover assets.</li>
                        <li>• Check login anomalies.</li>
                    </ul>
                </Card>
            </div>
        </div>
    );
};

export default AdminPanelPage;
