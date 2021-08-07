import { makeRedirectUri, revokeAsync, startAsync } from 'expo-auth-session';
import React, { useEffect, createContext, useContext, useState, ReactNode } from 'react';
import { generateRandom } from 'expo-auth-session/build/PKCE';

import { api } from '../services/api';

interface User {
  id: number;
  display_name: string;
  email: string;
  profile_image_url: string;
}

interface AuthContextData {
  user: User;
  isLoggingOut: boolean;
  isLoggingIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

interface AuthProviderData {
  children: ReactNode;
}

const AuthContext = createContext({} as AuthContextData);

const twitchEndpoints = {
  authorization: 'https://id.twitch.tv/oauth2/authorize',
  revocation: 'https://id.twitch.tv/oauth2/revoke'
};

function AuthProvider({ children }: AuthProviderData) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [user, setUser] = useState({} as User);
  const [userToken, setUserToken] = useState('');

  // get CLIENT_ID from environment variables
  const { CLIENT_ID } = process.env

  async function signIn() {
    try {
      setIsLoggingIn(true)

      // REDIRECT_URI - create OAuth redirect URI using makeRedirectUri() with "useProxy" option set to true
      // RESPONSE_TYPE - set to "token"
      // SCOPE - create a space-separated list of the following scopes: "openid", "user:read:email" and "user:read:follows"
      // FORCE_VERIFY - set to true
      // STATE - generate random 30-length string using generateRandom() with "size" set to 30
      // assemble authUrl with twitchEndpoint authorization, client_id, 
      // redirect_uri, response_type, scope, force_verify and state

      const myState = generateRandom(30) // process.env.STATE

      const authUrl = twitchEndpoints.authorization + 
        `?client_id=${ CLIENT_ID }` + 
        `&redirect_uri=${ process.env.REDIRECT_URI }` + 
        `&response_type=${ process.env.RESPONSE_TYPE }` + 
        `&scope=${ encodeURI(process.env.SCOPE as string) }` + 
        `&force_verify=${ process.env.FORCE_VERIFY }` +
        `&state=${ myState }`;

      // call startAsync with authUrl
      const response = await startAsync({ authUrl })

      // verify if startAsync response.type equals "success" and response.params.error differs from "access_denied"
      if (response.type === "success" && response.params.error !== "access_denied") {

        // verify if startAsync response.params.state differs from STATE
        if (response.params.state !== myState) {
          throw new Error("Invalid state value")
        }

        // add access_token to request's authorization header
        api.defaults.headers.authorization = `Bearer ${response.params.access_token}`;

        // call Twitch API's users route
        const userResponse = await api.get('/users');
        
        const myUser: User = {          
          id: Number(userResponse.data.data[0].id),
          display_name: userResponse.data.data[0].display_name,
          email: userResponse.data.data[0].email,
          profile_image_url: userResponse.data.data[0].profile_image_url
        }

        // set user state with response from Twitch API's route "/users"
        setUser(myUser)

        // set userToken state with response's access_token from startAsync
        setUserToken(response.params.access_token)
      }

    } catch (error) {
        throw new Error;

    } finally {
      // set isLoggingIn to false
      setIsLoggingIn(false)
    }
  }

  async function signOut() {
    try {
      // set isLoggingOut to true
      setIsLoggingIn(true)

      // call revokeAsync with access_token, client_id and twitchEndpoint revocation
      revokeAsync(
        { token: userToken, clientId: CLIENT_ID }, 
        { revocationEndpoint: twitchEndpoints.revocation }
      )

    } catch (error) {
    } finally {
      // set user state to an empty User object
      setUser({} as User)

      // set userToken state to an empty string
      setUserToken('')

      // remove "access_token" from request's authorization header
      delete api.defaults.headers.authorization;
      
      // set isLoggingOut to false
      setIsLoggingIn(false)
    }
  }

  useEffect(() => {
    // add client_id to request's "Client-Id" header
    api.defaults.headers['Client-Id'] = process.env.CLIENT_ID
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoggingOut, isLoggingIn, signIn, signOut }}>
      { children }
    </AuthContext.Provider>
  )
}

function useAuth() {
  const context = useContext(AuthContext);

  return context;
}

export { AuthProvider, useAuth };
