"use client";

import { useState, useEffect } from "react";
import { useUser } from "../../contexts/user-context";

interface User {
  id: string;
  user_id: string;
  email: string;
  email_confirmed: boolean;
  signup_method: 'email' | 'apple';
  user_type: 'free' | 'subscriber' | 'admin' | 'staff';
  signup_status: 'pending' | 'complete';
  display_name: string | null;
  avatar_url: string | null;
  preferred_calendar_type: 'new' | 'old';
  created_at: string;
  updated_at: string;
  auth_created_at: string | null;
  hasActivePaidSubscription?: boolean;
  subscriptionProvider?: string | null;
  subscriptionExpiresAt?: string | null;
}

type FilterType = 'all' | 'paid' | 'free' | 'admin' | 'staff';

export default function UsersDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showGrantSubscriptionModal, setShowGrantSubscriptionModal] = useState(false);
  const [showDeleteUserModal, setShowDeleteUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  
  // Add user form state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserType, setNewUserType] = useState<'free' | 'subscriber' | 'admin' | 'staff'>('free');
  const [addingUser, setAddingUser] = useState(false);
  
  // Grant subscription form state
  const [subscriptionUnit, setSubscriptionUnit] = useState<'days' | 'minutes'>('days');
  const [subscriptionValue, setSubscriptionValue] = useState(10);
  const [grantingSubscription, setGrantingSubscription] = useState(false);
  
  // Set role state
  const [updatingRole, setUpdatingRole] = useState(false);
  
  // Sync subscription state
  const [syncingSubscription, setSyncingSubscription] = useState<string | null>(null);
  
  // Get current user for preventing self-deletion
  const { user: currentUser } = useUser();

  // Fetch users
  const fetchUsers = async (filter: FilterType) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users?filter=${filter}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch users' }));
        throw new Error(errorData.error || 'Failed to fetch users');
      }

      const data = await response.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(activeFilter);
  }, [activeFilter]);

  // Handle add user
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingUser(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          userType: newUserType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create user' }));
        throw new Error(errorData.error || 'Failed to create user');
      }

      // Reset form and close modal
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserType('free');
      setShowAddUserModal(false);
      
      // Refresh users list
      await fetchUsers(activeFilter);
    } catch (err) {
      console.error('Error creating user:', err);
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setAddingUser(false);
    }
  };

  // Handle grant subscription
  const handleGrantSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setGrantingSubscription(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${selectedUser.user_id}/grant-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          [subscriptionUnit]: subscriptionValue,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to grant subscription' }));
        throw new Error(errorData.error || 'Failed to grant subscription');
      }

      // Close modal and refresh users list
      setShowGrantSubscriptionModal(false);
      setSelectedUser(null);
      setSubscriptionValue(10);
      setSubscriptionUnit('days');
      await fetchUsers(activeFilter);
    } catch (err) {
      console.error('Error granting subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to grant subscription');
    } finally {
      setGrantingSubscription(false);
    }
  };

  // Handle delete user
  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    setDeletingUser(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${selectedUser.user_id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to delete user' }));
        throw new Error(errorData.error || 'Failed to delete user');
      }

      // Close modal and refresh users list
      setShowDeleteUserModal(false);
      setSelectedUser(null);
      await fetchUsers(activeFilter);
    } catch (err) {
      console.error('Error deleting user:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeletingUser(false);
    }
  };

  // Handle set/remove staff role
  const handleToggleStaffRole = async (user: User) => {
    setUpdatingRole(true);
    setError(null);

    try {
      const newRole = user.user_type === 'staff' ? 'free' : 'staff';
      const response = await fetch(`/api/admin/users/${user.user_id}/set-role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ user_type: newRole }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to update user role' }));
        throw new Error(errorData.error || 'Failed to update user role');
      }

      // Refresh users list
      await fetchUsers(activeFilter);
    } catch (err) {
      console.error('Error updating user role:', err);
      setError(err instanceof Error ? err.message : 'Failed to update user role');
    } finally {
      setUpdatingRole(false);
    }
  };

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Handle sync subscription
  const handleSyncSubscription = async (user: User) => {
    setSyncingSubscription(user.user_id);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${user.user_id}/sync-subscription`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to sync subscription' }));
        throw new Error(errorData.error || 'Failed to sync subscription');
      }

      const data = await response.json();
      
      // Show success message
      if (data.success) {
        // Refresh users list
        await fetchUsers(activeFilter);
        // You could add a toast notification here if you have one
        console.log('Subscription synced successfully:', data.message);
      }
    } catch (err) {
      console.error('Error syncing subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to sync subscription');
    } finally {
      setSyncingSubscription(null);
    }
  };

  // Check if subscription is active
  // Uses hasActivePaidSubscription from API (which reads from subscriptions table)
  const isSubscriptionActive = (user: User) => {
    // Use hasActivePaidSubscription from API (from unified subscriptions table)
    return user.hasActivePaidSubscription === true;
  };

  const filters: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'paid', label: 'Paid' },
    { id: 'free', label: 'Free' },
    { id: 'admin', label: 'Admin' },
    { id: 'staff', label: 'Staff' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <button
          onClick={() => setShowAddUserModal(true)}
          className="bg-[#c50000] hover:bg-[#a00000] text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + Add User
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-2 mb-6 border-b border-gray-800">
        {filters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => setActiveFilter(filter.id)}
            className={`px-4 py-2 font-medium transition-colors border-b-2 ${
              activeFilter === filter.id
                ? 'border-white text-white'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-900/20 border border-red-600/50 rounded-lg p-4 mb-6">
          <p className="text-red-200">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      )}

      {/* Users Table */}
      {!loading && !error && (
        <div className="bg-[#1a1a1a] rounded-lg border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#0a0a0a] border-b border-gray-800">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-400">Email</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-400">Signup Method</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-400">Type</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-400">Status</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-400">Subscription</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-400">Created</th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-[#242424] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="relative group">
                            <p className="text-white font-medium cursor-help hover:text-gray-300 transition-colors">{user.email}</p>
                            {/* Tooltip */}
                            <div className="absolute left-0 top-full mt-2 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                              <div className="bg-[#0a0a0a] border border-gray-700 rounded-lg p-3 shadow-xl min-w-[300px] pointer-events-auto">
                                <div className="text-xs text-gray-400 mb-1">User ID (click to copy)</div>
                                <div 
                                  className="text-white font-mono text-sm break-all cursor-pointer hover:text-blue-400 transition-colors select-all"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    
                                    const target = e.currentTarget;
                                    const originalText = target.textContent;
                                    
                                    try {
                                      // Try modern Clipboard API first
                                      if (navigator.clipboard && navigator.clipboard.writeText) {
                                        await navigator.clipboard.writeText(user.user_id);
                                      } else {
                                        // Fallback: use execCommand for older browsers
                                        const textArea = document.createElement('textarea');
                                        textArea.value = user.user_id;
                                        textArea.style.position = 'fixed';
                                        textArea.style.left = '-999999px';
                                        textArea.style.top = '-999999px';
                                        document.body.appendChild(textArea);
                                        textArea.focus();
                                        textArea.select();
                                        
                                        try {
                                          document.execCommand('copy');
                                        } finally {
                                          document.body.removeChild(textArea);
                                        }
                                      }
                                      
                                      // Show feedback
                                      target.textContent = 'Copied!';
                                      target.classList.add('text-green-400');
                                      setTimeout(() => {
                                        target.textContent = originalText;
                                        target.classList.remove('text-green-400');
                                      }, 1000);
                                    } catch (err) {
                                      console.error('Failed to copy:', err);
                                      // Show error feedback
                                      target.textContent = 'Copy failed';
                                      target.classList.add('text-red-400');
                                      setTimeout(() => {
                                        target.textContent = originalText;
                                        target.classList.remove('text-red-400');
                                      }, 1000);
                                    }
                                  }}
                                >
                                  {user.user_id}
                                </div>
                              </div>
                              {/* Arrow */}
                              <div className="absolute -top-1 left-4 w-2 h-2 bg-[#0a0a0a] border-l border-t border-gray-700 transform rotate-45 pointer-events-none"></div>
                            </div>
                          </div>
                          {user.display_name && user.display_name !== user.email.split('@')[0] && (
                            <p className="text-gray-400 text-sm">{user.display_name}</p>
                          )}
                          {!user.email_confirmed && (
                            <span className="text-xs bg-yellow-900/30 text-yellow-400 px-2 py-1 rounded">
                              Unverified
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                            user.signup_method === 'apple'
                              ? 'bg-gray-800 text-gray-300'
                              : 'bg-blue-900/30 text-blue-400'
                          }`}
                        >
                          {user.signup_method === 'apple' ? (
                            <>
                              <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.08-.4C4.79 15.25 3.8 8.24 4.83 5.74c.7-1.94 2.03-3.03 3.89-3.03 1.08 0 2.06.37 2.78.37.63 0 1.54-.35 2.6-.35 1.64 0 2.87 1.02 3.57 2.64-3.12 1.76-2.64 6.62.58 8.1-.5 1.3-.78 2.66-.78 4.05 0 1.75.55 3.47 1.5 4.76zm-1.1-15.4c.58-.68.98-1.64.88-2.58-.85.04-1.88.57-2.49 1.28-.55.63-.99 1.57-.88 2.5.95.07 1.92-.48 2.49-1.2z"/>
                              </svg>
                              Apple
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              Email
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                            user.user_type === 'admin'
                              ? 'bg-purple-900/30 text-purple-400'
                              : user.user_type === 'staff'
                              ? 'bg-orange-900/30 text-orange-400'
                              : user.user_type === 'subscriber'
                              ? 'bg-green-900/30 text-green-400'
                              : 'bg-blue-900/30 text-blue-400'
                          }`}
                        >
                          {user.user_type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                            user.signup_status === 'complete'
                              ? 'bg-green-900/30 text-green-400'
                              : 'bg-yellow-900/30 text-yellow-400'
                          }`}
                        >
                          {user.signup_status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {user.hasActivePaidSubscription ? (
                          <div className="text-sm text-green-600">
                            <p className="font-medium">
                              Active ({user.subscriptionProvider || 'unknown'})
                            </p>
                            {user.subscriptionExpiresAt && (
                              <p className="text-xs text-gray-400 mt-1">
                                Expires: {formatDate(user.subscriptionExpiresAt)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">No active subscription</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-sm">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end space-x-2">
                          {user.user_type !== 'admin' && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedUser(user);
                                  setShowGrantSubscriptionModal(true);
                                }}
                                disabled={user.hasActivePaidSubscription}
                                className={`text-sm font-medium ${
                                  user.hasActivePaidSubscription
                                    ? 'text-gray-500 cursor-not-allowed opacity-50'
                                    : 'text-blue-400 hover:text-blue-300'
                                }`}
                                title={user.hasActivePaidSubscription ? 'Cannot grant manual days to users with active paid subscriptions (Stripe or Apple/RevenueCat)' : 'Grant free subscription days'}
                              >
                                Grant Days
                              </button>
                              <span className="text-gray-600">|</span>
                            </>
                          )}
                          {user.user_type !== 'admin' && (
                            <>
                              <button
                                onClick={() => handleToggleStaffRole(user)}
                                disabled={updatingRole || currentUser?.id === user.user_id}
                                className={`text-sm font-medium ${
                                  user.user_type === 'staff'
                                    ? 'text-orange-400 hover:text-orange-300'
                                    : 'text-gray-400 hover:text-gray-300'
                                }`}
                                title={currentUser?.id === user.user_id ? 'Cannot change your own role' : user.user_type === 'staff' ? 'Remove staff role' : 'Grant staff role'}
                              >
                                {user.user_type === 'staff' ? 'Remove Staff' : 'Make Staff'}
                              </button>
                              <span className="text-gray-600">|</span>
                            </>
                          )}
                          {user.user_type !== 'admin' && (
                            <>
                              <button
                                onClick={() => handleSyncSubscription(user)}
                                disabled={syncingSubscription === user.user_id}
                                className={`text-sm font-medium ${
                                  syncingSubscription === user.user_id
                                    ? 'text-gray-500 cursor-not-allowed'
                                    : 'text-green-400 hover:text-green-300'
                                }`}
                                title="Sync subscription status from Stripe"
                              >
                                {syncingSubscription === user.user_id ? 'Syncing...' : 'Sync Subscription'}
                              </button>
                              <span className="text-gray-600">|</span>
                            </>
                          )}
                          {user.user_type !== 'admin' && (
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setShowDeleteUserModal(true);
                              }}
                              className="text-red-400 hover:text-red-300 text-sm font-medium"
                              disabled={currentUser?.id === user.user_id}
                              title={currentUser?.id === user.user_id ? 'Cannot delete your own account' : 'Delete user'}
                            >
                              Delete
                            </button>
                          )}
                          {user.user_type === 'admin' && (
                            <span className="text-gray-500 text-sm">Protected</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-[#1a1a1a] rounded-lg border border-gray-800 p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add New User</h2>
            <form onSubmit={handleAddUser}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    required
                    className="w-full bg-[#0a0a0a] border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#c50000]"
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full bg-[#0a0a0a] border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#c50000]"
                    placeholder="Minimum 6 characters"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    User Type
                  </label>
                  <select
                    value={newUserType}
                    onChange={(e) => setNewUserType(e.target.value as 'free' | 'subscriber' | 'admin' | 'staff')}
                    className="w-full bg-[#0a0a0a] border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#c50000]"
                  >
                    <option value="free">Free</option>
                    <option value="subscriber">Subscriber</option>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddUserModal(false);
                    setNewUserEmail('');
                    setNewUserPassword('');
                    setNewUserType('free');
                    setError(null);
                  }}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingUser}
                  className="flex-1 bg-[#c50000] hover:bg-[#a00000] text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingUser ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grant Subscription Modal */}
      {showGrantSubscriptionModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-[#1a1a1a] rounded-lg border border-gray-800 p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Grant Free Subscription</h2>
            {selectedUser.hasActivePaidSubscription ? (
              <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-4 mb-4">
                <p className="text-yellow-200 text-sm">
                  <strong>Cannot grant manual days:</strong> This user has an active paid subscription (Stripe or Apple/RevenueCat). 
                  Manual subscription days cannot be added while a paid subscription is active.
                </p>
              </div>
            ) : (
              <p className="text-gray-400 text-sm mb-4">
                Grant free premium subscription days to <strong className="text-white">{selectedUser.email}</strong>
              </p>
            )}
            <form onSubmit={handleGrantSubscription}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Unit
                  </label>
                  <select
                    value={subscriptionUnit}
                    onChange={(e) => {
                      setSubscriptionUnit(e.target.value as 'days' | 'minutes');
                      // Reset value when switching units
                      setSubscriptionValue(e.target.value === 'minutes' ? 5 : 10);
                    }}
                    className="w-full bg-[#0a0a0a] border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#c50000] mb-4"
                  >
                    <option value="days">Days</option>
                    <option value="minutes">Minutes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Number of {subscriptionUnit === 'days' ? 'Days' : 'Minutes'}
                  </label>
                  <input
                    type="number"
                    value={subscriptionValue}
                    onChange={(e) => setSubscriptionValue(parseInt(e.target.value) || 0)}
                    required
                    min="1"
                    className="w-full bg-[#0a0a0a] border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#c50000]"
                  />
                  <p className="text-gray-500 text-xs mt-1">
                    Current subscription expires: {selectedUser.subscriptionExpiresAt ? formatDate(selectedUser.subscriptionExpiresAt) : 'N/A'}
                  </p>
                </div>
              </div>
              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowGrantSubscriptionModal(false);
                    setSelectedUser(null);
                    setSubscriptionValue(10);
                    setSubscriptionUnit('days');
                    setError(null);
                  }}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={grantingSubscription || selectedUser.hasActivePaidSubscription}
                  className="flex-1 bg-[#c50000] hover:bg-[#a00000] text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {grantingSubscription ? 'Granting...' : 'Grant Subscription'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {showDeleteUserModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-[#1a1a1a] rounded-lg border border-gray-800 p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-red-400">Delete User</h2>
            <p className="text-gray-400 text-sm mb-4">
              Are you sure you want to delete <strong className="text-white">{selectedUser.email}</strong>?
            </p>
            <div className="bg-red-900/20 border border-red-600/50 rounded-lg p-4 mb-4">
              <p className="text-red-200 text-sm">
                <strong>Warning:</strong> This action cannot be undone. All user data, including:
              </p>
              <ul className="text-red-300 text-sm mt-2 list-disc list-inside space-y-1">
                <li>User profile and settings</li>
                <li>Playback progress</li>
                <li>Comments</li>
                <li>Subscription information</li>
              </ul>
              <p className="text-red-200 text-sm mt-2">will be permanently deleted.</p>
            </div>
            {error && (
              <div className="bg-red-900/20 border border-red-600/50 rounded-lg p-3 mb-4">
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            )}
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteUserModal(false);
                  setSelectedUser(null);
                  setError(null);
                }}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deletingUser}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingUser ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
