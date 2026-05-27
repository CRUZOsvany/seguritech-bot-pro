import { Outlet, createRootRoute } from '@tanstack/react-router';

export const rootRoute = createRootRoute({
  component: () => (
    <main className="flex-1">
      <Outlet />
    </main>
  ),
});
