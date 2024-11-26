import ProxyManager from "./utils/proxy_manager.js";
import { VintedItem } from "./entities/vinted_item.js";
import ConfigurationManager from "./utils/config_manager.js";
import { fetchCookie } from "./api/fetchCookie.js";
import Logger from "./utils/logger.js";
import CatalogService from "./services/catalog_service.js";

var cookie = null;

try {
    await ProxyManager.init();
} catch (error) {
    Logger.error(`Failed to initialize proxies: ${error.message}`);
    Logger.info('Continuing without proxies...');
}

const algorithmSettings = ConfigurationManager.getAlgorithmSetting;
CatalogService.initializeConcurrency(algorithmSettings.concurrent_requests);

const getCookie = async () => {
    const c = await fetchCookie();
    return c.cookie;
};

const refreshCookie = async () => {
    let found = false;
    while (!found) {
        try {
            const cookie = await getCookie();
            if (cookie) {
                found = true;
                Logger.info('Fetched cookie from Vinted');
                return cookie;
            }
        } catch (error) {
            Logger.debug('Error fetching cookie');
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
};

Logger.info('Starting Vinted Bot');
Logger.info('Fetching cookie from Vinted');

cookie = await refreshCookie();

setInterval(async () => {
    try {
        cookie = await refreshCookie();
    } catch (error) {
        Logger.debug('Error refreshing cookie');
    }
}, 60000);

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

const monitorItems = () => {
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
            // `Price: \x1b[33m${formatPrice(item.priceNumeric, item.currency)}\x1b[0m`,  // Yellow color for price
            // `Brand: \x1b[35m${item.brand || 'No Brand'}\x1b[0m`,  // Magenta color for brand
            // `Size: ${item.size || 'No Size'}`,
            // `Status: ${item.status}`,
            // `Seller: \x1b[32m${item.user.login}\x1b[0m (${item.user.countryCode.toUpperCase()})`,  // Green color for seller name
            // `Rating: ${'⭐'.repeat(Math.round(item.getNumericStars()))}`,
            `Posted: \x1b[33m${relativeTime}\x1b[0m (\x1b[90m${absoluteTime}\x1b[0m)`, // Yellow for relative time, gray for absolute time
           `ID: \x1b[90m${item.id}\x1b[0m`,  // Gray color for ID
            // `URL: \x1b[34m${item.url}\x1b[0m`  // Blue color for URL
        ].join(' | ');

        console.log('─'.repeat(process.stdout.columns)); // Separator line
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
            }
        }
    })();
};

monitorItems();