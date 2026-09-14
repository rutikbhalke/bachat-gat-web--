import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Loader from './Loader';

const ProtectedRoute = ({ allowedRoles = ['ADMIN'] }) => {
  const { firebaseUser, user, token, loading, role, isAuthenticated, isAdmin } = useAuth();

  // 1. Block rendering and redirection while session is loading
  if (loading) {
    return <Loader fullScreen text="Loading admin session..." />;
  }

  // 2. Redirect to login if unauthenticated
  if (!isAuthenticated && !firebaseUser && !user) {
    return <Navigate to="/login" replace />;
  }

  // 3. Enforce admin role restrictions for the Admin Panel
  const userRole = (role || user?.role || 'member').toLowerCase();
  const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase());

  if (!normalizedAllowed.includes(userRole) && !isAdmin) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
