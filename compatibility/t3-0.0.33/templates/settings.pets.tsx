import { createFileRoute } from "@tanstack/react-router";

import { T3PetsSettingsPage } from "../t3code-pets/T3PetsIntegration";

function PetsSettingsRoute() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
      <T3PetsSettingsPage />
    </div>
  );
}

export const Route = createFileRoute("/settings/pets")({
  component: PetsSettingsRoute,
});
