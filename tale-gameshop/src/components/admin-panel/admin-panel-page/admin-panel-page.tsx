import React from 'react';
import { Link } from "react-router-dom";

const AdminPanelPage: React.FC = () => {

    return (
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#7d5bf0] via-[#a784f7] to-[#c69bff] text-[#2f1c57]">
            <div className="pointer-events-none absolute inset-0 opacity-50">
                <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.6),rgba(255,255,255,0))]" />
                <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.45),rgba(255,255,255,0))]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.35),transparent_55%)]" />
            </div>

            <div className="relative z-10 flex min-h-screen flex-col lg:flex-row">
                <aside className="w-full lg:w-72 lg:min-h-screen border-b border-white/30 bg-gradient-to-b from-[#6a47d6] via-[#5b3bb7] to-[#4b3296] px-6 py-8 text-white lg:border-b-0 lg:border-r lg:border-white/20">
                    <div className="flex items-center gap-3 rounded-2xl bg-white/20 p-4 shadow-[0_20px_50px_rgba(53,32,120,0.35)] backdrop-blur">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-[#5b3bb7] shadow-inner">
                            <span className="text-2xl font-semibold">T</span>
                        </div>
                        <div>
                            <p className="text-lg font-semibold tracking-wide">Tale Shop</p>
                            <p className="text-xs uppercase tracking-[0.2em] text-white/70">Admin Panel</p>
                        </div>
                    </div>

                    <nav className="mt-10 space-y-2 text-sm font-medium">
                        <button className="flex w-full items-center gap-3 rounded-xl border border-white/30 bg-white/20 px-4 py-3 text-white shadow-[0_12px_30px_rgba(45,24,104,0.25)]">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/30">
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                    <rect x="4" y="4" width="6" height="6" rx="1.5" fill="currentColor" />
                                    <rect x="14" y="4" width="6" height="6" rx="1.5" fill="currentColor" />
                                    <rect x="4" y="14" width="6" height="6" rx="1.5" fill="currentColor" />
                                    <rect x="14" y="14" width="6" height="6" rx="1.5" fill="currentColor" />
                                </svg>
                            </span>
                            Dashboard
                        </button>
                        {[
                            { label: "Games", icon: "M5 12h14" },
                            { label: "Orders", icon: "M7 7h10" },
                            { label: "Analytics", icon: "M5 16h14" },
                            { label: "Users", icon: "M12 6a4 4 0 1 1-4 4" },
                            { label: "Settings", icon: "M12 8v8" },
                        ].map((item) => (
                            <button
                                key={item.label}
                                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-white/70 transition hover:bg-white/10 hover:text-white"
                            >
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                        <path d={item.icon} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    </svg>
                                </span>
                                {item.label}
                            </button>
                        ))}
                    </nav>
                </aside>

                <main className="flex-1 px-6 py-6 lg:px-10 lg:py-8">
                    <div className="flex flex-col gap-4 rounded-2xl bg-white/50 px-6 py-4 shadow-[0_18px_40px_rgba(86,58,150,0.25)] backdrop-blur md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-4 text-[#3c2a66]">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 text-[#6b45d9] shadow-inner">
                                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
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
                                <p className="text-sm text-[#6a58a4]">Tale Shop | Admin Panel</p>
                                <h1 className="text-lg font-semibold">Admin Control Center</h1>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 text-[#6a58a4]">
                            <div className="relative">
                                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 text-[#6b45d9]">
                                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                        <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        <path d="M10 21a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    </svg>
                                </span>
                                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#6b45d9] text-[10px] font-semibold text-white">3</span>
                            </div>
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 text-[#6b45d9]">
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
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 text-[#6b45d9]">
                                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </span>
                        </div>
                    </div>

                    <div className="mt-6 rounded-3xl border border-white/60 bg-white/55 p-6 shadow-[0_24px_60px_rgba(92,64,170,0.25)] backdrop-blur">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <div className="flex items-center gap-3">
                                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8ddff] text-[#6b45d9]">
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
                                        <h2 className="text-xl font-semibold text-[#3a2965]">Admin Control Center</h2>
                                        <p className="text-sm text-[#6b58a5]">Manage shop, users, games and automation from one place</p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <div className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/60 px-4 py-3 shadow-[0_15px_30px_rgba(90,60,150,0.15)]">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#efe7ff] text-[#6b45d9]">
                                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                            <path d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4Z" stroke="currentColor" strokeWidth="2" />
                                            <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                    </span>
                                    <div>
                                        <p className="text-sm font-semibold text-[#3a2965]">System Status</p>
                                        <p className="text-xs text-[#6b58a5]">All systems operational</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/60 px-4 py-3 shadow-[0_15px_30px_rgba(90,60,150,0.15)]">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dff7ec] text-[#3aa774]">
                                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                            <path d="M6 12l4 4 8-8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </span>
                                    <div>
                                        <p className="text-sm font-semibold text-[#3a2965]">System Status</p>
                                        <p className="text-xs text-[#6b58a5]">All systems operational</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <div className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                            <div className="flex items-center gap-3 text-[#6b45d9]">
                                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#efe7ff]">
                                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                        <rect x="3" y="7" width="18" height="12" rx="3" stroke="currentColor" strokeWidth="2" />
                                        <circle cx="8" cy="13" r="2" fill="currentColor" />
                                        <path d="M14 11h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    </svg>
                                </span>
                                <div>
                                    <h3 className="text-base font-semibold text-[#3a2965]">Bot Config</h3>
                                    <p className="text-xs text-[#6b58a5]">Configure bot behavior & flows</p>
                                </div>
                            </div>
                            <Link
                                className="mt-4 inline-flex w-24 items-center justify-center rounded-xl bg-[#6b45d9] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(93,66,180,0.45)]"
                                to="/admin/botChanger"
                            >
                                Open
                            </Link>
                        </div>

                        <div className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                            <div className="flex items-center gap-3 text-[#6b45d9]">
                                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#efe7ff]">
                                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                        <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="2" />
                                        <circle cx="9" cy="10" r="2" fill="currentColor" />
                                        <path d="M21 16l-4-4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </span>
                                <div>
                                    <h3 className="text-base font-semibold text-[#3a2965]">Media Manager</h3>
                                    <p className="text-xs text-[#6b58a5]">Manage images & assets</p>
                                </div>
                            </div>
                            <Link
                                className="mt-4 inline-flex w-24 items-center justify-center rounded-xl bg-[#6b45d9] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(93,66,180,0.45)]"
                                to="/admin/siteChanger"
                            >
                                Open
                            </Link>
                        </div>

                        <div className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                            <div className="flex items-center gap-3 text-[#6b45d9]">
                                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#efe7ff]">
                                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                        <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
                                        <path d="M8 10h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        <path d="M8 14h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    </svg>
                                </span>
                                <div>
                                    <h3 className="text-base font-semibold text-[#3a2965]">Cards & Content</h3>
                                    <p className="text-xs text-[#6b58a5]">Create and edit content cards</p>
                                </div>
                            </div>
                            <Link
                                className="mt-4 inline-flex w-24 items-center justify-center rounded-xl bg-[#6b45d9] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(93,66,180,0.45)]"
                                to="/admin/cardAdder"
                            >
                                Open
                            </Link>
                        </div>

                        <div className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                            <div className="flex items-center gap-3 text-[#6b45d9]">
                                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#efe7ff]">
                                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
                                        <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    </svg>
                                </span>
                                <div>
                                    <h3 className="text-base font-semibold text-[#3a2965]">User Info</h3>
                                    <p className="text-xs text-[#6b58a5]">Inspect user profiles</p>
                                </div>
                            </div>
                            <Link
                                className="mt-4 inline-flex w-24 items-center justify-center rounded-xl bg-[#6b45d9] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(93,66,180,0.45)]"
                                to="/admin/userInfo"
                            >
                                Open
                            </Link>
                        </div>

                        <div className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                            <div className="flex items-center gap-3 text-[#6b45d9]">
                                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#efe7ff]">
                                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                        <path d="M5 16v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        <path d="M12 16V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        <path d="M19 16V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    </svg>
                                </span>
                                <div>
                                    <h3 className="text-base font-semibold text-[#3a2965]">User Stats</h3>
                                    <p className="text-xs text-[#6b58a5]">Analytics & activity</p>
                                </div>
                            </div>
                            <Link
                                className="mt-4 inline-flex w-24 items-center justify-center rounded-xl bg-[#6b45d9] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(93,66,180,0.45)]"
                                to="/admin/userStats"
                            >
                                Open
                            </Link>
                        </div>

                        <div className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
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
                            <div className="mt-4 flex flex-wrap gap-2">
                                <button className="rounded-lg bg-white/70 px-3 py-2 text-xs font-semibold text-[#6b45d9] shadow">
                                    Clear cache
                                </button>
                                <button className="rounded-lg bg-white/70 px-3 py-2 text-xs font-semibold text-[#6b45d9] shadow">
                                    Reindex data
                                </button>
                                <button className="rounded-lg bg-white/70 px-3 py-2 text-xs font-semibold text-[#6b45d9] shadow">
                                    Update log
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                            <div className="flex items-center justify-between">
                                <h3 className="text-base font-semibold text-[#3a2965]">Quick Stats</h3>
                                <span className="text-[#6b45d9]">›</span>
                            </div>
                            <div className="mt-4 space-y-4">
                                {[
                                    { label: "Total users", value: "34,210", icon: "M12 8a4 4 0 1 1-4 4" },
                                    { label: "Active today", value: "1,240", icon: "M13 2L4 14h7l-1 8 9-12h-7l1-8Z" },
                                    { label: "Orders today", value: "56", icon: "M3 6h18" },
                                    { label: "System warnings", value: "3", icon: "M12 9v4" },
                                ].map((item, index) => (
                                    <div key={item.label} className="flex items-center justify-between rounded-xl bg-white/60 px-4 py-3">
                                        <div className="flex items-center gap-3 text-[#6b45d9]">
                                            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${index === 3 ? "bg-[#ffe2e2] text-[#d85959]" : "bg-[#efe7ff]"}`}>
                                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                                                    <path d={item.icon} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </span>
                                            <span className="text-sm font-medium text-[#3a2965]">{item.label}</span>
                                        </div>
                                        <span className="text-lg font-semibold text-[#6b45d9]">{item.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                            <div className="flex items-center justify-between">
                                <h3 className="text-base font-semibold text-[#3a2965]">Recent Activity</h3>
                                <span className="text-[#6b45d9]">›</span>
                            </div>
                            <div className="mt-4 space-y-4">
                                {[
                                    { label: "User #1090 logged in", time: "2 min ago" },
                                    { label: "Bot config updated", time: "15 min ago" },
                                    { label: "New image uploaded", time: "1 hour ago" },
                                    { label: "Card added", time: "2 hours ago" },
                                    { label: "User #1087 banned", time: "Yesterday" },
                                ].map((item) => (
                                    <div key={item.label} className="flex items-center justify-between rounded-xl bg-white/60 px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#efe7ff] text-[#6b45d9]">
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

                    <div className="mt-6 grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                            <div className="flex items-center justify-between">
                                <h3 className="text-base font-semibold text-[#3a2965]">System Tools</h3>
                                <span className="text-[#6b45d9]">›</span>
                            </div>
                            <div className="mt-4 space-y-3">
                                <div className="flex items-center justify-between rounded-xl bg-white/60 px-4 py-3">
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
                                <div className="flex items-center justify-between rounded-xl bg-white/60 px-4 py-3">
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
                                    <span className="rounded-full bg-[#eef2ff] px-3 py-1 text-xs font-semibold text-[#6b45d9]">Operational</span>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_18px_40px_rgba(92,64,170,0.2)] backdrop-blur">
                            <div className="flex items-center justify-between">
                                <h3 className="text-base font-semibold text-[#3a2965]">Quick Actions</h3>
                                <span className="text-[#6b45d9]">›</span>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-3">
                                {[
                                    "Clear cache",
                                    "Update cache",
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
                </main>
            </div>
        </div>

    );
};

export default AdminPanelPage;
