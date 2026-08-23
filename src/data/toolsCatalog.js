import { lazy } from 'react';
import toolsData from './toolsData.json';

// Единый источник данных студии инструментов — toolsData.json (его же читают
// сборочные скрипты для sitemap/шеллов). Здесь к готовым тулам подключаются
// ленивые компоненты. Всё считается в браузере пользователя (client-side).

const READY_COMPONENTS = {
  'image-converter': lazy(() => import('../components/tools/ImageConverter')),
  'color-converter': lazy(() => import('../components/tools/ColorConverter')),
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
