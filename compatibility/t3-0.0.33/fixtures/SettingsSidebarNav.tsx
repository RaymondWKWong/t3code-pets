import { ArchiveIcon, PaletteIcon, Settings2Icon } from "lucide-react";
import type { ComponentType } from "react";

import type { SettingsPath } from "./settingsSearch";

const SETTINGS_SECTION_ICONS: Readonly<
  Record<SettingsPath, ComponentType<{ className?: string }>>
> = {
  "/settings/general": Settings2Icon,
  "/settings/appearance": PaletteIcon,
  "/settings/archived": ArchiveIcon,
};
