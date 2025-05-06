import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { BasicDBSDK, DBSchema } from './db';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh: string;
  refresh_token: string;
}

interface UserInfo {
  id: string;
  email: string;
  name: string;
  username: string;
}

interface User {
  id: string;
  email: string;
  username: string;
  name: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  isSignedIn: boolean;
}

interface BasicProviderProps<S extends DBSchema> {
  children: React.ReactNode;
  schema: S;
  project_id: string;
}

interface BasicContextType<S extends DBSchema> extends Omit<AuthState, 'user'> {
  isLoading: boolean;
  login: () => Promise<void>;
  signout: () => Promise<void>;
  db: BasicDBSDK<S>;
  debugAuth: () => Promise<void>;
  user: User | null;
}

const TOKEN_STORAGE_KEY = 'auth_tokens';
const USER_INFO_STORAGE_KEY = 'user_info';
const SDK_VERSION = '0.0.3';

const AuthWebHandler = (config: any) => { 
  const generateRandomState = () => {
    const randomBytes = new Uint8Array(5);
    window.crypto.getRandomValues(randomBytes);
    return Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };
  
  const state = generateRandomState();
  sessionStorage.setItem('basic_oauth_state', state);
  
  return {
    createAuthUrl: () => {
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: config.scheme,
        path: 'oauth/callback'
    });
      const scopeParam = config.scopes ? `&scope=${config.scopes.join(',')}` : '';
      return `${config.authorizationEndpoint}?response_type=code&client_id=${config.clientId}&redirect_uri=${redirectUri}${scopeParam}&state=${state}`;
    }
  }
}


const storageAdapter = {
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        const encryptedValue = btoa(value); // Base64 encoding for simple obfuscation
        localStorage.setItem(key, encryptedValue);
      } catch (error) {
        console.error('Error storing data in localStorage:', error);
      }
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },

  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try {
        const encryptedValue = localStorage.getItem(key);
        if (!encryptedValue) return null;
        return atob(encryptedValue); // Base64 decoding
      } catch (error) {
        console.error('Error retrieving data from localStorage:', error);
        return null;
      }
    } else {
      return await SecureStore.getItemAsync(key);
    }
  },

  deleteItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error('Error removing data from localStorage:', error);
      }
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  }
};

const checkForUpdates = async () => {
  try {
    const response = await fetch('https://registry.npmjs.org/@basictech/expo');
    if (!response.ok) {
      console.warn(`Initializing @basictech/expo - v${SDK_VERSION} - Error checking for updates: ${response.statusText}`);
    }
    const packageInfo = await response.json();
    const latestVersion = packageInfo['dist-tags']?.latest;
    if (latestVersion && latestVersion !== SDK_VERSION) {
      console.warn(`Initializing @basictech/expo - v${SDK_VERSION} - ⚠️  new version available ${latestVersion}, pls update`);
    } else {
      console.log(`Initializing @basictech/expo - v${SDK_VERSION} - (latest ✅) `);
    }
  } catch (error) {
    console.error(`Initializing @basictech/expo - v${SDK_VERSION} - Error checking for updates:`, error);
  }
};

const BasicContext = createContext<BasicContextType<any> | null>(null);

export const useBasic = <S extends DBSchema>() => {
  const context = useContext(BasicContext) as BasicContextType<S> | null;
  if (!context) {
    throw new Error('useBasic must be used within a BasicProvider');
  }
  return context;
};

export const BasicProvider = <S extends DBSchema>({ children, schema, project_id }: BasicProviderProps<S>) => {
  const config = {
    clientId: project_id,
    redirectUri: AuthSession.makeRedirectUri({
      scheme: 'your-app-scheme', // TODO: replace with schema from expo config 
      path: 'oauth/callback'
    }),
    scopes: ['openid', 'profile', 'email'],
    authorizationEndpoint: 'https://api.basic.tech/auth/authorize',
    tokenEndpoint: 'https://api.basic.tech/auth/token',
    userInfoEndpoint: 'https://api.basic.tech/auth/userInfo',
  };

  const decodeJWT = (token: string) => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Error decoding JWT:', error);
      return null;
    }
  };

  const isTokenExpired = (token: string): boolean => {
    const decoded = decodeJWT(token);
    if (!decoded || !decoded.exp) return true;

    const expirationTime = decoded.exp * 1000;
    const currentTime = Date.now();

    return currentTime >= (expirationTime - 5 * 60 * 1000);
  };

  const [authState, setAuthState] = useState<AuthState>({
    accessToken: null,
    refreshToken: null,
    user: null,
    isSignedIn: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  const refreshAccessTokenRef = useRef<(refreshToken: string) => Promise<string>>(async (rt) => "");

  const fetchToken = useCallback(async (): Promise<string> => {
    try {
      const storedTokens = await storageAdapter.getItem(TOKEN_STORAGE_KEY);
      if (!storedTokens) {
        throw new Error('No tokens found - user not signed in');
      }

      const { accessToken, refreshToken } = JSON.parse(storedTokens);

      if (!isTokenExpired(accessToken)) {
        console.log('Valid token found');
        return accessToken;
      }

      console.log('Token expired, attempting refresh...');
      if (!refreshAccessTokenRef.current) {
        throw new Error('refreshAccessToken not initialized');
      }
      const newAccessToken = await refreshAccessTokenRef.current(refreshToken);
      return newAccessToken;
    } catch (error) {
      console.error('Error in fetchToken:', error);
      throw error;
    }
  }, []);

  const signout = useCallback(async () => {
    try {
      await storageAdapter.deleteItem(TOKEN_STORAGE_KEY);
      await storageAdapter.deleteItem(USER_INFO_STORAGE_KEY);
      setAuthState({
        accessToken: null,
        refreshToken: null,
        user: null,
        isSignedIn: false,
      });
    } catch (error) {
      console.error('Error during signout:', error);
    }
  }, []);

  const refreshAccessToken = useCallback(async (refreshToken: string) => {
    try {
      console.log('Attempting to refresh token...');
      const response = await fetch(config.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          code: refreshToken,
          client_id: config.clientId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Refresh token response error:', {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          body: errorText
        });
        throw new Error(`Failed to refresh token: ${errorText}`);
      }

      const tokenData: TokenResponse = await response.json();
      console.log('Successfully refreshed token');
      await storeTokens(tokenData);
      return tokenData.access_token;
    } catch (error: any) {
      console.error('Error refreshing token:', {
        error,
        message: error?.message || 'Unknown error',
        stack: error?.stack,
        type: error?.constructor?.name || 'Unknown error type'
      });
      throw error;
    }
  }, [config.tokenEndpoint, config.clientId]);

  useEffect(() => {
    refreshAccessTokenRef.current = refreshAccessToken;
  }, [refreshAccessToken]);

  const db = useMemo(() => {
    return new BasicDBSDK<S>({
      project_id: schema.project_id,
      getToken: async () => {
        const tok = await fetchToken();

        if (!tok) {
          throw new Error('User not authenticated');
        }
        return tok;
      },
      schema,
    });
  }, [schema, project_id, fetchToken]);

  const storeTokens = async (tokenData: TokenResponse) => {
    await storageAdapter.setItem(
      TOKEN_STORAGE_KEY,
      JSON.stringify({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
      })
    );
  };

  const handleLoginCode = async (code: string) => {
    const tokenResponse = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: config.clientId,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token');
    }

    const tokenData: TokenResponse = await tokenResponse.json();
    await storeTokens(tokenData);

    const userInfoResponse = await fetch(config.userInfoEndpoint, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch user info', {
        cause: userInfoResponse,
      });
    }

    const userInfo: UserInfo = await userInfoResponse.json();
    await storeUserInfo(userInfo);

    setAuthState({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      user: userInfo,
      isSignedIn: true,
    });
  }

  const login = async () => {
    if (Platform.OS === 'web') {
      const url = AuthWebHandler(config).createAuthUrl();
      window.location.href = url;

    } else {
      try {
        const result = await promptAsync();
        if (result.type === 'success') {
          const { code } = result.params;
          
          await handleLoginCode(code);

        }
      } catch (error) {
        console.error('Authentication error:', error);
        await signout();
        throw error;
      }
    }
  };

  const debugAuth = async () => {
    try {
      console.log('=== Auth Debug Information ===');

      console.log('Current Auth State:', {
        isSignedIn: authState.isSignedIn,
        userEmail: authState.user?.email,
        hasAccessToken: !!authState.accessToken,
        hasRefreshToken: !!authState.refreshToken,
      });

      const storedTokens = await storageAdapter.getItem(TOKEN_STORAGE_KEY);
      if (storedTokens) {
        const { accessToken, refreshToken } = JSON.parse(storedTokens);
        console.log('Stored Tokens:', {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
        });

        if (accessToken) {
          const decodedAccess = decodeJWT(accessToken);
          console.log('Access Token Info:', {
            exp: decodedAccess?.exp ? new Date(decodedAccess.exp * 1000).toISOString() : 'N/A',
            isExpired: isTokenExpired(accessToken),
            payload: decodedAccess,
          });
        }

        if (refreshToken) {
          console.log('Refresh Token:', {
            value: refreshToken.substring(0, 10) + '...',
            length: refreshToken.length,
          });
        }
      } else {
        console.log('No stored tokens found');
      }

      const storedUserInfo = await storageAdapter.getItem(USER_INFO_STORAGE_KEY);
      if (storedUserInfo) {
        console.log('Stored User Info:', JSON.parse(storedUserInfo));
      } else {
        console.log('No stored user info found');
      }

      console.log('===========================');
    } catch (error) {
      console.error('Error in debugAuth:', error);
    }
  };

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scopes: config.scopes,
      responseType: AuthSession.ResponseType.Code,
    },
    {
      authorizationEndpoint: config.authorizationEndpoint,
      tokenEndpoint: config.tokenEndpoint,
    }
  );

  useEffect(() => {
    loadStoredAuth();

    if (Platform.OS === 'web') {
      if (window.location.pathname.includes('oauth/callback')) {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const storedState = sessionStorage.getItem('basic_oauth_state');

        if (code && state === storedState) {
          handleLoginCode(code);
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    }
    
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedTokens = await storageAdapter.getItem(TOKEN_STORAGE_KEY);
      const storedUserInfo = await storageAdapter.getItem(USER_INFO_STORAGE_KEY);

      if (storedTokens && storedUserInfo) {
        const { accessToken, refreshToken } = JSON.parse(storedTokens);
        const userInfo = JSON.parse(storedUserInfo);

        if (await verifyToken(accessToken)) {
          setAuthState({
            accessToken,
            refreshToken,
            user: userInfo,
            isSignedIn: true,
          });
        } else {
          await refreshAccessToken(refreshToken);
        }
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const verifyToken = async (token: string): Promise<boolean> => {
    try {
      console.log('Verifying token...');
      const response = await fetch(config.userInfoEndpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Token verification response status:', response.status);
      if (!response.ok) {
        console.log('Token verification failed:', await response.text());
      }
      return response.ok;
    } catch (error) {
      console.error('Token verification error:', error);
      return false;
    }
  };

  const storeUserInfo = async (userInfo: UserInfo) => {
    await storageAdapter.setItem(
      USER_INFO_STORAGE_KEY,
      JSON.stringify(userInfo)
    );
  };

  useEffect(() => {
    checkForUpdates();

    // Show warning on web platform about security
    if (Platform.OS === 'web') {
      console.warn('@basictech/expo - running on web platform - some features may not work as expected');
    }
  }, []);

  return (
    <BasicContext.Provider
      value={{
        ...authState,
        isLoading,
        login,
        signout,
        db: db as BasicDBSDK<S>,
        debugAuth,
      } as BasicContextType<S>}
    >
      {children}
    </BasicContext.Provider>
  );
}; 