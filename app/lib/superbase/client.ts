import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Missing Supabase environment variables - using demo mode');
  console.warn('For full functionality, create a .env file with:');
  console.warn('  VITE_SUPABASE_URL=your_supabase_url');
  console.warn('  VITE_SUPABASE_ANON_KEY=your_supabase_anon_key');
}

// Define database types
export interface Database {
  public: {
    Tables: {
      trading_platforms: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
      };
      user_api_keys: {
        Row: {
          id: string;
          user_id: string;
          platform_id: string;
          api_key: string;
          api_secret: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          platform_id: string;
          api_key: string;
          api_secret: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          platform_id?: string;
          api_key?: string;
          api_secret?: string;
          created_at?: string;
        };
      };
      trading_scripts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description?: string;
          file_path: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string;
          file_path: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string;
          file_path?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}

// Create typed client with fallback values to prevent crashes
export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      redirectTo: typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback`
        : undefined
    }
  }
);