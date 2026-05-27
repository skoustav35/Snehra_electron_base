import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import AnimatedBackground from '~/components/ui/AnimatedBackground';
import { useAuth } from '~/lib/contexts/AuthContext';
import { AuthModal } from '~/components/auth/AuthModal';
import { useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

export const meta: MetaFunction = () => {
  return [{ title: 'Snehra OmniForge' }, { name: 'description', content: 'Talk with Snehra OmniForge, by Koustav Sarkar' }];
};

export const loader = () => json({});

const technologies = [
  { name: 'React', icon: 'i-ph:atom-duotone' },
  { name: 'Node.js', icon: 'i-ph:hexagon-duotone' },
  { name: 'Firebase', icon: 'i-ph:fire-duotone' },
  { name: 'Supabase', icon: 'i-ph:database-duotone' },
  { name: 'Vercel', icon: 'i-ph:triangle-duotone' },
  { name: 'Netlify', icon: 'i-ph:globe-hemisphere-west-duotone' },
  { name: 'GitHub', icon: 'i-ph:github-logo-duotone' },
  { name: 'GitLab', icon: 'i-ph:gitlab-logo-simple-duotone' },
];

export default function Index() {
  const { user, loading } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '50%']);

  if (loading) {
    return (
      <div className="flex flex-col h-full w-full items-center justify-center bg-bolt-elements-background-depth-1 relative">
        <AnimatedBackground />
        <div className="w-10 h-10 border-4 border-bolt-elements-borderColor border-t-bolt-elements-button-primary-background rounded-full animate-spin z-10" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1 relative">
        <AnimatedBackground />
        <Header />
        <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1 overflow-x-hidden relative scroll-smooth overflow-y-auto">
      <AnimatedBackground />
      
      {/* Navbar */}
      <div className="w-full flex justify-between items-center px-8 py-6 fixed top-0 z-50 backdrop-blur-md bg-bolt-elements-background-depth-1/50 border-b border-bolt-elements-borderColor">
        <div className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
          Snehra OmniForge
        </div>
        <button
          onClick={() => setAuthModalOpen(true)}
          className="text-bolt-elements-textPrimary hover:text-bolt-elements-button-primary-background transition-colors font-medium px-4 py-2 rounded-lg bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor"
        >
          Sign In
        </button>
      </div>

      <main className="flex-1 flex flex-col z-10 w-full pt-20">
        
        {/* Hero Section */}
        <section className="min-h-[90vh] flex flex-col items-center justify-center p-8 text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-bolt-elements-textPrimary to-bolt-elements-textTertiary mb-6 tracking-tight drop-shadow-sm leading-tight">
              Snehra <br /> OmniForge
            </h1>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <p className="text-xl md:text-3xl text-bolt-elements-textSecondary max-w-4xl mb-12 leading-relaxed">
              Your infinite cloud-native workspace. Experience hyper-secure zero-trust architecture paired with a built-in virtual execution engine.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            <button
              onClick={() => setAuthModalOpen(true)}
              className="group relative px-10 py-5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-full font-bold text-xl transition-all hover:scale-105 shadow-[0_0_40px_rgba(124,58,237,0.3)] hover:shadow-[0_0_60px_rgba(124,58,237,0.5)]"
            >
              <span className="relative flex items-center gap-3 z-10">
                Start Building Infinite Universes
                <div className="i-ph:rocket-duotone w-6 h-6 group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
          </motion.div>
        </section>

        {/* Infinite Marquee Section */}
        <section className="py-12 w-full overflow-hidden border-y border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/30 backdrop-blur-sm">
          <div className="relative flex overflow-x-hidden">
            <div className="animate-marquee whitespace-nowrap flex items-center gap-16 py-4 px-8">
              {[...technologies, ...technologies, ...technologies].map((tech, i) => (
                <div key={`${tech.name}-${i}`} className="flex items-center gap-3 text-2xl font-semibold text-bolt-elements-textSecondary/50 hover:text-bolt-elements-textPrimary transition-colors">
                  <div className={`${tech.icon} w-8 h-8`} />
                  <span>{tech.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Deep Dive 1: Zero Trust Security */}
        <section className="min-h-screen flex items-center justify-center p-8 lg:p-24 w-full">
          <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8 }}
            >
              <h2 className="text-5xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-amber-500">
                Absolute Zero-Trust Security
              </h2>
              <p className="text-2xl text-bolt-elements-textSecondary leading-relaxed mb-8">
                Your keys never leave your encrypted Firestore shard. We employ a strict Zero-Local-Storage architecture, ensuring absolute isolation between users on the platform. Sleep peacefully knowing your enterprise tokens are safe.
              </p>
              <ul className="space-y-4">
                {['Database-per-user isolation', 'No cookies or localStorage caching', 'Server-side injected ephemeral tokens'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-lg text-bolt-elements-textPrimary">
                    <div className="i-ph:check-circle-duotone w-6 h-6 text-green-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative w-full aspect-square rounded-3xl overflow-hidden border border-bolt-elements-borderColor shadow-2xl shadow-red-500/10"
            >
              <img src="/images/security_dashboard.png" alt="Security Dashboard" className="object-cover w-full h-full hover:scale-105 transition-transform duration-1000" />
            </motion.div>
          </div>
        </section>

        {/* Deep Dive 2: GitHub Direct */}
        <section className="min-h-screen flex items-center justify-center p-8 lg:p-24 w-full bg-bolt-elements-background-depth-2/30 backdrop-blur-md border-y border-bolt-elements-borderColor">
          <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8 }}
              className="relative w-full aspect-square rounded-3xl overflow-hidden border border-bolt-elements-borderColor shadow-2xl shadow-purple-500/10 order-2 lg:order-1"
            >
              <img src="/images/github_direct_editor.png" alt="GitHub Editor" className="object-cover w-full h-full hover:scale-105 transition-transform duration-1000" />
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="order-1 lg:order-2"
            >
              <h2 className="text-5xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-purple-500 to-blue-500">
                Direct 2-Way VFS Sync
              </h2>
              <p className="text-2xl text-bolt-elements-textSecondary leading-relaxed mb-8">
                Say goodbye to clunky, massive repository clones. Snehra OmniForge utilizes an ultra-fast Virtual File System (VFS) to directly read, manipulate, and push to GitHub and GitLab branches in milliseconds.
              </p>
              <button className="px-6 py-3 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-xl text-lg font-medium hover:bg-bolt-elements-background-depth-4 transition-colors">
                Explore the VFS Engine
              </button>
            </motion.div>
          </div>
        </section>

        {/* Deep Dive 3: Execution Environment */}
        <section className="min-h-screen flex items-center justify-center p-8 lg:p-24 w-full">
          <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8 }}
            >
              <h2 className="text-5xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-emerald-400">
                Live Cloud Execution
              </h2>
              <p className="text-2xl text-bolt-elements-textSecondary leading-relaxed mb-8">
                Your browser is now a full-stack Linux server. Compile Node.js, Python, and Go instantly using deeply integrated WebContainers. Preview your full-stack app before deploying directly to Vercel or Netlify.
              </p>
              <div className="flex gap-4">
                <div className="px-6 py-4 bg-black/40 border border-bolt-elements-borderColor rounded-xl text-center">
                  <div className="text-3xl font-bold text-emerald-400">0.1s</div>
                  <div className="text-sm text-bolt-elements-textSecondary">Boot Time</div>
                </div>
                <div className="px-6 py-4 bg-black/40 border border-bolt-elements-borderColor rounded-xl text-center">
                  <div className="text-3xl font-bold text-cyan-400">100%</div>
                  <div className="text-sm text-bolt-elements-textSecondary">In-Browser</div>
                </div>
              </div>
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative w-full aspect-[4/3] rounded-3xl overflow-hidden border border-bolt-elements-borderColor shadow-2xl shadow-cyan-500/10"
            >
              <img src="/images/cloud_execution.png" alt="Cloud Execution" className="object-cover w-full h-full hover:scale-105 transition-transform duration-1000" />
            </motion.div>
          </div>
        </section>

        {/* Pricing / Credit System */}
        <section className="py-32 px-8 max-w-7xl mx-auto w-full text-center relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-900/10 to-transparent -z-10 blur-3xl" />
          <h2 className="text-5xl font-bold mb-6">Transparent Credit Pricing</h2>
          <p className="text-xl text-bolt-elements-textSecondary max-w-2xl mx-auto mb-16">
            No massive monthly subscriptions. Pay precisely for the compute and AI generation you actually use.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { name: 'Starter', price: '$0.00', desc: 'Get started for free', features: ['Local Models', 'Basic VFS', 'Community Support'] },
              { name: 'Developer', price: '$0.50', desc: 'Per 100 AI Executions', features: ['Premium AI Models', 'GitHub 2-Way Sync', 'Stripe Auto-Topup', 'Priority Support'], popular: true },
              { name: 'Enterprise', price: 'Custom', desc: 'For heavy workloads', features: ['Dedicated Shard', 'Unlimited Sync', 'White-glove SLA'] }
            ].map((tier, i) => (
              <div key={i} className={`p-8 rounded-3xl border ${tier.popular ? 'border-purple-500 bg-purple-900/10 scale-105 shadow-[0_0_30px_rgba(168,85,247,0.15)]' : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2'}`}>
                {tier.popular && <div className="text-purple-400 font-bold tracking-wider text-sm mb-4 uppercase">Most Popular</div>}
                <h3 className="text-3xl font-bold mb-2">{tier.name}</h3>
                <div className="text-4xl font-black mb-2">{tier.price}</div>
                <div className="text-bolt-elements-textSecondary mb-8">{tier.desc}</div>
                <ul className="space-y-4 text-left">
                  {tier.features.map((feat, j) => (
                    <li key={j} className="flex items-center gap-3">
                      <div className="i-ph:check-bold w-5 h-5 text-purple-400" />
                      {feat}
                    </li>
                  ))}
                </ul>
                <button className={`w-full mt-8 py-4 rounded-xl font-bold transition-all ${tier.popular ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4'}`}>
                  Select {tier.name}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Footer / Founder Section */}
        <footer className="mt-auto py-20 px-8 border-t border-bolt-elements-borderColor bg-black/50 backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px]" />
          
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 relative z-10">
            <div className="flex flex-col gap-6">
              <span className="text-4xl font-bold text-bolt-elements-textPrimary bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
                Snehra OmniForge
              </span>
              <p className="text-lg text-bolt-elements-textSecondary max-w-md">
                The ultimate agentic IDE designed to shatter the limitations of standard web development environments.
              </p>
              <div className="text-bolt-elements-textTertiary mt-8">
                &copy; {new Date().getFullYear()} Snehra. All rights reserved.
              </div>
            </div>
            
            <div className="flex flex-col md:items-end justify-center gap-6">
              <div className="text-xl text-bolt-elements-textSecondary">
                Built with precision by <strong className="text-bolt-elements-textPrimary font-bold text-2xl ml-1">Koustav Sarkar</strong>
              </div>
              <div className="flex flex-col gap-2 p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-all backdrop-blur-sm group cursor-pointer w-full max-w-sm">
                <div className="text-sm text-bolt-elements-textTertiary uppercase tracking-wider font-bold mb-1">Founder Contact</div>
                <a 
                  href="mailto:skoustav35@gmail.com" 
                  className="flex items-center justify-between gap-4 w-full"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <div className="i-ph:envelope-simple-fill w-6 h-6 text-white" />
                    </div>
                    <span className="font-semibold text-lg text-bolt-elements-textPrimary group-hover:text-purple-400 transition-colors tracking-wide">
                      skoustav35@gmail.com
                    </span>
                  </div>
                  <div className="i-ph:arrow-up-right w-5 h-5 text-bolt-elements-textTertiary group-hover:text-white transition-colors" />
                </a>
              </div>
            </div>
          </div>
        </footer>
      </main>

      <AuthModal isOpen={authModalOpen} onOpenChange={setAuthModalOpen} />
    </div>
  );
}
