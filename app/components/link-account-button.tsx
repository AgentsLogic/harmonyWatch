"use client";

import { useState } from "react";

type Platform = 'youtube' | 'patreon';

interface LinkAccountButtonProps {
  platform: Platform;
  isLinked: boolean;
  onLinkChange?: () => void;
  disabled?: boolean;
}

export function LinkAccountButton({
  platform,
  isLinked,
  onLinkChange,
  disabled = false,
}: LinkAccountButtonProps) {
  const [isLinking, setIsLinking] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);

  const platformName = platform === 'youtube' ? 'YouTube' : 'Patreon';
  const platformIcon = platform === 'youtube' ? (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  ) : (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M0 0v24h24V0H0zm7.5 7.5h9v9h-9v-9z"/>
    </svg>
  );

  const handleLink = async () => {
    if (isLinked || disabled || isLinking) return;

    setIsLinking(true);
    try {
      const response = await fetch(`/api/auth/link/${platform}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to initiate OAuth flow');
      }

      const { url } = await response.json();
      if (url) {
        // Redirect to OAuth provider
        window.location.href = url;
      }
    } catch (error) {
      console.error(`[Link ${platformName}] Error:`, error);
      alert(error instanceof Error ? error.message : `Failed to link ${platformName} account`);
      setIsLinking(false);
    }
  };

  const handleUnlink = async () => {
    if (!isLinked || disabled || isUnlinking) return;

    if (!confirm(`Are you sure you want to unlink your ${platformName} account? This will remove your subscription access if it's your only active subscription.`)) {
      return;
    }

    setIsUnlinking(true);
    try {
      const response = await fetch(`/api/auth/unlink/${platform}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to unlink account');
      }

      // Refresh user data
      if (onLinkChange) {
        onLinkChange();
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error(`[Unlink ${platformName}] Error:`, error);
      alert(error instanceof Error ? error.message : `Failed to unlink ${platformName} account`);
      setIsUnlinking(false);
    }
  };

  if (isLinked) {
    return (
      <button
        onClick={handleUnlink}
        disabled={disabled || isUnlinking}
        className="flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
      >
        {isUnlinking ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Unlinking...</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Unlink {platformName}</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleLink}
      disabled={disabled || isLinking}
      className="flex items-center gap-2 px-4 py-2 bg-[#2a2a2a] text-white rounded-lg hover:bg-[#333333] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
    >
      {isLinking ? (
        <>
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Linking...</span>
        </>
      ) : (
        <>
          {platformIcon}
          <span>Link {platformName}</span>
        </>
      )}
    </button>
  );
}
