import { Outlet } from "@tanstack/react-router";

function RootRouteView() {
  const appShell = (
    <main>
      <Outlet />
    </main>
  );

  return (
    <div>
      {appShell}
      <span>Theme host</span>
    </div>
  );
}

export { RootRouteView };
