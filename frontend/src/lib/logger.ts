import { dev } from '$app/environment';
import pino from 'pino';

// Create different logger configurations for server and browser
const createLogger = () => {
	return pino({
		level: dev ? 'debug' : 'info',
		transport: dev
			? {
					target: 'pino-pretty',
					options: {
						colorize: true,
						translateTime: 'SYS:yyyy-mm-dd HH:MM:ss'
					}
				}
			: undefined
	});
};

const baseLogger = createLogger();

export const sanitize = (obj: any) => {
	if (!obj || typeof obj !== 'object') return obj;
	try {
		const clone = JSON.parse(JSON.stringify(obj));
		if (clone.password) clone.password = '***';
		if (clone.access_token) clone.access_token = '***';
		if (clone.refresh_token) clone.refresh_token = '***';
		return clone;
	} catch {
		return obj;
	}
};

export const logger = Object.assign(baseLogger, {
	inspect: (...args: any[]) => {
		if (dev) {
			console.log(...args);
		}
	},
	dir: (obj: any, options?: any) => {
		if (dev) {
			console.dir(obj, options);
		}
	},
	table: (data: any, columns?: string[]) => {
		if (dev) {
			console.table(data, columns);
		}
	}
});
