import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import NotFound from "./pages/NotFound.tsx";
import { AuthProvider } from "./contexts/AuthContext";
import AppLayout from "./components/app/AppLayout";
import Recebimento from "./pages/app/Recebimento";
import Workflow from "./pages/app/Workflow";
import Conferencia from "./pages/app/Conferencia";
import Divergencias from "./pages/app/Divergencias";
import ProcessosConferidos from "./pages/app/ProcessosConferidos";
import VisaoDetalhada from "./pages/app/VisaoDetalhada";
import Configuracoes from "./pages/app/Configuracoes";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<Recebimento />} />
              <Route path="workflow" element={<Workflow />} />
              <Route path="conferencia" element={<Conferencia />} />
              
              <Route path="divergencias" element={<Divergencias />} />
              <Route path="historico" element={<ProcessosConferidos />} />
              <Route path="processos-conferidos" element={<ProcessosConferidos />} />
              <Route path="visao-detalhada" element={<VisaoDetalhada />} />
              <Route path="historico-devolucoes" element={<ProcessosConferidos />} />
              <Route path="configuracoes" element={<Configuracoes />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
