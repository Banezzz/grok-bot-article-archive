export const LANG_COOKIE = 'archive_lang';
export type Locale = 'zh' | 'en';

export type MessageKey = keyof typeof ZH;

const ZH = {
	siteTitle: '文章归档',
	signInTitle: '登录 · 文章归档',
	setupTitle: '初始化 · 文章归档',
	setupCompleteTitle: '初始化完成 · 文章归档',
	settingsTitle: '设置 · 文章归档',
	usersTitle: '用户 · 文章归档',
	foldersTitle: '文件夹 · 文章归档',
	notFoundTitle: '未找到 · 文章归档',
	signInHeading: '文章归档',
	signInLead: '使用用户名和密码登录。',
	signIn: '登录',
	signOut: '退出',
	username: '用户名',
	password: '密码',
	confirmPassword: '确认密码',
	createFirstAdmin: '创建第一个管理员账号',
	setupHeading: '创建首位管理员',
	setupLead: '还没有账号。此用户将接管现有文章，之后可以添加其他人。',
	createAdmin: '创建管理员',
	setupCompleteHeading: '管理员已就绪',
	setupCompleteLead: '已登录为 {user}。已将 {n} 篇现有文章划归此账号。',
	copyTokenOnce: '请立即复制上传令牌。它只会显示一次。',
	setupTokenHint: '在 POST /api/upload 时使用 Authorization: Bearer …。之后可在设置中轮换。',
	goToArchive: '进入归档',
	users: '用户',
	folders: '文件夹',
	settings: '设置',
	adminBadge: '管理员',
	searchPlaceholder: '搜索标题、摘要、作者、来源或标签',
	searchAria: '搜索文章',
	search: '搜索',
	tagsAria: '标签',
	foldersAria: '文件夹',
	allTags: '全部',
	allFolders: '全部文件夹',
	starred: '星标',
	star: '加星',
	unstar: '取消星标',
	starAria: '切换星标',
	noArticles: '还没有文章。',
	noArticlesTagged: '没有带“{tag}”标签的文章。',
	noArticlesMatch: '没有匹配“{q}”的文章。',
	noFolderArticles: '这个文件夹里还没有文章。',
	noStarredArticles: '还没有加星的文章。',
	noStarredInFolder: '这个文件夹里没有加星的文章。',
	articleOne: '1 篇文章',
	articleMany: '{n} 篇文章',
	folderOne: '1 个文件夹',
	folderMany: '{n} 个文件夹',
	yours: '仅自己的',
	matching: '匹配“{q}”',
	inTag: '标签 {tag}',
	inFolderName: '文件夹 {folder}',
	starredNote: '已加星',
	everyone: '全部',
	mine: '我的',
	addToFolders: '加入文件夹',
	saveFolders: '保存文件夹',
	createFirstFolder: '先去创建文件夹。',
	noFolders: '还没有文件夹。',
	source: '原文',
	backArchive: '← 归档',
	downloadHtml: '下载 HTML',
	settingsHeading: '设置',
	settingsLead: '上传令牌用于把文章记到你的名下。',
	currentPrefix: '当前前缀：',
	none: '无',
	rotateToken: '轮换上传令牌',
	copyTokenAgain: '请立即复制此令牌。之后不会再显示。',
	foldersHeading: '文件夹',
	foldersLead: '手动创建文件夹，一篇文章可以放进多个文件夹。文件夹和星标只属于你。',
	createFolder: '新建文件夹',
	folderName: '名称',
	rename: '重命名',
	save: '保存',
	moveUp: '上移',
	moveDown: '下移',
	openFolder: '查看文章',
	usersHeading: '用户',
	usersLead: '创建账号并轮换上传令牌。令牌只显示一次。',
	tokenForUser: '{user} 的上传令牌 — 请立即复制。',
	role: '角色',
	roleUser: '普通用户',
	roleAdmin: '管理员',
	addUser: '添加用户',
	tokenPrefix: '令牌前缀',
	created: '创建时间',
	you: '（你）',
	promote: '设为管理员',
	demote: '取消管理员',
	delete: '删除',
	rotateTokenShort: '轮换令牌',
	notFound: '归档中没有这篇文章。',
	backToList: '返回列表',
	langZh: '中文',
	langEn: 'EN',
	langToggle: '界面语言',
	invalidCredentials: '用户名或密码不正确。',
	passwordsMismatch: '两次输入的密码不一致。',
	secretMissing: '未配置 SITE_ACCESS_SECRET。',
	usernameInvalid: '用户名为 3–32 个字符，仅限字母、数字、点、下划线或连字符。',
	passwordLength: '密码长度须为 8–200 个字符。',
	usernameTaken: '该用户名已被占用。',
	lastAdminDemote: '不能取消最后一位管理员。',
	lastAdminDelete: '不能删除最后一位管理员。',
	userNotFound: '找不到该用户。',
	invalidRole: '角色无效。',
	folderNameRequired: '请填写文件夹名称。',
	folderNameTooLong: '文件夹名称过长。',
	folderNameTaken: '已有同名文件夹。',
	folderNotFound: '找不到该文件夹。',
} as const;

const EN: Record<MessageKey, string> = {
	siteTitle: 'Article archive',
	signInTitle: 'Sign in · Article archive',
	setupTitle: 'Setup · Article archive',
	setupCompleteTitle: 'Setup complete · Article archive',
	settingsTitle: 'Settings · Article archive',
	usersTitle: 'Users · Article archive',
	foldersTitle: 'Folders · Article archive',
	notFoundTitle: 'Not found · Article archive',
	signInHeading: 'Article archive',
	signInLead: 'Sign in with your username and password.',
	signIn: 'Sign in',
	signOut: 'Sign out',
	username: 'Username',
	password: 'Password',
	confirmPassword: 'Confirm password',
	createFirstAdmin: 'Create the first admin account',
	setupHeading: 'Create the first admin',
	setupLead: 'No accounts exist yet. This user will own existing articles and can add other people later.',
	createAdmin: 'Create admin',
	setupCompleteHeading: 'Admin ready',
	setupCompleteLead: 'Signed in as {user}. {n} existing articles were assigned to this account.',
	copyTokenOnce: 'Copy your upload token now. It is shown only once.',
	setupTokenHint: 'Use it as Authorization: Bearer … on POST /api/upload. You can rotate it later under Settings.',
	goToArchive: 'Go to the archive',
	users: 'Users',
	folders: 'Folders',
	settings: 'Settings',
	adminBadge: 'admin',
	searchPlaceholder: 'Search title, summary, author, source, or tags',
	searchAria: 'Search articles',
	search: 'Search',
	tagsAria: 'Tags',
	foldersAria: 'Folders',
	allTags: 'All',
	allFolders: 'All folders',
	starred: 'Starred',
	star: 'Star',
	unstar: 'Unstar',
	starAria: 'Toggle star',
	noArticles: 'No articles yet.',
	noArticlesTagged: 'No articles tagged “{tag}”.',
	noArticlesMatch: 'No articles match “{q}”.',
	noFolderArticles: 'This folder is empty.',
	noStarredArticles: 'No starred articles yet.',
	noStarredInFolder: 'No starred articles in this folder.',
	articleOne: '1 article',
	articleMany: '{n} articles',
	folderOne: '1 folder',
	folderMany: '{n} folders',
	yours: 'yours',
	matching: 'matching “{q}”',
	inTag: 'in {tag}',
	inFolderName: 'in {folder}',
	starredNote: 'starred',
	everyone: 'Everyone',
	mine: 'Mine',
	addToFolders: 'Add to folders',
	saveFolders: 'Save folders',
	createFirstFolder: 'Create a folder first.',
	noFolders: 'No folders yet.',
	source: 'Source',
	backArchive: '← Archive',
	downloadHtml: 'Download HTML',
	settingsHeading: 'Settings',
	settingsLead: 'Your upload token identifies articles as yours.',
	currentPrefix: 'Current prefix:',
	none: 'none',
	rotateToken: 'Rotate upload token',
	copyTokenAgain: 'Copy this token now. It will not be shown again.',
	foldersHeading: 'Folders',
	foldersLead: 'Create folders by hand. An article can belong to many folders. Folders and stars are yours alone.',
	createFolder: 'New folder',
	folderName: 'Name',
	rename: 'Rename',
	save: 'Save',
	moveUp: 'Move up',
	moveDown: 'Move down',
	openFolder: 'View articles',
	usersHeading: 'Users',
	usersLead: 'Create accounts and rotate upload tokens. Tokens are shown only once.',
	tokenForUser: 'Upload token for {user} — copy it now.',
	role: 'Role',
	roleUser: 'user',
	roleAdmin: 'admin',
	addUser: 'Add user',
	tokenPrefix: 'Token prefix',
	created: 'Created',
	you: ' (you)',
	promote: 'Promote',
	demote: 'Demote',
	delete: 'Delete',
	rotateTokenShort: 'Rotate token',
	notFound: 'That article is not in the archive.',
	backToList: 'Back to the list',
	langZh: '中文',
	langEn: 'EN',
	langToggle: 'Interface language',
	invalidCredentials: 'Invalid credentials.',
	passwordsMismatch: 'Passwords do not match.',
	secretMissing: 'SITE_ACCESS_SECRET is not configured.',
	usernameInvalid: 'Username must be 3–32 characters: letters, digits, dot, underscore, or hyphen.',
	passwordLength: 'Password must be 8–200 characters.',
	usernameTaken: 'That username is already taken.',
	lastAdminDemote: 'Cannot demote the last remaining admin.',
	lastAdminDelete: 'Cannot delete the last remaining admin.',
	userNotFound: 'User not found',
	invalidRole: 'Invalid role',
	folderNameRequired: 'Folder name is required.',
	folderNameTooLong: 'Folder name is too long.',
	folderNameTaken: 'A folder with that name already exists.',
	folderNotFound: 'Folder not found',
};

const TABLE: Record<Locale, Record<MessageKey, string>> = { zh: ZH, en: EN };

const ERROR_KEYS: Record<string, MessageKey> = {
	'Invalid credentials.': 'invalidCredentials',
	'Passwords do not match.': 'passwordsMismatch',
	'SITE_ACCESS_SECRET is not configured.': 'secretMissing',
	'Username must be 3–32 characters: letters, digits, dot, underscore, or hyphen.': 'usernameInvalid',
	'Password must be 8–200 characters.': 'passwordLength',
	'That username is already taken.': 'usernameTaken',
	'Cannot demote the last remaining admin.': 'lastAdminDemote',
	'Cannot delete the last remaining admin.': 'lastAdminDelete',
	'User not found': 'userNotFound',
	'Invalid role': 'invalidRole',
	'Folder name is required.': 'folderNameRequired',
	'Folder name is too long.': 'folderNameTooLong',
	'A folder with that name already exists.': 'folderNameTaken',
	'Folder not found': 'folderNotFound',
};

export function parseLocale(request: Request): Locale {
	const header = request.headers.get('cookie') ?? '';
	for (const part of header.split(';')) {
		const trimmed = part.trim();
		if (trimmed === `${LANG_COOKIE}=en`) {
			return 'en';
		}
		if (trimmed === `${LANG_COOKIE}=zh`) {
			return 'zh';
		}
	}
	return 'zh';
}

export function localeCookie(locale: Locale, requestUrl: URL): string {
	const secure = requestUrl.protocol === 'https:' ? '; Secure' : '';
	return `${LANG_COOKIE}=${locale}; Path=/; SameSite=Lax; Max-Age=31536000${secure}`;
}

export function t(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
	let text = TABLE[locale][key] ?? TABLE.en[key];
	if (vars) {
		for (const [name, value] of Object.entries(vars)) {
			text = text.replaceAll(`{${name}}`, String(value));
		}
	}
	return text;
}

export function translateError(locale: Locale, message: string): string {
	const key = ERROR_KEYS[message];
	return key ? t(locale, key) : message;
}

export function tagLabel(locale: Locale, tag: { name_zh: string; name_en: string | null; slug: string }): string {
	if (locale === 'en') {
		return tag.name_en?.trim() || tag.name_zh || tag.slug;
	}
	return tag.name_zh?.trim() || tag.name_en || tag.slug;
}

export function htmlLang(locale: Locale): string {
	return locale === 'en' ? 'en' : 'zh-CN';
}

export function formatUiDate(iso: string | null | undefined, locale: Locale): string {
	if (!iso) {
		return '';
	}
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return iso;
	}
	return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

export function parseLocaleParam(value: string | null): Locale | null {
	if (value === 'en' || value === 'zh') {
		return value;
	}
	return null;
}

export function langSetHref(locale: Locale, currentPath: string): string {
	const params = new URLSearchParams({ set: locale, next: currentPath || '/' });
	return `/lang?${params.toString()}`;
}

export function langSwitchHref(locale: Locale, currentPath: string): string {
	return langSetHref(locale === 'zh' ? 'en' : 'zh', currentPath);
}

export const LANG_BOOTSTRAP = `<script>
(function () {
  var key = '${LANG_COOKIE}';
  try {
    var stored = localStorage.getItem(key);
    var cookie = document.cookie.split('; ').find(function (part) { return part.indexOf(key + '=') === 0; });
    if ((stored === 'zh' || stored === 'en') && !cookie) {
      document.cookie = key + '=' + stored + '; Path=/; SameSite=Lax; Max-Age=31536000';
      location.reload();
      return;
    }
    if (cookie) {
      localStorage.setItem(key, cookie.slice(key.length + 1));
    }
  } catch (err) {}
})();
</script>`;
