import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { darkTheme, lightTheme, type ThemeTokens } from '../../constants/theme';

const STORAGE_KEY = 'claimio_theme_mode';

type ThemeMode = 'light' | 'dark';

type ThemeContextType = {
  mode: ThemeMode;
  tokens: ThemeTokens;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
  isLoaded: boolean;
};

const ThemeContext = createContext<ThemeContextType>({
  mode:        'light',
  tokens:      lightTheme,
  toggleTheme: () => {},
  setTheme:    () => {},
  isLoaded:    false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode]       = useState<ThemeMode>('light');
  const [isLoaded, setLoaded] = useState(false);

  // check asyncstorage on startup so the theme is right from the first render
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark') setMode(stored);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const toggleTheme = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const setTheme = useCallback((newMode: ThemeMode) => {
    setMode(newMode);
    AsyncStorage.setItem(STORAGE_KEY, newMode).catch(() => {});
  }, []);

  const tokens = mode === 'light' ? lightTheme : darkTheme;

  return (
    <ThemeContext.Provider value={{ mode, tokens, toggleTheme, setTheme, isLoaded }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  return useContext(ThemeContext);
}

// expo router needs a default export from every file in app/
export default ThemeProvider;
