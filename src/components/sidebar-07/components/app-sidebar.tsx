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
import { supabase } from '@/lib/supabase'

import { NavMain } from "@/components/sidebar-07/components/nav-main"
import { NavUser } from "@/components/sidebar-07/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

type NavItem = { id: string; title: string; icon: any; url: string }

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAppContext()

  const [isAdmin, setIsAdmin] = React.useState(false)
  const [checked, setChecked] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false

    async function checkAdmin() {
      // 1) fast checks from auth metadata (covers most setups)
      const fromAppMeta =
        (user as any)?.app_metadata?.roles?.includes?.('admin') ||
        (user as any)?.app_metadata?.role === 'admin'
      const fromUserMeta =
        (user as any)?.user_metadata?.role === 'admin' ||
        (user as any)?.user_metadata?.is_admin === true

      if (fromAppMeta || fromUserMeta) {
        if (!cancelled) {
          setIsAdmin(true)
          setChecked(true)
        }
        return
      }

      // 2) fallback: check profiles table (role or is_admin)
      try {
        if (!user?.id) {
          setChecked(true)
          return
        }
        const { data, error } = await supabase
          .from('profiles')
          .select('role,is_admin')
          .eq('id', user.id)
          .single()

        if (!cancelled) {
          if (error) {
            console.warn('[AppSidebar] profiles read failed:', error.message)
            setIsAdmin(false)
          } else {
            const dbAdmin = data?.role === 'admin' || data?.is_admin === true
            setIsAdmin(dbAdmin)
          }
          setChecked(true)
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('[AppSidebar] admin check error:', e)
          setIsAdmin(false)
          setChecked(true)
        }
      }
    }

    checkAdmin()
    return () => { cancelled = true }
  }, [user?.id])

  // Build menu; insert CFO only for admins
  const items: NavItem[] = React.useMemo(() => {
    const base: NavItem[] = [
      { id: 'dashboard',     title: 'Dashboard',     icon: LayoutDashboard, url: '/dashboard' },
      // CFO Agent (admin only) — keep id 'cfo-agent' to match AppLayout's activeSection logic
      ...(isAdmin ? [{ id: 'cfo-agent', title: 'CFO Agent', icon: Bot, url: '/cfo' } as NavItem] : []),
      { id: 'ai-accountant', title: 'AI Accountant', icon: MessageSquare,   url: '/ai-accountant' },
      { id: 'reports',       title: 'Reports',       icon: FileText,        url: '/reports' },
      { id: 'add-ons',       title: 'Add-Ons',       icon: Plus,            url: '/add-ons' },
      { id: 'settings',      title: 'Settings',      icon: Settings,        url: '/settings' },
    ]
    return base
  }, [isAdmin])

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
          {/* Favicon when collapsed */}
          <img
            src="https://quaeeqgobujsukemkrze.supabase.co/storage/v1/object/public/assets/img/faviconV2%20(1).png"
            alt="IronBooks"
            className="h-7 w-auto max-w-7 shrink-0 object-contain hidden group-data-[collapsible=icon]:block"
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Avoid flicker: wait until the admin check runs once */}
        {checked ? <NavMain items={items} /> : null}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
