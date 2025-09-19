import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { CategoriesProvider } from '@/contexts/categories-context';
import { ToastProvider } from '@/contexts/toast-context';
import { Toaster } from '@/components/ui/toast';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <CategoriesProvider>
        <DashboardLayout>{children}</DashboardLayout>
        <Toaster />
      </CategoriesProvider>
    </ToastProvider>
  );
}