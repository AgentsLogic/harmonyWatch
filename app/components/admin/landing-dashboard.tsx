"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { seriesService } from "@/lib/database";
import type { Series } from "@/lib/database.types";
import { compressImage, COMPRESSION_PRESETS } from "@/lib/utils/image-compression";
import { useModal } from "../../contexts/modal-context";
import MobileSlideshowDashboard from "./mobile-slideshow-dashboard";

interface LandingPageSeries {
  id: string;
  series_id: string;
  sort_order: number;
  series: Series;
}

interface LandingPageModule {
  id: string;
  series_id: string;
  sort_order: number;
  logo_url_override: string | null;
  background_url_override: string | null;
  subtitle_override: string | null;
  hide_subtitle: boolean;
  button_text_override: string | null;
  logo_width: number | null;
  logo_height: number | null;
  series: Series;
}

interface LandingPageFAQ {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
}

export default function LandingDashboard() {
  const { refreshFooterContent } = useModal();
  const [activeTab, setActiveTab] = useState<'series' | 'modules' | 'faqs' | 'footer-content' | 'mobile-slideshow'>('series');
  
  // Series state
  const [landingSeries, setLandingSeries] = useState<LandingPageSeries[]>([]);
  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  
  // Modules state
  const [modules, setModules] = useState<LandingPageModule[]>([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [modulesError, setModulesError] = useState<string | null>(null);
  const [selectedModuleSeriesId, setSelectedModuleSeriesId] = useState<string>("");
  const [editingModule, setEditingModule] = useState<LandingPageModule | null>(null);
  const [moduleFormData, setModuleFormData] = useState({
    logo_url_override: '',
    background_url_override: '',
    subtitle_override: '',
    hide_subtitle: false,
    button_text_override: '',
    logo_width: '',
    logo_height: '',
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  
  // FAQs state
  const [faqs, setFaqs] = useState<LandingPageFAQ[]>([]);
  const [faqsLoading, setFaqsLoading] = useState(true);
  const [faqsError, setFaqsError] = useState<string | null>(null);
  const [editingFaq, setEditingFaq] = useState<LandingPageFAQ | null>(null);
  const [faqFormData, setFaqFormData] = useState({
    question: '',
    answer: '',
  });

  // Footer Content state
  const [footerContent, setFooterContent] = useState<Array<{ content_key: string; title: string; content: string }>>([]);
  const [footerContentLoading, setFooterContentLoading] = useState(true);
  const [footerContentError, setFooterContentError] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<{ content_key: string; title: string; content: string } | null>(null);
  const [contentFormData, setContentFormData] = useState({
    title: '',
    content: '',
  });
  const [savingContent, setSavingContent] = useState(false);

  // Load landing page series and all series
  useEffect(() => {
    loadData();
    loadModules();
    loadFaqs();
    loadFooterContent();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [landingResponse, seriesData] = await Promise.all([
        fetch('/api/admin/landing-series', { credentials: 'include' }),
        seriesService.getAll(),
      ]);

      if (!landingResponse.ok) {
        throw new Error('Failed to fetch landing page series');
      }

      const landingData = await landingResponse.json();
      setLandingSeries(landingData.series || []);
      
      // Filter to only video series (not audio)
      const videoSeries = seriesData.filter(s => s.content_type === 'video');
      setAllSeries(videoSeries);
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadModules = async () => {
    try {
      setModulesLoading(true);
      setModulesError(null);

      const response = await fetch('/api/admin/landing-modules', { credentials: 'include' });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.details || 'Failed to fetch landing page modules';
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setModules(data.modules || []);
    } catch (err) {
      console.error('Error loading modules:', err);
      setModulesError(err instanceof Error ? err.message : 'Failed to load modules');
    } finally {
      setModulesLoading(false);
    }
  };

  // Get available series (not already added)
  const availableSeries = allSeries.filter(
    series => !landingSeries.some(ls => ls.series_id === series.id)
  );

  const handleAddSeries = async () => {
    if (!selectedSeriesId) {
      setError('Please select a series');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const response = await fetch('/api/admin/landing-series', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          series_id: selectedSeriesId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add series');
      }

      // Reload data
      await loadData();
      setSelectedSeriesId("");
    } catch (err) {
      console.error('Error adding series:', err);
      setError(err instanceof Error ? err.message : 'Failed to add series');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSeries = async (id: string) => {
    if (!confirm('Are you sure you want to remove this series from the landing page?')) {
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const response = await fetch(`/api/admin/landing-series/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to remove series');
      }

      // Reload data
      await loadData();
    } catch (err) {
      console.error('Error removing series:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove series');
    } finally {
      setSaving(false);
    }
  };

  const handleReorder = async (id: string, newSortOrder: number) => {
    try {
      const response = await fetch(`/api/admin/landing-series/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          sort_order: newSortOrder,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to reorder series');
      }

      // Reload data
      await loadData();
    } catch (err) {
      console.error('Error reordering series:', err);
      setError(err instanceof Error ? err.message : 'Failed to reorder series');
    }
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const item = landingSeries[index];
    const prevItem = landingSeries[index - 1];
    handleReorder(item.id, prevItem.sort_order);
    handleReorder(prevItem.id, item.sort_order);
  };

  const handleMoveDown = (index: number) => {
    if (index === landingSeries.length - 1) return;
    const item = landingSeries[index];
    const nextItem = landingSeries[index + 1];
    handleReorder(item.id, nextItem.sort_order);
    handleReorder(nextItem.id, item.sort_order);
  };

  // Module handlers
  const handleAddModule = async () => {
    if (!selectedModuleSeriesId) {
      setModulesError('Please select a series');
      return;
    }

    try {
      setSaving(true);
      setModulesError(null);

      const response = await fetch('/api/admin/landing-modules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          series_id: selectedModuleSeriesId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add module');
      }

      await loadModules();
      setSelectedModuleSeriesId("");
    } catch (err) {
      console.error('Error adding module:', err);
      setModulesError(err instanceof Error ? err.message : 'Failed to add module');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveModule = async (id: string) => {
    if (!confirm('Are you sure you want to remove this module from the landing page?')) {
      return;
    }

    try {
      setSaving(true);
      setModulesError(null);

      const response = await fetch(`/api/admin/landing-modules/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to remove module');
      }

      await loadModules();
    } catch (err) {
      console.error('Error removing module:', err);
      setModulesError(err instanceof Error ? err.message : 'Failed to remove module');
    } finally {
      setSaving(false);
    }
  };

  const handleEditModule = (module: LandingPageModule) => {
    setEditingModule(module);
    setModuleFormData({
      logo_url_override: module.logo_url_override || '',
      background_url_override: module.background_url_override || '',
      subtitle_override: module.subtitle_override || '',
      hide_subtitle: module.hide_subtitle || false,
      button_text_override: module.button_text_override || '',
      logo_width: module.logo_width?.toString() || '',
      logo_height: module.logo_height?.toString() || '',
    });
    setLogoPreview(module.logo_url_override || module.series.logo_url || null);
    setBackgroundPreview(module.background_url_override || module.series.banner_url || null);
  };

  // Upload file to storage
  const uploadFile = async (file: File, type: 'logo' | 'background'): Promise<string | null> => {
    try {
      // Compress image before upload - use appropriate preset based on type
      const preset = type === 'logo' ? COMPRESSION_PRESETS.logo : COMPRESSION_PRESETS.banner;
      const compressedFile = await compressImage(file, preset);
      
      const formData = new FormData();
      formData.append('file', compressedFile);
      formData.append('bucket', 'thumbnails');
      formData.append('path', `landing-module-${type}-${Date.now()}.${compressedFile.name.split('.').pop()}`);

      const uploadResponse = await fetch('/api/upload/thumbnail', {
        method: 'POST',
        body: formData,
      });

      if (uploadResponse.ok) {
        const { url } = await uploadResponse.json();
        return url;
      } else {
        console.error('Failed to upload file');
        return null;
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      return null;
    }
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setUploadingLogo(true);
    const url = await uploadFile(file, 'logo');
    setUploadingLogo(false);

    if (url) {
      setModuleFormData({ ...moduleFormData, logo_url_override: url });
      setLogoPreview(url);
    } else {
      alert('Failed to upload logo image');
    }
  };

  const handleBackgroundFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setUploadingBackground(true);
    const url = await uploadFile(file, 'background');
    setUploadingBackground(false);

    if (url) {
      setModuleFormData({ ...moduleFormData, background_url_override: url });
      setBackgroundPreview(url);
    } else {
      alert('Failed to upload background image');
    }
  };

  const handleRemoveLogo = () => {
    setModuleFormData({ ...moduleFormData, logo_url_override: '' });
    setLogoPreview(editingModule?.series.logo_url || null);
  };

  const handleRemoveBackground = () => {
    setModuleFormData({ ...moduleFormData, background_url_override: '' });
    setBackgroundPreview(editingModule?.series.banner_url || null);
  };

  const handleSaveModule = async () => {
    if (!editingModule) return;

    try {
      setSaving(true);
      setModulesError(null);

      const response = await fetch(`/api/admin/landing-modules/${editingModule.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          logo_url_override: moduleFormData.logo_url_override || null,
          background_url_override: moduleFormData.background_url_override || null,
          subtitle_override: moduleFormData.subtitle_override || null,
          hide_subtitle: moduleFormData.hide_subtitle,
          button_text_override: moduleFormData.button_text_override || null,
          logo_width: moduleFormData.logo_width ? parseInt(moduleFormData.logo_width) : null,
          logo_height: moduleFormData.logo_height ? parseInt(moduleFormData.logo_height) : null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update module');
      }

      await loadModules();
      setEditingModule(null);
      setModuleFormData({
        logo_url_override: '',
        background_url_override: '',
        subtitle_override: '',
        hide_subtitle: false,
        button_text_override: '',
        logo_width: '',
        logo_height: '',
      });
      setLogoPreview(null);
      setBackgroundPreview(null);
    } catch (err) {
      console.error('Error updating module:', err);
      setModulesError(err instanceof Error ? err.message : 'Failed to update module');
    } finally {
      setSaving(false);
    }
  };

  const handleReorderModule = async (id: string, newSortOrder: number) => {
    try {
      const response = await fetch(`/api/admin/landing-modules/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          sort_order: newSortOrder,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to reorder module');
      }

      await loadModules();
    } catch (err) {
      console.error('Error reordering module:', err);
      setModulesError(err instanceof Error ? err.message : 'Failed to reorder module');
    }
  };

  const handleMoveModuleUp = (index: number) => {
    if (index === 0) return;
    const item = modules[index];
    const prevItem = modules[index - 1];
    handleReorderModule(item.id, prevItem.sort_order);
    handleReorderModule(prevItem.id, item.sort_order);
  };

  const handleMoveModuleDown = (index: number) => {
    if (index === modules.length - 1) return;
    const item = modules[index];
    const nextItem = modules[index + 1];
    handleReorderModule(item.id, nextItem.sort_order);
    handleReorderModule(nextItem.id, item.sort_order);
  };

  // Get available series for modules (not already added)
  const availableModuleSeries = allSeries.filter(
    series => !modules.some(m => m.series_id === series.id)
  );

  // FAQ handlers
  const loadFaqs = async () => {
    try {
      setFaqsLoading(true);
      setFaqsError(null);

      const response = await fetch('/api/admin/landing-faqs', { credentials: 'include' });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.details || 'Failed to fetch FAQs';
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setFaqs(data.faqs || []);
    } catch (err) {
      console.error('Error loading FAQs:', err);
      setFaqsError(err instanceof Error ? err.message : 'Failed to load FAQs');
    } finally {
      setFaqsLoading(false);
    }
  };

  const handleAddFaq = async () => {
    if (!faqFormData.question.trim() || !faqFormData.answer.trim()) {
      setFaqsError('Please fill in both question and answer');
      return;
    }

    try {
      setSaving(true);
      setFaqsError(null);

      const response = await fetch('/api/admin/landing-faqs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          question: faqFormData.question.trim(),
          answer: faqFormData.answer.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add FAQ');
      }

      await loadFaqs();
      setFaqFormData({ question: '', answer: '' });
    } catch (err) {
      console.error('Error adding FAQ:', err);
      setFaqsError(err instanceof Error ? err.message : 'Failed to add FAQ');
    } finally {
      setSaving(false);
    }
  };

  const handleEditFaq = (faq: LandingPageFAQ) => {
    setEditingFaq(faq);
    setFaqFormData({
      question: faq.question,
      answer: faq.answer,
    });
  };

  const handleSaveFaq = async () => {
    if (!editingFaq) return;
    if (!faqFormData.question.trim() || !faqFormData.answer.trim()) {
      setFaqsError('Please fill in both question and answer');
      return;
    }

    try {
      setSaving(true);
      setFaqsError(null);

      const response = await fetch(`/api/admin/landing-faqs/${editingFaq.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          question: faqFormData.question.trim(),
          answer: faqFormData.answer.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update FAQ');
      }

      await loadFaqs();
      setEditingFaq(null);
      setFaqFormData({ question: '', answer: '' });
    } catch (err) {
      console.error('Error updating FAQ:', err);
      setFaqsError(err instanceof Error ? err.message : 'Failed to update FAQ');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFaq = async (id: string) => {
    if (!confirm('Are you sure you want to remove this FAQ?')) {
      return;
    }

    try {
      setSaving(true);
      setFaqsError(null);

      const response = await fetch(`/api/admin/landing-faqs/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to remove FAQ');
      }

      await loadFaqs();
    } catch (err) {
      console.error('Error removing FAQ:', err);
      setFaqsError(err instanceof Error ? err.message : 'Failed to remove FAQ');
    } finally {
      setSaving(false);
    }
  };

  const handleReorderFaq = async (id: string, newSortOrder: number) => {
    try {
      const response = await fetch(`/api/admin/landing-faqs/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          sort_order: newSortOrder,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to reorder FAQ');
      }

      await loadFaqs();
    } catch (err) {
      console.error('Error reordering FAQ:', err);
      setFaqsError(err instanceof Error ? err.message : 'Failed to reorder FAQ');
    }
  };

  const handleMoveFaqUp = (index: number) => {
    if (index === 0) return;
    const item = faqs[index];
    const prevItem = faqs[index - 1];
    handleReorderFaq(item.id, prevItem.sort_order);
    handleReorderFaq(prevItem.id, item.sort_order);
  };

  const handleMoveFaqDown = (index: number) => {
    if (index === faqs.length - 1) return;
    const item = faqs[index];
    const nextItem = faqs[index + 1];
    handleReorderFaq(item.id, nextItem.sort_order);
    handleReorderFaq(nextItem.id, item.sort_order);
  };

  const loadFooterContent = async () => {
    try {
      setFooterContentLoading(true);
      setFooterContentError(null);

      const response = await fetch('/api/landing-content', { credentials: 'include' });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.details || 'Failed to fetch footer content';
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setFooterContent(data.content || []);
    } catch (err) {
      console.error('Error loading footer content:', err);
      setFooterContentError(err instanceof Error ? err.message : 'Failed to load footer content');
    } finally {
      setFooterContentLoading(false);
    }
  };

  const handleEditContent = (content: { content_key: string; title: string; content: string }) => {
    setEditingContent(content);
    setContentFormData({
      title: content.title,
      content: content.content,
    });
  };

  const handleSaveContent = async () => {
    if (!editingContent) return;
    if (!contentFormData.title.trim() || !contentFormData.content.trim()) {
      setFooterContentError('Please fill in both title and content');
      return;
    }

    try {
      setSavingContent(true);
      setFooterContentError(null);

      const response = await fetch('/api/landing-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          content_key: editingContent.content_key,
          title: contentFormData.title.trim(),
          content: contentFormData.content.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save content');
      }

      await loadFooterContent();
      // Refresh the cache in modal context so users see updated content immediately
      // Pass true to force refresh (bypass cache)
      await refreshFooterContent(true);
      setEditingContent(null);
      setContentFormData({ title: '', content: '' });
    } catch (err) {
      console.error('Error saving content:', err);
      setFooterContentError(err instanceof Error ? err.message : 'Failed to save content');
    } finally {
      setSavingContent(false);
    }
  };

  if (loading || modulesLoading || faqsLoading || footerContentLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Landing Page Management</h1>
      
      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-gray-800">
        <button
          onClick={() => setActiveTab('series')}
          className={`px-4 py-2 font-semibold transition-colors ${
            activeTab === 'series'
              ? 'text-white border-b-2 border-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Featured Series
        </button>
        <button
          onClick={() => setActiveTab('modules')}
          className={`px-4 py-2 font-semibold transition-colors ${
            activeTab === 'modules'
              ? 'text-white border-b-2 border-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Content Modules
        </button>
        <button
          onClick={() => setActiveTab('faqs')}
          className={`px-4 py-2 font-semibold transition-colors ${
            activeTab === 'faqs'
              ? 'text-white border-b-2 border-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          FAQs
        </button>
        <button
          onClick={() => setActiveTab('footer-content')}
          className={`px-4 py-2 font-semibold transition-colors ${
            activeTab === 'footer-content'
              ? 'text-white border-b-2 border-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Footer Content
        </button>
        <button
          onClick={() => setActiveTab('mobile-slideshow')}
          className={`px-4 py-2 font-semibold transition-colors ${
            activeTab === 'mobile-slideshow'
              ? 'text-white border-b-2 border-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Mobile Landing Page
        </button>
      </div>

      {/* Series Tab */}
      {activeTab === 'series' && (
        <>
      
      {error && (
        <div className="bg-red-900/20 border border-red-600/50 rounded-lg p-4 mb-6">
          <p className="text-red-200">{error}</p>
        </div>
      )}

      {/* Add Series Section */}
      <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800 mb-6">
        <h2 className="text-lg font-semibold mb-4">Add Series to Landing Page</h2>
        <div className="flex gap-4">
          <select
            value={selectedSeriesId}
            onChange={(e) => setSelectedSeriesId(e.target.value)}
            className="flex-1 bg-[#0a0a0a] border border-gray-700 rounded-lg px-4 py-2 text-white"
          >
            <option value="">Select a video series...</option>
            {availableSeries.map((series) => (
              <option key={series.id} value={series.id}>
                {series.title}
              </option>
            ))}
          </select>
          <button
            onClick={handleAddSeries}
            disabled={!selectedSeriesId || saving}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Adding...' : 'Add Series'}
          </button>
        </div>
        {availableSeries.length === 0 && (
          <p className="text-gray-400 text-sm mt-2">
            All video series have been added to the landing page.
          </p>
        )}
      </div>

      {/* Current Landing Page Series */}
      <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
        <h2 className="text-lg font-semibold mb-4">
          Current Landing Page Series ({landingSeries.length})
        </h2>
        
        {landingSeries.length === 0 ? (
          <p className="text-gray-400">
            No series selected. The landing page will show random video series by default.
          </p>
        ) : (
          <div className="space-y-4">
            {landingSeries.map((item, index) => (
              <div
                key={item.id}
                className="bg-[#0a0a0a] rounded-lg p-4 border border-gray-700 flex items-center gap-4"
              >
                <div className="flex-shrink-0 flex gap-2">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0 || saving}
                    className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === landingSeries.length - 1 || saving}
                    className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Move down"
                  >
                    ↓
                  </button>
                </div>
                
                <div className="flex-shrink-0 w-24 h-14 bg-gray-800 rounded overflow-hidden">
                  {item.series.thumbnail_url ? (
                    <Image
                      src={item.series.thumbnail_url}
                      alt={item.series.title}
                      width={96}
                      height={56}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                      <span className="text-gray-500 text-xs">No image</span>
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-medium truncate">{item.series.title}</h3>
                  {item.series.description && (
                    <p className="text-gray-400 text-sm line-clamp-1">{item.series.description}</p>
                  )}
                  <p className="text-gray-500 text-xs mt-1">
                    {item.series.episodes_count || 0} episodes
                  </p>
                </div>
                
                <button
                  onClick={() => handleRemoveSeries(item.id)}
                  disabled={saving}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}

      {/* Modules Tab */}
      {activeTab === 'modules' && (
        <>
          {(error || modulesError) && (
            <div className="bg-red-900/20 border border-red-600/50 rounded-lg p-4 mb-6">
              <p className="text-red-200">{error || modulesError}</p>
            </div>
          )}

          {/* Add Module Section */}
          <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800 mb-6">
            <h2 className="text-lg font-semibold mb-4">Add Module to Landing Page</h2>
            <div className="flex gap-4">
              <select
                value={selectedModuleSeriesId}
                onChange={(e) => setSelectedModuleSeriesId(e.target.value)}
                className="flex-1 bg-[#0a0a0a] border border-gray-700 rounded-lg px-4 py-2 text-white"
              >
                <option value="">Select a series...</option>
                {availableModuleSeries.map((series) => (
                  <option key={series.id} value={series.id}>
                    {series.title}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddModule}
                disabled={!selectedModuleSeriesId || saving}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Adding...' : 'Add Module'}
              </button>
            </div>
            {availableModuleSeries.length === 0 && (
              <p className="text-gray-400 text-sm mt-2">
                All series have been added as modules.
              </p>
            )}
          </div>

          {/* Current Modules */}
          <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
            <h2 className="text-lg font-semibold mb-4">
              Current Landing Page Modules ({modules.length})
            </h2>
            
            {modules.length === 0 ? (
              <p className="text-gray-400">
                No modules configured. The landing page will not show any content modules.
              </p>
            ) : (
              <div className="space-y-4">
                {modules.map((module, index) => (
                  <div
                    key={module.id}
                    className="bg-[#0a0a0a] rounded-lg p-4 border border-gray-700"
                  >
                    {editingModule?.id === module.id ? (
                      // Edit Form
                      <div className="space-y-4">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-white font-medium">{module.series.title}</h3>
                          <div className="flex gap-2">
                            <button
                              onClick={handleSaveModule}
                              disabled={saving}
                              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingModule(null);
                                setModuleFormData({
                                  logo_url_override: '',
                                  background_url_override: '',
                                  subtitle_override: '',
                                  hide_subtitle: false,
                                  button_text_override: '',
                                  logo_width: '',
                                  logo_height: '',
                                });
                                setLogoPreview(null);
                                setBackgroundPreview(null);
                              }}
                              className="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Logo Upload */}
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                              Logo Override (leave empty to use series logo)
                            </label>
                            <div className="space-y-2">
                              {logoPreview ? (
                                <div className="relative">
                                  <img
                                    src={logoPreview}
                                    alt="Logo preview"
                                    className="w-full h-32 object-contain bg-[#0a0a0a] rounded-lg border border-gray-700"
                                  />
                                  <button
                                    type="button"
                                    onClick={handleRemoveLogo}
                                    className="absolute top-2 right-2 bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ) : (
                                <div className="border-2 border-dashed border-gray-700 rounded-lg p-4 text-center">
                                  <p className="text-gray-400 text-sm mb-2">No logo uploaded</p>
                                  <p className="text-gray-500 text-xs">Will use series logo if available</p>
                                </div>
                              )}
                              <label className="block">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleLogoFileChange}
                                  disabled={uploadingLogo}
                                  className="hidden"
                                />
                                <div className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-4 py-3 text-white text-sm text-center cursor-pointer hover:bg-[#1a1a1a] transition-colors disabled:opacity-50">
                                  {uploadingLogo ? 'Uploading...' : logoPreview ? 'Change Logo' : 'Upload Logo'}
                                </div>
                              </label>
                            </div>
                          </div>
                          
                          {/* Background Upload */}
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                              Background Override (leave empty to use series banner)
                            </label>
                            <div className="space-y-2">
                              {backgroundPreview ? (
                                <div className="relative">
                                  <img
                                    src={backgroundPreview}
                                    alt="Background preview"
                                    className="w-full h-32 object-cover bg-[#0a0a0a] rounded-lg border border-gray-700"
                                  />
                                  <button
                                    type="button"
                                    onClick={handleRemoveBackground}
                                    className="absolute top-2 right-2 bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ) : (
                                <div className="border-2 border-dashed border-gray-700 rounded-lg p-4 text-center">
                                  <p className="text-gray-400 text-sm mb-2">No background uploaded</p>
                                  <p className="text-gray-500 text-xs">Will use series banner if available</p>
                                </div>
                              )}
                              <label className="block">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleBackgroundFileChange}
                                  disabled={uploadingBackground}
                                  className="hidden"
                                />
                                <div className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-4 py-3 text-white text-sm text-center cursor-pointer hover:bg-[#1a1a1a] transition-colors disabled:opacity-50">
                                  {uploadingBackground ? 'Uploading...' : backgroundPreview ? 'Change Background' : 'Upload Background'}
                                </div>
                              </label>
                            </div>
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                              Logo Width (px) - leave empty for default
                            </label>
                            <input
                              type="number"
                              value={moduleFormData.logo_width}
                              onChange={(e) => setModuleFormData({ ...moduleFormData, logo_width: e.target.value })}
                              className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-4 py-2 text-white text-sm"
                              placeholder="500"
                              min="0"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                              Logo Height (px) - leave empty for default
                            </label>
                            <input
                              type="number"
                              value={moduleFormData.logo_height}
                              onChange={(e) => setModuleFormData({ ...moduleFormData, logo_height: e.target.value })}
                              className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-4 py-2 text-white text-sm"
                              placeholder="150"
                              min="0"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                              Subtitle Override (leave empty to use series description)
                            </label>
                            <input
                              type="text"
                              value={moduleFormData.subtitle_override}
                              onChange={(e) => setModuleFormData({ ...moduleFormData, subtitle_override: e.target.value })}
                              className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-4 py-2 text-white text-sm"
                              placeholder={module.series.description || 'No series description'}
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                              Button Text Override (leave empty for default &quot;Start Watching &gt;&quot;)
                            </label>
                            <input
                              type="text"
                              value={moduleFormData.button_text_override}
                              onChange={(e) => setModuleFormData({ ...moduleFormData, button_text_override: e.target.value })}
                              className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-4 py-2 text-white text-sm"
                              placeholder="Start Watching >"
                            />
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`hide-subtitle-${module.id}`}
                            checked={moduleFormData.hide_subtitle}
                            onChange={(e) => setModuleFormData({ ...moduleFormData, hide_subtitle: e.target.checked })}
                            className="w-4 h-4 rounded border-gray-700 bg-[#0a0a0a] text-blue-600"
                          />
                          <label htmlFor={`hide-subtitle-${module.id}`} className="text-sm text-gray-300">
                            Hide subtitle completely
                          </label>
                        </div>
                      </div>
                    ) : (
                      // Display Mode
                      <div className="flex items-center gap-4">
                        <div className="flex-shrink-0 flex gap-2">
                          <button
                            onClick={() => handleMoveModuleUp(index)}
                            disabled={index === 0 || saving}
                            className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-600 disabled:opacity-50"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => handleMoveModuleDown(index)}
                            disabled={index === modules.length - 1 || saving}
                            className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-600 disabled:opacity-50"
                            title="Move down"
                          >
                            ↓
                          </button>
                        </div>
                        
                        <div className="flex-shrink-0 w-24 h-14 bg-gray-800 rounded overflow-hidden">
                          {module.series.thumbnail_url ? (
                            <Image
                              src={module.series.thumbnail_url}
                              alt={module.series.title}
                              width={96}
                              height={56}
                              className="w-full h-full object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                              <span className="text-gray-500 text-xs">No image</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-medium truncate">{module.series.title}</h3>
                          <div className="text-gray-400 text-sm space-y-1">
                            <p className="line-clamp-1">
                              Logo: {module.logo_url_override ? 'Custom' : module.series.logo_url ? 'From Series' : 'None'}
                            </p>
                            <p className="line-clamp-1">
                              BG: {module.background_url_override ? 'Custom' : module.series.banner_url ? 'From Series' : 'None'}
                            </p>
                            <p className="line-clamp-1">
                              Subtitle: {module.hide_subtitle ? 'Hidden' : module.subtitle_override || module.series.description || 'None'}
                            </p>
                            <p className="line-clamp-1">
                              Button: {module.button_text_override || 'Start Watching &gt;'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditModule(module)}
                            disabled={saving}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRemoveModule(module.id)}
                            disabled={saving}
                            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* FAQs Tab */}
      {activeTab === 'faqs' && (
        <>
          {faqsError && (
            <div className="bg-red-900/20 border border-red-600/50 rounded-lg p-4 mb-6">
              <p className="text-red-200">{faqsError}</p>
            </div>
          )}

          {/* Add FAQ Section */}
          <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800 mb-6">
            <h2 className="text-lg font-semibold mb-4">
              {editingFaq ? 'Edit FAQ' : 'Add New FAQ'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Question
                </label>
                <input
                  type="text"
                  value={faqFormData.question}
                  onChange={(e) => setFaqFormData({ ...faqFormData, question: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-4 py-2 text-white"
                  placeholder="Enter question..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Answer
                </label>
                <textarea
                  value={faqFormData.answer}
                  onChange={(e) => setFaqFormData({ ...faqFormData, answer: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-4 py-2 text-white min-h-[120px]"
                  placeholder="Enter answer..."
                  rows={5}
                />
              </div>
              <div className="flex gap-2">
                {editingFaq ? (
                  <>
                    <button
                      onClick={handleSaveFaq}
                      disabled={saving || !faqFormData.question.trim() || !faqFormData.answer.trim()}
                      className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingFaq(null);
                        setFaqFormData({ question: '', answer: '' });
                      }}
                      className="bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleAddFaq}
                    disabled={saving || !faqFormData.question.trim() || !faqFormData.answer.trim()}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Adding...' : 'Add FAQ'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Current FAQs */}
          <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
            <h2 className="text-lg font-semibold mb-4">
              Current FAQs ({faqs.length})
            </h2>
            
            {faqs.length === 0 ? (
              <p className="text-gray-400">
                No FAQs configured. Add your first FAQ above.
              </p>
            ) : (
              <div className="space-y-4">
                {faqs.map((faq, index) => (
                  <div
                    key={faq.id}
                    className="bg-[#0a0a0a] rounded-lg p-4 border border-gray-700"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0 flex gap-2">
                        <button
                          onClick={() => handleMoveFaqUp(index)}
                          disabled={index === 0 || saving}
                          className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => handleMoveFaqDown(index)}
                          disabled={index === faqs.length - 1 || saving}
                          className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          ↓
                        </button>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium mb-1">{faq.question}</h3>
                        <p className="text-gray-400 text-sm line-clamp-2">{faq.answer}</p>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditFaq(faq)}
                          disabled={saving}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleRemoveFaq(faq.id)}
                          disabled={saving}
                          className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Mobile Slideshow Tab */}
      {activeTab === 'mobile-slideshow' && (
        <MobileSlideshowDashboard />
      )}

      {/* Footer Content Tab */}
      {activeTab === 'footer-content' && (
        <>
          {footerContentError && (
            <div className="bg-red-900/20 border border-red-600/50 rounded-lg p-4 mb-6">
              <p className="text-red-200">{footerContentError}</p>
            </div>
          )}

          {/* Footer Content List */}
          <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
            <h2 className="text-lg font-semibold mb-4">
              Footer Content Pages
            </h2>
            
            {footerContent.length === 0 ? (
              <p className="text-gray-400">
                No footer content configured.
              </p>
            ) : (
              <div className="space-y-4">
                {footerContent.map((content) => (
                  <div
                    key={content.content_key}
                    className="bg-[#0a0a0a] rounded-lg p-4 border border-gray-700"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-semibold">{content.title}</h3>
                      <button
                        onClick={() => handleEditContent(content)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700"
                      >
                        {editingContent?.content_key === content.content_key ? 'Editing...' : 'Edit'}
                      </button>
                    </div>
                    {editingContent?.content_key === content.content_key && (
                      <div className="mt-4 space-y-4 pt-4 border-t border-gray-700">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Title
                          </label>
                          <input
                            type="text"
                            value={contentFormData.title}
                            onChange={(e) => setContentFormData({ ...contentFormData, title: e.target.value })}
                            className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-4 py-2 text-white"
                            placeholder="Enter title..."
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Content (supports HTML)
                          </label>
                          <textarea
                            value={contentFormData.content}
                            onChange={(e) => setContentFormData({ ...contentFormData, content: e.target.value })}
                            className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-4 py-2 text-white min-h-[300px] font-mono text-sm"
                            placeholder="Enter content (HTML supported)..."
                            rows={15}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveContent}
                            disabled={savingContent || !contentFormData.title.trim() || !contentFormData.content.trim()}
                            className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {savingContent ? 'Saving...' : 'Save Changes'}
                          </button>
                          <button
                            onClick={() => {
                              setEditingContent(null);
                              setContentFormData({ title: '', content: '' });
                            }}
                            className="bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}













