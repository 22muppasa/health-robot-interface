import { FamilyCallerDashboard } from '@/components/FamilyCallerDashboard';
import { ResponsiveLayout } from '@/components/ResponsiveLayout';

export default function FamilyCallPage() {
  return (
    <ResponsiveLayout
      headerTitle="Family Portal"
      showHeader={false}
      showFooter={false}
    >
      <FamilyCallerDashboard />
    </ResponsiveLayout>
  );
}
