import { motion } from 'framer-motion';

export default function AnimatedBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
      <div className="absolute inset-0 bg-bolt-elements-background-depth-1" />
      
      {/* Orb 1 */}
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full blur-[120px] bg-blue-600/20"
        animate={{
          x: ['-25%', '25%', '-25%'],
          y: ['-25%', '25%', '-25%'],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "linear"
        }}
        style={{ top: '10%', left: '10%' }}
      />

      {/* Orb 2 */}
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full blur-[100px] bg-purple-600/20"
        animate={{
          x: ['25%', '-25%', '25%'],
          y: ['25%', '-25%', '25%'],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "linear"
        }}
        style={{ top: '40%', right: '10%' }}
      />

      {/* Orb 3 */}
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full blur-[90px] bg-cyan-600/20"
        animate={{
          x: ['-30%', '30%', '-30%'],
          y: ['30%', '-30%', '30%'],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "linear"
        }}
        style={{ bottom: '10%', left: '30%' }}
      />

      {/* Optional: Add a subtle grid overlay for a "tech" feel */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.03]" />
    </div>
  );
}
