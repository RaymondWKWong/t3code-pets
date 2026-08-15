export type SettingsPath =
  "/settings/general" | "/settings/appearance" | "/settings/archived";

export const SETTINGS_SECTION_LABELS: Readonly<Record<SettingsPath, string>> = {
  "/settings/general": "General",
  "/settings/appearance": "Appearance",
  "/settings/archived": "Archive",
};
