import { TRANSLATIONS, COLOR_NAMES, JAPANESE_WORDS } from './translations.js';
import { isSupportedLanguage, languageFromLocale } from './language-options.js';
export { SUPPORTED_LANGUAGES } from './language-options.js';
export const LANGUAGE_STORAGE_KEY = 'iroate.language.v1';

function safeStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function translate(source, parameters = {}, language = 'ja') {
  const catalog = Object.hasOwn(TRANSLATIONS, language) ? TRANSLATIONS[language] : TRANSLATIONS.en;
  const message = Object.hasOwn(catalog, source) ? catalog[source] : source;
  return message.replace(/\{(\d+)\}/gu, (placeholder, key) => (
    Object.hasOwn(parameters, key) ? String(parameters[key]) : placeholder
  ));
}

export function colorName(id, language = 'ja', word = false) {
  if (word && language === 'ja') return JAPANESE_WORDS[id] ?? id;
  const catalog = Object.hasOwn(COLOR_NAMES, language) ? COLOR_NAMES[language] : COLOR_NAMES.en;
  return (Object.hasOwn(catalog, id) ? catalog[id] : null) ?? COLOR_NAMES.en[id] ?? id;
}

function browserLanguage(navigatorObject) {
  const languages = Array.isArray(navigatorObject?.languages) ? navigatorObject.languages : [];
  const preferences = [...languages, navigatorObject?.language].filter(v => typeof v === 'string' && v.trim());
  for (const locale of preferences) {
    const language = languageFromLocale(locale);
    if (language) return language;
  }
  return preferences.length ? 'en' : 'ja';
}

export function createI18n({storage = safeStorage(), navigatorObject = globalThis.window?.navigator} = {}) {
  let language = browserLanguage(navigatorObject);
  try {
    const saved = storage?.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(saved)) language = saved;
  } catch { /* Storage restrictions do not prevent play. */ }
  return Object.freeze({
    getLanguage: () => language,
    setLanguage(next) {
      if (!isSupportedLanguage(next)) return;
      language = next;
      try { storage?.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* Session preference still applies. */ }
    },
    t: (source, parameters) => translate(source, parameters, language)
  });
}

const i18n = createI18n();
export const {getLanguage, setLanguage, t} = i18n;
const parametersByElement = new WeakMap();
const originalAttributes = new WeakMap();

// Remember message IDs and parameters, so result/status text also changes language.
export function setTranslatedText(element, source, parameters = {}) {
  if (source === '') {
    element.removeAttribute('data-i18n');
    parametersByElement.delete(element);
    element.textContent = '';
    return;
  }
  element.setAttribute('data-i18n', source);
  parametersByElement.set(element, parameters);
  element.textContent = t(source, parameters);
}

export function applyTranslations(root = globalThis.document) {
  for (const element of root.querySelectorAll('[data-i18n], [data-i18n-attrs]')) {
    if (element.hasAttribute('data-i18n')) {
      const source = element.getAttribute('data-i18n') || element.textContent.trim();
      element.setAttribute('data-i18n', source);
      element.textContent = t(source, parametersByElement.get(element));
    }
    let attributes = originalAttributes.get(element);
    if (!attributes) {
      attributes = {};
      for (const name of (element.getAttribute('data-i18n-attrs') || '').split(/\s+/u).filter(Boolean)) attributes[name] = element.getAttribute(name);
      originalAttributes.set(element, attributes);
    }
    for (const [name, source] of Object.entries(attributes)) element.setAttribute(name, t(source));
  }
  if (root.documentElement) root.documentElement.lang = getLanguage();
}
