import { parentPort } from 'worker_threads';
import { fetchCookie } from "./api/fetchCookie.js";
import Logger from "./utils/logger.js";
import ProxyManager from "./utils/proxy_manager.js";

const getCookie = async () => {
    const result = await fetchCookie();
    return result.cookie;
};

const refreshCookie = async () => {
    try {
        Logger.info('Worker: Starting cookie refresh...');
        
        // Initialize proxies in worker if not already initialized
        if (ProxyManager.proxies.length === 0) {
            Logger.info('Worker: Initializing proxies...');
            await ProxyManager.init();
            Logger.info('Worker: Proxies initialized successfully');
        }

        let found = false;
        while (!found) {
            try {
                Logger.info('Worker: Attempting to fetch cookie...');
                const cookie = await getCookie();
                if (cookie) {
                    found = true;
                    Logger.info('Worker: Successfully got cookie');
                    parentPort.postMessage({ type: 'cookie', cookie: cookie });
                    return cookie;
                }
            } catch (error) {
                Logger.debug('Worker: Error fetching cookie, retrying...');
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
    } catch (error) {
        Logger.error(`Worker: Error in refresh: ${error.message}`);
    }
};

// Initial cookie fetch
Logger.info('Worker: Starting initial cookie fetch...');
refreshCookie();

// Refresh cookie every minute
setInterval(refreshCookie, 60000);

// Handle any uncaught errors
process.on('uncaughtException', (error) => {
    Logger.error(`Worker uncaught exception: ${error.message}`);
});