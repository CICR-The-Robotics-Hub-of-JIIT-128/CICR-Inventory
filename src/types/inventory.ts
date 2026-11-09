export type UserRole = 'member' | 'lead' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  username?: string;
  enrollment_no?: string;
  roll_number?: string;
  role: UserRole;
  phone?: string;
  avatar_url?: string;
  status?: 'pending' | 'approved' | 'rejected';
  created_at?: string;
  last_sign_in?: string;
}

export type ItemCategory =
  | 'Microcontrollers & SBCs'
  | 'Controllers'
  | 'Sensors & Modules'
  | 'Sensors'
  | 'Motors & Drivers'
  | 'Actuators'
  | 'Power & Batteries'
  | 'Power'
  | 'Tools & Fabrication'
  | 'Tools'
  | 'Electronic Components'
  | 'Mechanical & Chassis'
  | 'Other';

export type ItemStatus = 'In Stock' | 'Low Stock' | 'Out of Stock' | 'Maintenance';

export interface InventoryItem {
  id: string;
  name: string;
  sku?: string;
  category: ItemCategory;
  description: string;
  location?: string;
  total_qty: number;
  available_qty: number;
  min_threshold: number;
  condition?: string;
  status: ItemStatus;
  image_url?: string;
  datasheet_url?: string;
  created_at?: string;
  updated_at?: string;
}

export type BorrowStatus = 'pending' | 'approved' | 'rejected' | 'returned' | 'overdue';

export function isReturnRequested(req: { status: string; admin_notes?: string | null }): boolean {
  return req.status === 'approved' && Boolean(req.admin_notes && req.admin_notes.includes('[RETURN_REQUESTED]'));
}

export interface BorrowRequest {
  id: string;
  item_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  item_name: string;
  quantity: number;
  project_name: string;
  purpose: string;
  status: BorrowStatus;
  borrow_date?: string;
  expected_return_date: string;
  actual_return_date?: string;
  approved_by?: string;
  admin_notes?: string;
  created_at: string;
  updated_at?: string;
}

export type ActivityAction =
  | 'CREATE_ITEM'
  | 'UPDATE_ITEM'
  | 'DELETE_ITEM'
  | 'BORROW_REQUEST'
  | 'BORROW_APPROVED'
  | 'BORROW_REJECTED'
  | 'RETURN_REQUEST'
  | 'RETURN_DECLINED'
  | 'ITEM_RETURNED'
  | 'ACCOUNT_REQUEST'
  | 'ACCOUNT_APPROVED'
  | 'ACCOUNT_REJECTED'
  | 'ROLE_UPDATED'
  | 'PROFILE_UPDATED'
  | 'USER_SIGNIN'
  | 'USER_SIGNOUT'
  | 'LOGIN'
  | string;

export interface ActivityLog {
  id: string;
  user_id?: string;
  user_name: string;
  action: ActivityAction;
  details: string;
  item_id?: string;
  created_at: string;
}
