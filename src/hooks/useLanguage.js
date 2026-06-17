import { useEffect, useState } from 'react';
import siteConfig from '../data/siteConfig';

const STORAGE_KEY = 'portfolio-language';

function getInitialLanguage() {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'ru' || saved === 'en') {
    return saved;
  }

  const browserLanguage = window.navigator.language.toLowerCase();
  if (browserLanguage.startsWith('ru')) {
    return 'ru';
  }

  return siteConfig.defaultLanguage || 'ru';
}

export function useLanguage() {
  const [language, setLanguage] = useState(getInitialLanguage);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  return {
    language,
    setLanguage,
  };
}
