import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Bell, 
  CheckCheck, 
  Trash2, 
  Info, 
  AlertTriangle, 
  CheckCircle2, 
  Settings, 
  LogOut, 
  User, 
  ChevronRight, 
  Clock, 
  Calendar, 
  Truck, 
  DollarSign, 
  Menu,
  LayoutGrid
} from 'lucide-react';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import type { NotificationItem } from '../notificationTypes';
import api from '../../api';
import { navigateToSystemPortal } from '../Auth/authRedirect';
import './GlobalHeader.css';

export type { NotificationItem };

const DUMMY_NOTIFICATIONS: NotificationItem[] = [
  // Logistics Director / Coordinator Alerts
  { id: '1', title: 'SLA Breach Warning', description: 'Route #8 is running 35 mins behind schedule. SLA impact imminent.', timestamp: '2m ago', date: 'Today', read: false, type: 'alert', category: 'logistics', isToday: true, source: 'TARS Monitor', actionLabel: 'View Route #8' },
  { id: '2', title: 'Fleet Report Available', description: 'Weekly dispatch efficiency audit is ready for download.', timestamp: '1h ago', date: 'Today', read: false, type: 'success', category: 'logistics', isToday: true, source: 'TARS Analytics' },
  { id: '3', title: 'New Route Manifest', description: 'Waybill SP-77291 assigned to driver Juan dela Cruz.', timestamp: '3h ago', date: 'Today', read: true, type: 'info', category: 'logistics', isToday: true, source: 'DMS' },

  // Finance approvals
  { id: '4', title: 'Capital Expenditure Request', description: 'Approval required for fuel replenishment fund PHP 120,000.', timestamp: '5h ago', date: 'Today', read: false, type: 'info', category: 'finance', isToday: true, source: 'FinSys', actionLabel: 'Review Fund' },
  { id: '5', title: 'Invoice Settlement Failed', description: 'Vendor payout to FastTrack Cargo rejected by bank.', timestamp: 'Yesterday', date: 'Yesterday', read: false, type: 'alert', category: 'finance', isToday: false, source: 'FinSys', actionLabel: 'Re-submit Pay' },

  // Driver notifications
  { id: '6', title: 'Route Update: Delivery Order', description: 'New dispatch assignment: Pickup at warehouse Cluster B.', timestamp: 'Yesterday', date: 'Yesterday', read: false, type: 'info', category: 'driver', isToday: false, source: 'Fleet Ops' },
  { id: '7', title: 'Vehicle Maintenance Complete', description: 'Truck Plate TX-492 cleared for long-haul duty.', timestamp: '3 days ago', date: 'March 3, 2025', read: true, type: 'success', category: 'driver', isToday: false, source: 'Fleet Ops' },

  // General System
  { id: '8', title: 'System Security Update', description: 'Workspace session policies updated for standard users.', timestamp: '4 days ago', date: 'March 3, 2025', read: true, type: 'system', category: 'system', isToday: false, source: 'IT Security' }
];

export interface BreadcrumbItem {
  label: string;
  /** Optional href or route path. Omit for the current (last) crumb. */
  href?: string;
}

export interface GlobalHeaderProps {
  title?: string;
  /** Breadcrumb trail shown below the title. Last item is the current page. */
  breadcrumbs?: BreadcrumbItem[];
  profile?: {
    name: string;
    role: string;
    avatarInitials: string;
    avatarUrl?: string;
  };
  /** External notifications from API. When provided, overrides internal dummy data. */
  notifications?: NotificationItem[];
  /** Called when a notification action button is clicked. Replaces alert(). */
  onNotificationAction?: (notification: NotificationItem) => void;
  /** Called when "View all notifications" footer link is clicked. */
  onViewAllNotifications?: () => void;
  /** Called when "My Profile" is clicked in the profile dropdown. */
  onProfile?: () => void;
  /** Called when "System Settings" is clicked in the profile dropdown. */
  onSettings?: () => void;
  /** Called when "Log Out" is clicked in the profile dropdown. */
  onLogout?: () => void;
  /** Called when notifications are marked as read or cleared. */
  onNotificationsUpdate?: (notifications: NotificationItem[]) => void;
}

const defaultProfile: {
  name: string;
  role: string;
  avatarInitials: string;
  avatarUrl?: string;
} = {
  name: 'FirstName LastName',
  role: 'Logistics Director',
  avatarInitials: 'FL',
};

const GlobalHeader: React.FC<GlobalHeaderProps> = ({ 
  title = 'Dashboard',
  breadcrumbs,
  profile = defaultProfile,
  notifications: externalNotifications,
  onNotificationAction,
  onViewAllNotifications,
  onProfile,
  onSettings,
  onLogout,
  onNotificationsUpdate,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [internalNotifications, setInternalNotifications] = useState<NotificationItem[]>(DUMMY_NOTIFICATIONS);

  const notifications = externalNotifications ?? internalNotifications;
  const setNotifications = (items: NotificationItem[] | ((prev: NotificationItem[]) => NotificationItem[])) => {
    if (externalNotifications) {
      if (typeof items === 'function') {
        const result = items(externalNotifications);
        onNotificationsUpdate?.(result);
      } else {
        onNotificationsUpdate?.(items);
      }
    } else {
      setInternalNotifications(items as any);
    }
  };
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [bellAnimating, setBellAnimating] = useState(false);

  const notificationRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const bellBtnRef = useRef<HTMLButtonElement>(null);
  const avatarBtnRef = useRef<HTMLButtonElement>(null);

  // Real-time Clock logic
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDateTime = useMemo(() => {
    const dateStr = currentTime.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timeStr = currentTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    return `${dateStr} • ${timeStr}`;
  }, [currentTime]);



  // Auto-close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdowns on Escape and return focus to the trigger button
  // (keyboard-accessibility parity with the shared Dropdown.tsx component)
  useEffect(() => {
    if (!showNotifications && !showProfileMenu) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showNotifications) {
        setShowNotifications(false);
        bellBtnRef.current?.focus();
      }
      if (showProfileMenu) {
        setShowProfileMenu(false);
        avatarBtnRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showNotifications, showProfileMenu]);

  // Filter notifications by active user role to show relevance
  const roleRelevantNotifications = useMemo(() => {
    const role = profile.role.toLowerCase();
    return notifications.filter(item => {
      if (role.includes('director') || role.includes('admin') || role.includes('manager')) {
        return item.category === 'logistics' || item.category === 'finance' || item.category === 'system';
      }
      if (role.includes('finance') || role.includes('auditor')) {
        return item.category === 'finance' || item.category === 'system';
      }
      if (role.includes('driver')) {
        return item.category === 'driver' || item.category === 'system';
      }
      return true; // fallback
    });
  }, [notifications, profile.role]);

  // Apply read/unread tabs
  const filtered = useMemo(() => {
    let result = roleRelevantNotifications;
    
    // Read/Unread tab filter
    if (filter === 'unread') {
      result = result.filter(n => !n.read);
    }
    
    return result;
  }, [roleRelevantNotifications, filter]);

  // Order: newest first, so recent notifications appear at the top. Items that
  // have no sortable timestamp keep their incoming order; unread critical
  // alerts break ties (same timestamp) so they still surface first.
  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime; // newest first
      const aCriticalUnread = a.type === 'alert' && !a.read ? 1 : 0;
      const bCriticalUnread = b.type === 'alert' && !b.read ? 1 : 0;
      return bCriticalUnread - aCriticalUnread; // unread criticals first on ties
    });
  }, [filtered]);

  // Unread count
  const unreadCount = useMemo(() => {
    return roleRelevantNotifications.filter(n => !n.read).length;
  }, [roleRelevantNotifications]);

  // Trigger bell animation on unread count change
  useEffect(() => {
    if (unreadCount > 0) {
      setBellAnimating(true);
      const t = setTimeout(() => setBellAnimating(false), 800);
      return () => clearTimeout(t);
    }
  }, [unreadCount]);

  // Persist "mark as read" to the backend so it survives polling/refetch.
  // Derived/pinned notifications (ids like "review-…" / "overdue-…") are not
  // real rows, so only real GUID ids are sent to the API.
  const isRealNotificationId = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(item => item.id === id ? { ...item, read: true } : item));
    if (isRealNotificationId(id)) {
      api.patch(`/api/Notification/${id}/read`).catch(() => { /* non-fatal */ });
    }
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => {
      const isRelevant = roleRelevantNotifications.some(r => r.id === n.id);
      return isRelevant ? { ...n, read: true } : n;
    }));
    api.patch('/api/Notification/read-all').catch(() => { /* non-fatal */ });
  };

  const clearAll = () => {
    setNotifications(prev => prev.filter(n => {
      const isRelevant = roleRelevantNotifications.some(r => r.id === n.id);
      return !isRelevant;
    }));
  };

  const toggleReadStatus = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = notifications.find(n => n.id === id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: !n.read } : n));
    // Persist only the "mark as read" direction (there is no unread API endpoint).
    if (current && !current.read) markAsRead(id);
  };

  // Group sorted notifications into Today vs Earlier
  const todayNotifications = useMemo(() => sortedFiltered.filter(n => n.isToday), [sortedFiltered]);
  const earlierNotifications = useMemo(() => sortedFiltered.filter(n => !n.isToday), [sortedFiltered]);

  return (
    <header className="site-header">
      <nav className="nav-bar">
        {/* Mobile-only hamburger — toggles the off-canvas Sidebar drawer.
            Hidden above the 480px breakpoint via .header-menu-btn CSS. */}
        <button
          className="header-menu-btn"
          onClick={() => window.dispatchEvent(new Event('toggle-sidebar-mobile'))}
          aria-label="Toggle navigation menu"
        >
          <Menu size={20} strokeWidth={1.75} />
        </button>

        {/* Left Side: Title + Breadcrumb */}
        <div className="header-title-group">
          {/* Breadcrumb trail */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="header-breadcrumb" aria-label="Breadcrumb">
              <ol className="breadcrumb-list">
                {breadcrumbs.map((crumb, i) => {
                  const isLast = i === breadcrumbs.length - 1;
                  return (
                    <li key={i} className="breadcrumb-item">
                      {!isLast && crumb.href ? (
                        <a href={crumb.href} className="breadcrumb-link">{crumb.label}</a>
                      ) : (
                        <span
                          className={isLast ? 'breadcrumb-current' : 'breadcrumb-link'}
                          aria-current={isLast ? 'page' : undefined}
                        >
                          {crumb.label}
                        </span>
                      )}
                      {!isLast && (
                        <ChevronRight size={12} className="breadcrumb-sep" aria-hidden="true" />
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}
          <h1 className="header-title">{title}</h1>
        </div>

        {/* Right Side: Interactive Controls */}
        <div className="header-controls">

          {/* Real-time Clock Widget */}
          <div className="header-datetime" aria-label="Current date and time">
            <Clock size={14} className="header-datetime-icon" />
            <span className="header-datetime-text">{formattedDateTime}</span>
          </div>
          {/* Notification Button & Dropdown */}
          <div className="header-notification-container" ref={notificationRef}>
            <button 
              ref={bellBtnRef}
              className={`header-icon-btn ${bellAnimating ? 'bell-pulse' : ''}`}
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowProfileMenu(false);
              }}
              aria-label="Notifications"
              aria-haspopup="true"
              aria-expanded={showNotifications}
            >
              <Bell size={20} strokeWidth={1.75} />
              {unreadCount > 0 && (
                <span className="notification-badge-count">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            
            {showNotifications && (
              <div 
                className="notification-dropdown"
                role="dialog"
                aria-live="polite"
                aria-label="Notification center"
              >
                {/* Header */}
                <div className="notification-dropdown-header">
                  <div className="notification-dropdown-title-group">
                    <span>Notifications</span>
                    {unreadCount > 0 && (
                      <span className="notification-unread-pill">{unreadCount} new</span>
                    )}
                  </div>
                  <button className="notification-mark-all-btn" onClick={markAllAsRead}>
                    <CheckCheck size={14} /> Mark all as read
                  </button>
                </div>
                
                {/* Filter tab bar */}
                <div className="notification-filter-bar">
                  <span 
                    onClick={() => setFilter('all')} 
                    className={`notification-filter-tab ${filter === 'all' ? 'active' : ''}`}
                  >
                    All
                  </span>
                  <span 
                    onClick={() => setFilter('unread')} 
                    className={`notification-filter-tab ${filter === 'unread' ? 'active' : ''}`}
                  >
                    Unread ({unreadCount})
                  </span>
                </div>

 
                {/* Notification Items List */}
                <div className="notification-dropdown-list">
                  {sortedFiltered.length === 0 ? (
                    <div className="notification-dropdown-empty">
                      <div className="empty-bell-icon">
                        <Bell size={32} />
                      </div>
                      <p className="empty-title">You're all caught up!</p>
                      <p className="empty-subtitle">No new alerts for this category.</p>
                    </div>
                  ) : (
                    <>
                      {/* TODAY SECTION */}
                      {todayNotifications.length > 0 && (
                        <div className="notification-group-section">
                          <div className="notification-group-title">Today</div>
                          {todayNotifications.map((n) => {
                            const isCritical = n.type === 'alert';
                            return (
                              <div 
                                key={n.id} 
                                className={`notification-dropdown-item ${!n.read ? 'unread' : ''} ${isCritical ? 'critical' : ''}`}
                                onClick={() => {
                                  if (!n.read) {
                                    markAsRead(n.id);
                                  }
                                  onNotificationAction?.(n);
                                }}
                              >
                                <div className="notification-dropdown-item-content">
                                  <div className={`notification-dropdown-icon-container ${n.type}`}>
                                    {n.type === 'alert' && <AlertTriangle size={14} />}
                                    {n.type === 'success' && <CheckCircle2 size={14} />}
                                    {n.type === 'info' && <Info size={14} />}
                                    {n.type === 'system' && <Settings size={14} />}
                                  </div>
                                  <div className="notification-dropdown-text-container">
                                    <div className="notification-dropdown-item-header">
                                      <div className="notification-title-container">
                                        <span className="notification-dropdown-item-title">{n.title}</span>
                                        <span className={`notification-category-badge ${n.category}`}>
                                          {n.category === 'logistics' && <Truck size={10} />}
                                          {n.category === 'finance' && <DollarSign size={10} />}
                                          {n.category === 'driver' && <User size={10} />}
                                          {n.category === 'system' && <Settings size={10} />}
                                          <span>{n.category}</span>
                                        </span>
                                      </div>
                                      <div className="notification-actions-right">
                                        <button
                                          className="mark-as-read-btn-text"
                                          onClick={(e) => toggleReadStatus(n.id, e)}
                                          title={n.read ? "Mark as unread" : "Mark as read"}
                                          aria-label={n.read ? "Mark as unread" : "Mark as read"}
                                        >
                                          {n.read ? "Mark unread" : "Mark read"}
                                        </button>
                                        <span className="notification-status-indicator-dot" />
                                      </div>
                                    </div>
                                    <p className="notification-dropdown-item-desc">{n.description}</p>
                                    
                                    {/* Inline action button — routes via onNotificationAction prop */}
                                    {n.actionLabel && (
                                      <div style={{ marginTop: '6px' }} onClick={e => e.stopPropagation()}>
                                        <button 
                                          className="notification-action-btn"
                                          onClick={() => {
                                            onNotificationAction
                                              ? onNotificationAction(n)
                                              : console.info('[GlobalHeader] onNotificationAction not set for:', n.actionLabel);
                                          }}
                                        >
                                          {n.actionLabel} →
                                        </button>
                                      </div>
                                    )}

                                    <span className="notification-dropdown-item-time">{n.timestamp}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
 
                      {/* EARLIER SECTION */}
                      {earlierNotifications.length > 0 && (
                        <div className="notification-group-section">
                          <div className="notification-group-title">Earlier</div>
                          {earlierNotifications.map((n) => {
                            const isCritical = n.type === 'alert';
                            return (
                              <div 
                                key={n.id} 
                                className={`notification-dropdown-item ${!n.read ? 'unread' : ''} ${isCritical ? 'critical' : ''}`}
                                onClick={() => {
                                  if (!n.read) {
                                    markAsRead(n.id);
                                  }
                                  onNotificationAction?.(n);
                                }}
                              >
                                <div className="notification-dropdown-item-content">
                                  <div className={`notification-dropdown-icon-container ${n.type}`}>
                                    {n.type === 'alert' && <AlertTriangle size={14} />}
                                    {n.type === 'success' && <CheckCircle2 size={14} />}
                                    {n.type === 'info' && <Info size={14} />}
                                    {n.type === 'system' && <Settings size={14} />}
                                  </div>
                                  <div className="notification-dropdown-text-container">
                                    <div className="notification-dropdown-item-header">
                                      <div className="notification-title-container">
                                        <span className="notification-dropdown-item-title">{n.title}</span>
                                        <span className={`notification-category-badge ${n.category}`}>
                                          {n.category === 'logistics' && <Truck size={10} />}
                                          {n.category === 'finance' && <DollarSign size={10} />}
                                          {n.category === 'driver' && <User size={10} />}
                                          {n.category === 'system' && <Settings size={10} />}
                                          <span>{n.category}</span>
                                        </span>
                                      </div>
                                      <div className="notification-actions-right">
                                        <button
                                          className="mark-as-read-btn-text"
                                          onClick={(e) => toggleReadStatus(n.id, e)}
                                          title={n.read ? "Mark as unread" : "Mark as read"}
                                          aria-label={n.read ? "Mark as unread" : "Mark as read"}
                                        >
                                          {n.read ? "Mark unread" : "Mark read"}
                                        </button>
                                        <span className="notification-status-indicator-dot" />
                                      </div>
                                    </div>
                                    <p className="notification-dropdown-item-desc">{n.description}</p>

                                    {/* Inline action button — routes via onNotificationAction prop */}
                                    {n.actionLabel && (
                                      <div style={{ marginTop: '6px' }} onClick={e => e.stopPropagation()}>
                                        <button 
                                          className="notification-action-btn"
                                          onClick={() => {
                                            onNotificationAction
                                              ? onNotificationAction(n)
                                              : console.info('[GlobalHeader] onNotificationAction not set for:', n.actionLabel);
                                          }}
                                        >
                                          {n.actionLabel} →
                                        </button>
                                      </div>
                                    )}

                                    <span className="notification-dropdown-item-time">{n.timestamp}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
 
                {/* Footer Link */}
                <div className="notification-dropdown-footer">
                  <button
                    className="view-all-notifications-btn"
                    onClick={() => {
                      setShowNotifications(false);
                      onViewAllNotifications
                        ? onViewAllNotifications()
                        : console.info('[GlobalHeader] onViewAllNotifications not set');
                    }}
                  >
                    <span>View all notifications</span>
                    <ChevronRight size={14} />
                  </button>
                  {/* Destructive Clear All icon is now linked to confirmation workflow */}
                  <button 
                    className="clear-all-notifications-btn" 
                    onClick={() => setShowClearConfirm(true)} 
                    title="Clear all notifications"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
 
          {/* Profile Avatar & Dropdown */}
          <div className="header-profile-container" ref={profileRef}>
            <button 
              ref={avatarBtnRef}
              className="header-avatar-btn" 
              onClick={() => {
                setShowProfileMenu(!showProfileMenu);
                setShowNotifications(false);
              }}
              aria-label="User Profile Dropdown"
              aria-haspopup="true"
              aria-expanded={showProfileMenu}
            >
              <div className="avatar-circle-wrapper">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={profile.name} className="avatar-image" />
                ) : (
                  <div className="avatar-circle">
                    {profile.avatarInitials}
                  </div>
                )}
                <span className="avatar-online-indicator" title="Online" />
              </div>
            </button>
            
            {showProfileMenu && (
              <div className="profile-dropdown" role="menu" aria-label="Profile menu">
                {/* Identity Header */}
                <div className="profile-dropdown-user-info">
                  <div className="profile-dropdown-avatar-wrapper">
                    {profile.avatarUrl ? (
                      <img src={profile.avatarUrl} alt={profile.name} className="profile-dropdown-avatar-image" />
                    ) : (
                      <div className="profile-dropdown-avatar">
                        {profile.avatarInitials}
                      </div>
                    )}
                    <span className="profile-dropdown-online-indicator" title="Online" />
                  </div>
                  <div className="profile-dropdown-meta">
                    <span className="profile-dropdown-name">{profile.name}</span>
                    <span className="profile-dropdown-role">{profile.role}</span>
                  </div>
                </div>
 
                <div className="profile-dropdown-divider" />
                
                {/* Options List */}
                <div className="profile-dropdown-options">
                  <button 
                    className="profile-dropdown-option"
                    role="menuitem"
                    onClick={() => {
                      setShowProfileMenu(false);
                      onProfile
                        ? onProfile()
                        : console.info('[GlobalHeader] onProfile not set');
                    }}
                  >
                    <User size={15} strokeWidth={2} className="option-icon" />
                    <span>My Profile</span>
                  </button>

                  <button 
                    className="profile-dropdown-option"
                    role="menuitem"
                    onClick={() => {
                      setShowProfileMenu(false);
                      navigateToSystemPortal();
                    }}
                  >
                    <LayoutGrid size={15} strokeWidth={2} className="option-icon" />
                    <span>System Portal</span>
                  </button>
                  
                  <button 
                    className="profile-dropdown-option"
                    role="menuitem"
                    onClick={() => {
                      setShowProfileMenu(false);
                      onSettings
                        ? onSettings()
                        : console.info('[GlobalHeader] onSettings not set');
                    }}
                  >
                    <Settings size={15} strokeWidth={2} className="option-icon" />
                    <span>System Settings</span>
                  </button>
                </div>
 

                
                {/* Logout Option */}
                <div className="profile-dropdown-logout-section">
                  <button 
                    className="profile-dropdown-option logout-option"
                    role="menuitem"
                    onClick={() => {
                      setShowProfileMenu(false);
                      onLogout
                        ? onLogout()
                        : console.info('[GlobalHeader] onLogout not set');
                    }}
                  >
                    <LogOut size={15} strokeWidth={2} className="option-icon" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>



      {/* Confirmation dialog for the destructive "Clear all" action — shared ConfirmModal */}
      <ConfirmModal
        isOpen={showClearConfirm}
        title="Clear all notifications?"
        message="This will permanently delete all notifications for your current role. This action is irreversible."
        variant="danger"
        confirmLabel="Clear Notifications"
        cancelLabel="Cancel"
        icon="ti-trash"
        onCancel={() => setShowClearConfirm(false)}
        onConfirm={() => {
          clearAll();
          setShowClearConfirm(false);
        }}
      />

    </header>
  );
};
 
export default GlobalHeader;
