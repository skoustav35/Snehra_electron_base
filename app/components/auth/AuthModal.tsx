import React, { useState } from 'react';
import { z } from 'zod';
import { useAuth } from '~/lib/contexts/AuthContext';
import { toast } from '~/components/ui/use-toast';
import * as Dialog from '@radix-ui/react-dialog';

const authSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

export const AuthModal: React.FC<{ isOpen: boolean; onOpenChange: (open: boolean) => void }> = ({
  isOpen,
  onOpenChange,
}) => {
  const { signInWithGoogle, signInWithGithub, loginWithEmail, registerWithEmail } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    try {
      authSchema.parse({ email, password });
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: { email?: string; password?: string } = {};
        error.errors.forEach((e) => {
          if (e.path[0] === 'email') fieldErrors.email = e.message;
          if (e.path[0] === 'password') fieldErrors.password = e.message;
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      if (isLogin) {
        await loginWithEmail(email, password);
      } else {
        await registerWithEmail(email, password);
      }
      onOpenChange(false);
      toast.success(`Successfully ${isLogin ? 'logged in' : 'registered'}.`);
    } catch (err: any) {
      // Toast is already handled in the context, but we can catch to stop loading
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'github') => {
    setLoading(true);
    try {
      if (provider === 'google') await signInWithGoogle();
      if (provider === 'github') await signInWithGithub();
      onOpenChange(false);
    } catch (error) {
      // Handled in context
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity duration-300" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-2xl shadow-2xl p-8 z-50 animate-in fade-in zoom-in-95 duration-200">
          <Dialog.Title className="text-2xl font-bold text-bolt-elements-textPrimary text-center mb-2">
            {isLogin ? 'Welcome Back' : 'Create an Account'}
          </Dialog.Title>
          <Dialog.Description className="text-bolt-elements-textSecondary text-center mb-6">
            Sign in to access your Snehra Multi-Model AI Engine.
          </Dialog.Description>

          <form onSubmit={handleEmailAuth} className="flex flex-col gap-4">
            <div>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg px-4 py-3 text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-button-primary-background transition-all"
              />
              {errors.email && <span className="text-red-500 text-sm mt-1">{errors.email}</span>}
            </div>
            <div>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg px-4 py-3 text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-button-primary-background transition-all"
              />
              {errors.password && <span className="text-red-500 text-sm mt-1">{errors.password}</span>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-bolt-elements-button-primary-background hover:bg-bolt-elements-button-primary-backgroundHover text-bolt-elements-button-primary-text font-semibold py-3 rounded-lg transition-all flex justify-center items-center gap-2 mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                isLogin ? 'Sign In' : 'Sign Up'
              )}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-bolt-elements-borderColor"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-bolt-elements-background-depth-1 text-bolt-elements-textTertiary">Or continue with</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleOAuth('google')}
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor py-2.5 rounded-lg text-bolt-elements-textPrimary font-medium transition-all"
            >
              {/* Google SVG Icon placeholder */}
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google
            </button>
            <button
              onClick={() => handleOAuth('github')}
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor py-2.5 rounded-lg text-bolt-elements-textPrimary font-medium transition-all"
            >
              {/* GitHub SVG Icon placeholder */}
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              GitHub
            </button>
          </div>

          <p className="text-center text-bolt-elements-textSecondary text-sm mt-6">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-bolt-elements-button-primary-background hover:underline font-semibold"
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>

          <Dialog.Close asChild>
            <button className="absolute top-4 right-4 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
