-- Add paid_leave to attendance_type enum
ALTER TYPE public.attendance_type ADD VALUE IF NOT EXISTS 'paid_leave';
