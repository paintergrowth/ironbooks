import * as React from "react"
import { useNavigate, useLocation } from 'react-router-dom'
import { useTheme } from './theme-provider'
import { useAppContext } from '@/contexts/AppContext'
import { 
  LayoutDashboard, 
  Bot, 
  FileText, 
  Plus, 
  Settings, 
  Sun, 
  Moon,
  LogOut
} from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"

// Navigation data
const navMain = [
  { id: 'dashboard', title: 'Dashboard', icon: LayoutDashboard, url: '/dashboard' },
  { id: 'cfo-agent', title: 'CFO Agent', icon: Bot, url: '/cfo' },
  { id: 'reports', title: 'Reports', icon: FileText, url: '/reports' },
  { id: 'add-ons', title: 'Add-Ons', icon: Plus, url: '/add-ons' },
  { id: 'settings', title: 'Settings', icon: Settings, url: '/settings' },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate()
  const location = useLocation()
  const { theme, setTheme } = useTheme()
  const { logout } = useAppContext()

  const handleNavClick = (url: string) => {
    navigate(url)
  }

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <div className="p-2">
          <h1 className="text-xl font-bold">IronBooks</h1>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navMain.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.url
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton 
                      onClick={() => handleNavClick(item.url)}
                      isActive={isActive}
                      className="w-full justify-start"
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="h-4 w-4" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4" />
                  <span>Dark Mode</span>
                </>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} className="text-destructive">
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
