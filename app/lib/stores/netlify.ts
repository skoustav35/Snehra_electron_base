import { atom } from 'nanostores';
import type { NetlifyConnection, NetlifyUser } from '~/types/netlify';
import { logStore } from './logs';
import { toast } from 'react-toastify';

import { auth } from '~/lib/firebase/firebase.client';
import { SettingsRepository } from '~/lib/firebase/repositories/settingsRepository';

// Auto-connect using environment variable
const envToken = import.meta.env.VITE_NETLIFY_ACCESS_TOKEN;
console.log('Netlify store: envToken loaded:', envToken ? '[TOKEN_EXISTS]' : '[NO_TOKEN]');

// Initial state
const initialConnection: NetlifyConnection = {
  user: null,
  token: envToken || '',
  stats: undefined,
};

// Listen to Auth State to initialize secure connection
if (typeof window !== 'undefined') {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      try {
        const savedConnection = await SettingsRepository.getConnection(user.uid, 'netlify');
        if (savedConnection && (savedConnection.user || savedConnection.token)) {
          netlifyConnection.set(savedConnection);
        } else if (envToken) {
          // Fallback to env token
          netlifyConnection.set({ user: null, token: envToken, stats: undefined });
        }
      } catch (error) {
        console.error('Error initializing Netlify connection from Firestore:', error);
      }
    } else {
      // Clear legacy storage
      localStorage.removeItem('netlify_connection');
      netlifyConnection.set({ user: null, token: envToken || '', stats: undefined });
    }
  });
}

export const netlifyConnection = atom<NetlifyConnection>(initialConnection);
export const isConnecting = atom<boolean>(false);
export const isFetchingStats = atom<boolean>(false);

// Function to initialize Netlify connection with environment token
export async function initializeNetlifyConnection() {
  const currentState = netlifyConnection.get();

  // If we already have a connection or no token, don't try to connect
  if (currentState.user || !envToken) {
    console.log('Netlify: Skipping auto-connect - user exists or no env token');
    return;
  }

  console.log('Netlify: Attempting auto-connection with env token');

  try {
    isConnecting.set(true);

    const response = await fetch('https://api.netlify.com/api/v1/user', {
      headers: {
        Authorization: `Bearer ${envToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to connect to Netlify: ${response.statusText}`);
    }

    const userData = await response.json();

    // Update the connection state
    const connectionData: Partial<NetlifyConnection> = {
      user: userData as NetlifyUser,
      token: envToken,
    };

    // Securely update the store (which handles persistence)
    updateNetlifyConnection(connectionData);

    // Update the store
    updateNetlifyConnection(connectionData);

    // Fetch initial stats
    await fetchNetlifyStats(envToken);
  } catch (error) {
    console.error('Error initializing Netlify connection:', error);
    logStore.logError('Failed to initialize Netlify connection', { error });
  } finally {
    isConnecting.set(false);
  }
}

export const updateNetlifyConnection = (updates: Partial<NetlifyConnection>) => {
  const currentState = netlifyConnection.get();
  const newState = { ...currentState, ...updates };
  netlifyConnection.set(newState);

  // Persist to Firestore if authenticated
  const user = auth.currentUser;
  if (user) {
    SettingsRepository.setConnection(user.uid, 'netlify', newState).catch((err) =>
      console.error('Failed to securely save Netlify connection:', err)
    );
  }

  // Clear legacy localStorage
  if (typeof window !== 'undefined') {
    localStorage.removeItem('netlify_connection');
  }
};

export async function fetchNetlifyStats(token: string) {
  try {
    isFetchingStats.set(true);

    const sitesResponse = await fetch('https://api.netlify.com/api/v1/sites', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!sitesResponse.ok) {
      throw new Error(`Failed to fetch sites: ${sitesResponse.status}`);
    }

    const sites = (await sitesResponse.json()) as any;

    const currentState = netlifyConnection.get();
    updateNetlifyConnection({
      ...currentState,
      stats: {
        sites,
        totalSites: sites.length,
      },
    });
  } catch (error) {
    console.error('Netlify API Error:', error);
    logStore.logError('Failed to fetch Netlify stats', { error });
    toast.error('Failed to fetch Netlify statistics');
  } finally {
    isFetchingStats.set(false);
  }
}
