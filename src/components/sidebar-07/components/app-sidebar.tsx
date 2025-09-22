"use client"

import * as React from "react"
import {
  LayoutDashboard,
  Bot,
  MessageSquare,
  FileText,
  Plus,
  Settings,
} from "lucide-react"
import { useAppContext } from '@/contexts/AppContext'

import { NavMain } from "@/components/sidebar-07/components/nav-main"
import { NavUser } from "@/components/sidebar-07/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

// Navigation data matching original sidebar
const navItems = [
  { id: 'dashboard', title: 'Dashboard', icon: LayoutDashboard, url: '/dashboard' },
  { id: 'cfo-agent', title: 'CFO Agent', icon: Bot, url: '/cfo' },
  { id: 'ai-accountant', title: 'AI Accountant', icon: MessageSquare, url: '/ai-accountant' },
  { id: 'reports', title: 'Reports', icon: FileText, url: '/reports' },
  { id: 'add-ons', title: 'Add-Ons', icon: Plus, url: '/add-ons' },
  { id: 'settings', title: 'Settings', icon: Settings, url: '/settings' },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAppContext()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center px-4 py-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
          {/* Light mode logo when expanded */}
          <img
            src="https://quaeeqgobujsukemkrze.supabase.co/storage/v1/object/public/assets/img/logo-dark-text.png"
            alt="IronBooks"
            className="h-8 w-auto dark:hidden group-data-[collapsible=icon]:hidden"
          />
          {/* Dark mode logo when expanded */}
          <img
            src="https://quaeeqgobujsukemkrze.supabase.co/storage/v1/object/public/assets/img/LOGO-2.png"
            alt="IronBooks"
            className="h-8 w-auto hidden dark:block group-data-[collapsible=icon]:hidden"
          />
          {/* Favicon when collapsed - preserve aspect ratio */}
          <img
            src="https://quaeeqgobujsukemkrze.supabase.co/storage/v1/object/public/assets/img/faviconV2%20(1).png"
            alt="IronBooks"
            className="h-7 w-auto max-w-7 shrink-0 object-contain hidden group-data-[collapsible=icon]:block"
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter className="p-4">
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
