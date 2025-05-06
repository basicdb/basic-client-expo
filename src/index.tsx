import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
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
      scheme: 'your-app-scheme',
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
  const [db, setDb] = useState<BasicDBSDK<S>>(
    new BasicDBSDK<S>({
      project_id: schema.project_id,
      token: 'dummy-initial-token',
      schema,
    })
  );

  const signout = useCallback(async () => {
    try {
      await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
      await SecureStore.deleteItemAsync(USER_INFO_STORAGE_KEY);
      setAuthState({
        accessToken: null,
        refreshToken: null,
        user: null,
        isSignedIn: false,
      });
      setDb(new BasicDBSDK<S>({
         project_id: schema.project_id,
         token: 'logged-out-token',
         schema
      }));
    } catch (error) {
      console.error('Error during signout:', error);
    }
  }, [schema]);

  const storeTokens = async (tokenData: TokenResponse) => {
    await SecureStore.setItemAsync(
      TOKEN_STORAGE_KEY,
      JSON.stringify({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
      })
    );
  };
  
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
      await signout();
      throw error;
    }
  }, [config.tokenEndpoint, config.clientId, signout]);

  const fetchToken = useCallback(async (): Promise<string> => {
    try {
      const storedTokens = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
      if (!storedTokens) {
        throw new Error('No stored tokens found');
      }

      const { accessToken, refreshToken } = JSON.parse(storedTokens);
      
      if (!isTokenExpired(accessToken)) {
        console.log('Current token is still valid');
        return accessToken;
      }

      console.log('Token expired, attempting refresh...');
      const newAccessToken = await refreshAccessToken(refreshToken);
      return newAccessToken;
    } catch (error) {
      console.error('Error in fetchToken:', error);
      await signout();
      throw error;
    }
  }, [refreshAccessToken, signout]);

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
    const updateDbToken = async () => {
      if (!authState.isSignedIn) return;
      try {
        console.log('Attempting to fetch token for DB update...');
        const token = await fetchToken();
        console.log('Updating DB with new token:', {
          tokenLength: token.length,
          tokenPreview: token.substring(0, 10) + '...'
        });
        setDb(
          new BasicDBSDK<S>({
            project_id: schema.project_id,
            token,
            schema,
          })
        );
      } catch (error: any) {
        console.error('Failed to update DB token due to token fetch/refresh error.');
      }
    };

    updateDbToken();
  }, [authState.isSignedIn, schema, fetchToken]);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedTokens = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
      const storedUserInfo = await SecureStore.getItemAsync(USER_INFO_STORAGE_KEY);
      
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
    await SecureStore.setItemAsync(
      USER_INFO_STORAGE_KEY,
      JSON.stringify(userInfo)
    );
  };

  const login = async () => {
    try {
      const result = await promptAsync();
      if (result.type === 'success') {
        const { code } = result.params;
        
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
    } catch (error) {
      console.error('Authentication error:', error);
      await signout();
      throw error;
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

      const storedTokens = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
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

      const storedUserInfo = await SecureStore.getItemAsync(USER_INFO_STORAGE_KEY);
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

  return (
    <BasicContext.Provider
      value={{
        ...authState,
        isLoading,
        login,
        signout,
        db,
        debugAuth,
      } as BasicContextType<S>}
    >
      {children}
    </BasicContext.Provider>
  );
}; 