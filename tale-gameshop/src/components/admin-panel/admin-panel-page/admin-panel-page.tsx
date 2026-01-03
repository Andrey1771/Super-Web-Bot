import React, { useEffect, useState } from 'react';
import { Link } from "react-router-dom";

const AdminPanelPage: React.FC = () => {
    const [toast, setToast] = useState<string | null>(null);
    const [modal, setModal] = useState<null | "details" | "updateLog">(null);
    const [isReindexing, setIsReindexing] = useState(false);
    const [returnTo, setReturnTo] = useState("/");

    useEffect(() => {
        const lastPublic = localStorage.getItem("admin:returnTo");
        if (lastPublic) {
            setReturnTo(lastPublic);
        }
    }, []);

    useEffect(() => {
        const referrer = document.referrer;
        if (referrer && !referrer.includes("/admin")) {
            localStorage.setItem("admin:returnTo", referrer);
            setReturnTo(referrer);
        }
    }, []);

    const showToast = (message: string) => {
        setToast(message);
        window.setTimeout(() => setToast(null), 2200);
    };

    const handleSoon = () => showToast("Coming soon");
    const handleClearCache = () => {
        Object.keys(localStorage)
            .filter((key) => key.startsWith("admin:"))
            .forEach((key) => localStorage.removeItem(key));
        showToast("Cache cleared");
    };
    const handleUdpnCache = () => showToast("Udpn cache refreshed");
    const handleReindex = () => {
        setIsReindexing(true);
        showToast("Reindex started");
        window.setTimeout(() => setIsReindexing(false), 1500);
    };
    const handleViewSite = () => {
        window.location.href = returnTo || "/";
    };

    return (
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#7c59ef] via-[#b08bf7] to-[#caa2ff] text-[#2d1b54]">
            <div className="pointer-events-none absolute inset-0 opacity-70">
                <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.65),rgba(255,255,255,0))]" />
                <div className="absolute right-[-80px] top-[30%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.35),rgba(255,255,255,0))]" />
                <div className="absolute bottom-[-120px] left-[10%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.28),rgba(255,255,255,0))]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.35)_1px,transparent_1px)] [background-size:120px_120px] opacity-40" />
            </div>

            <header className="relative z-20 border-b border-white/40 bg-gradient-to-r from-white/45 via-white/35 to-white/30 px-6 py-4 shadow-[0_18px_40px_rgba(77,45,141,0.25)] backdrop-blur">
                <div className="mx-auto flex max-w-[1180px] items-center justify-between">
                    <div className="flex flex-wrap items-center gap-4 text-[#3b2966]">
                        <div className="flex h-12 w-16 items-center justify-center rounded-2xl bg-white/80 px-2 shadow-inner">
                            <span className="text-2xl font-semibold italic tracking-wide">Tale</span>
                        </div>
                        <div className="flex items-center gap-3 text-lg font-semibold">
                            <span>Tale Shop</span>
                            <span className="text-[#8a79be]">/</span>
                            <span className="font-medium text-[#7055b0]">Admin Panel</span>
                        </div>
                        <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-[#6b45d9] shadow">Admin mode</span>
                    </div>
                    <div className="flex items-center gap-3 text-[#6b45d9]">
                        <button
                            className="hidden items-center gap-2 rounded-xl bg-white/70 px-4 py-2 text-sm font-semibold text-[#6b45d9] shadow-[0_12px_25px_rgba(77,45,141,0.2)] md:flex"
                            onClick={handleViewSite}
                        >
                            View site
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                <path d="M7 17L17 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <path d="M10 7h7v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                        </button>
                        <div className="relative">
                            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70 shadow-[0_12px_25px_rgba(77,45,141,0.2)]">
                                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                    <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    <path d="M10 21a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                            </span>
                            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#6b45d9] text-[10px] font-semibold text-white">3</span>
                        </div>
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70 shadow-[0_12px_25px_rgba(77,45,141,0.2)]">
                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                <path d="M12 3v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <path d="M12 19v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <path d="M4.2 6.2l1.4 1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <path d="M18.4 18.4l1.4 1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <path d="M3 12h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <path d="M19 12h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <path d="M6.2 19.8l1.4-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <path d="M16.4 7.6l1.4-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                            </svg>
                        </span>
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70 shadow-[0_12px_25px_rgba(77,45,141,0.2)]">
                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </span>
                    </div>
                </div>
            </header>

            <div className="relative z-10 flex min-h-[calc(100vh-88px)] flex-col lg:flex-row">
                <aside className="relative w-full border-b border-white/30 bg-gradient-to-b from-[#5c3bb4] via-[#4b2f93] to-[#3b2474] px-5 py-6 text-white lg:w-[240px] lg:border-b-0 lg:border-r lg:border-white/20">
                    <div className="pointer-events-none absolute inset-0 opacity-50">
                        <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:120px_120px]" />
                    </div>
                    <div className="relative">
                        <nav className="space-y-1 text-sm font-medium">
                            <button className="flex w-full items-center gap-3 rounded-lg border border-white/40 bg-white/20 px-4 py-2 text-white shadow-[0_10px_24px_rgba(36,16,98,0.35)]">
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                    <rect x="4" y="4" width="6" height="6" rx="1.5" fill="currentColor" />
                                    <rect x="14" y="4" width="6" height="6" rx="1.5" fill="currentColor" />
                                    <rect x="4" y="14" width="6" height="6" rx="1.5" fill="currentColor" />
                                    <rect x="14" y="14" width="6" height="6" rx="1.5" fill="currentColor" />
                                </svg>
                                Anim Home
                            </button>
                            {[
                                { label: "Dashboard", icon: "M4 12h16" },
                                { label: "Games", icon: "M6 9h12" },
                                { label: "Orders", icon: "M6 15h12" },
                                { label: "Analytics", icon: "M6 15l3-3 3 2 4-5" },
                                { label: "Users", icon: "M12 6a4 4 0 1 1-4 4" },
                                { label: "Settings", icon: "M12 8v8" },
                            ].map((item) => (
                                <button
                                    key={item.label}
                                    className="flex w-full cursor-not-allowed items-center justify-between rounded-lg px-4 py-2 text-white/45 transition hover:bg-white/10 hover:text-white"
                                    onClick={handleSoon}
                                    aria-disabled="true"
                                >
                                    <span className="flex items-center gap-3">
                                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                            <path d={item.icon} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        {item.label}
                                    </span>
                                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                                        Soon
                                    </span>
                                </button>
                            ))}
                        </nav>
                        <div className="mt-6 space-y-2 border-t border-white/10 pt-4 text-sm">
                            <Link
                                className="flex w-full items-center gap-3 rounded-lg px-4 py-2 text-white/75 transition hover:bg-white/10 hover:text-white"
                                to="/admin/botChanger"
                            >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                    <rect x="4" y="7" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
                                    <circle cx="9" cy="12" r="1.5" fill="currentColor" />
                                </svg>
                                Bot Config
                            </Link>
                            <Link
                                className="flex w-full items-center gap-3 rounded-lg px-4 py-2 text-white/75 transition hover:bg-white/10 hover:text-white"
                                to="/admin/siteChanger"
                            >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                    <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
                                    <path d="M7 14l3-3 3 3 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Media Manager
                            </Link>
                            <Link
                                className="flex w-full items-center gap-3 rounded-lg px-4 py-2 text-white/75 transition hover:bg-white/10 hover:text-white"
                                to="/admin/cardAdder"
                            >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                    <rect x="5" y="7" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
                                    <path d="M8 10h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                                </svg>
                                Cards & Content
                            </Link>
                            <Link
                                className="flex w-full items-center gap-3 rounded-lg px-4 py-2 text-white/75 transition hover:bg-white/10 hover:text-white"
                                to="/admin/userInfo"
                            >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
                                    <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                                </svg>
                                User Info
                            </Link>
                            <Link
                                className="flex w-full items-center gap-3 rounded-lg px-4 py-2 text-white/75 transition hover:bg-white/10 hover:text-white"
                                to="/admin/userStats"
                            >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                    <path d="M6 16v-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                                    <path d="M12 16V8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                                    <path d="M18 16V4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                                </svg>
                                User Stats
                            </Link>
                        </div>
                        <button
                            className="mt-6 flex w-full items-center gap-3 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_25px_rgba(36,16,98,0.35)] transition hover:bg-white/20"
                            onClick={handleViewSite}
                        >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                <path d="M7 17L17 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <path d="M10 7h7v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                            View site
                        </button>
                    </div>
                </aside>

                <main className="relative flex-1 px-6 py-6 lg:px-10 lg:py-8">
                    <div className="pointer-events-none absolute inset-0 opacity-40">
                        <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.4)_1px,transparent_1px)] [background-size:140px_140px]" />
                    </div>

                    <div className="relative mx-auto max-w-[1060px] space-y-6">
                        <div className="rounded-[26px] border border-white/70 bg-white/60 p-6 shadow-[0_22px_55px_rgba(92,64,170,0.24)] backdrop-blur">
                            <div className="flex items-center gap-4">
                                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e6dbff] text-[#6b45d9]">
                                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
                                        <path d="M12 3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        <path d="M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        <path d="M4.9 5.1l2.2 2.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        <path d="M16.9 16.9l2.2 2.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        <path d="M3 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        <path d="M18 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        <path d="M4.9 18.9l2.2-2.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        <path d="M16.9 7.1l2.2-2.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="2" />
                                    </svg>
                                </span>
                                <div>
                                    <h1 className="text-2xl font-semibold text-[#3a2965]">Admin Control Center</h1>
                                    <p className="text-sm text-[#6b58a5]">Manage shop, users, games and automation from one place</p>
                                </div>
                            </div>

                            <div className="mt-5 rounded-2xl border border-white/70 bg-white/65 px-5 py-4 shadow-[0_14px_30px_rgba(90,60,150,0.15)]">
                                <div className="grid gap-4 text-sm text-[#3a2965] sm:grid-cols-2">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#efe7ff] text-[#6b45d9]">
                                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                                <path d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4Z" stroke="currentColor" strokeWidth="2" />
                                                <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                            </svg>
                                        </span>
                                        <div>
                                            <p className="font-semibold">System Status</p>
                                            <p className="text-xs text-[#6b58a5]">All systems operational</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 border-white/60 sm:border-l sm:pl-6">
                                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dff7ec] text-[#3aa774]">
                                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                                <path d="M6 12l4 4 8-8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </span>
                                        <div>
                                            <p className="font-semibold">System Status</p>
                                            <p className="text-xs text-[#6b58a5]">All systems operational</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {[
                                {
                                    title: "Bot Config",
                                    description: "Configure bot behavior & flows",
                                    to: "/admin/botChanger",
                                    icon: (
                                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                            <rect x="3" y="7" width="18" height="12" rx="3" stroke="currentColor" strokeWidth="2" />
                                            <circle cx="8" cy="13" r="2" fill="currentColor" />
                                            <path d="M14 11h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                    ),
                                },
                                {
                                    title: "Media Manager",
                                    description: "Manage images & assets",
                                    to: "/admin/siteChanger",
                                    icon: (
                                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                            <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="2" />
                                            <circle cx="9" cy="10" r="2" fill="currentColor" />
                                            <path d="M21 16l-4-4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    ),
                                },
                                {
                                    title: "Cards & Content",
                                    description: "Create and edit content cards",
                                    to: "/admin/cardAdder",
                                    icon: (
                                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                            <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
                                            <path d="M8 10h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                            <path d="M8 14h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                    ),
                                },
                                {
                                    title: "User Info",
                                    description: "Inspect user profiles",
                                    to: "/admin/userInfo",
                                    icon: (
                                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
                                            <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                    ),
                                },
                                {
                                    title: "User Stats",
                                    description: "Analytics & activity",
                                    to: "/admin/userStats",
                                    icon: (
                                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                            <path d="M5 16v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                            <path d="M12 16V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                            <path d="M19 16V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                    ),
                                },
                            ].map((card) => (
                                <div
                                    key={card.title}
                                    className="relative flex min-h-[168px] flex-col justify-between overflow-hidden rounded-2xl border border-white/70 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur"
                                >
                                    <div className="pointer-events-none absolute inset-0 opacity-30">
                                        <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:120px_120px]" />
                                    </div>
                                    <div className="flex items-center gap-3 text-[#6b45d9]">
                                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#efe7ff]">
                                            {card.icon}
                                        </span>
                                        <div>
                                            <h3 className="text-base font-semibold text-[#3a2965]">{card.title}</h3>
                                            <p className="text-xs text-[#6b58a5]">{card.description}</p>
                                        </div>
                                    </div>
                                    <Link
                                        className="relative mx-auto mt-4 inline-flex h-8 w-20 items-center justify-center rounded-lg bg-[#6b45d9] text-sm font-semibold text-white shadow-[0_10px_20px_rgba(93,66,180,0.45)]"
                                        to={card.to}
                                    >
                                        Open
                                    </Link>
                                </div>
                            ))}
                            <div className="relative flex min-h-[168px] flex-col justify-between overflow-hidden rounded-2xl border border-white/70 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                                <div className="pointer-events-none absolute inset-0 opacity-30">
                                    <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:120px_120px]" />
                                </div>
                                <div className="flex items-center gap-3 text-[#6b45d9]">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#efe7ff]">
                                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                            <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </span>
                                    <div>
                                        <h3 className="text-base font-semibold text-[#3a2965]">Quick Actions</h3>
                                        <p className="text-xs text-[#6b58a5]">Shortcuts for admin tasks</p>
                                    </div>
                                </div>
                                <button className="relative mx-auto mt-4 inline-flex h-8 w-20 items-center justify-center rounded-lg bg-[#6b45d9] text-sm font-semibold text-white shadow-[0_10px_20px_rgba(93,66,180,0.45)]">
                                    Open
                                </button>
                            </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-2xl border border-white/70 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-semibold text-[#3a2965]">Quick Stats</h3>
                                    <button className="text-lg text-[#6b45d9]" onClick={() => setModal("details")}>›</button>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {[
                                        { label: "Total users", value: "34,210", icon: "M12 8a4 4 0 1 1-4 4" },
                                        { label: "Active today", value: "1,240", icon: "M13 2L4 14h7l-1 8 9-12h-7l1-8Z" },
                                        { label: "Orders today", value: "56", icon: "M4 7h16" },
                                        { label: "System warnings", value: "3", icon: "M12 8v5" },
                                    ].map((item, index) => (
                                        <div key={item.label} className="flex items-center justify-between rounded-xl bg-white/65 px-4 py-3">
                                            <div className="flex items-center gap-3 text-[#6b45d9]">
                                                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${index === 3 ? "bg-[#ffe1e1] text-[#d85959]" : "bg-[#efe7ff]"}`}>
                                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                                        <path d={item.icon} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </span>
                                                <span className="text-sm font-medium text-[#3a2965]">{item.label}</span>
                                            </div>
                                            <span className="text-xl font-semibold text-[#6b45d9]">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/70 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-semibold text-[#3a2965]">Recent Activity</h3>
                                    <button className="text-lg text-[#6b45d9]" onClick={() => setModal("details")}>›</button>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {[
                                        {
                                            label: "User #1090 logged in",
                                            time: "2 min ago",
                                            icon: (
                                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                                    <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="2" />
                                                    <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                                </svg>
                                            ),
                                        },
                                        {
                                            label: "Bot config updated",
                                            time: "15 min ago",
                                            icon: (
                                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                                    <rect x="5" y="7" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
                                                    <circle cx="9" cy="12" r="1.5" fill="currentColor" />
                                                </svg>
                                            ),
                                        },
                                        {
                                            label: "New image uploaded",
                                            time: "1 hour ago",
                                            icon: (
                                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                                    <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
                                                    <path d="M7 14l3-3 3 3 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            ),
                                        },
                                        {
                                            label: "Card added",
                                            time: "2 hours ago",
                                            icon: (
                                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                                    <rect x="5" y="7" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
                                                    <path d="M8 10h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                                    <path d="M8 14h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                                </svg>
                                            ),
                                        },
                                        {
                                            label: "User #1087 banned",
                                            time: "Yesterday",
                                            icon: (
                                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                                    <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="2" />
                                                    <path d="M8.5 8.5l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                                </svg>
                                            ),
                                        },
                                    ].map((item) => (
                                        <div key={item.label} className="flex items-center justify-between rounded-xl bg-white/65 px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#efe7ff] text-[#6b45d9]">
                                                    {item.icon}
                                                </span>
                                                <span className="text-sm text-[#3a2965]">{item.label}</span>
                                            </div>
                                            <span className="text-xs text-[#6b58a5]">{item.time}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-2xl border border-white/70 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-semibold text-[#3a2965]">System Tools</h3>
                                    <button className="text-lg text-[#6b45d9]" onClick={() => setModal("details")}>›</button>
                                </div>
                                <div className="mt-4 space-y-3">
                                    <div className="flex items-center justify-between rounded-xl bg-white/65 px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#efe7ff] text-[#6b45d9]">
                                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                                    <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
                                                    <path d="M7 9h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                                </svg>
                                            </span>
                                            <span className="text-sm font-medium text-[#3a2965]">Environment</span>
                                        </div>
                                        <span className="rounded-full bg-[#dff7ec] px-3 py-1 text-xs font-semibold text-[#3aa774]">Production</span>
                                    </div>
                                    <div className="flex items-center justify-between rounded-xl bg-white/65 px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#efe7ff] text-[#6b45d9]">
                                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                                    <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                                    <path d="M8 8l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                    <path d="M8 16l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </span>
                                            <span className="text-sm font-medium text-[#3a2965]">API status</span>
                                        </div>
                                        <span className="rounded-full bg-[#efe7ff] px-3 py-1 text-xs font-semibold text-[#6b45d9]">Operational &gt;</span>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/70 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-semibold text-[#3a2965]">Recent Activity</h3>
                                    <button className="text-lg text-[#6b45d9]" onClick={() => setModal("details")}>›</button>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    {[
                                        {
                                            label: "Clear cache",
                                            icon: (
                                                <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                            ),
                                        },
                                        {
                                            label: "Udpn cache",
                                            icon: (
                                                <path d="M8 6h8v12H8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                            ),
                                        },
                                        {
                                            label: "Reindex data",
                                            icon: (
                                                <path d="M6 12a6 6 0 1 1 2 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                            ),
                                        },
                                        {
                                            label: "Upgrade log",
                                            icon: (
                                                <path d="M6 18V6h6l6 6v6H6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                            ),
                                        },
                                    ].map((item) => (
                                        <button
                                            key={item.label}
                                            className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-3 text-xs font-semibold text-[#6b45d9] shadow"
                                            onClick={() => {
                                                if (item.label === "Clear cache") {
                                                    handleClearCache();
                                                    return;
                                                }
                                                if (item.label === "Udpn cache") {
                                                    handleUdpnCache();
                                                    return;
                                                }
                                                if (item.label === "Reindex data") {
                                                    handleReindex();
                                                    return;
                                                }
                                                setModal("updateLog");
                                            }}
                                        >
                                            <span className="flex items-center gap-2">
                                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#efe7ff] text-[#6b45d9]">
                                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                                        {item.icon}
                                                    </svg>
                                                </span>
                                                {item.label}
                                            </span>
                                            {item.label === "Reindex data" && isReindexing ? (
                                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#6b45d9] border-t-transparent" />
                                            ) : (
                                                <span className="text-sm">›</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
            {toast && (
                <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-white/90 px-4 py-3 text-sm font-semibold text-[#6b45d9] shadow-[0_18px_40px_rgba(77,45,141,0.25)] backdrop-blur">
                    {toast}
                </div>
            )}
            {modal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
                    <div className="w-full max-w-md rounded-2xl border border-white/40 bg-white/90 p-6 shadow-[0_20px_50px_rgba(77,45,141,0.3)] backdrop-blur">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-[#3a2965]">
                                {modal === "details" ? "Details" : "Update log"}
                            </h3>
                            <button className="text-[#6b45d9]" onClick={() => setModal(null)}>✕</button>
                        </div>
                        {modal === "details" ? (
                            <p className="mt-3 text-sm text-[#6b58a5]">
                                This section shows additional context, alerts, and quick summaries tailored for admin workflows.
                            </p>
                        ) : (
                            <ul className="mt-4 space-y-2 text-sm text-[#6b58a5]">
                                <li>• Updated content moderation rules.</li>
                                <li>• Added new bot response templates.</li>
                                <li>• Improved analytics snapshots for admins.</li>
                            </ul>
                        )}
                        <button
                            className="mt-5 w-full rounded-xl bg-[#6b45d9] py-2 text-sm font-semibold text-white"
                            onClick={() => setModal(null)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>

    );
};

export default AdminPanelPage;
