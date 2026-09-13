import { RouterProvider } from '@tanstack/react-router';
import { router } from '@/apps/panel/router';
import { Toaster } from '@/shared/ui/sonner';

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      {/* Uno solo para todo el panel. Los toasts se disparan desde los hooks
          de mutación (onSuccess/onError), no desde los componentes. */}
      <Toaster />
    </>
  );
}
