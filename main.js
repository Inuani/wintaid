import ProxyManager from "./utils/proxy_manager.js";
import { VintedItem } from "./entities/vinted_item.js";
import ConfigurationManager from "./utils/config_manager.js";
import Logger from "./utils/logger.js";
import CatalogService from "./services/catalog_service.js";
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cookie = null;

Logger.info('Starting Vinted Bot');

try {
    Logger.info('Main: Initializing proxies...');
    await ProxyManager.init();
    Logger.info('Main: Proxies initialized successfully');
} catch (error) {
    Logger.error(`Main: Failed to initialize proxies: ${error.message}`);
}


const algorithmSettings = ConfigurationManager.getAlgorithmSetting;
CatalogService.initializeConcurrency(algorithmSettings.concurrent_requests);

// Create a promise that will resolve with our first cookie
const cookiePromise = new Promise((resolve) => {
    Logger.info('Starting cookie worker...');
    
    const cookieWorker = new Worker(join(__dirname, 'cookieworker.js'), {
        type: 'module'
    });

    cookieWorker.on('message', (message) => {
        Logger.info(`Main: Received message from worker: ${JSON.stringify(message)}`);
        if (message.type === 'cookie' && message.cookie) {
            cookie = message.cookie;
            Logger.info('Main: Got valid cookie from worker');
            resolve(cookie);
        }
    });
    
    cookieWorker.on('error', (error) => {
        Logger.error(`Cookie worker error: ${error.message}`);
    });

    cookieWorker.on('exit', (code) => {
        if (code !== 0) {
            Logger.error(`Worker stopped with exit code ${code}`);
        }
    });
});

// Function to format price
const formatPrice = (price, currency) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
    }).format(price);
};

// Function to format time difference
const formatTimeDifference = (timestamp) => {
    const now = Date.now();
    const diffInSeconds = Math.floor((now - timestamp * 1000) / 1000);

    if (diffInSeconds < 60) {
        return `${diffInSeconds}s ago`;
    } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours}h ago`;
    } else {
        const days = Math.floor(diffInSeconds / 86400);
        return `${days}d ago`;
    }
};

// Function to format absolute time
const formatAbsoluteTime = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
};

const monitorItems = async () => {
    try {
        Logger.info('Main: Waiting for initial cookie...');
        await cookiePromise;
        Logger.info('Main: Got initial cookie, starting monitor...');

    const handleItem = async (rawItem) => {
        const item = new VintedItem(rawItem);

        if (item.getNumericStars() === 0 && algorithmSettings.filter_zero_stars_profiles) {
            return;
        }

        // Format both relative and absolute time
        const relativeTime = formatTimeDifference(item.unixUpdatedAt);
        const absoluteTime = formatAbsoluteTime(item.unixUpdatedAt);

        // Create a formatted string with item details
        const itemDetails = [
            `\x1b[36m${item.title}\x1b[0m`,  // Cyan color for title
            `Posted: \x1b[33m${relativeTime}\x1b[0m (\x1b[90m${absoluteTime}\x1b[0m)`,
            `ID: \x1b[90m${item.id}\x1b[0m`,  // Gray color for ID
        ].join(' | ');

        console.log('─'.repeat(process.stdout.columns));
        console.log(itemDetails);
    };

    (async () => {
        await CatalogService.findHighestIDUntilSuccessful(cookie);
        Logger.info('Starting to monitor items...');

        while (true) {
            try {
                await CatalogService.fetchUntilCurrentAutomatic(cookie, handleItem);
            } catch (error) {
                console.error('Error fetching items:', error);
                // Add a small delay before retrying
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    })();
} catch (error) {
    Logger.error(`Monitor error: ${error.message}`);
}
};

monitorItems().catch(error => {
    Logger.error(`Monitor error: ${error.message}`);
});