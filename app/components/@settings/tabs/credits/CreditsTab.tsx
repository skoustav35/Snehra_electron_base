import { classNames } from '~/utils/classNames';
import { useStore } from '@nanostores/react';
import { profileStore } from '~/lib/stores/profile';
import type { Profile } from '~/components/@settings/core/types';
import { CreditCard, Zap, Check } from 'lucide-react';
import { auth } from '~/lib/firebase/firebase.client';

export default function CreditsTab() {
  const profile = useStore(profileStore) as Profile;

  const creditPackages = [
    { name: 'Starter', credits: 1, price: '$0.50', link: 'https://buy.stripe.com/test_7sY9AV26B9lzdrX9Ap24000', popular: false },
    { name: 'Basic', credits: 5, price: '$2.50', link: 'https://buy.stripe.com/test_5kQ4gB7qV0P3fA57sh24001', popular: false },
    { name: 'Pro', credits: 10, price: '$5.00', link: 'https://buy.stripe.com/test_bJeaEZcLf2Xb73zfYN24002', popular: true },
    { name: 'Advanced', credits: 50, price: '$25.00', link: 'https://buy.stripe.com/test_fZu7sNaD7eFTdrXbIx24003', popular: false },
    { name: 'Power User', credits: 100, price: '$50.00', link: 'https://buy.stripe.com/test_9B614ph1v0P35ZvaEt24004', popular: false },
    { name: 'Enterprise', credits: 1000, price: '$500.00', link: 'https://buy.stripe.com/test_cNiaEZ3aFeFTdrX9Ap24005', popular: false }
  ];

  const handlePurchase = (link: string) => {
    const user = auth.currentUser;
    if (!user) {
      alert("You must be logged in to purchase credits.");
      return;
    }
    const finalLink = `${link}?client_reference_id=${user.uid}`;
    window.open(finalLink, '_blank');
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-purple-500" />
          Credits & Billing
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Manage your AI execution credits. Each AI prompt execution deducts 1 credit.
        </p>
      </div>

      <div className="mb-10 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-2xl p-6 border border-purple-500/20 flex flex-col sm:flex-row items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Available Balance</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Your current execution credits</p>
        </div>
        <div className="mt-4 sm:mt-0 flex items-center gap-3">
          <Zap className="w-8 h-8 text-yellow-500 fill-yellow-500" />
          <span className="text-4xl font-bold text-gray-900 dark:text-white">{profile?.credits || 0}</span>
        </div>
      </div>

      <div className="mb-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Buy Credits</h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Choose a package that fits your needs.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {creditPackages.map((pkg, i) => (
            <div 
              key={i}
              className={classNames(
                'relative flex flex-col p-6 rounded-2xl border transition-all duration-200',
                pkg.popular 
                  ? 'border-purple-500 shadow-lg shadow-purple-500/20 bg-white/50 dark:bg-gray-800/50' 
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-500/50'
              )}
            >
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-purple-500 text-white text-xs font-semibold rounded-full">
                  Most Popular
                </div>
              )}
              
              <div className="mb-4">
                <h4 className="text-lg font-medium text-gray-900 dark:text-white">{pkg.name}</h4>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-gray-900 dark:text-white">{pkg.price}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">USD</span>
                </div>
              </div>
              
              <div className="mb-6 flex-1">
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span><strong className="font-semibold text-gray-900 dark:text-white">{pkg.credits}</strong> Executions</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Never expires</span>
                  </li>
                </ul>
              </div>
              
              <button
                onClick={() => handlePurchase(pkg.link)}
                className={classNames(
                  'w-full py-2.5 px-4 rounded-xl font-medium transition-colors',
                  pkg.popular
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600'
                )}
              >
                Purchase
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
