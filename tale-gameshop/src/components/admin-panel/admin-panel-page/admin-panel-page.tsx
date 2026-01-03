import React from 'react';
import { Link } from "react-router-dom";

const AdminPanelPage: React.FC = () => {

    return (
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#7c59ef] via-[#b08bf7] to-[#caa2ff] text-[#2d1b54]">
            <div className="pointer-events-none absolute inset-0 opacity-70">
                <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.65),rgba(255,255,255,0))]" />
                <div className="absolute right-[-80px] top-[30%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.35),rgba(255,255,255,0))]" />
                <div className="absolute bottom-[-120px] left-[10%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.28),rgba(255,255,255,0))]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.35)_1px,transparent_1px)] [background-size:120px_120px] opacity-40" />
            </div>

            <header className="relative z-20 border-b border-white/40 bg-white/40 px-6 py-4 shadow-[0_18px_40px_rgba(77,45,141,0.25)] backdrop-blur">
                <div className="mx-auto flex max-w-[1200px] items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 text-[#5f3fd1] shadow-inner">
                            <span className="text-2xl font-semibold">T</span>
                        </div>
                        <div className="text-[#3b2966]">
                            <p className="text-lg font-semibold leading-none">Tale Shop</p>
                            <p className="text-xs uppercase tracking-[0.25em] text-[#6b58a5]">Admin Panel</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 text-[#5f3fd1]">
                        <div className="relative">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
                                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                    <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    <path d="M10 21a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                            </span>
                            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#6b45d9] text-[10px] font-semibold text-white">3</span>
                        </div>
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
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
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </span>
                    </div>
                </div>
            </header>

            <div className="relative z-10 flex min-h-[calc(100vh-88px)] flex-col lg:flex-row">
                <aside className="relative w-full border-b border-white/30 bg-gradient-to-b from-[#5c3bb4] via-[#4b2f93] to-[#3b2474] px-6 py-8 text-white lg:w-[260px] lg:border-b-0 lg:border-r lg:border-white/20">
                    <div className="pointer-events-none absolute inset-0 opacity-50">
                        <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:120px_120px]" />
                    </div>
                    <div className="relative">
                        <div className="flex items-center gap-3 rounded-2xl bg-white/15 p-4 shadow-[0_18px_40px_rgba(29,13,82,0.35)] backdrop-blur">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-[#5b3bb7] shadow-inner">
                                <span className="text-2xl font-semibold">T</span>
                            </div>
                            <div>
                                <p className="text-lg font-semibold tracking-wide">Tale Shop</p>
                                <p className="text-xs uppercase tracking-[0.2em] text-white/70">Admin Panel</p>
                            </div>
                        </div>

                        <nav className="mt-8 space-y-2 text-sm font-medium">
                            <button className="flex w-full items-center gap-3 rounded-xl border border-white/40 bg-white/20 px-4 py-3 text-white shadow-[0_14px_30px_rgba(36,16,98,0.35)]">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/30 text-white">
                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                        <rect x="4" y="4" width="6" height="6" rx="1.5" fill="currentColor" />
                                        <rect x="14" y="4" width="6" height="6" rx="1.5" fill="currentColor" />
                                        <rect x="4" y="14" width="6" height="6" rx="1.5" fill="currentColor" />
                                        <rect x="14" y="14" width="6" height="6" rx="1.5" fill="currentColor" />
                                    </svg>
                                </span>
                                Anim Home
                            </button>
                            {[
                                { label: "Dashboard", icon: "M5 12h14" },
                                { label: "Games", icon: "M7 7h10" },
                                { label: "Orders", icon: "M5 16h14" },
                                { label: "Analytics", icon: "M6 16l2-2 3 3 4-6 3 5" },
                                { label: "Users", icon: "M12 6a4 4 0 1 1-4 4" },
                                { label: "Settings", icon: "M12 8v8" },
                            ].map((item) => (
                                <button
                                    key={item.label}
                                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-white/55 transition hover:bg-white/10 hover:text-white"
                                >
                                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                            <path d={item.icon} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </span>
                                    {item.label}
                                </button>
                            ))}
                        </nav>
                    </div>
                </aside>

                <main className="relative flex-1 px-6 py-6 lg:px-10 lg:py-8">
                    <div className="pointer-events-none absolute inset-0 opacity-40">
                        <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.4)_1px,transparent_1px)] [background-size:140px_140px]" />
                    </div>

                    <div className="relative mx-auto max-w-[1080px] space-y-6">
                        <div className="rounded-[28px] border border-white/60 bg-white/55 p-6 shadow-[0_24px_60px_rgba(92,64,170,0.25)] backdrop-blur">
                            <div className="flex items-center gap-4">
                                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8ddff] text-[#6b45d9]">
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

                            <div className="mt-6 rounded-2xl border border-white/70 bg-white/60 px-5 py-4 shadow-[0_14px_30px_rgba(90,60,150,0.15)]">
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
                                    className="flex min-h-[170px] flex-col justify-between rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur"
                                >
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
                                        className="mx-auto mt-4 inline-flex w-24 items-center justify-center rounded-xl bg-[#6b45d9] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(93,66,180,0.45)]"
                                        to={card.to}
                                    >
                                        Open
                                    </Link>
                                </div>
                            ))}
                            <div className="flex min-h-[170px] flex-col justify-between rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
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
                                <button className="mx-auto mt-4 inline-flex w-24 items-center justify-center rounded-xl bg-[#6b45d9] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(93,66,180,0.45)]">
                                    Open
                                </button>
                            </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-semibold text-[#3a2965]">Quick Stats</h3>
                                    <span className="text-lg text-[#6b45d9]">›</span>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {[
                                        { label: "Total users", value: "34,210", icon: "M12 8a4 4 0 1 1-4 4" },
                                        { label: "Active today", value: "1,240", icon: "M13 2L4 14h7l-1 8 9-12h-7l1-8Z" },
                                        { label: "Orders today", value: "56", icon: "M3 7h18" },
                                        { label: "System warnings", value: "3", icon: "M12 8v5" },
                                    ].map((item, index) => (
                                        <div key={item.label} className="flex items-center justify-between rounded-xl bg-white/60 px-4 py-3">
                                            <div className="flex items-center gap-3 text-[#6b45d9]">
                                                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${index === 3 ? "bg-[#ffe1e1] text-[#d85959]" : "bg-[#efe7ff]"}`}>
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

                            <div className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-semibold text-[#3a2965]">Recent Activity</h3>
                                    <span className="text-lg text-[#6b45d9]">›</span>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {[
                                        { label: "User #1090 logged in", time: "2 min ago" },
                                        { label: "Bot config updated", time: "15 min ago" },
                                        { label: "New image uploaded", time: "1 hour ago" },
                                        { label: "Card added", time: "2 hours ago" },
                                        { label: "User #1087 banned", time: "Yesterday" },
                                    ].map((item) => (
                                        <div key={item.label} className="flex items-center justify-between rounded-xl bg-white/60 px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#efe7ff] text-[#6b45d9]">
                                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                                        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="2" />
                                                        <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                                    </svg>
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
                            <div className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-semibold text-[#3a2965]">System Tools</h3>
                                    <span className="text-lg text-[#6b45d9]">›</span>
                                </div>
                                <div className="mt-4 space-y-3">
                                    <div className="flex items-center justify-between rounded-xl bg-white/60 px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#efe7ff] text-[#6b45d9]">
                                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                                    <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
                                                    <path d="M7 9h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                                </svg>
                                            </span>
                                            <span className="text-sm font-medium text-[#3a2965]">Environment</span>
                                        </div>
                                        <span className="rounded-full bg-[#dff7ec] px-3 py-1 text-xs font-semibold text-[#3aa774]">Production</span>
                                    </div>
                                    <div className="flex items-center justify-between rounded-xl bg-white/60 px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#efe7ff] text-[#6b45d9]">
                                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                                    <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                                    <path d="M8 8l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                    <path d="M8 16l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </span>
                                            <span className="text-sm font-medium text-[#3a2965]">API status</span>
                                        </div>
                                        <span className="rounded-full bg-[#eef2ff] px-3 py-1 text-xs font-semibold text-[#6b45d9]">Operational ›</span>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-semibold text-[#3a2965]">Recent Activity</h3>
                                    <span className="text-lg text-[#6b45d9]">›</span>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    {[
                                        "Clear cache",
                                        "Udpn cache",
                                        "Reindex data",
                                        "Upgrade log",
                                    ].map((label) => (
                                        <button
                                            key={label}
                                            className="flex items-center justify-between rounded-xl bg-white/70 px-4 py-3 text-xs font-semibold text-[#6b45d9] shadow"
                                        >
                                            {label}
                                            <span className="text-sm">›</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>

    );
};

export default AdminPanelPage;
