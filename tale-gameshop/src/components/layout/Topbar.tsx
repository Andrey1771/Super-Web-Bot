import React from "react";

type TopbarProps = {
  title: string;
  onToggleSidebar: () => void;
};

const Topbar: React.FC<TopbarProps> = ({ title, onToggleSidebar }) => {
  return (
    <header className="admin-topbar">
      <button className="btn btn-outline" onClick={onToggleSidebar}>
        ☰
      </button>
      <div className="admin-topbar__title">{title}</div>
      <div className="admin-topbar__search">
        <span>🔎</span>
        <input
          type="text"
          placeholder="Search across admin..."
          aria-label="Global search"
        />
      </div>
      <div className="admin-topbar__actions">
        <button
          className="btn btn-primary"
          onClick={() => window.dispatchEvent(new CustomEvent("admin:add"))}
        >
          + Add
        </button>
        <button className="btn btn-outline">Profile</button>
      </div>
    </header>
  );
};

export default Topbar;
