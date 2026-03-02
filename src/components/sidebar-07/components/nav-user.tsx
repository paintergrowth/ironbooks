"use client"

import { LogOut, Sun, Moon, HelpCircle } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { useAppContext } from "@/contexts/AppContext"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavUser() {
  const { theme, setTheme } = useTheme()
  const { logout } = useAppContext()

  const isDark = theme === "dark"

  return (
    <SidebarMenu>
      {/* Theme Toggle */}
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="w-full justify-start text-base h-10 group-data-[collapsible=icon]:justify-center"
          tooltip={isDark ? "Light Mode" : "Dark Mode"}
        >
          {isDark ? (
            <>
              <Sun className="h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">
                Light Mode
              </span>
            </>
          ) : (
            <>
              <Moon className="h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">
                Dark Mode
              </span>
            </>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>

      {/* Help Button */}
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => {
            window.location.href = "mailto:admin@ironbooks.com"
          }}
          className="w-full justify-start text-base h-10 group-data-[collapsible=icon]:justify-center"
          tooltip="Help"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="group-data-[collapsible=icon]:hidden">Help</span>
        </SidebarMenuButton>
      </SidebarMenuItem>

      {/* Logout */}
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={logout}
          className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 text-base h-10 group-data-[collapsible=icon]:justify-center"
          tooltip="Log out"
        >
          <LogOut className="h-4 w-4" />
          <span className="group-data-[collapsible=icon]:hidden">Log out</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
