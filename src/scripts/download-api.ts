const fs = require('fs');
const path = require('path');
const nodeFetch = require('node-fetch');
const { execSync } = require('child_process');

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

// 添加一个进度显示函数
function showProgress(current: number, total: number, name: string) {
    const percentage = Math.round((current / total) * 100);
    process.stdout.write(`\rProgress: ${current}/${total} (${percentage}%) - ${name}`);
    if (current === total) {
        process.stdout.write('\n');
    }
}

async function downloadFile(url: string, filePath: string, isBinary: boolean = false) {
    try {
        console.log('\n----------------------------------------');
        console.log(`File: ${path.basename(filePath)}`);
        console.log(`URL: ${url}`);
        console.log(`Path: ${filePath}`);
        console.log('----------------------------------------');
        
        const response = await fetchWithRetry(url);
        const contentLength = response.headers.get('content-length');
        const total = parseInt(contentLength || '0', 10);

        if (isBinary) {
            const buffer = await response.buffer();
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filePath, buffer);
            console.log('✓ Download completed\n');
            return true;
        } else {
            let content = '';
            const arrayBuffer = await response.arrayBuffer();
            const text = new TextDecoder().decode(arrayBuffer);
            
            if (!text.trim()) {
                console.log('⚠ Warning: Empty content');
                return false;
            }

            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(filePath, text);
            console.log('\n✓ Download completed\n');
            return true;
        }
    } catch (error) {
        console.error(`✗ Error downloading file:`);
        console.error(`  ${error}`);
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

// 添加一个辅助函数来验证文件保存
function saveFile(filePath: string, content: any, isJson: boolean = false) {
    try {
        // 确保目录存在
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // 保存文件
        const fileContent = isJson ? JSON.stringify(content, null, 2) : content;
        fs.writeFileSync(filePath, fileContent);
        
        // 验证文件是否成功保存
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            console.log(`✓ File saved successfully: ${filePath} (${stats.size} bytes)`);
            return true;
        } else {
            console.error(`✗ File not found after saving: ${filePath}`);
            return false;
        }
    } catch (error) {
        console.error(`✗ Error saving file ${filePath}:`, error);
        return false;
    }
}

// 添加目录结构打印函数
function printDirectoryStructure(dir: string, prefix: string = ''): void {
    const files: string[] = fs.readdirSync(dir);
    
    files.forEach((file: string, index: number) => {
        const filePath: string = path.join(dir, file);
        const stats = fs.statSync(filePath);
        const isLast: boolean = index === files.length - 1;
        
        // 打印当前文件/目录
        console.log(`${prefix}${isLast ? '└── ' : '├── '}${file}`);
        
        // 如果是目录，递归打印其内容
        if (stats.isDirectory()) {
            printDirectoryStructure(filePath, `${prefix}${isLast ? '    ' : '│   '}`);
        }
    });
}

async function downloadDatabase() {
    try {
        // 获取绝对路径
        const absoluteDataDir = path.resolve(currentDir, 'data');
        console.log(`Using data directory: ${absoluteDataDir}`);

        // 创建主数据目录
        if (!fs.existsSync(absoluteDataDir)) {
            fs.mkdirSync(absoluteDataDir, { recursive: true });
            console.log(`Created data directory: ${absoluteDataDir}`);
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
        const baseDir = path.join(absoluteDataDir, 'services');
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
        const dbFilePath = path.join(absoluteDataDir, 'services', 'database.json');
        saveFile(dbFilePath, dbData, true);
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
                
                const serviceDir = path.join(
                    absoluteDataDir, 
                    'services', 
                    `${service.id}_${service.slug || service.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
                );
                if (!fs.existsSync(serviceDir)) {
                    fs.mkdirSync(serviceDir, { recursive: true });
                }

                // Get service details
                const detailsResponse = await nodeFetch(
                    `${API_ENDPOINT}/services/v2/${service.id}.json`
                );

                if (detailsResponse.ok) {
                    const detailsData = await detailsResponse.json() as ServiceDetails;
                    
                    // Generate and save rendered popup HTML
                    const popupHtml = await generatePopupHtml(service, detailsData);
                    const popupDir = path.join(serviceDir, 'rendered');
                    if (!fs.existsSync(popupDir)) {
                        fs.mkdirSync(popupDir);
                    }
                    
                    const popupFilePath = path.join(popupDir, 'popup.html');
                    saveFile(popupFilePath, popupHtml);
                    console.log(`Generated popup.html for ${service.name}`);

                    // Save service details
                    const detailsFilePath = path.join(serviceDir, 'details.json');
                    saveFile(detailsFilePath, detailsData, true);
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

                        const docsIndexFilePath = path.join(serviceDir, 'documents_index.json');
                        saveFile(docsIndexFilePath, docsIndex, true);

                        // Download documents
                        console.log(`\nDownloading ${detailsData.documents.length} documents for ${service.name}:`);
                        let completed = 0;
                        
                        for (const doc of docsIndex) {
                            completed++;
                            console.log(`\nDocument ${completed}/${docsIndex.length}:`);
                            try {
                                const filePath = path.join(serviceDir, doc.local_path);
                                await downloadFile(doc.original_url, filePath);
                            } catch (error) {
                                console.error(`Failed to download document: ${doc.original_url}`, error);
                            }
                            await sleep(1000);
                        }
                    }

                    // Download linked pages from points
                    if (detailsData.points) {
                        const pointsWebpagesDir = path.join(serviceDir, 'points_webpages');
                        if (!fs.existsSync(pointsWebpagesDir)) {
                            fs.mkdirSync(pointsWebpagesDir);
                        }

                        const pointsWithUrls = detailsData.points.filter(p => p.source && p.source.url);
                        console.log(`\nDownloading ${pointsWithUrls.length} point sources for ${service.name}:`);
                        let completed = 0;

                        for (const point of pointsWithUrls) {
                            completed++;
                            console.log(`\nPoint source ${completed}/${pointsWithUrls.length}:`);
                            try {
                                const fileName = `point_${point.id}_source.html`;
                                const filePath = path.join(pointsWebpagesDir, fileName);
                                await downloadFile(point.source.url, filePath);
                            } catch (error) {
                                console.error(`Failed to download point source: ${point.source.url}`, error);
                            }
                            await sleep(1000);
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

                    // 打印目录结构
                    console.log('\nCreated directory structure:');
                    printDirectoryStructure(serviceDir);
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

    // Updated URLs for HTML files
    const htmlFiles = [
        { 
            url: `${WEBSITE_ENDPOINT}/get-extension`, 
            file: 'popup.html',
            selector: '#popup-content'  // 选择器用于提取相关内容
        },
        { 
            url: `${WEBSITE_ENDPOINT}/settings`, 
            file: 'settings/settings.html',
            selector: '#settings-content'
        }
    ];

    for (const { url, file, selector } of htmlFiles) {
        try {
            console.log(`\nDownloading ${file} from ${url}`);
            const response = await fetchWithRetry(url);
            
            if (response.ok) {
                const content = await response.text();
                const filePath = path.join(viewsDir, file);
                const dir = path.dirname(filePath);
                
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                
                // Save the file
                saveFile(filePath, content);
                console.log(`✓ Downloaded ${file} successfully`);
                
                // Print file size
                const stats = fs.statSync(filePath);
                console.log(`  File size: ${stats.size} bytes`);
            } else {
                console.error(`✗ Failed to download ${file} from ${url}`);
                console.error(`  Status: ${response.status} ${response.statusText}`);
                
                // Try alternative URL
                const altUrl = `${WEBSITE_ENDPOINT}/${file}`;
                console.log(`\nTrying alternative URL: ${altUrl}`);
                
                const altResponse = await fetchWithRetry(altUrl);
                if (altResponse.ok) {
                    const content = await altResponse.text();
                    const filePath = path.join(viewsDir, file);
                    const dir = path.dirname(filePath);
                    
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    
                    saveFile(filePath, content);
                    console.log(`✓ Downloaded ${file} from alternative URL successfully`);
                } else {
                    console.error(`✗ Failed to download from alternative URL as well`);
                }
            }
        } catch (error) {
            console.error(`✗ Error downloading ${file}:`, error);
        }
    }
    
    // Print directory contents
    if (fs.existsSync(viewsDir)) {
        console.log('\nContents of views directory:');
        printDirectoryStructure(viewsDir);
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

// 添加一个函数来生成完整的 popup HTML
async function generatePopupHtml(service: ServiceData, detailsData: ServiceDetails) {
    // 基本的 popup.html 模板
    const template = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Terms of Service; Didn't Read - ${service.name}</title>
    <style>
        body {
            width: 400px;
            padding: 10px;
            font-family: Arial, sans-serif;
        }
        .rating {
            font-size: 24px;
            font-weight: bold;
            margin: 10px 0;
        }
        .point {
            margin: 10px 0;
            padding: 10px;
            border: 1px solid #ccc;
        }
        .point-title {
            font-weight: bold;
        }
        .point-status {
            color: #666;
        }
    </style>
</head>
<body>
    <h1>${service.name}</h1>
    <div class="rating">Rating: ${service.rating || 'Not Rated'}</div>
    
    <h2>Points:</h2>
    ${detailsData.points?.map(point => `
        <div class="point">
            <div class="point-title">${point.title}</div>
            <div class="point-status">Status: ${point.status}</div>
            <div class="point-case">
                Classification: ${point.case.classification}
                Score: ${point.case.score}
            </div>
            ${point.description ? `<div class="point-description">${point.description}</div>` : ''}
            ${point.source?.url ? `<div class="point-source">Source: <a href="${point.source.url}">${point.source.document}</a></div>` : ''}
        </div>
    `).join('\n') || 'No points available'}

    <h2>Documents:</h2>
    <ul>
    ${detailsData.documents?.map(doc => `
        <li><a href="${doc.url}">${doc.name}</a></li>
    `).join('\n') || 'No documents available'}
    </ul>

    <h2>Links:</h2>
    <ul>
    ${detailsData.links?.map(link => `
        <li><a href="${link.url}">${link.name} (${link.type})</a></li>
    `).join('\n') || 'No links available'}
    </ul>
</body>
</html>`;

    return template;
}

// Execute download
downloadDatabase();

// 在脚本开始时打印当前工作目录
console.log('Current working directory:', process.cwd());
console.log('Script directory:', __dirname);