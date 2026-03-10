"use client";

import { useUser } from "../../contexts/user-context";

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export default function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  const { user } = useUser();
  const isAdmin = user?.user_type === 'admin';
  const isStaff = user?.user_type === 'staff';

  const allSections = [
    { id: "overview", label: "Overview", adminOnly: true, staffAllowed: false },
    { id: "users", label: "Users", adminOnly: true, staffAllowed: false },
    { id: "carousel", label: "Carousel", adminOnly: false, staffAllowed: false },
    { id: "content", label: "Home", adminOnly: false, staffAllowed: false },
    { id: "landing", label: "Landing", adminOnly: false, staffAllowed: false },
    { id: "content-list", label: "Content", adminOnly: false, staffAllowed: true },
    { id: "daily-content", label: "Daily Content", adminOnly: false, staffAllowed: false },
    { id: "bug-reports", label: "Bug Reports", adminOnly: true, staffAllowed: false }
  ];

  // Filter sections based on user role
  const sections = allSections.filter(section => {
    if (section.adminOnly && !isAdmin) {
      return false; // Hide admin-only sections from staff
    }
    if (isStaff && !section.staffAllowed) {
      return false; // Hide non-staff-allowed sections from staff
    }
    return true;
  });

  return (
    <div className="w-64 bg-[#121212] border-r border-gray-800 pt-16">
      <div className="p-6">
        <nav className="space-y-2">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => onSectionChange(section.id)}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                activeSection === section.id
                  ? "bg-[#242424] text-white border-l-4 border-white"
                  : "text-gray-400 hover:text-white hover:bg-[#1a1a1a]"
              }`}
            >
              {section.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
