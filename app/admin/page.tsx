"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../contexts/user-context";
import Sidebar from "../components/admin/sidebar";
import ContentDashboard from "../components/admin/content-dashboard";
import ContentList from "../components/admin/content-list";
import CarouselDashboard from "../components/admin/carousel-dashboard";
import LandingDashboard from "../components/admin/landing-dashboard";
import DailyContentCalendar from "../components/admin/daily-content-calendar";
import UsersDashboard from "../components/admin/users-dashboard";
import BugReportsDashboard from "../components/admin/bug-reports-dashboard";
import { useCategories } from "@/lib/hooks/useCategories";
import { seriesService } from "@/lib/database";
import type { Series } from "@/lib/database.types";
import { HarmonySpinner } from "../components/harmony-spinner";

interface Statistics {
  totalUsers: number;
  subscribedUsers: number;
  freeUsers: number;
  estimatedMRR: number;
  monthlySubscriptions: number;
  yearlySubscriptions: number;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();
  
  // Load last active section from localStorage, default to "content-list"
  const [activeSection, setActiveSection] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('admin-active-section');
      return saved || "content-list";
    }
    return "content-list";
  });
  
  // Save active section to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && activeSection) {
      localStorage.setItem('admin-active-section', activeSection);
    }
  }, [activeSection]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [statisticsLoading, setStatisticsLoading] = useState(true);
  const [statisticsError, setStatisticsError] = useState<string | null>(null);
  const [dailyContentSeries, setDailyContentSeries] = useState<Series[]>([]);
  const [dailyContentLoading, setDailyContentLoading] = useState(false);
  const [selectedDailySeries, setSelectedDailySeries] = useState<Series | null>(null);
  const [contentToEdit, setContentToEdit] = useState<string | null>(null);
  
  // All hooks must be called before any conditional returns
  const { 
    categories, 
    loading, 
    error,
    refresh: refreshCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    addContentToCategory,
    removeContentFromCategory,
    reorderContentInCategory
  } = useCategories();
  
  // Redirect non-admins/staff away from admin page
  useEffect(() => {
    if (!userLoading) {
      if (!user) {
        // Not logged in - redirect to landing
        router.push('/landing');
      } else if (user.user_type !== 'admin' && user.user_type !== 'staff') {
        // Not an admin or staff - redirect to home
        router.push('/');
      }
    }
  }, [user, userLoading, router]);

  // Fetch statistics when overview section is active (admin only)
  useEffect(() => {
    if (activeSection === 'overview' && user && user.user_type === 'admin') {
      const fetchStatistics = async () => {
        setStatisticsLoading(true);
        setStatisticsError(null);
        try {
          const response = await fetch('/api/admin/statistics', {
            credentials: 'include',
          });

          if (response.ok) {
            const data = await response.json();
            setStatistics(data.statistics);
          } else {
            const errorData = await response.json().catch(() => ({ error: 'Failed to fetch statistics' }));
            setStatisticsError(errorData.error || 'Failed to fetch statistics');
          }
        } catch (error) {
          console.error('Error fetching statistics:', error);
          setStatisticsError('Failed to fetch statistics');
        } finally {
          setStatisticsLoading(false);
        }
      };

      fetchStatistics();
    }
  }, [activeSection, user]);

  // Redirect staff users to content-list if they try to access restricted sections
  useEffect(() => {
    if (user && user.user_type === 'staff') {
      const restrictedSections = ['overview', 'users', 'carousel', 'content', 'landing', 'daily-content'];
      if (restrictedSections.includes(activeSection)) {
        setActiveSection('content-list');
      }
    }
  }, [user, activeSection]);

  // Fetch daily content series when daily-content section is active (admin only)
  useEffect(() => {
    if (activeSection === 'daily-content' && user && user.user_type === 'admin') {
      const fetchDailyContent = async () => {
        setDailyContentLoading(true);
        try {
          const allSeries = await seriesService.getAll();
          // Filter series where is_daily_content is true
          const dailySeries = allSeries.filter((series: any) => series.is_daily_content === true);
          setDailyContentSeries(dailySeries);
        } catch (error) {
          console.error('Error fetching daily content series:', error);
        } finally {
          setDailyContentLoading(false);
        }
      };

      fetchDailyContent();
    }
  }, [activeSection, user]);
  
  // Show loading while checking user
  if (userLoading) {
    return (
      <div className="flex h-screen bg-[#121212] text-white items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex justify-center">
            <HarmonySpinner size={24} />
          </div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if not admin or staff (redirect will happen)
  if (!user || (user.user_type !== 'admin' && user.user_type !== 'staff')) {
    return null;
  }

  const isAdmin = user.user_type === 'admin';
  const isStaff = user.user_type === 'staff';

  const handleDeleteContent = async (categoryId: string, itemId: string) => {
    try {
      await removeContentFromCategory(categoryId, itemId);
    } catch (err) {
      console.error('Failed to delete content:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-[#121212] text-white items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex justify-center">
            <HarmonySpinner size={24} />
          </div>
          <p className="text-gray-400">Loading categories...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen bg-[#121212] text-white items-center justify-center">
        <div className="text-center max-w-md p-8 bg-red-900/20 border border-red-600/50 rounded-lg">
          <p className="text-red-200 mb-4">❌ Error loading categories</p>
          <p className="text-red-300 text-sm">{error}</p>
          <p className="text-gray-400 text-sm mt-4">
            Make sure you've run the SQL schema and seeded the database at{' '}
            <a href="/seed" className="text-blue-400 hover:underline">/seed</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#121212] text-white pt-16">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      <main className="flex-1 bg-[#1a1a1a] overflow-y-auto">
        <div className="p-6">
          {activeSection === "users" && isAdmin && <UsersDashboard />}
          {activeSection === "users" && isStaff && (
            <div className="text-center py-12">
              <p className="text-gray-400">User management is only available to administrators.</p>
            </div>
          )}
          {activeSection === "carousel" && isAdmin && <CarouselDashboard />}
          {activeSection === "carousel" && isStaff && (
            <div className="text-center py-12">
              <p className="text-gray-400">Carousel management is only available to administrators.</p>
            </div>
          )}
          {activeSection === "landing" && isAdmin && <LandingDashboard />}
          {activeSection === "landing" && isStaff && (
            <div className="text-center py-12">
              <p className="text-gray-400">Landing page management is only available to administrators.</p>
            </div>
          )}
          {activeSection === "daily-content" && isAdmin && (
            <>
              {selectedDailySeries ? (
                <DailyContentCalendar
                  seriesId={selectedDailySeries.id}
                  seriesTitle={selectedDailySeries.title}
                  onBack={() => setSelectedDailySeries(null)}
                />
              ) : (
                <div>
                  <h1 className="text-2xl font-bold mb-6">Daily Content</h1>
                  
                  {dailyContentLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <HarmonySpinner size={24} />
                    </div>
                  ) : dailyContentSeries.length > 0 ? (
                    <div className="space-y-2">
                      <h2 className="text-lg font-semibold mb-4">Daily Content Series</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {dailyContentSeries.map((series) => (
                          <button
                            key={series.id}
                            onClick={() => setSelectedDailySeries(series)}
                            className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800 hover:border-blue-500 hover:bg-[#242424] transition-colors text-left"
                          >
                            <p className="text-white font-medium mb-1">{series.title}</p>
                            {series.description && (
                              <p className="text-gray-400 text-sm line-clamp-2">{series.description}</p>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-400">No daily content series found. Mark a series as "Daily Content" in the series edit form.</p>
                  )}
                </div>
              )}
            </>
          )}
          {activeSection === "daily-content" && isStaff && (
            <div className="text-center py-12">
              <p className="text-gray-400">Daily content management is only available to administrators.</p>
            </div>
          )}
          {activeSection === "content" && isAdmin && (
            <ContentDashboard 
              categories={categories}
              onAddCategory={addCategory}
              onUpdateCategory={updateCategory}
              onDeleteCategory={deleteCategory}
              onReorderCategories={reorderCategories}
              onAddContentToCategory={addContentToCategory}
              onDeleteContent={handleDeleteContent}
              onReorderContent={reorderContentInCategory}
            />
          )}
          {activeSection === "content" && isStaff && (
            <div className="text-center py-12">
              <p className="text-gray-400">Home page management is only available to administrators.</p>
            </div>
          )}
          {activeSection === "content-list" && (
            <ContentList 
              categories={categories} 
              onDeleteContent={handleDeleteContent}
              onContentUpdate={refreshCategories}
              contentToEdit={contentToEdit}
              onContentEditComplete={() => setContentToEdit(null)}
            />
          )}
          {activeSection === "overview" && isAdmin && (
            <div>
              <h1 className="text-2xl font-bold mb-6">Overview</h1>
              
              {statisticsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
              ) : statisticsError ? (
                <div className="bg-red-900/20 border border-red-600/50 rounded-lg p-4">
                  <p className="text-red-200">Error loading statistics: {statisticsError}</p>
                </div>
              ) : statistics ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  {/* Total Users */}
                  <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-gray-400 text-sm font-medium">Total Users</h3>
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                    <p className="text-3xl font-bold text-white">{statistics.totalUsers.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">All signed up users</p>
                  </div>

                  {/* Subscribed Users */}
                  <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-gray-400 text-sm font-medium">Subscribed Users</h3>
                      <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-3xl font-bold text-white">{statistics.subscribedUsers.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">Active subscriptions</p>
                  </div>

                  {/* Free Users */}
                  <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-gray-400 text-sm font-medium">Free Users</h3>
                      <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                      </svg>
                    </div>
                    <p className="text-3xl font-bold text-white">{statistics.freeUsers.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">Free tier users</p>
                  </div>

                  {/* Estimated MRR */}
                  <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-gray-400 text-sm font-medium">Estimated MRR</h3>
                      <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-3xl font-bold text-white">${statistics.estimatedMRR.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className="text-xs text-gray-500 mt-1">Monthly recurring revenue</p>
                  </div>
                </div>
              ) : null}

              {/* Subscription Breakdown */}
              {statistics && !statisticsLoading && !statisticsError && (
                <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
                  <h2 className="text-xl font-bold mb-4">Subscription Breakdown</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#0a0a0a] rounded-lg p-4">
                      <p className="text-gray-400 text-sm mb-1">Monthly Subscriptions</p>
                      <p className="text-2xl font-bold text-white">{statistics.monthlySubscriptions}</p>
                      <p className="text-xs text-gray-500 mt-1">$7.00/month each</p>
                    </div>
                    <div className="bg-[#0a0a0a] rounded-lg p-4">
                      <p className="text-gray-400 text-sm mb-1">Yearly Subscriptions</p>
                      <p className="text-2xl font-bold text-white">{statistics.yearlySubscriptions}</p>
                      <p className="text-xs text-gray-500 mt-1">$70.00/year each</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {activeSection === "overview" && isStaff && (
            <div className="text-center py-12">
              <p className="text-gray-400">Overview statistics are only available to administrators.</p>
            </div>
          )}
          {activeSection === "bug-reports" && isAdmin && <BugReportsDashboard />}
          {activeSection === "bug-reports" && isStaff && (
            <div className="text-center py-12">
              <p className="text-gray-400">Bug reports are only available to administrators.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
