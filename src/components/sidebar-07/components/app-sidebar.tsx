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
const SHOW_CFO_AGENT = false;
type NavItem = { id: string; title: string; icon: any; url: string }

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAppContext()

  // exactly mirror Settings.tsx logic
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [checked, setChecked] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        // pull auth user (Settings does this first)
        const { data: { user: authedUser } } = await supabase.auth.getUser()
        if (!authedUser) {
          if (!cancelled) {
            setIsAdmin(false)
            setChecked(true)
          }
          return
        }

        // read profiles.role with maybeSingle (same as Settings)
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authedUser.id)
          .maybeSingle()

        if (cancelled) return

        if (error) {
          console.warn('[AppSidebar] profiles read failed:', error.message)
          setIsAdmin(false)
        } else {
          const adminFlag = data?.role === 'admin'
          // Debug (optional):
          // console.log('[AppSidebar] profiles.role =', data?.role, '→ isAdmin =', adminFlag)
          setIsAdmin(adminFlag)
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('[AppSidebar] admin check error:', e)
          setIsAdmin(false)
        }
      } finally {
        if (!cancelled) setChecked(true)
      }
    })()

    return () => { cancelled = true }
  }, [user?.id])

  // Build menu; CFO Agent only when admin (id stays 'cfo-agent' to match AppLayout mapping)
  const items: NavItem[] = React.useMemo(() => {
    const base: NavItem[] = [
      { id: 'dashboard',     title: 'Dashboard',     icon: LayoutDashboard, url: '/dashboard' },
      ...(isAdmin && SHOW_CFO_AGENT ? [{ id: 'cfo-agent', title: 'CFO Agent', icon: Bot, url: '/cfo' } as NavItem] : []),
      { id: 'ai-accountant', title: 'AI Accountant', icon: MessageSquare,   url: '/ai-accountant' },
      { id: 'reports',       title: 'Reports',       icon: FileText,        url: '/reports' },
      { id: 'add-ons',       title: 'Packages',       icon: Plus,            url: '/add-ons' },
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
        {/* avoid flicker until we know admin status (same pattern you used) */}
        {checked ? <NavMain items={items} /> : null}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
