/**
 * CICR Robotics Vault & Inventory - Native Device Push Notification Service
 * Pushes system notifications outside the browser to native OS / device notification panels
 * (Windows Action Center, macOS Notification Center, Android Notification Drawer, iOS Web Push).
 */

const LOGO_ICON = '/cicr-logo.jpg';
let swRegistration: ServiceWorkerRegistration | null = null;
let lastNotifRef: { title: string; body?: string; time: number } | null = null;

/**
 * Register Service Worker for reliable native mobile & desktop notifications
 */
export const initDeviceNotifications = async (): Promise<void> => {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      swRegistration = reg;
    } catch (err) {
      console.warn('ServiceWorker registration note:', err);
    }
  }
};

/**
 * Check if the browser & device supports native push notifications
 */
export const isDeviceNotificationSupported = (): boolean => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

/**
 * Get current device notification permission
 */
export const getDeviceNotificationPermission = (): NotificationPermission | 'unsupported' => {
  if (!isDeviceNotificationSupported()) return 'unsupported';
  return Notification.permission;
};

/**
 * Request notification permission from user / device OS
 */
export const requestDeviceNotificationPermission = async (): Promise<boolean> => {
  if (!isDeviceNotificationSupported()) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      try {
        localStorage.setItem('cicr-device-notifications-enabled', 'true');
      } catch {}

      // Fire a welcome test notification to verify the device's notification panel
      await sendDeviceNotification('🔔 Push Notifications Enabled', {
        body: 'You will now receive native alerts on your device for sign-ins, requests, approvals, and clearances.',
        tag: 'cicr-notifications-enabled',
      });
      return true;
    }
  } catch (err) {
    console.warn('Permission request error:', err);
  }
  return false;
};

export interface DeviceNotificationOptions {
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  silent?: boolean;
  vibrate?: number[];
  data?: any;
}

/**
 * Send a notification to the device's native notification panel
 */
export const sendDeviceNotification = async (
  title: string,
  options: DeviceNotificationOptions = {}
): Promise<boolean> => {
  if (!isDeviceNotificationSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  // Deduplicate identical notifications fired within 1.5 seconds
  const now = Date.now();
  if (
    lastNotifRef &&
    lastNotifRef.title === title &&
    lastNotifRef.body === options.body &&
    now - lastNotifRef.time < 1500
  ) {
    return false;
  }
  lastNotifRef = { title, body: options.body, time: now };

  const finalOptions: NotificationOptions = {
    icon: options.icon || LOGO_ICON,
    badge: options.badge || LOGO_ICON,
    body: options.body || '',
    tag: options.tag || `cicr-${now}`,
    silent: options.silent ?? false,
    ...options,
  };

  try {
    // 1. Try Service Worker showNotification (standard for mobile devices / Android notification drawer)
    if ('serviceWorker' in navigator) {
      if (!swRegistration) {
        try {
          swRegistration = await navigator.serviceWorker.ready;
        } catch {}
      }
      if (swRegistration && typeof swRegistration.showNotification === 'function') {
        await swRegistration.showNotification(title, finalOptions);
        return true;
      }
    }

    // 2. Fallback to standard window.Notification constructor (desktop browsers / Windows / macOS)
    const notification = new Notification(title, finalOptions);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    return true;
  } catch (err) {
    console.warn('Could not post device notification:', err);
    return false;
  }
};

/* =========================================================================
 * Specialized Event Helpers for User Flows (Signin, Signup, Req Status, etc.)
 * ========================================================================= */

/**
 * Triggered when a member or admin signs in
 */
export const notifySignIn = async (name: string): Promise<void> => {
  await sendDeviceNotification('CICR Vault: Signed In Successfully', {
    body: `Welcome back, ${name}! Your laboratory session is now active.`,
    tag: 'auth-signin',
  });
};

/**
 * Triggered when a new user submits registration
 */
export const notifySignUp = async (name: string): Promise<void> => {
  await sendDeviceNotification('CICR Portal: Registration Submitted', {
    body: `Welcome ${name}! Your account request has been routed to the Admin Portal for authorization.`,
    tag: 'auth-signup',
  });
};

/**
 * Triggered when account registration is approved
 */
export const notifyAccountApproved = async (name: string, isSelf = false): Promise<void> => {
  if (isSelf) {
    await sendDeviceNotification('🎉 Account Approved!', {
      body: 'Welcome to CICR! Your portal account has been authorized. You can now access the Vault.',
      tag: 'account-status-approved',
    });
  } else {
    await sendDeviceNotification('Account Approved', {
      body: `Registration for ${name} was approved and clearance granted.`,
      tag: `admin-approved-${name}`,
    });
  }
};

/**
 * Triggered when account registration is rejected
 */
export const notifyAccountRejected = async (name: string, isSelf = false): Promise<void> => {
  if (isSelf) {
    await sendDeviceNotification('Account Registration Update', {
      body: 'Your registration request was reviewed and declined by the administrator.',
      tag: 'account-status-rejected',
    });
  } else {
    await sendDeviceNotification('Account Request Rejected', {
      body: `Registration request for ${name} has been rejected.`,
      tag: `admin-rejected-${name}`,
    });
  }
};

/**
 * Triggered when hardware requisition is submitted
 */
export const notifyRequisitionSubmitted = async (count: number, projectName?: string): Promise<void> => {
  await sendDeviceNotification('Hardware Requisition Submitted', {
    body: `Requisition for ${count} item(s) ${projectName ? `for "${projectName}" ` : ''}has been staged for administrator clearance.`,
    tag: 'req-submitted',
  });
};

/**
 * Triggered when hardware requisition is approved
 */
export const notifyRequisitionApproved = async (itemName: string, quantity: number): Promise<void> => {
  await sendDeviceNotification('🎉 Requisition Approved!', {
    body: `Your requisition for ${quantity}x ${itemName} has been cleared! Collect your hardware pass.`,
    tag: `req-approved-${itemName}`,
  });
};

/**
 * Triggered when hardware requisition is declined
 */
export const notifyRequisitionRejected = async (itemName: string, note?: string): Promise<void> => {
  await sendDeviceNotification('❌ Requisition Declined', {
    body: `Your requisition for ${itemName} was declined.${note ? ` Note: ${note}` : ''}`,
    tag: `req-rejected-${itemName}`,
  });
};

/**
 * Triggered when return clearance is submitted or approved
 */
export const notifyReturnRequested = async (itemName: string, userName?: string): Promise<void> => {
  await sendDeviceNotification('🔄 Return Clearance Requested', {
    body: `${userName ? `${userName} ` : 'A member '}has submitted ${itemName} for return inspection.`,
    tag: `return-requested-${itemName}`,
  });
};

export const notifyReturnCleared = async (itemName: string): Promise<void> => {
  await sendDeviceNotification('📦 Hardware Return Cleared', {
    body: `Your return for ${itemName} has been verified and restocked into vault inventory.`,
    tag: `return-cleared-${itemName}`,
  });
};
