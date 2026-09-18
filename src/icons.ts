// Default site icons from assets/icons/. Replace those files to change the brand mark.
import appleTouchIcon from '../assets/icons/apple-touch-icon.png';
import favicon32 from '../assets/icons/favicon-32.png';
import faviconIco from '../assets/icons/favicon.ico';
import faviconSvg from '../assets/icons/favicon.svg';
import icon512 from '../assets/icons/icon-512.png';

export type SiteIcon = {
	body: BodyInit;
	contentType: string;
};

const SITE_ICONS: Record<string, SiteIcon> = {
	'/apple-touch-icon.png': { body: appleTouchIcon, contentType: 'image/png' },
	'/favicon-32.png': { body: favicon32, contentType: 'image/png' },
	'/favicon.ico': { body: faviconIco, contentType: 'image/x-icon' },
	'/favicon.svg': { body: faviconSvg, contentType: 'image/svg+xml; charset=utf-8' },
	'/icon-512.png': { body: icon512, contentType: 'image/png' },
};

const PUBLIC_CACHE = 'public, max-age=31536000';

export function getSiteIcon(pathname: string): SiteIcon | null {
	return SITE_ICONS[pathname] ?? null;
}

export function isSiteIconPath(pathname: string): boolean {
	return Object.hasOwn(SITE_ICONS, pathname);
}

export function siteIconResponse(icon: SiteIcon): Response {
	return new Response(icon.body, {
		headers: {
			'content-type': icon.contentType,
			'cache-control': PUBLIC_CACHE,
			'x-content-type-options': 'nosniff',
		},
	});
}
