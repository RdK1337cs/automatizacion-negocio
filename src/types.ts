export interface Product {
  id: number;
  code: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  min_stock: number;
  active: number;
  image: string | null;
  created_at: string;
}

export type Role = 'admin' | 'operador' | 'lector';

export interface User {
  id: number;
  username: string;
  role: Role;
  active: number;
  created_at: string;
  last_login: string | null;
}

export interface OrderItem {
  id?: number;
  order_id?: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface Order {
  id: number;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  source: 'panel' | 'whatsapp' | 'api';
  status: 'pending' | 'confirmed' | 'cancelled' | 'delivered';
  total: number;
  notes: string;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface QuoteItem {
  id?: number;
  quote_id?: number;
  product_id?: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface Quote {
  id: number;
  quote_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  source: 'manual' | 'whatsapp' | 'panel';
  status: 'draft' | 'sent' | 'approved' | 'rejected' | 'expired';
  valid_days: number;
  total: number;
  notes: string;
  created_at: string;
  updated_at: string;
  items?: QuoteItem[];
}

export type OrderStatus = Order['status'];
export type QuoteStatus = Quote['status'];
