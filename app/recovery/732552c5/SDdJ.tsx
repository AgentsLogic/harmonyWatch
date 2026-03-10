"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useUser } from "@/app/contexts/user-context";
import { useModal } from "@/app/contexts/modal-context";
import { motion } from "framer-motion";
import "./landing.css";

// Dummy data for the landing page
const featuredContent = [
  {
    id: 1,
    title: "DUST to DUST",
    thumbnail: "/images/dust-to-dust.jpg",
    description: "The Wisdom of the Ancient Desert Fathers vibrantly retold in animation.",
    category: "Animation"
  },
  {
    id: 2,
    title: "STORIES of SAINTS",
    thumbnail: "/images/stories-of-saints.jpg",
    description: "Inspiring tales of Orthodox saints and their miraculous journeys.",
    category: "Documentary"
  },
  {
    id: 3,
    title: "THE HUMBLE ELDER",
    thumbnail: "/images/humble-elder.jpg",
    description: "A contemplative journey through the life of a modern-day elder.",
    category: "Drama"
  },
  {
    id: 4,
    title: "TOBIT",
    thumbnail: "/images/tobit.jpg",
    description: "The biblical story of Tobit brought to life through stunning visuals.",
    category: "Biblical"
  }
];

const features = [
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    title: "Family Friendly",
    description: "Content free from profanity & vulgar imagery"
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
    title: "Patristic Sources",
    description: "Striving to retell the Truth of Orthodoxy, while keeping the fullness of the Faith intact."
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    title: "All Devices",
    description: "Available on desktop, iOS & Android"
  }
];

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const router = useRouter();
  const { user, isLoading, hasPlan } = useUser();
  const { setIsSignupModalOpen, setSignupModalInitialStep, setSignupModalInitialEmail, setIsLoginModalOpen } = useModal();

  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-redirect free or subscribed users to home page
  // They never need to see the landing page
  // Admins can view the landing page if they want
  useEffect(() => {
    if (!isLoading) {
      // For non-admins, check hasPlan (admins are excluded from this redirect)
      if (hasPlan && user?.user_type !== 'admin') {
        router.push("/");
      }
    }
  }, [isLoading, hasPlan, user, router]);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Open signup modal with email pre-filled
    setSignupModalInitialEmail(email);
    setSignupModalInitialStep('email');
    setIsSignupModalOpen(true);
  };

  const handleFinishSignup = () => {
    // Open signup modal at plans step
    // Auto-fill email if user is pending (they already registered)
    if (user?.email) {
      setSignupModalInitialEmail(user.email);
    }
    setSignupModalInitialStep('plans');
    setIsSignupModalOpen(true);
  };

  // Check if user has a pending account (signup_status === 'pending')
  // Show "Finish signup" button instead of email form
  const needsToFinishSignup = user && user.signup_status === 'pending';

  return (
    <div className="min-h-screen bg-black text-white bg-pattern" style={{ paddingBottom: isMobile && !isLoading && !needsToFinishSignup ? '140px' : '0' }}>
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-50 p-6 hidden sm:block">
        <div className="max-w-7xl mx-auto flex items-center justify-end">
          {/* Navigation removed - no sign in/up buttons */}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-6">
        {/* Background with blurred content cards */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-black/80">
          <div className="absolute inset-0 opacity-20">
            <div className="grid grid-cols-4 gap-4 p-8 blur-sm">
              {featuredContent.map((item, index) => (
                <div key={item.id} className="aspect-video bg-gray-800 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>

        {/* Hero Content */}
        <div className={`relative z-10 text-center max-w-4xl mx-auto fade-in ${isVisible ? 'visible' : ''}`}>
          <h1 className="hero-title text-5xl md:text-6xl font-serif font-bold mb-6 leading-tight">
            Orthodox Christian Films, Series, and Podcasts
          </h1>
          
          <p className="hero-subtitle text-xl md:text-2xl mb-8 text-gray-300">
            $7 per month | New content added weekly
          </p>

          {/* Email Signup Form or Finish Signup Button */}
          {!isLoading && needsToFinishSignup ? (
            <div className="max-w-md mx-auto">
              <button
                onClick={handleFinishSignup}
                className="btn-primary bg-red-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-red-700 whitespace-nowrap w-full sm:w-auto cursor-pointer"
              >
                Finish signup &gt;
              </button>
            </div>
          ) : !isMobile ? (
            // Desktop: Show email form
            <form onSubmit={handleEmailSubmit} className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email@email.com"
                className="form-input flex-1 px-4 py-3 rounded-lg bg-white text-black placeholder-gray-500 focus:outline-none"
                required
              />
              <button
                type="submit"
                className="btn-primary bg-red-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-red-700 whitespace-nowrap cursor-pointer"
              >
                Free Trial &gt;
              </button>
            </form>
          ) : null}
        </div>
      </section>

      {/* Featured Content Row */}
      <section className="py-16 px-6 bg-gray-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {featuredContent.map((item) => (
              <div
                key={item.id}
                className="content-card group cursor-pointer"
              >
                <div className="aspect-video bg-gray-800 rounded-lg mb-4 overflow-hidden">
                  <div className="w-full h-full image-placeholder bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                    <span className="text-gray-400 text-sm">Thumbnail</span>
                  </div>
                </div>
                <h3 className="text-lg font-serif font-semibold group-hover:text-red-400 transition-colors">
                  {item.title}
                </h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Large Featured Content Section */}
      <section className="py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="relative bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl overflow-hidden">
            {/* Background Image Placeholder */}
            <div className="absolute inset-0 bg-gradient-to-r from-gray-800 via-gray-700 to-gray-600">
              <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-gray-600 to-transparent"></div>
            </div>
            
            {/* Content Overlay */}
            <div className="relative z-10 p-12 md:p-16 max-w-2xl">
              <motion.h2 
                className="text-4xl md:text-5xl font-serif font-bold mb-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              >
                DUST to DUST
              </motion.h2>
              <p className="text-xl text-gray-300 mb-8 leading-relaxed">
                The Wisdom of the Ancient Desert Fathers vibrantly retold in animation.
              </p>
              <button className="btn-primary bg-white text-black px-8 py-3 rounded-full font-semibold hover:bg-gray-200">
                Start Watching &gt;
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-6 bg-gray-900/30">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="text-center">
                <div className="feature-icon w-16 h-16 mx-auto mb-6 text-white flex items-center justify-center">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold mb-4 font-serif">
                  {feature.title}
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 bg-black border-t border-gray-800">
        <div className="max-w-7xl mx-auto text-center text-gray-500">
          <p>&copy; 2024 har.mo.ny. All rights reserved.</p>
        </div>
      </footer>

      {/* Fixed Sign Up and Sign In Buttons - Mobile Only */}
      {isMobile && !isLoading && !needsToFinishSignup && typeof window !== 'undefined' && createPortal(
        <div 
          className="sm:hidden fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-sm border-t border-gray-800 z-50 px-6 py-4"
          style={{ 
            position: 'fixed', 
            bottom: 0, 
            left: 0, 
            right: 0, 
            zIndex: 9999,
            transform: 'translate3d(0, 0, 0)',
            isolation: 'isolate'
          }}
        >
          <div className="max-w-md mx-auto space-y-4">
            <button
              onClick={() => {
                setIsSignupModalOpen(true);
                setSignupModalInitialStep('email');
              }}
              className="w-full bg-red-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-red-700 cursor-pointer"
            >
              Sign Up
            </button>
            <button
              onClick={() => {
                setIsLoginModalOpen(true);
              }}
              className="w-full bg-gray-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-gray-700 cursor-pointer"
            >
              Sign In
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
