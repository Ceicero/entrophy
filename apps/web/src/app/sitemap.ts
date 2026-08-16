import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/site';
import { allPluginExports } from '../lib/commands';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ['', '/features', '/enforcer', '/donate', '/privacy', '/terms'].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
  }));

  const pluginRoutes = allPluginExports().map((plugin) => ({
    url: `${SITE_URL}/features/${plugin.id}`,
    lastModified: new Date(),
  }));

  return [...staticRoutes, ...pluginRoutes];
}
