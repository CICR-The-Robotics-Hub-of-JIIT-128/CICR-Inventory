import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { BottomNavbar, ActiveView } from '../layout/BottomNavbar';
import { MobileSidebar } from '../layout/MobileSidebar';
import { CartItem } from '../inventory/RequestCartModal';
import { TopNavbar } from './TopNavbar';
import { DashboardOverview } from './DashboardOverview';
import { ComponentVaultView } from './ComponentVaultView';
import { AdminHubView } from './AdminHubView';
import { InventoryItem, BorrowRequest, isReturnRequested } from '../../types/inventory';
import { supabase } from '../../lib/supabase';
import { useToast } from '../common/Toast';
import { Notification } from '../ui/notification-bell';
import { notifyAccountApproved, notifyAccountRejected, requestDeviceNotificationPermission } from '../../utils/deviceNotification';
import {
  extractIdentityFromEmail,
  hydrateMemberIdentity,
  isDirtyOrPlaceholderName,
  toCleanDisplayName,
} from '../../lib/identity';

// Code-split heavy sub-views and modals on-demand so initial page load is 0ms instant and smooth
const RequisitionsView = lazy(() =>
  import('./RequisitionsView').then((m) => ({ default: m.RequisitionsView }))
);
const MeetTheDevelopers = lazy(() =>
  import('./MeetTheDevelopers').then((m) => ({ default: m.MeetTheDevelopers }))
);
const RequestCartModal = lazy(() =>
  import('../inventory/RequestCartModal').then((m) => ({ default: m.RequestCartModal }))
);
const AddEditItemModal = lazy(() =>
  import('../inventory/AddEditItemModal').then((m) => ({ default: m.AddEditItemModal }))
);
const ItemDetailModal = lazy(() =>
  import('../inventory/ItemDetailModal').then((m) => ({ default: m.ItemDetailModal }))
);
const IssuePassModal = lazy(() =>
  import('./IssuePassModal').then((m) => ({ default: m.IssuePassModal }))
);

const isLowReserveItem = (i: InventoryItem): boolean => {
  if (i.available_qty <= 0) return false;
  if (i.total_qty <= 0) return false;
  return (i.available_qty / i.total_qty) < 0.5;
};

const VIEW_TO_HASH: Record<ActiveView, string> = {
  dashboard: '#dashboard',
  inventory: '#inventory',
  'review-requests': '#requests',
  logs: '#management',
  developers: '#team',
};

const HASH_TO_VIEW: Record<string, ActiveView> = {
  '': 'dashboard',
  '#': 'dashboard',
  '#dashboard': 'dashboard',
  '#inventory': 'inventory',
  '#requests': 'review-requests',
  '#review-requests': 'review-requests',
  '#logs': 'logs',
  '#management': 'logs',
  '#developers': 'developers',
  '#team': 'developers',
};

export const UserDashboard: React.FC = () => {
  const {
    user,
    profile,
    isAdmin,
    approveUserAccount,
    rejectUserAccount,
    updateUserRole,
  } = useAuth();
  const { items, requests, logs, loading, deleteItem, updateBorrowStatus, refreshData, broadcastAccountStatus } = useInventory();
  const { showToast } = useToast();

  const [activeView, setActiveView] = useState<ActiveView>(() => {
    if (typeof window !== 'undefined') {
      const v = HASH_TO_VIEW[window.location.hash] || 'dashboard';
      if (v === 'logs' && !isAdmin) return 'dashboard';
      return v;
    }
    return 'dashboard';
  });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartModalOpen, setCartModalOpen] = useState(false);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedIssuePassReq, setSelectedIssuePassReq] = useState<BorrowRequest | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Filters in Component Vault
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Admin Hub state with instant 0ms localStorage caching
  const [pendingAccounts, setPendingAccounts] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem('cicr-cached-pending-accounts');
      if (!raw) return [];
      if (raw.startsWith('cicr_vault_')) {
        const decoded = decodeURIComponent(atob(raw.slice(11)).split('').reverse().join(''));
        return JSON.parse(decoded);
      }
      return JSON.parse(raw);
    } catch {
      return [];
    }
  });
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [locallyProcessedIds, setLocallyProcessedIds] = useState<Set<string>>(() => new Set());
  const [allMembers, setAllMembers] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem('cicr-cached-members');
      if (!raw) return [];
      if (raw.startsWith('cicr_vault_')) {
        const decoded = decodeURIComponent(atob(raw.slice(11)).split('').reverse().join(''));
        return JSON.parse(decoded);
      }
      return JSON.parse(raw);
    } catch {
      return [];
    }
  });
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Notifications with persistent read status in localStorage
  const [readNotifIds, setReadNotifIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('cicr-read-notifications');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Notifications with persistent dismissed status in localStorage
  const [dismissedNotifIds, setDismissedNotifIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('cicr-dismissed-notifications');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Track open modal status and active view in refs so popstate listener always has fresh state
  const isAnyModalOpen =
    cartModalOpen ||
    addItemModalOpen ||
    editingItem !== null ||
    selectedItem !== null ||
    selectedIssuePassReq !== null;

  const isAnyModalOpenRef = useRef(isAnyModalOpen);
  const mobileMenuOpenRef = useRef(mobileMenuOpen);
  const activeViewRef = useRef<ActiveView>(activeView);
  const viewHistoryRef = useRef<ActiveView[]>([]);
  const lastBackPressTimeRef = useRef<number>(0);
  const isProgrammaticModalCloseRef = useRef<boolean>(false);

  useEffect(() => {
    isAnyModalOpenRef.current = isAnyModalOpen;
  }, [isAnyModalOpen]);

  useEffect(() => {
    mobileMenuOpenRef.current = mobileMenuOpen;
  }, [mobileMenuOpen]);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  // Clean Address Bar & Mobile/Browser History Navigation:
  // Keeps the address bar strictly clean (active origin without #inventory, #team, etc.)
  // while preserving full phone hardware back, gesture swipe, and browser back navigation.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const currentHash = window.location.hash;
    let initialView = HASH_TO_VIEW[currentHash] || 'dashboard';
    if (initialView === 'logs' && !isAdmin) {
      initialView = 'dashboard';
    }
    setActiveView(initialView);
    viewHistoryRef.current = initialView === 'dashboard' ? ['dashboard'] : ['dashboard', initialView];

    const cleanPath = window.location.pathname || '/';
    let tabCameFromOAuth = false;
    try {
      tabCameFromOAuth =
        sessionStorage.getItem('cicr_oauth_tab') === '1' ||
        /[?&](code|state|error_code)=/.test(window.location.search || '') ||
        /(accounts\.google\.com|\.supabase\.co)/i.test(document.referrer || '');
    } catch {}

    // 1. Seed root guard at history entry 0 (protects mobile users from abruptly exiting)
    // Strip any hash that might have been present in the initial URL
    window.history.replaceState({ cicrApp: true, view: 'dashboard', root: true }, '', cleanPath);

    // 2. Push active view entry at history entry 1 without any #hash in the address bar
    window.history.pushState(
      { cicrApp: true, view: initialView, depth: viewHistoryRef.current.length },
      '',
      cleanPath
    );

    const handlePopState = (e: PopStateEvent) => {
      // If modal was closed programmatically (e.g. by clicking 'X' or Cancel button), ignore this popstate
      if (isProgrammaticModalCloseRef.current) {
        isProgrammaticModalCloseRef.current = false;
        return;
      }

      // 1. Close mobile navigation drawer on back press before popping views
      if (mobileMenuOpenRef.current) {
        setMobileMenuOpen(false);
        window.history.pushState(
          { cicrApp: true, view: activeViewRef.current, depth: viewHistoryRef.current.length },
          '',
          cleanPath
        );
        return;
      }

      // 2. If any modal is open, pressing back closes the modal and stays in the active view
      if (isAnyModalOpenRef.current) {
        setCartModalOpen(false);
        setAddItemModalOpen(false);
        setEditingItem(null);
        setSelectedItem(null);
        setSelectedIssuePassReq(null);
        return;
      }

      // 2. If user is on a sub-view (inventory, requests, management, developers):
      //    Take them back to previous view or Home Dashboard instead of exiting!
      if (activeViewRef.current !== 'dashboard') {
        let prevView: ActiveView = 'dashboard';
        while (viewHistoryRef.current.length > 0) {
          const last = viewHistoryRef.current.pop();
          if (last && last !== activeViewRef.current) {
            prevView = last;
            break;
          }
        }
        setActiveView(prevView);
        window.history.pushState(
          { cicrApp: true, view: prevView, depth: viewHistoryRef.current.length },
          '',
          cleanPath
        );
        return;
      }

      // 3. User is on the Home Dashboard and pressed Back on phone:
      //    Require a double back-press within 2 seconds to exit, preventing accidental closing!
      const now = Date.now();
      if (now - lastBackPressTimeRef.current < 2000) {
        // Never rewind browser history into a consumed Google / Supabase OAuth callback URL,
        // which triggers bad_oauth_state and bounces out of the CICR domain.
        if (tabCameFromOAuth) {
          try {
            window.close();
          } catch {}
          lastBackPressTimeRef.current = 0;
          window.history.pushState({ cicrApp: true, view: 'dashboard', depth: 0 }, '', cleanPath);
          return;
        }
        // Double back pressed within 2s: allow normal exit from site
        window.history.back();
        return;
      }

      lastBackPressTimeRef.current = now;
      showToast('info', 'Press back again to exit', 'Tap back once more to leave the app.');

      // Push Dashboard state back so the web app stays open on phone
      window.history.pushState(
        { cicrApp: true, view: 'dashboard', depth: 0 },
        '',
        cleanPath
      );
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleNavigateView = useCallback((newView: ActiveView) => {
    if (newView === activeViewRef.current) return;
    if (newView === 'logs' && !isAdmin) return;
    viewHistoryRef.current.push(newView);
    const cleanPath = typeof window !== 'undefined' ? (window.location.pathname || '/') : '/';
    // Push new view with clean address bar (no #hash)
    window.history.pushState(
      { cicrApp: true, view: newView, depth: viewHistoryRef.current.length },
      '',
      cleanPath
    );
    setActiveView(newView);
  }, [isAdmin]);

  // Modal open & close helpers that integrate with the browser history stack
  const openModalWithHistory = useCallback((modalName: string) => {
    const cleanPath = typeof window !== 'undefined' ? (window.location.pathname || '/') : '/';
    window.history.pushState(
      { cicrApp: true, view: activeViewRef.current, modal: modalName, depth: viewHistoryRef.current.length },
      '',
      cleanPath
    );
  }, []);

  const closeModalWithHistory = useCallback((closeAction: () => void) => {
    closeAction();
    if (typeof window !== 'undefined' && window.history.state?.modal) {
      isProgrammaticModalCloseRef.current = true;
      window.history.back();
    }
  }, []);

  const handleOpenCart = () => {
    openModalWithHistory('cart');
    setCartModalOpen(true);
  };

  const handleCloseCart = () => {
    closeModalWithHistory(() => setCartModalOpen(false));
  };

  const handleOpenAddItem = () => {
    if (!isAdmin) {
      showToast('error', 'Admin Clearance Required', 'Only administrators can add components.');
      return;
    }
    setEditingItem(null);
    openModalWithHistory('add-item');
    setAddItemModalOpen(true);
  };

  const handleOpenEditItem = (item: InventoryItem) => {
    if (!isAdmin) {
      showToast('error', 'Admin Clearance Required', 'Only administrators can edit components.');
      return;
    }
    setEditingItem(item);
    setSelectedItem(null);
    openModalWithHistory('edit-item');
    setAddItemModalOpen(true);
  };

  const handleCloseAddEditItem = () => {
    closeModalWithHistory(() => {
      setAddItemModalOpen(false);
      setEditingItem(null);
    });
  };

  const handleSelectItem = (item: InventoryItem) => {
    openModalWithHistory('item-detail');
    setSelectedItem(item);
  };

  const handleCloseItemDetail = () => {
    closeModalWithHistory(() => setSelectedItem(null));
  };

  const handleOpenIssuePass = (req: BorrowRequest) => {
    openModalWithHistory('issue-pass');
    setSelectedIssuePassReq(req);
  };

  const handleCloseIssuePass = () => {
    closeModalWithHistory(() => setSelectedIssuePassReq(null));
  };

  const handleMarkNotificationRead = (id: string) => {
    setReadNotifIds((prev) => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem('cicr-read-notifications', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const handleMarkAllNotificationsRead = () => {
    setReadNotifIds((prev) => {
      const next = new Set(prev);
      notifications.forEach((n) => next.add(n.id));
      try {
        localStorage.setItem('cicr-read-notifications', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleClearNotifications = () => {
    setDismissedNotifIds((prev) => {
      const next = new Set(prev);
      notifications.forEach((n) => next.add(n.id));
      try {
        localStorage.setItem('cicr-dismissed-notifications', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
    setNotifications([]);
  };

  const handleDismissNotification = (id: string) => {
    setDismissedNotifIds((prev) => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem('cicr-dismissed-notifications', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // Unified parallel fetch for Admin Hub roster & pending requests with Auth metadata hydration & cache
  const syncAdminHubData = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setAllMembers((curr) => {
        if (curr.length === 0) setLoadingMembers(true);
        return curr;
      });

      // 1. Prefer server-side roster sync (/api/accounts) so auth.users.user_metadata recovers real names
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (accessToken) {
          const serverRes = await fetch('/api/accounts', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ action: 'list_roster' }),
          });
          if (serverRes.ok) {
            const serverData = await serverRes.json();
            if (Array.isArray(serverData?.members)) {
              const serverMembers = serverData.members.map((m: any) => hydrateMemberIdentity(m));
              setAllMembers(serverMembers);
              try {
                localStorage.setItem('cicr-cached-members', JSON.stringify(serverMembers));
              } catch {}

              const serverPending = Array.isArray(serverData?.pendingAccounts)
                ? serverData.pendingAccounts
                    .map((a: any) => hydrateMemberIdentity(a))
                    .filter(
                      (a: any) =>
                        !locallyProcessedIds.has(a.id) &&
                        (!a.email || !locallyProcessedIds.has(String(a.email).toLowerCase()))
                    )
                : [];
              setPendingAccounts(serverPending);
              try {
                localStorage.setItem('cicr-cached-pending-accounts', JSON.stringify(serverPending));
              } catch {}
              return;
            }
          }
        }
      } catch (serverSyncErr) {
        console.warn('Server roster sync notice, falling back to direct Supabase query:', serverSyncErr);
      }

      const [profRes, reqLogsRes] = await Promise.all([
        supabase.from('profiles').select('*').order('full_name', { ascending: true }),
        supabase.from('activity_logs').select('*').eq('action', 'ACCOUNT_REQUEST').order('created_at', { ascending: false }).limit(100),
      ]);

      const profData = profRes.data || [];
      const reqLogs = reqLogsRes.data || [];

      // 1. Process Approved Roster Members and hydrate identity from institutional email when missing
      const approvedMembers = profData
        .filter(
          (m) =>
            (m.status === 'approved' || m.avatar_url === 'status:approved') &&
            m.status !== 'rejected' &&
            m.avatar_url !== 'status:rejected'
        )
        .map((m) => hydrateMemberIdentity(m));
      setAllMembers(approvedMembers);
      try {
        localStorage.setItem('cicr-cached-members', JSON.stringify(approvedMembers));
      } catch {}

      // 2. Process Pending Signups (strictly treat only approved/rejected as resolved, NOT status:pending)
      const isProfileResolved = (p: any) =>
        p.status === 'approved' ||
        p.status === 'rejected' ||
        p.avatar_url === 'status:approved' ||
        p.avatar_url === 'status:rejected';

      const resolvedEmails = new Set(
        profData
          .filter(isProfileResolved)
          .map((p) => p.email?.toLowerCase())
          .filter(Boolean)
      );

      const resolvedUserIds = new Set(
        profData
          .filter(isProfileResolved)
          .map((p) => p.id)
      );

      const pendingMap = new Map();

      profData.forEach((p) => {
        const emailKey = p.email?.toLowerCase();
        const isResolved =
          isProfileResolved(p) ||
          locallyProcessedIds.has(p.id) ||
          (emailKey && locallyProcessedIds.has(emailKey));

        if (!isResolved) {
          const isPending =
            p.status === 'pending' ||
            p.avatar_url === 'status:pending' ||
            !p.status;

          if (isPending && emailKey && !resolvedEmails.has(emailKey)) {
            pendingMap.set(emailKey, hydrateMemberIdentity(p));
          }
        }
      });

      reqLogs.forEach((log) => {
        let details: any = {};
        try {
          details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
        } catch {
          details = {};
        }
        const email = (details?.email || '').toLowerCase();
        const userId = details?.userId || log.user_id;
        const isPending = !details?.status || details?.status === 'pending';

        if (
          isPending &&
          email &&
          !resolvedEmails.has(email) &&
          (!userId || !resolvedUserIds.has(userId)) &&
          !locallyProcessedIds.has(log.id) &&
          (!userId || !locallyProcessedIds.has(userId)) &&
          !locallyProcessedIds.has(email) &&
          !pendingMap.has(email)
        ) {
          pendingMap.set(
            email,
            hydrateMemberIdentity({
              id: userId || log.id,
              full_name: details?.fullName || details?.full_name || log.user_name || '',
              email: details?.email,
              roll_number: details?.enrollmentNo || details?.roll_number || '',
              phone: details?.phone || '',
              role: details?.role || 'member',
              status: 'pending',
              created_at: log.created_at,
            })
          );
        }
      });

      const pendingList = Array.from(pendingMap.values()).filter(
        (a) => !locallyProcessedIds.has(a.id) && (!a.email || !locallyProcessedIds.has(a.email.toLowerCase()))
      );
      setPendingAccounts(pendingList);
      try {
        localStorage.setItem('cicr-cached-pending-accounts', JSON.stringify(pendingList));
      } catch {}
    } catch (err) {
      console.warn('Notice syncing admin hub telemetry:', err);
    } finally {
      setLoadingMembers(false);
    }
  }, [isAdmin, locallyProcessedIds]);

  useEffect(() => {
    if (isAdmin) {
      syncAdminHubData();
      return;
    }

    setAddItemModalOpen(false);
    setEditingItem(null);
    setPendingAccounts([]);
    setAllMembers([]);
    try {
      localStorage.removeItem('cicr-cached-members');
      localStorage.removeItem('cicr-cached-pending-accounts');
    } catch {}
    if (activeViewRef.current === 'logs') {
      setActiveView('dashboard');
    }
  }, [isAdmin, syncAdminHubData]);

  // Generate notifications: warnings are strictly visible to only admin accounts!
  useEffect(() => {
    const list: Notification[] = [];
    if (isAdmin) {
      const lowItems = items.filter((i) => isLowReserveItem(i));
      lowItems.forEach((it) => {
        const notifId = `low-${it.id}`;
        if (!dismissedNotifIds.has(notifId)) {
          list.push({
            id: notifId,
            title: `Low Reserve: ${it.name}`,
            message: `Only ${it.available_qty} units left in stock.`,
            type: 'warning',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            read: readNotifIds.has(notifId),
            action: () => handleNavigateView('inventory'),
          });
        }
      });
    }

    const pendingReqs = requests.filter((r) => r.status === 'pending');
    if (isAdmin && pendingReqs.length > 0) {
      const notifId = `pending-reqs-alert-${pendingReqs.map((r) => r.id).join('_')}`;
      if (!dismissedNotifIds.has(notifId) && !dismissedNotifIds.has('pending-reqs-alert')) {
        list.push({
          id: notifId,
          title: `${pendingReqs.length} Requisition(s) Pending`,
          message: 'Members have requested hardware awaiting admin authorization.',
          type: 'info',
          timestamp: 'Real-time',
          read: readNotifIds.has(notifId),
          action: () => handleNavigateView('review-requests'),
        });
      }
    }

    const returnReqs = requests.filter((r) => isReturnRequested(r));
    if (isAdmin && returnReqs.length > 0) {
      const notifId = `pending-returns-alert-${returnReqs.map((r) => r.id).join('_')}`;
      if (!dismissedNotifIds.has(notifId) && !dismissedNotifIds.has('pending-returns-alert')) {
        list.push({
          id: notifId,
          title: `${returnReqs.length} Return Clearance(s) Pending`,
          message: 'Members have submitted hardware for return awaiting admin check-in.',
          type: 'warning',
          timestamp: 'Real-time',
          read: readNotifIds.has(notifId),
          action: () => handleNavigateView('review-requests'),
        });
      }
    }

    if (isAdmin && pendingAccounts.length > 0) {
      const notifId = `pending-accounts-alert-${pendingAccounts.map((a) => a.id).join('_')}`;
      if (!dismissedNotifIds.has(notifId) && !dismissedNotifIds.has('pending-accounts-alert')) {
        list.push({
          id: notifId,
          title: `${pendingAccounts.length} Registration(s) Pending`,
          message: 'New user account requests are awaiting admin verification in Management Hub.',
          type: 'info',
          timestamp: 'Pending Review',
          read: readNotifIds.has(notifId),
          action: () => handleNavigateView('logs'),
        });
      }
    }

    // Member-specific requisition updates
    if (user?.email) {
      const myApproved = requests.filter(
        (r) =>
          (r.user_email?.toLowerCase() === user.email?.toLowerCase() || r.user_id === user.id) &&
          (r.status === 'approved' || r.status === 'overdue')
      );
      if (myApproved.length > 0) {
        const notifId = `my-approved-${myApproved.map((r) => r.id).join('_')}`;
        if (!dismissedNotifIds.has(notifId) && !dismissedNotifIds.has('my-approved-requisitions')) {
          list.push({
            id: notifId,
            title: `${myApproved.length} Requisition(s) Cleared`,
            message: 'Admin has authorized your hardware pass. Tap to view and collect hardware.',
            type: 'success',
            timestamp: 'Authorized',
            read: readNotifIds.has(notifId),
            action: () => handleNavigateView('review-requests'),
          });
        }
      }

      const myRejected = requests.filter(
        (r) => (r.user_email?.toLowerCase() === user.email?.toLowerCase() || r.user_id === user.id) && r.status === 'rejected'
      );
      if (myRejected.length > 0) {
        const notifId = `my-rejected-${myRejected.map((r) => r.id).join('_')}`;
        if (!dismissedNotifIds.has(notifId) && !dismissedNotifIds.has('my-rejected-requisitions')) {
          list.push({
            id: notifId,
            title: `${myRejected.length} Requisition(s) Declined`,
            message: 'An administrator has reviewed and declined your requisition request.',
            type: 'error',
            timestamp: 'Reviewed',
            read: readNotifIds.has(notifId),
            action: () => handleNavigateView('review-requests'),
          });
        }
      }

      const myReturnPending = requests.filter(
        (r) => (r.user_email?.toLowerCase() === user.email?.toLowerCase() || r.user_id === user.id) && isReturnRequested(r)
      );
      if (myReturnPending.length > 0) {
        const notifId = `my-return-${myReturnPending.map((r) => r.id).join('_')}`;
        if (!dismissedNotifIds.has(notifId) && !dismissedNotifIds.has('my-return-pending')) {
          list.push({
            id: notifId,
            title: `${myReturnPending.length} Return Clearance(s) Pending`,
            message: 'Your hardware return request is submitted and awaiting admin inspection & approval.',
            type: 'info',
            timestamp: 'In Review',
            read: readNotifIds.has(notifId),
            action: () => handleNavigateView('review-requests'),
          });
        }
      }
    }

    setNotifications((prev) => {
      if (
        prev.length === list.length &&
        prev.every((n, i) => n.id === list[i].id && n.read === list[i].read)
      ) {
        return prev;
      }
      return list;
    });
  }, [items, requests, pendingAccounts, isAdmin, user, readNotifIds, dismissedNotifIds, handleNavigateView]);

  // Cart operations
  const handleAddToCart = (item: InventoryItem) => {
    const existing = cart.find((c) => c.item.id === item.id);
    if (existing) {
      if (existing.quantity >= item.available_qty) {
        showToast('warning', 'Max Units Added', `Only ${item.available_qty} items available in vault.`);
        return;
      }
      showToast('info', 'Cart Updated', `Increased ${item.name} quantity.`);
      setCart((prev) =>
        prev.map((c) => (c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c))
      );
      return;
    }
    showToast('success', 'Staged in Cart', `${item.name} staged for requisition dispatch.`);
    setCart((prev) => [...prev, { item, quantity: 1 }]);
  };

  const handleUpdateCartQuantity = (itemId: string, delta: number) => {
    const existing = cart.find((c) => c.item.id === itemId);
    if (!existing) return;
    const newQty = existing.quantity + delta;
    if (newQty > existing.item.available_qty) {
      showToast('warning', 'Limit Reached', `Only ${existing.item.available_qty} units available.`);
      return;
    }
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.item.id === itemId) {
            if (newQty <= 0) return null;
            return { ...c, quantity: newQty };
          }
          return c;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleRemoveFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((c) => c.item.id !== itemId));
    showToast('info', 'Item Removed', 'Component removed from request cart.');
  };

  // Requisitions & Approvals
  const handleBorrowAction = async (
    requestId: string,
    action: 'approved' | 'rejected' | 'returned',
    note?: string
  ) => {
    if (!isAdmin) {
      showToast('error', 'Admin Clearance Required', 'Only administrators can approve, reject, or process returns.');
      return;
    }
    const res = await updateBorrowStatus(requestId, action, note);
    if (res.success) {
      showToast('success', `Requisition ${action.toUpperCase()}`, `Borrow status updated to ${action}.`);
      await refreshData();
    } else {
      showToast('error', 'Update Failed', res.error);
    }
  };

  // Member Management
  const handlePromoteRole = async (targetUserId: string, newRole: 'admin' | 'member', name: string) => {
    try {
      if (!isAdmin) {
        showToast('error', 'Unauthorized', 'Administrative privileges required.');
        return;
      }
      if (user?.id && targetUserId === user.id) {
        showToast('error', 'Action Restricted', 'You cannot change your own administrator role.');
        return;
      }

      setProcessingUserId(targetUserId);
      const res = await updateUserRole(targetUserId, newRole);
      if (!res.success) {
        showToast('error', 'Role Update Failed', res.error || 'Failed to update member role.');
        return;
      }

      showToast('success', 'Role Updated', `${name} is now ${newRole.toUpperCase()}.`);
      await Promise.all([syncAdminHubData(), refreshData()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not change member role.';
      showToast('error', 'Role Update Failed', msg);
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleApproveAccount = async (targetUserId: string, targetName: string, targetEmail?: string) => {
    if (!isAdmin) {
      showToast('error', 'Admin Clearance Required', 'Only administrators can approve member accounts.');
      return;
    }
    const emailKey = targetEmail?.toLowerCase() || '';
    setLocallyProcessedIds((prev) => {
      const next = new Set(prev);
      if (targetUserId) next.add(targetUserId);
      if (emailKey) next.add(emailKey);
      return next;
    });

    // Instant Optimistic UI Update (0ms)
    const previousPending = pendingAccounts;
    const updatedPending = previousPending.filter(
      (a) => a.id !== targetUserId && (!emailKey || a.email?.toLowerCase() !== emailKey)
    );
    setPendingAccounts(updatedPending);
    try {
      localStorage.setItem('cicr-cached-pending-accounts', JSON.stringify(updatedPending));
    } catch {}

    showToast('success', 'Account Approved', `${targetName} can now sign in.`);
    notifyAccountApproved(targetName, false);
    broadcastAccountStatus?.(targetUserId, targetEmail || '', targetName, 'approved');

    setProcessingUserId(targetUserId);
    try {
      const res = await approveUserAccount(targetUserId, targetEmail, targetName);
      if (!res.success) {
        // Rollback only if approval truly failed
        setLocallyProcessedIds((prev) => {
          const next = new Set(prev);
          next.delete(targetUserId);
          if (emailKey) next.delete(emailKey);
          return next;
        });
        setPendingAccounts(previousPending);
        try {
          localStorage.setItem('cicr-cached-pending-accounts', JSON.stringify(previousPending));
        } catch {}
        showToast('error', 'Approval Failed', res.error || 'Could not approve account');
      } else {
        Promise.all([syncAdminHubData(), refreshData()]).catch(() => {});
      }
    } catch {
      setLocallyProcessedIds((prev) => {
        const next = new Set(prev);
        next.delete(targetUserId);
        if (emailKey) next.delete(emailKey);
        return next;
      });
      setPendingAccounts(previousPending);
      try {
        localStorage.setItem('cicr-cached-pending-accounts', JSON.stringify(previousPending));
      } catch {}
      showToast('error', 'Approval Failed', 'Network or server error during approval');
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleRejectAccount = async (targetUserId: string, targetName: string, targetEmail?: string) => {
    if (!isAdmin) {
      showToast('error', 'Admin Clearance Required', 'Only administrators can reject member accounts.');
      return;
    }
    const emailKey = targetEmail?.toLowerCase() || '';
    setLocallyProcessedIds((prev) => {
      const next = new Set(prev);
      if (targetUserId) next.add(targetUserId);
      if (emailKey) next.add(emailKey);
      return next;
    });

    // Instant Optimistic UI Update (0ms)
    const previousPending = pendingAccounts;
    const updatedPending = previousPending.filter(
      (a) => a.id !== targetUserId && (!emailKey || a.email?.toLowerCase() !== emailKey)
    );
    setPendingAccounts(updatedPending);
    try {
      localStorage.setItem('cicr-cached-pending-accounts', JSON.stringify(updatedPending));
    } catch {}

    showToast('warning', 'Request Rejected', `Account registration for ${targetName} was rejected.`);
    notifyAccountRejected(targetName, false);
    broadcastAccountStatus?.(targetUserId, targetEmail || '', targetName, 'rejected');

    setProcessingUserId(targetUserId);
    try {
      const res = await rejectUserAccount(targetUserId, targetEmail, targetName);
      if (!res.success) {
        setLocallyProcessedIds((prev) => {
          const next = new Set(prev);
          next.delete(targetUserId);
          if (emailKey) next.delete(emailKey);
          return next;
        });
        setPendingAccounts(previousPending);
        try {
          localStorage.setItem('cicr-cached-pending-accounts', JSON.stringify(previousPending));
        } catch {}
        showToast('error', 'Rejection Failed', res.error || 'Could not reject account');
      } else {
        Promise.all([syncAdminHubData(), refreshData()]).catch(() => {});
      }
    } catch {
      setLocallyProcessedIds((prev) => {
        const next = new Set(prev);
        next.delete(targetUserId);
        if (emailKey) next.delete(emailKey);
        return next;
      });
      setPendingAccounts(previousPending);
      try {
        localStorage.setItem('cicr-cached-pending-accounts', JSON.stringify(previousPending));
      } catch {}
      showToast('error', 'Rejection Failed', 'Network or server error during rejection');
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleDeleteItem = async (id: string, name: string) => {
    if (!isAdmin) {
      showToast('error', 'Admin Clearance Required', 'Only administrators can delete components.');
      return;
    }
    if (window.confirm(`Delete "${name}" from inventory?`)) {
      const res = await deleteItem(id);
      if (res.success) {
        showToast('info', 'Item Removed', `"${name}" removed from database.`);
      } else {
        showToast('error', 'Delete Failed', res.error);
      }
    }
  };

  const lowReservesCount = items.filter((i) => isLowReserveItem(i)).length;
  const activeEmail = profile?.email || user?.email;
  const validProfileName =
    profile?.full_name && !isDirtyOrPlaceholderName(profile.full_name, activeEmail)
      ? profile.full_name
      : '';
  const fallbackMetaUserName =
    (user?.user_metadata?.full_name as string) || (user?.user_metadata?.name as string) || '';
  const userIdentity = extractIdentityFromEmail(activeEmail, {
    ...(user?.user_metadata || {}),
    full_name: validProfileName || fallbackMetaUserName || profile?.full_name,
    enrollment_no: profile?.roll_number || profile?.enrollment_no || user?.user_metadata?.enrollment_no || user?.user_metadata?.roll_number,
  });
  const userName = validProfileName
    ? toCleanDisplayName(validProfileName)
    : userIdentity.fullName || 'Member';
  const enrollmentNo = profile?.roll_number || profile?.enrollment_no || userIdentity.enrollmentNo || '';
  const roleName = isAdmin ? 'ADMIN' : 'MEMBER';
  const pendingRequisitionBadges = isAdmin
    ? requests.filter((r) => r.status === 'pending' || isReturnRequested(r)).length
    : requests.filter(
        (r) =>
          (r.user_id === user?.id || r.user_email?.toLowerCase() === (user?.email || '').toLowerCase()) &&
          (r.status === 'pending' || isReturnRequested(r))
      ).length;
  const mobileNavBadgeCount = pendingRequisitionBadges + (isAdmin ? pendingAccounts.length : 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#07070a] text-slate-900 dark:text-slate-100 flex flex-col relative overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* 1. Top Header Bar (Normal sticky full width bar on mobile, floating capsule on laptop) */}
      <TopNavbar
        activeView={activeView}
        setActiveView={handleNavigateView}
        isAdmin={isAdmin}
        isLeadOrAdmin={Boolean(isAdmin)}
        cartCount={cart.reduce((s, c) => s + c.quantity, 0)}
        onOpenCart={handleOpenCart}
        notifications={notifications}
        onMarkNotificationRead={handleMarkNotificationRead}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        onClearNotifications={handleClearNotifications}
        onDismissNotification={handleDismissNotification}
        lowReservesCount={lowReservesCount}
        isMobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
        mobileBadgeCount={mobileNavBadgeCount}
      />

      {/* 2. Main Workspace Body - Compact spacing below normal bar on mobile, generous dock clearance on laptop */}
      <main className="flex-1 max-w-[1720px] w-full mx-auto px-3 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 pt-20 md:pt-32 pb-10 md:pb-40 space-y-8 animate-in fade-in duration-300">
        {/* VIEW 1: DASHBOARD */}
        {activeView === 'dashboard' && (
          <DashboardOverview
            userName={userName}
            roleName={roleName}
            enrollmentNo={enrollmentNo}
            setActiveView={handleNavigateView}
          />
        )}

        {/* VIEW 2: COMPONENT VAULT */}
        {activeView === 'inventory' && (
          <ComponentVaultView
            items={items}
            requests={requests}
            isAdmin={isAdmin}
            isLeadOrAdmin={Boolean(isAdmin)}
            currentUserEmail={user?.email}
            currentUserId={user?.id}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            onAddToCart={handleAddToCart}
            onOpenAddItem={handleOpenAddItem}
            onEditItem={handleOpenEditItem}
            onDeleteItem={handleDeleteItem}
            onSelectItem={handleSelectItem}
            cartCount={cart.reduce((s, c) => s + c.quantity, 0)}
            onOpenCart={handleOpenCart}
            loading={loading}
          />
        )}

        {/* VIEW 3: REQUISITIONS & CLEARANCE PORTAL */}
        {activeView === 'review-requests' && (
          <Suspense fallback={<div className="p-16 flex items-center justify-center"><div className="w-5 h-5 border-2 border-blue-600 dark:border-purple-500 border-t-transparent rounded-full animate-spin" /></div>}>
            <RequisitionsView
              requests={requests}
              items={items}
              allMembers={allMembers}
              isLeadOrAdmin={Boolean(isAdmin)}
              userEmail={user?.email}
              userId={user?.id}
              onNavigateToVault={() => handleNavigateView('inventory')}
              onBorrowAction={handleBorrowAction}
              onOpenIssuePass={handleOpenIssuePass}
            />
          </Suspense>
        )}

        {/* VIEW 4: MANAGEMENT HUB & AUDIT LOGS */}
        {activeView === 'logs' && isAdmin && (
          <AdminHubView
            isAdmin={isAdmin}
            currentUserId={user?.id}
            logs={logs}
            items={items}
            requests={requests}
            allMembers={allMembers}
            loadingMembers={loadingMembers}
            pendingAccounts={pendingAccounts}
            processingUserId={processingUserId}
            onPromoteRole={handlePromoteRole}
            onApproveAccount={handleApproveAccount}
            onRejectAccount={handleRejectAccount}
            onRefresh={async () => {
              await Promise.all([refreshData(), syncAdminHubData()]);
            }}
          />
        )}

        {/* VIEW 5: MEET THE DEVELOPERS TIMELINE */}
        {activeView === 'developers' && (
          <Suspense fallback={<div className="p-16 flex items-center justify-center"><div className="w-5 h-5 border-2 border-blue-600 dark:border-purple-500 border-t-transparent rounded-full animate-spin" /></div>}>
            <MeetTheDevelopers />
          </Suspense>
        )}
      </main>

      {/* 3. Mobile Slide Out Sidebar & Laptop Bottom Docked Navbar */}
      <MobileSidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        activeView={activeView}
        setActiveView={handleNavigateView}
        activeCategory={categoryFilter}
        onSelectCategory={(cat) => setCategoryFilter(cat)}
        pendingAccountsCount={pendingAccounts.length}
        lowReservesCount={lowReservesCount}
      />

      <BottomNavbar
        activeView={activeView}
        setActiveView={handleNavigateView}
        activeCategory={categoryFilter}
        onSelectCategory={(cat) => setCategoryFilter(cat)}
        pendingAccountsCount={pendingAccounts.length}
      />

      {/* 4. Modals (Suspense-wrapped on demand) */}
      <Suspense fallback={null}>
        {cartModalOpen && (
          <RequestCartModal
            isOpen={cartModalOpen}
            onClose={handleCloseCart}
            cart={cart}
            onUpdateQuantity={handleUpdateCartQuantity}
            onRemoveItem={handleRemoveFromCart}
            onClearCart={() => setCart([])}
          />
        )}

        {addItemModalOpen && isAdmin && (
          <AddEditItemModal
            isOpen={addItemModalOpen}
            onClose={handleCloseAddEditItem}
            initialItem={editingItem}
          />
        )}

        {selectedItem && (
          <ItemDetailModal
            item={selectedItem}
            isAdmin={isAdmin}
            onEdit={handleOpenEditItem}
            onClose={handleCloseItemDetail}
            onBorrow={(it) => {
              handleAddToCart(it);
              handleCloseItemDetail();
            }}
          />
        )}

        {selectedIssuePassReq && (
          <IssuePassModal
            request={selectedIssuePassReq}
            item={items.find((i) => i.id === selectedIssuePassReq?.item_id)}
            onClose={handleCloseIssuePass}
          />
        )}
      </Suspense>
    </div>
  );
};
