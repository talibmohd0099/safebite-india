// src/pages/admin/AdminGuard.jsx
//
// Gates every /admin/* route except the login page itself behind a real
// Supabase Auth session -- not a client-side password check, which
// would just be a string sitting in the shipped JS bundle for anyone to
// read. The one admin account is created once by hand in the Supabase
// dashboard (Authentication -> Add user); this only ever checks for an
// existing session.
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../../services/supabaseClient';

export default function AdminGuard({ children }) {
  const [status, setStatus] = useState('checking'); // 'checking' | 'in' | 'out'

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setStatus('out');
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? 'in' : 'out');
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? 'in' : 'out');
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  if (status === 'checking') return null;
  if (status === 'out') return <Navigate to="/admin" replace />;
  return children;
}
