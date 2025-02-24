const fs = require('fs');
const path = require('path');
const nodeFetch = require('node-fetch');

const DOMAIN_URL = 'tosdr.org';
const API_ENDPOINT = `https://api.${DOMAIN_URL}`;
const WEBSITE_ENDPOINT = `https://${DOMAIN_URL}`;
const API_KEY = 'Y29uZ3JhdHMgb24gZ2V0dGluZyB0aGUga2V5IDpQ';

// Get the current script directory path
const currentDir = process.cwd();

// Check if it's full download mode
const isFullDownload = process.argv.includes('--all');

// Interface definitions
interface ServiceData {
    id: number;
    name: string;
    slug: string;
    rating: string;
    url: string;
}

interface Case {
    id: number;
    classification: string;
    score: number;
    title: string;
    description: string;
}

interface Point {
    id: number;
    title: string;
    status: string;
    case: Case;
    description: string;
    source: {
        document: string;
        url: string;
    };
}

interface ServiceDetails {
    id: number;
    name: string;
    points: Point[];
    rating: string;
    urls: string[];
    documents: {
        name: string;
        url: string;
        xpath: string;
    }[];
    cases: Case[];
    links: {
        name: string;
        url: string;
        type: string;
    }[];
}

async function downloadFile(url: string, filePath: string, isBinary: boolean = false) {
    try {
        console.log(`Attempting to download: ${url}`);
        const response = await fetchWithRetry(url);
        const content = isBinary ? await response.buffer() : await response.text();
        
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        if (!isBinary && !content.trim()) {
            console.log(`Warning: Empty content from ${url}`);
            return false;
        }
        
        fs.writeFileSync(filePath, content);
        console.log(`Successfully downloaded: ${url} -> ${filePath}`);
        return true;
    } catch (error) {
        console.error(`Error downloading ${url}:`, error);
        return false;
    }
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, options: any = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await nodeFetch(url, options);
            if (response.ok) {
                return response;
            }
            console.log(`Attempt ${i + 1} failed for ${url}, status: ${response.status}`);
        } catch (error) {
            console.error(`Attempt ${i + 1} failed for ${url}:`, error);
        }
        if (i < retries - 1) {
            const delay = Math.pow(2, i) * 1000; // 指数退避
            await sleep(delay);
        }
    }
    throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
}

async function downloadDatabase() {
    try {
        // Create main data directory
        const dataDir = path.join(currentDir, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // 1. Download HTML files
        console.log('\nDownloading HTML files...');
        await downloadHtmlFiles();

        // 2. Download icons
        console.log('\nDownloading icons...');
        await downloadIcons();

        // 3. Download localization files
        console.log('\nDownloading locales...');
        await downloadLocales();

        // 4. Download service data
        console.log('\nDownloading service data...');
        const baseDir = path.join(currentDir, 'data/services');
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }

        // Download main database
        console.log('Downloading main database...');
        const dbResponse = await nodeFetch(`${API_ENDPOINT}/appdb/version/v2`, {
            headers: {
                'apikey': Buffer.from(API_KEY, 'base64').toString()
            }
        });

        if (!dbResponse.ok) {
            throw new Error(`Failed to fetch database: ${dbResponse.status}`);
        }

        const dbData = await dbResponse.json() as ServiceData[];
        
        // Save main database
        fs.writeFileSync(
            path.join(baseDir, 'database.json'), 
            JSON.stringify(dbData, null, 2)
        );
        console.log(`Main database saved with ${dbData.length} services`);

        // Determine services to process
        let servicesToProcess = dbData;
        if (!isFullDownload) {
            servicesToProcess = dbData.slice(0, 5);
            console.log(`Sample mode: processing only first 5 services`);
        } else {
            console.log(`Full mode: processing all ${dbData.length} services`);
        }

        // Download service details
        for (const service of servicesToProcess) {
            try {
                console.log(`\nProcessing service: ${service.name}`);
                
                const serviceDir = path.join(baseDir, `${service.id}_${service.slug || service.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
                if (!fs.existsSync(serviceDir)) {
                    fs.mkdirSync(serviceDir, { recursive: true });
                }

                // Get service details
                const detailsResponse = await nodeFetch(
                    `${API_ENDPOINT}/services/v2/${service.id}.json`
                );

                if (detailsResponse.ok) {
                    const detailsData = await detailsResponse.json() as ServiceDetails;
                    
                    // Save service details
                    fs.writeFileSync(
                        path.join(serviceDir, 'details.json'),
                        JSON.stringify({
                            id: service.id,
                            name: service.name,
                            rating: service.rating,
                            points: detailsData.points,
                            urls: detailsData.urls,
                            documents: detailsData.documents,
                            cases: detailsData.cases,
                            links: detailsData.links
                        }, null, 2)
                    );
                    console.log(`Saved details for ${service.name} (${detailsData.points?.length || 0} points)`);

                    // Download service documents and webpages
                    if (detailsData.documents && detailsData.documents.length > 0) {
                        const documentsDir = path.join(serviceDir, 'webpages');
                        if (!fs.existsSync(documentsDir)) {
                            fs.mkdirSync(documentsDir);
                        }

                        // Save documents index
                        const docsIndex = detailsData.documents.map(doc => ({
                            name: doc.name,
                            original_url: doc.url,
                            local_path: `webpages/${doc.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`
                        }));

                        fs.writeFileSync(
                            path.join(serviceDir, 'documents_index.json'),
                            JSON.stringify(docsIndex, null, 2)
                        );

                        // Download each document
                        console.log(`Downloading ${docsIndex.length} documents for ${service.name}`);
                        for (const doc of docsIndex) {
                            try {
                                const filePath = path.join(serviceDir, doc.local_path);
                                await downloadFile(doc.original_url, filePath);
                                
                                // Add a small delay between downloads
                                await sleep(1000);
                            } catch (error) {
                                console.error(`Failed to download document: ${doc.original_url}`, error);
                            }
                        }
                    }

                    // Download linked pages from points
                    if (detailsData.points) {
                        const pointsWebpagesDir = path.join(serviceDir, 'points_webpages');
                        if (!fs.existsSync(pointsWebpagesDir)) {
                            fs.mkdirSync(pointsWebpagesDir);
                        }

                        for (const point of detailsData.points) {
                            if (point.source && point.source.url) {
                                try {
                                    const fileName = `point_${point.id}_source.html`;
                                    const filePath = path.join(pointsWebpagesDir, fileName);
                                    await downloadFile(point.source.url, filePath);
                                    
                                    // Add a small delay between downloads
                                    await sleep(1000);
                                } catch (error) {
                                    console.error(`Failed to download point source: ${point.source.url}`, error);
                                }
                            }
                        }
                    }

                    // Download service links
                    if (detailsData.links && detailsData.links.length > 0) {
                        const linksDir = path.join(serviceDir, 'links');
                        if (!fs.existsSync(linksDir)) {
                            fs.mkdirSync(linksDir);
                        }

                        for (const link of detailsData.links) {
                            try {
                                const fileName = `${link.type}_${link.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
                                const filePath = path.join(linksDir, fileName);
                                await downloadFile(link.url, filePath);
                                
                                // Add a small delay between downloads
                                await sleep(1000);
                            } catch (error) {
                                console.error(`Failed to download link: ${link.url}`, error);
                            }
                        }
                    }
                }

                await sleep(1000);
            } catch (error) {
                console.error(`Error processing service ${service.name}:`, error);
            }
        }

        console.log('\nDownload completed!');
        if (!isFullDownload) {
            console.log('Note: Only downloaded sample data. Use --all flag to download complete database.');
        }

        console.log('\nAll downloads completed!');
    } catch (error) {
        console.error('Error during download:', error);
    }
}

// Function to download HTML files
async function downloadHtmlFiles() {
    const viewsDir = path.join(currentDir, 'data/views');
    if (!fs.existsSync(viewsDir)) {
        fs.mkdirSync(viewsDir, { recursive: true });
    }

    // 直接从网站下载 HTML 文件
    const htmlFiles = [
        { url: `${WEBSITE_ENDPOINT}/en/popup`, file: 'popup.html' },
        { url: `${WEBSITE_ENDPOINT}/en/settings`, file: 'settings/settings.html' }
    ];

    for (const { url, file } of htmlFiles) {
        try {
            console.log(`Downloading ${url}`);
            const response = await nodeFetch(url);
            if (response.ok) {
                const content = await response.text();
                const filePath = path.join(viewsDir, file);
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(filePath, content);
                console.log(`Downloaded ${file}`);
            } else {
                console.error(`Failed to download ${url}, status: ${response.status}`);
            }
        } catch (error) {
            console.error(`Error downloading ${url}:`, error);
        }
    }
}

// Function to download icons
async function downloadIcons() {
    const iconsDir = path.join(currentDir, 'data/icons');
    if (!fs.existsSync(iconsDir)) {
        fs.mkdirSync(iconsDir, { recursive: true });
    }

    // List of icons to download
    const icons = [
        'logo/logo16.png',
        'logo/logo32.png',
        'logo/logo48.png',
        'logo/logo128.png',
        'loading.png',
        'grades/a.png',
        'grades/b.png',
        'grades/c.png',
        'grades/d.png',
        'grades/e.png',
        'grades/none.png'
    ];

    for (const icon of icons) {
        const response = await nodeFetch(`https://${DOMAIN_URL}/icons/${icon}`);
        if (response.ok) {
            const buffer = await response.buffer();
            const filePath = path.join(iconsDir, icon);
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filePath, buffer);
            console.log(`Downloaded ${icon}`);
        }
    }
}

// Function to download localization files
async function downloadLocales() {
    const localesDir = path.join(currentDir, 'data/_locales');
    if (!fs.existsSync(localesDir)) {
        fs.mkdirSync(localesDir, { recursive: true });
    }

    // Get list of supported languages
    const response = await nodeFetch(`https://${DOMAIN_URL}/locales/list.json`);
    if (response.ok) {
        const languages = await response.json();
        
        for (const lang of languages) {
            const langDir = path.join(localesDir, lang);
            if (!fs.existsSync(langDir)) {
                fs.mkdirSync(langDir);
            }
            
            const messagesResponse = await nodeFetch(`https://${DOMAIN_URL}/locales/${lang}/messages.json`);
            if (messagesResponse.ok) {
                const content = await messagesResponse.json();
                fs.writeFileSync(
                    path.join(langDir, 'messages.json'),
                    JSON.stringify(content, null, 2)
                );
                console.log(`Downloaded locale: ${lang}`);
            }
        }
    }
}

// Execute download
downloadDatabase();