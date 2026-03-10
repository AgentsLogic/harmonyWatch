"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

interface BugReport {
  id: string;
  user_id: string;
  report_text: string;
  image_url: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  user_email: string | null;
  user_display_name: string | null;
}

export default function BugReportsDashboard() {
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadBugReports();
  }, [statusFilter]);

  const loadBugReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      params.append('limit', '100');
      params.append('offset', '0');

      const response = await fetch(`/api/admin/bug-reports?${params.toString()}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to load bug reports' }));
        throw new Error(errorData.error || 'Failed to load bug reports');
      }

      const data = await response.json();
      setBugReports(data.bug_reports || []);
    } catch (err) {
      console.error('Error loading bug reports:', err);
      setError(err instanceof Error ? err.message : 'Failed to load bug reports');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    setUpdatingStatus(id);
    try {
      const response = await fetch('/api/admin/bug-reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, status: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to update status' }));
        throw new Error(errorData.error || 'Failed to update status');
      }

      // Reload bug reports
      await loadBugReports();
    } catch (err) {
      console.error('Error updating status:', err);
      alert(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this bug report?')) {
      return;
    }

    setDeletingId(id);
    try {
      const response = await fetch(`/api/admin/bug-reports?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to delete bug report' }));
        throw new Error(errorData.error || 'Failed to delete bug report');
      }

      // Reload bug reports
      await loadBugReports();
      if (selectedReport?.id === id) {
        setSelectedReport(null);
      }
    } catch (err) {
      console.error('Error deleting bug report:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete bug report');
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'in_progress':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case 'resolved':
        return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'closed':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Bug Reports</h1>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Bug Reports</h1>
        <div className="bg-red-900/20 border border-red-600/50 rounded-lg p-4">
          <p className="text-red-200">Error: {error}</p>
          <button
            onClick={loadBugReports}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Bug Reports</h1>
        <button
          onClick={loadBugReports}
          className="px-4 py-2 bg-[#2a2a2a] text-white rounded-lg hover:bg-[#333333] transition-colors text-sm"
        >
          Refresh
        </button>
      </div>

      {/* Status Filter */}
      <div className="mb-6 flex gap-2">
        {['all', 'open', 'in_progress', 'resolved', 'closed'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === status
                ? 'bg-white text-black'
                : 'bg-[#2a2a2a] text-gray-400 hover:text-white'
            }`}
          >
            {status === 'all' ? 'All' : status.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Bug Reports List */}
      {bugReports.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">No bug reports found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bugReports.map((report) => (
            <div
              key={report.id}
              className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800 hover:border-gray-700 transition-colors cursor-pointer"
              onClick={() => setSelectedReport(report)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(report.status)}`}>
                      {report.status.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </span>
                    <span className="text-gray-400 text-sm">
                      {formatDate(report.created_at)}
                    </span>
                  </div>
                  <p className="text-white font-medium mb-1">
                    {report.user_display_name || report.user_email || 'Unknown User'}
                  </p>
                  <p className="text-gray-400 text-sm line-clamp-2">
                    {report.report_text}
                  </p>
                  {report.image_url && (
                    <div className="mt-2 text-xs text-gray-500">
                      📷 Image attached
                    </div>
                  )}
                </div>
                <div className="flex gap-2 ml-4">
                  <select
                    value={report.status}
                    onChange={(e) => handleStatusChange(report.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    disabled={updatingStatus === report.id}
                    className="px-3 py-1 bg-[#2a2a2a] text-white rounded text-sm border border-gray-700 hover:border-gray-600 disabled:opacity-50"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(report.id);
                    }}
                    disabled={deletingId === report.id}
                    className="px-3 py-1 bg-red-600/20 text-red-400 rounded text-sm border border-red-600/50 hover:bg-red-600/30 disabled:opacity-50"
                  >
                    {deletingId === report.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedReport && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedReport(null)}
        >
          <div
            className="bg-[#1a1a1a] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Bug Report Details</h2>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                {/* User Info */}
                <div>
                  <label className="text-gray-400 text-sm font-medium">User</label>
                  <p className="text-white">
                    {selectedReport.user_display_name || 'No display name'}
                  </p>
                  <p className="text-gray-400 text-sm">
                    {selectedReport.user_email || 'No email'}
                  </p>
                </div>

                {/* Status */}
                <div>
                  <label className="text-gray-400 text-sm font-medium">Status</label>
                  <select
                    value={selectedReport.status}
                    onChange={(e) => handleStatusChange(selectedReport.id, e.target.value)}
                    disabled={updatingStatus === selectedReport.id}
                    className="mt-1 px-3 py-2 bg-[#2a2a2a] text-white rounded border border-gray-700 hover:border-gray-600 disabled:opacity-50"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-400 text-sm font-medium">Submitted</label>
                    <p className="text-white text-sm">{formatDate(selectedReport.created_at)}</p>
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm font-medium">Last Updated</label>
                    <p className="text-white text-sm">{formatDate(selectedReport.updated_at)}</p>
                  </div>
                </div>

                {/* Report Text */}
                <div>
                  <label className="text-gray-400 text-sm font-medium">Description</label>
                  <p className="text-white mt-1 whitespace-pre-wrap">{selectedReport.report_text}</p>
                </div>

                {/* Image */}
                {selectedReport.image_url && (
                  <div>
                    <label className="text-gray-400 text-sm font-medium">Screenshot</label>
                    <div className="mt-2 relative w-full h-64 bg-black rounded-lg overflow-hidden">
                      <Image
                        src={selectedReport.image_url}
                        alt="Bug report screenshot"
                        fill
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                    <a
                      href={selectedReport.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-blue-400 hover:text-blue-300 text-sm"
                    >
                      Open full size
                    </a>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t border-gray-800">
                  <button
                    onClick={() => handleDelete(selectedReport.id)}
                    disabled={deletingId === selectedReport.id}
                    className="px-4 py-2 bg-red-600/20 text-red-400 rounded-lg border border-red-600/50 hover:bg-red-600/30 disabled:opacity-50 transition-colors"
                  >
                    {deletingId === selectedReport.id ? 'Deleting...' : 'Delete Report'}
                  </button>
                  <button
                    onClick={() => setSelectedReport(null)}
                    className="px-4 py-2 bg-[#2a2a2a] text-white rounded-lg hover:bg-[#333333] transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
