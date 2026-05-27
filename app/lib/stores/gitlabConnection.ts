import { atom, computed } from 'nanostores';
import Cookies from 'js-cookie';
import { logStore } from '~/lib/stores/logs';
import { GitLabApiService } from '~/lib/services/gitlabApiService';
import { calculateStatsSummary } from '~/utils/gitlabStats';
import type { GitLabConnection, GitLabStats } from '~/types/GitLab';
import { auth } from '~/lib/firebase/firebase.client';
import { SettingsRepository } from '~/lib/firebase/repositories/settingsRepository';

// Auto-connect using environment variable
const envToken = import.meta.env?.VITE_GITLAB_ACCESS_TOKEN;

const gitlabConnectionAtom = atom<GitLabConnection>({
  user: null,
  token: envToken || '',
  tokenType: 'personal-access-token',
});

const gitlabUrlAtom = atom('https://gitlab.com');

// Initialize connection from Firestore on startup
async function initializeConnection() {
  try {
    const user = auth.currentUser;
    if (!user) {
      localStorage.removeItem('gitlab_connection');
      Cookies.remove('gitlabUsername');
      Cookies.remove('gitlabToken');
      Cookies.remove('git:gitlab.com');
      Cookies.remove('gitlabUrl');
      return;
    }

    const savedConnection = await SettingsRepository.getConnection(user.uid, 'gitlab');

    if (savedConnection) {
      savedConnection.tokenType = 'personal-access-token';

      if (savedConnection.gitlabUrl) {
        gitlabUrlAtom.set(savedConnection.gitlabUrl);
      }

      // Only set if we have a valid user
      if (savedConnection.user) {
        gitlabConnectionAtom.set(savedConnection);
      }
    }
  } catch (error) {
    console.error('Error initializing GitLab connection:', error);
  }
}

// Listen to Auth State to initialize secure connection
if (typeof window !== 'undefined') {
  auth.onAuthStateChanged((user) => {
    if (user) {
      initializeConnection();
    } else {
      gitlabConnectionAtom.set({ user: null, token: envToken || '', tokenType: 'personal-access-token' });
    }
  });
}

// Computed store for checking if connected
export const isGitLabConnected = computed(gitlabConnectionAtom, (connection) => !!connection.user);

// Computed store for current connection
export const gitlabConnection = computed(gitlabConnectionAtom, (connection) => connection);

// Computed store for current user
export const gitlabUser = computed(gitlabConnectionAtom, (connection) => connection.user);

// Computed store for current stats
export const gitlabStats = computed(gitlabConnectionAtom, (connection) => connection.stats);

// Computed store for current URL
export const gitlabUrl = computed(gitlabUrlAtom, (url) => url);

class GitLabConnectionStore {
  async connect(token: string, gitlabUrl = 'https://gitlab.com') {
    try {
      const apiService = new GitLabApiService(token, gitlabUrl);

      // Test connection by fetching user
      const user = await apiService.getUser();

      // Update state
      gitlabConnectionAtom.set({
        user,
        token,
        tokenType: 'personal-access-token',
        gitlabUrl,
      });

      const connectionData = {
        user,
        token,
        tokenType: 'personal-access-token',
        gitlabUrl,
      };

      // Clean up legacy cookies
      Cookies.remove('gitlabUsername');
      Cookies.remove('gitlabToken');
      Cookies.remove('git:gitlab.com');
      Cookies.remove('gitlabUrl');
      localStorage.removeItem('gitlab_connection');

      // Securely store connection details in Firestore
      const currentUser = auth.currentUser;
      if (currentUser) {
        await SettingsRepository.setConnection(currentUser.uid, 'gitlab', connectionData);
      } else {
        throw new Error('Must be logged in to connect GitLab securely.');
      }

      logStore.logInfo('Connected to GitLab', {
        type: 'system',
        message: `Connected to GitLab as ${user.username}`,
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to connect to GitLab:', error);

      logStore.logError(`GitLab authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        type: 'system',
        message: 'GitLab authentication failed',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async fetchStats(_forceRefresh = false) {
    const connection = gitlabConnectionAtom.get();

    if (!connection.user || !connection.token) {
      throw new Error('Not connected to GitLab');
    }

    try {
      const apiService = new GitLabApiService(connection.token, connection.gitlabUrl || 'https://gitlab.com');

      // Fetch user data
      const userData = await apiService.getUser();

      // Fetch projects
      const projects = await apiService.getProjects();

      // Fetch events
      const events = await apiService.getEvents();

      // Fetch groups
      const groups = await apiService.getGroups();

      // Fetch snippets
      const snippets = await apiService.getSnippets();

      // Calculate stats
      const stats: GitLabStats = calculateStatsSummary(projects, events, groups, snippets, userData);

      // Update connection with stats
      const updatedConnection = {
        ...connection,
        stats,
      };
      gitlabConnectionAtom.set(updatedConnection);

      // Securely update Firestore
      const currentUser = auth.currentUser;
      if (currentUser) {
        await SettingsRepository.setConnection(currentUser.uid, 'gitlab', updatedConnection);
      }

      return { success: true, stats };
    } catch (error) {
      console.error('Error fetching GitLab stats:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async disconnect() {
    // Remove legacy cookies
    Cookies.remove('gitlabToken');
    Cookies.remove('gitlabUsername');
    Cookies.remove('git:gitlab.com');
    Cookies.remove('gitlabUrl');
    localStorage.removeItem('gitlab_connection');

    // Securely clear connection from Firestore
    const currentUser = auth.currentUser;
    if (currentUser) {
      await SettingsRepository.setConnection(currentUser.uid, 'gitlab', null);
    }

    // Reset state
    gitlabConnectionAtom.set({
      user: null,
      token: '',
      tokenType: 'personal-access-token',
    });

    logStore.logInfo('Disconnected from GitLab', {
      type: 'system',
      message: 'Disconnected from GitLab',
    });
  }

  async loadSavedConnection() {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return null;

      const savedConnection = await SettingsRepository.getConnection(currentUser.uid, 'gitlab');

      if (savedConnection) {
        savedConnection.tokenType = 'personal-access-token';

        // Set GitLab URL if saved
        if (savedConnection.gitlabUrl) {
          gitlabUrlAtom.set(savedConnection.gitlabUrl);
        }

        // Set connection
        gitlabConnectionAtom.set(savedConnection);

        return savedConnection;
      }
    } catch (error) {
      console.error('Error parsing saved GitLab connection from Firestore:', error);
    }

    return null;
  }

  setGitLabUrl(url: string) {
    gitlabUrlAtom.set(url);
  }

  setToken(token: string) {
    gitlabConnectionAtom.set({
      ...gitlabConnectionAtom.get(),
      token,
    });
  }

  // Auto-connect using environment token
  async autoConnect() {
    // Check if token exists and is not empty
    if (!envToken || envToken.trim() === '') {
      return { success: false, error: 'No GitLab token found in environment' };
    }

    try {
      const apiService = new GitLabApiService(envToken);
      const user = await apiService.getUser();

      const connectionData = {
        user,
        token: envToken,
        tokenType: 'personal-access-token',
        gitlabUrl: 'https://gitlab.com',
      };

      // Clean up legacy cookies
      Cookies.remove('gitlabUsername');
      Cookies.remove('gitlabToken');
      Cookies.remove('git:gitlab.com');
      Cookies.remove('gitlabUrl');
      localStorage.removeItem('gitlab_connection');

      // Securely store connection details in Firestore
      const currentUser = auth.currentUser;
      if (currentUser) {
        await SettingsRepository.setConnection(currentUser.uid, 'gitlab', connectionData);
      }

      // Update state
      gitlabConnectionAtom.set(connectionData as any);

      logStore.logInfo('Auto-connected to GitLab', {
        type: 'system',
        message: `Auto-connected to GitLab as ${user.username}`,
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to auto-connect to GitLab:', error);

      // Log more detailed error information
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('GitLab auto-connect error details:', {
        token: envToken.substring(0, 10) + '...', // Log first 10 chars for debugging
        error: errorMessage,
      });

      logStore.logError(`GitLab auto-connection failed: ${errorMessage}`, {
        type: 'system',
        message: 'GitLab auto-connection failed',
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

export const gitlabConnectionStore = new GitLabConnectionStore();

// Export hooks for React components
export function useGitLabConnection() {
  return {
    connection: gitlabConnection,
    isConnected: isGitLabConnected,
    user: gitlabUser,
    stats: gitlabStats,
    gitlabUrl,
    connect: gitlabConnectionStore.connect.bind(gitlabConnectionStore),
    disconnect: gitlabConnectionStore.disconnect.bind(gitlabConnectionStore),
    fetchStats: gitlabConnectionStore.fetchStats.bind(gitlabConnectionStore),
    loadSavedConnection: gitlabConnectionStore.loadSavedConnection.bind(gitlabConnectionStore),
    setGitLabUrl: gitlabConnectionStore.setGitLabUrl.bind(gitlabConnectionStore),
    setToken: gitlabConnectionStore.setToken.bind(gitlabConnectionStore),
    autoConnect: gitlabConnectionStore.autoConnect.bind(gitlabConnectionStore),
  };
}
