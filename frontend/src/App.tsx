import { RouterProvider } from '@tanstack/react-router';
import { router } from '@/apps/panel/router';

export default function App() {
  return <RouterProvider router={router} />;
}
