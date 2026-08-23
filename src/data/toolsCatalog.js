import { lazy } from 'react';
import toolsData from './toolsData.json';

// Единый источник данных студии инструментов — toolsData.json (его же читают
// сборочные скрипты для sitemap/шеллов). Здесь к готовым тулам подключаются
// ленивые компоненты. Всё считается в браузере пользователя (client-side).

const READY_COMPONENTS = {
  'image-converter': lazy(() => import('../components/tools/ImageConverter')),
  'color-converter': lazy(() => import('../components/tools/ColorConverter')),
  'contrast-checker': lazy(() => import('../components/tools/ContrastChecker')),
  'palette-extractor': lazy(() => import('../components/tools/PaletteExtractor')),
  'colorblind-simulator': lazy(() => import('../components/tools/ColorblindSimulator')),
  'noise-generator': lazy(() => import('../components/tools/NoiseGenerator')),
  'break-timer': lazy(() => import('../components/tools/BreakTimer')),
  watermark: lazy(() => import('../components/tools/Watermark')),
  'svg-cleaner': lazy(() => import('../components/tools/SvgCleaner')),
  'design-challenge': lazy(() => import('../components/tools/DesignChallenge')),
  'color-harmony': lazy(() => import('../components/tools/ColorHarmony')),
  'gradient-generator': lazy(() => import('../components/tools/GradientGenerator')),
  'favicon-generator': lazy(() => import('../components/tools/FaviconGenerator')),
  'qr-generator': lazy(() => import('../components/tools/QrTool')),
  'barcode-generator': lazy(() => import('../components/tools/Barcode')),
  'voronoi-generator': lazy(() => import('../components/tools/VoronoiBackground')),
  'color-weight': lazy(() => import('../components/tools/ColorWeight')),
  'rule-of-thirds': lazy(() => import('../components/tools/RuleOfThirds')),
  'icon-scaler': lazy(() => import('../components/tools/IconScaler')),
  'eink-simulator': lazy(() => import('../components/tools/EinkSimulator')),
  'pastel-pairs': lazy(() => import('../components/tools/PastelPairs')),
  'karma-counter': lazy(() => import('../components/tools/KarmaCounter')),
  'background-remover': lazy(() => import('../components/tools/BackgroundRemover')),
};

export const TOOL_CATEGORIES = toolsData.categories;

export const TOOLS = toolsData.tools.map((tool) => ({
  ...tool,
  // Тул считается готовым только если для него реально есть компонент.
  status: tool.status === 'ready' && READY_COMPONENTS[tool.slug] ? 'ready' : (tool.status === 'ready' ? 'soon' : tool.status),
  component: READY_COMPONENTS[tool.slug] || null,
}));

export function getToolBySlug(slug) {
  return TOOLS.find((tool) => tool.slug === slug) || null;
}

export function getToolsByCategory(categoryId) {
  return TOOLS.filter((tool) => tool.categoryId === categoryId);
}
