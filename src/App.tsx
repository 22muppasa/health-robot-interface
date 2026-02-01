import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import SettingsPage from "./pages/Settings";
import UnifiedDashboardPage from "./pages/UnifiedDashboard"
import FamilyLogin from "./pages/FamilyLogin";
import FamilyPortal from "./pages/FamilyPortal";
import FamilyCallPage from "./pages/FamilyCall";
import SpeechTest from "./pages/SpeechTest";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Patient Robot Interface - Main screen on robot */}
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<UnifiedDashboardPage />} />
          
          {/* Family Portal - Remote access for family members */}
          <Route path="/family" element={<FamilyLogin />} />
          <Route path="/family/dashboard" element={<FamilyPortal />} />
          <Route path="/family-call" element={<FamilyCallPage />} />
          
          {/* Settings */}
          <Route path="/settings" element={<SettingsPage />} />
          
          {/* Diagnostic/Test Pages */}
          <Route path="/test/speech" element={<SpeechTest />} />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

