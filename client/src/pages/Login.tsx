import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Calendar, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

export default function Login() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (user) return <Redirect to="/" />;

  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4">
      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-indigo-200/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-violet-200/20 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white/70 backdrop-blur-2xl p-8 md:p-12 text-center space-y-8 border border-white/50 rounded-[2.5rem] shadow-2xl shadow-indigo-500/10"
      >
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-20 h-20 bg-[#625df5] rounded-3xl rotate-3 shadow-lg shadow-indigo-500/40 flex items-center justify-center">
              <Calendar className="w-12 h-12 text-white" />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-emerald-400 rounded-full flex items-center justify-center shadow-md animate-bounce">
              <span className="text-xs font-bold">New!</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
            MyCal
          </h1>
          <p className="text-muted-foreground text-lg">
            Organize your life with style. 
            <br />
            Simple, beautiful, and shared.
          </p>
        </div>

        <div className="space-y-4 pt-4">
          <Button 
            onClick={handleLogin}
            className="w-full h-14 text-lg font-semibold rounded-full bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <img src="https://authjs.dev/img/providers/google.svg" alt="Google" className="w-5 h-5 mr-3" />
            Continue with Google
          </Button>

          <div className="grid grid-cols-2 gap-3 text-left pt-4">
             <FeatureItem text="Fast Sync" />
             <FeatureItem text="Shared Views" />
             <FeatureItem text="Beautiful Themes" />
             <FeatureItem text="Any Device" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-600">
      <CheckCircle2 className="w-4 h-4 text-indigo-500" />
      <span>{text}</span>
    </div>
  );
}
