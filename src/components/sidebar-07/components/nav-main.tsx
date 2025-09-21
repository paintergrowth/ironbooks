"use client"

import { type LucideIcon } from "lucide-react"
import { useNavigate, useLocation } from 'react-router-dom'

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon: LucideIcon
    id: string
  }[]
}) {
  const navigate = useNavigate()
  const location = useLocation()

  const handleNavClick = (url: string) => {
    navigate(url)
  }

  return (
    <SidebarGroup>
      <SidebarMenu className="space-y-2">
        {items.map((item) => {
          const isActive = location.pathname === item.url
          return (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton 
                tooltip={item.title}
                onClick={() => handleNavClick(item.url)}
                isActive={isActive}
                className="text-base h-10"
              >
                <item.icon className="h-5 w-5" />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
