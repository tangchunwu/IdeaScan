import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhTranslation from './locales/zh.json';
import enTranslation from './locales/en.json';

const resources = {
        zh: {
                translation: zhTranslation,
        },
        en: {
                translation: enTranslation,
        },
};

i18n
        .use(LanguageDetector)
        .use(initReactI18next)
        .init({
                resources,
                fallbackLng: 'zh',
                interpolation: {
                        escapeValue: false,
                },
                detection: {
                        order: ['localStorage', 'navigator', 'htmlTag'],
                        caches: ['localStorage'],
                },
        });

export default i18n;
