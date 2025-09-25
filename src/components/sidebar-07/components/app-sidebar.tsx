// src/components/sidebar-07/components/app-sidebar.tsx
import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarHeader,
} from "../../ui/sidebar";

import {
  LayoutDashboard,
  Bot,
  Brain,
  FileBarChart2,
  Puzzle,
  Settings as SettingsIcon,
  Shield,
} from "lucide-react";

/**
 * NOTE:
 * - This sidebar ALWAYS shows "CFO Agent" for all users (moved out of any admin-only gating).
 * - Admin panel remains optionally gated by a lightweight check so we don't change your current behavior.
 *   If you want to hard-hide Admin, just set `const isAdmin = false`.
 */

export function AppSidebar() {
  const location = useLocation();

  // If you already centralize admin in context/store, replace this with your real check.
  // Keeping a soft gate so we don't break existing expectations.
  const isAdmin =
    typeof window !== "undefined" &&
    (window.localStorage.getItem("adminMode") === "true" ||
      window.localStorage.getItem("isAdmin") === "1");

  const workspaceItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    // ✅ CFO Agent is visible to EVERYONE
    { title: "CFO Agent", url: "/cfo", icon: Bot },
    { title: "AI Accountant", url: "/ai-accountant", icon: Brain },
    { title: "Reports", url: "/reports", icon: FileBarChart2 },
    { title: "Add-Ons", url: "/add-ons", icon: Puzzle },
    { title: "Settings", url: "/settings", icon: SettingsIcon },
  ];

  const adminItems = [
    { title: "Admin Panel", url: "/admin-panel", icon: Shield },
  ];

  const isActive = (url: string) =>
    location.pathname === url ||
    (url !== "/dashboard" && location.pathname.startsWith(url));

  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-2">
        <div className="text-sm font-semibold tracking-wide">IronBooks</div>
        <div className="text-xs text-muted-foreground">Workspace</div>
      </SidebarHeader>

      <SidebarContent>

        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarMenu>
            {workspaceItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.url);
              return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={active}>
                    <NavLink to={item.url}>
                      <Icon className="mr-2 h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarMenu>
              {adminItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active}>
                      <NavLink to={item.url}>
                        <Icon className="mr-2 h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="px-3 py-2 text-xs text-muted-foreground">
        © {new Date().getFullYear()} IronBooks
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
