import React, { useState, useEffect, useRef, useMemo } from "react";
import { useToast } from '../Toast/Toast';
import "./Sidebar.css";

export interface NavSubItem {
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export interface NavItem {
  label: string;
  icon?: string; // Tabler icon class, e.g., 'ti ti-smart-home'
  badge?: {
    text: string;
    variant?: "teal" | "warn" | "error" | "default";
  };
  active?: boolean;
  onClick?: () => void;
  subItems?: NavSubItem[];
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export interface SidebarProps {
  logoUrl?: string;
  logoText?: string;
  navGroups?: NavGroup[];
  profile?: {
    name: string;
    role: string;
    avatarInitials: string;
  };
  onProfileClick?: () => void;
  onLogout?: () => void;
}

const defaultNavGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", icon: "ti ti-dashboard", active: true },
      { label: "Analytics", icon: "ti ti-chart-bar", badge: { text: "New", variant: "teal" } },
    ],
  },
  {
    label: "Management",
    items: [
      {
        label: "Shipments",
        icon: "ti ti-truck",
        badge: { text: "8", variant: "warn" },
        subItems: [
          { label: "Active Routes", active: false },
          { label: "Completed Log", active: false },
          { label: "Returns Audit", active: false },
        ],
      },
      { label: "Inventory", icon: "ti ti-box" },
      { label: "Drivers", icon: "ti ti-users" },
    ],
  },
];

const defaultProfile = {
  name: "FirstName LastName",
  role: "Logistics Director",
  avatarInitials: "FL",
};

export const Sidebar: React.FC<SidebarProps> = ({
  logoUrl = "/logo.png",
  logoText = "SPEEDEX",
  navGroups = defaultNavGroups,
  profile = defaultProfile,
  onProfileClick,
  onLogout,
}) => {
  const { info, success } = useToast();
  // Persist collapse preference
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar-collapsed") === "true";
    }
    return false;
  });

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
    Shipments: true,
  });

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // ── Mobile drawer state ──
  // Below the 480px breakpoint, global.css turns the sidebar into an
  // off-canvas drawer (`.sidebar` gets `left: -100%`, revealed via
  // `.mobile-open`). GlobalHeader's hamburger button dispatches this
  // window event so the sidebar doesn't need a prop wired through
  // every layout that renders both components independently.
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setMobileOpen((prev) => !prev);
    window.addEventListener("toggle-sidebar-mobile", handler);
    return () => window.removeEventListener("toggle-sidebar-mobile", handler);
  }, []);

  // Close the mobile drawer on route-like interactions (any nav item click)
  // and on Escape, matching standard drawer UX.
  useEffect(() => {
    if (!mobileOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [mobileOpen]);

  // ── Pinned/Favorites Navigation State ──
  const [pinnedItems, setPinnedItems] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("sidebar-pinned");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const togglePin = (label: string) => {
    setPinnedItems((prev) => {
      const next = prev.includes(label)
        ? prev.filter((item) => item !== label)
        : [...prev, label];
      try {
        localStorage.setItem("sidebar-pinned", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Build the Favorites NavGroup dynamically if there are pinned items
  const favoritesGroup = useMemo(() => {
    if (pinnedItems.length === 0) return null;
    const items: NavItem[] = [];
    pinnedItems.forEach((label) => {
      // Look up label across all original navGroups
      for (const group of navGroups) {
        const match = group.items.find((i) => i.label === label);
        if (match) {
          items.push({
            ...match,
            subItems: undefined, // Favorites group items act as direct flat shortcuts
          });
          break;
        }
      }
    });
    return items.length > 0 ? { label: "Favorites", items } : null;
  }, [pinnedItems, navGroups]);

  const displayNavGroups = useMemo(() => {
    if (!favoritesGroup) return navGroups;
    return [favoritesGroup, ...navGroups];
  }, [favoritesGroup, navGroups]);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  const toggleExpand = (label: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      {/* Mobile drawer backdrop — closes the drawer on tap-outside */}
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
      {/* Logo Header */}
      <div className="sidebar-logo">
        <div className="logo-img-wrapper">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="sidebar-logo-img" />
          ) : (
            <span style={{ fontSize: "18px", fontWeight: 800, color: "#fff", letterSpacing: "-0.5px", fontFamily: "var(--fh)" }}>
              {logoText}
            </span>
          )}
        </div>
        <button
          className="sb-toggle-btn sb-desktop-toggle"
          onClick={toggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <i className={collapsed ? "ti ti-chevron-right" : "ti ti-chevron-left"} />
        </button>
        <button
          className="sb-close-mobile-btn"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation menu"
        >
          <i className="ti ti-x" />
        </button>
      </div>
        {profile && (
          <div className="sidebar-role-badge">
            <span className="role-dot-inner" />
            {profile.role}
          </div>
        )}

      {/* Navigation Links */}
      <nav className="sidebar-nav" aria-label="Main navigation">
        {displayNavGroups.map((group, groupIndex) => (
          <React.Fragment key={groupIndex}>
            {group.label && <span className="nav-module-label">{group.label}</span>}
            {group.items.map((item, itemIndex) => {
              const hasSubItems = item.subItems && item.subItems.length > 0;
              const isExpanded = !!expandedItems[item.label];
              const isPinned = pinnedItems.includes(item.label);
              const showPinToggle = !collapsed; // Show pin button on all groups

              return (
                <div key={itemIndex} className="nav-item-container">
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (hasSubItems) {
                        toggleExpand(item.label);
                        if (collapsed) {
                          // Expand sidebar when clicking collapsed menu with sub-items
                          setCollapsed(false);
                          localStorage.setItem("sidebar-collapsed", "false");
                        }
                      } else {
                        item.onClick?.();
                        // Close the mobile drawer after navigating (no-op on desktop)
                        setMobileOpen(false);
                      }
                    }}
                    className={`nav-item ${item.active ? "active" : ""} ${hasSubItems ? "has-subs" : ""}`}
                    data-tooltip={collapsed ? item.label : undefined}
                    aria-current={item.active ? "page" : undefined}
                    aria-expanded={hasSubItems ? isExpanded : undefined}
                  >
                    {item.icon && (
                      <span className="nav-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                        <i className={item.icon} style={{ fontSize: "18px" }}></i>
                        {/* Collapsed dot fallback indicator */}
                        {item.badge && collapsed && (
                          <span className={`nav-icon-badge-dot ${item.badge.variant || "default"}`} />
                        )}
                      </span>
                    )}
                    <span className="nav-label">{item.label}</span>
                    
                    {/* Pin button — always visible for pinned items so users can unpin */}
                    {(showPinToggle || isPinned) && !collapsed && (
                      <button
                        className={`sb-pin-btn ${isPinned ? "active" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          togglePin(item.label);
                        }}
                        title={isPinned ? "Unpin item" : "Pin to top"}
                        aria-label={isPinned ? "Unpin item" : "Pin to top"}
                      >
                        <i className={isPinned ? "ti ti-star-filled pin-icon-starred" : "ti ti-star"} />
                      </button>
                    )}

                    {/* Badge on expanded mode */}
                    {item.badge && !collapsed && (
                      <span className={`nav-badge ${item.badge.variant || ""}`}>
                        {item.badge.text}
                      </span>
                    )}

                    {/* Chevron for sub-menus */}
                    {hasSubItems && !collapsed && (
                      <i className={`ti ti-chevron-${isExpanded ? "down" : "right"} nav-chevron`} />
                    )}
                  </a>

                  {/* Sub-items list */}
                  {hasSubItems && isExpanded && !collapsed && (
                    <div className="nav-sub-list">
                      {item.subItems!.map((sub, subIdx) => (
                        <a
                          key={subIdx}
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            if (sub.onClick) sub.onClick();
                          }}
                          className={`nav-sub-item ${sub.active ? "active" : ""}`}
                          aria-current={sub.active ? "page" : undefined}
                        >
                          {sub.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </nav>

      {/* Clickable Profile Card / Account Menu */}
      {profile && (
        <div className="sidebar-footer" ref={profileRef}>
          <div 
            className={`profile-card ${showProfileMenu ? "active" : ""}`} 
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            role="button"
            aria-haspopup="true"
            aria-expanded={showProfileMenu}
          >
            <div className="profile-av">{profile.avatarInitials}</div>
            <div className="profile-info">
              <span className="profile-name">{profile.name}</span>
              <span className="profile-role">{profile.role}</span>
            </div>
            {!collapsed && (
              <i className="ti ti-selector profile-selector-icon" style={{ marginLeft: "auto", opacity: 0.5, fontSize: "14px" }} />
            )}
          </div>

          {/* Footer Account Dropdown Popover */}
          {showProfileMenu && (
            <div className={`sidebar-profile-dropdown ${collapsed ? "collapsed" : ""}`}>
              <div className="dropdown-identity">
                <span className="dropdown-name">{profile.name}</span>
                <span className="dropdown-role">{profile.role}</span>
              </div>
              <div className="dropdown-divider" />
              <button className="dropdown-option" onClick={() => { setShowProfileMenu(false); onProfileClick?.(); }}>
                <i className="ti ti-user" />
                <span>My Profile</span>
              </button>
              <div className="dropdown-divider" />
              <button className="dropdown-option logout" onClick={() => { setShowProfileMenu(false); onLogout?.(); }}>
                <i className="ti ti-logout" />
                <span>Log Out</span>
              </button>
            </div>
          )}
        </div>
      )}
      </aside>
    </>
  );
};

export default Sidebar;
