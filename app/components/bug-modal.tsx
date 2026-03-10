"use client";

import { useState, useEffect, useRef } from "react";
import { BaseModal } from "./base-modal";
import Image from "next/image";
import { compressImage, COMPRESSION_PRESETS } from "@/lib/utils/image-compression";

type Props = {
  isOpen: boolean;
  onClose: (delayClose?: boolean) => void;
  isAnimatingClose?: boolean;
};

export function BugModal({ isOpen, onClose, isAnimatingClose = false }: Props) {
  const [isMobile, setIsMobile] = useState(false);
  const [bugReport, setBugReport] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen && !isAnimatingClose) {
      setBugReport("");
      setImagePreview(null);
      setImageUrl(null);
      setSubmitMessage(null);
    }
  }, [isOpen, isAnimatingClose]);

  const handleImageFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setSubmitMessage('Please select an image file');
      return;
    }

    setIsUploadingImage(true);
    setSubmitMessage(null);

    try {
      // Compress image before upload
      const compressedFile = await compressImage(file, COMPRESSION_PRESETS.thumbnail);
      
      const formData = new FormData();
      formData.append('file', compressedFile);
      formData.append('bucket', 'thumbnails');
      formData.append('path', `bug-reports/bug-${Date.now()}.${compressedFile.name.split('.').pop() || 'webp'}`);

      const uploadResponse = await fetch('/api/upload/thumbnail', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const data = await uploadResponse.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(data.error || 'Failed to upload image');
      }

      const { url } = await uploadResponse.json();
      setImageUrl(url);
      setImagePreview(url);
    } catch (error) {
      console.error('Error uploading image:', error);
      setSubmitMessage(error instanceof Error ? error.message : 'Failed to upload image');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageFileSelect(file);
    }
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setImageUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugReport.trim()) return;

    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      const response = await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          report: bugReport,
          image_url: imageUrl || null
        }),
      });

      if (response.ok) {
        setSubmitMessage("Thank you! Your bug report has been submitted.");
        setBugReport("");
        setImagePreview(null);
        setImageUrl(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setSubmitMessage("Failed to submit bug report. Please try again.");
      }
    } catch (error) {
      console.error('Error submitting bug report:', error);
      setSubmitMessage("Failed to submit bug report. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      isMobile={isMobile}
      enableDragToDismiss={true}
      showDragHandle={false}
      isAnimatingClose={isAnimatingClose}
      centerOnDesktop={true}
      zIndex={105}
      backdropZIndex={104}
      maxWidth="md"
      fitContent={true}
      className="bg-[#151515]"
    >
      <div className="bg-[#151515] text-white min-h-full sm:min-h-0 sm:rounded-t-2xl sm:rounded-b-2xl">
        {/* Close button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose(!isMobile);
          }}
          onTouchStart={(e) => e.stopPropagation()}
          className="absolute top-12 left-4 sm:top-4 sm:right-4 z-50 w-10 h-10 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors flex items-center justify-center text-lg sm:text-base"
        >
          ✕
        </button>

        {/* Bug heading - centered and aligned with X button */}
        <h2 className="absolute top-14 left-1/2 -translate-x-1/2 sm:top-4 z-40 text-[16px] font-normal text-white">
          Report a Bug
        </h2>

        {/* Content */}
        <div className="p-6 sm:p-8 mt-[90px] sm:mt-0 pb-24 sm:pb-8">
          <form onSubmit={handleSubmit} className="space-y-4 sm:mt-[45px]">
            <div>
              <label htmlFor="bug-report" className="block text-sm font-medium mb-2">
                Describe the bug
              </label>
              <textarea
                id="bug-report"
                value={bugReport}
                onChange={(e) => setBugReport(e.target.value)}
                placeholder="What happened? What did you expect to happen?"
                className="w-full h-32 px-4 py-3 bg-black/50 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/30 resize-none"
                required
              />
            </div>

            {/* Image Upload - Optional */}
            <div>
              <label htmlFor="bug-image" className="block text-sm font-medium mb-2">
                Attach screenshot (optional)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                id="bug-image"
                accept="image/*"
                onChange={handleImageInputChange}
                className="hidden"
                disabled={isUploadingImage || isSubmitting}
              />
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage || isSubmitting}
                  className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-lg text-white hover:bg-black/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
                >
                  {isUploadingImage ? 'Uploading...' : imagePreview ? 'Change Image' : 'Choose Image'}
                </button>
                {imagePreview && (
                  <div className="relative">
                    <div className="relative w-full h-48 bg-black/50 rounded-lg overflow-hidden">
                      <Image
                        src={imagePreview}
                        alt="Bug screenshot preview"
                        fill
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      disabled={isSubmitting}
                      className="mt-2 text-gray-400 text-xs hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>

            {submitMessage && (
              <div className={`p-3 rounded-lg ${
                submitMessage.includes("Thank you") 
                  ? "bg-green-500/20 text-green-400" 
                  : "bg-red-500/20 text-red-400"
              }`}>
                {submitMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !bugReport.trim()}
              className="w-full bg-red-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting..." : "Submit Report"}
            </button>
          </form>
        </div>
      </div>
    </BaseModal>
  );
}
