export const RESTART_NOTICE =
  "Restart T3 Code before opening it. If a Vite error overlay is already visible, stop the T3 dev process, start it again, then hard-refresh the page.";

export function withRestartNotice(
  message: string,
  restartRequired: boolean,
): string {
  if (!restartRequired || message.includes(RESTART_NOTICE)) return message;
  return `${message}\n\n${RESTART_NOTICE}`;
}
