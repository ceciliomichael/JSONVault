"use client";

import {
  Check,
  ChevronDown,
  Clock,
  FileText,
  FlaskConical,
  LogOut,
  Settings,
  UserCircle,
} from "lucide-react";
import { useTheme } from "next-themes";
import { logoutAction } from "@/app/logout/actions";
import { Dropdown, DropdownDivider, DropdownItem } from "./ui";

export default function ProfileMenu({
  align = "right",
  direction = "down",
  userEmail = "",
  userName = "",
}: {
  align?: "left" | "right";
  direction?: "down" | "up";
  userEmail?: string;
  userName?: string;
}) {
  const { theme, setTheme } = useTheme();
  const email = userEmail.trim();
  const displayName = userName.trim() || nameFromEmail(email);
  const displayEmail = email || "No email available";

  return (
    <Dropdown
      align={align}
      direction={direction}
      trigger={
        <button
          type="button"
          aria-label="Open profile menu"
          className="w-8 h-8 rounded-full border border-zinc-200 dark:border-white/10 bg-[#f6eee8] dark:bg-zinc-800 text-[#c18f77] dark:text-zinc-300 flex items-center justify-center hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
        >
          <UserCircle size={18} />
        </button>
      }
    >
      <div className="w-[320px]">
        <div className="px-4 py-3">
          <div className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">
            {displayName}
          </div>
          <div className="mt-1 truncate text-[13px] text-zinc-500">
            {displayEmail}
          </div>
        </div>
        <DropdownDivider />
        <DropdownItem icon={Settings}>Account preferences</DropdownItem>
        <DropdownItem icon={FlaskConical}>Feature previews</DropdownItem>
        <DropdownItem icon={FileText}>Changelog</DropdownItem>
        <DropdownDivider />
        <div className="px-4 py-2 text-[12px] font-medium text-zinc-500">
          Theme
        </div>
        {[
          ["dark", "Dark"],
          ["light", "Light"],
          ["system", "System"],
        ].map(([mode, label]) => (
          <DropdownItem key={mode} onClick={() => setTheme(mode)}>
            <div className="flex items-center justify-between w-full pl-4">
              <span>{label}</span>
              {theme === mode && <Check size={14} className="text-zinc-700" />}
            </div>
          </DropdownItem>
        ))}
        <DropdownDivider />
        <DropdownItem icon={Clock}>
          <div className="flex items-center justify-between w-full">
            <div>
              <div>Timezone</div>
              <div className="text-[12px] text-zinc-500">
                Auto (Asia/Manila)
              </div>
            </div>
            <ChevronDown size={14} className="-rotate-90" />
          </div>
        </DropdownItem>
        <DropdownDivider />
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <LogOut size={14} />
            Log out
          </button>
        </form>
      </div>
    </Dropdown>
  );
}

function nameFromEmail(email: string): string {
  const localPart = email.split("@")[0]?.trim();
  return localPart || "Workspace User";
}
