const fs = require('fs');
const path = require('path');
const nodeFetch = require('node-fetch');

const API_URL = 'api.tosdr.org';
const API_KEY = 'Y29uZ3JhdHMgb24gZ2V0dGluZyB0aGUga2V5IDpQ';

// 获取当前脚本的目录路径
const currentDir = process.cwd();

// 检查是否是完整下载模式
const isFullDownload = process.argv.includes('--all');

// 接口定义
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

async function downloadFile(url: string, filePath: string) {
    try {
        console.log(`Attempting to download: ${url}`);
        const response = await nodeFetch(url);
        if (response.ok) {
            const content = await response.text();
            // 检查内容是否为空
            if (!content.trim()) {
                console.log(`Warning: Empty content from ${url}`);
                return false;
            }
            // 确保目录存在
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filePath, content);
            console.log(`Successfully downloaded: ${url} -> ${filePath}`);
            return true;
        } else {
            console.log(`Failed to download ${url}, status: ${response.status}`);
            return false;
        }
    } catch (error) {
        console.error(`Error downloading ${url}:`, error);
        return false;
    }
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadDatabase() {
    try {
        const baseDir = path.join(currentDir, 'data/services');
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }

        // 1. 下载主数据库
        console.log('Downloading main database...');
        const dbResponse = await nodeFetch(`https://${API_URL}/appdb/version/v2`, {
            headers: {
                'apikey': Buffer.from(API_KEY, 'base64').toString()
            }
        });

        if (!dbResponse.ok) {
            throw new Error(`Failed to fetch database: ${dbResponse.status}`);
        }

        const dbData = await dbResponse.json() as ServiceData[];
        
        // 保存主数据库
        fs.writeFileSync(
            path.join(baseDir, 'database.json'), 
            JSON.stringify(dbData, null, 2)
        );
        console.log(`Main database saved with ${dbData.length} services`);

        // 2. 确定要处理的服务
        let servicesToProcess = dbData;
        if (!isFullDownload) {
            servicesToProcess = dbData.slice(0, 5);
            console.log(`Sample mode: processing only first 5 services`);
        } else {
            console.log(`Full mode: processing all ${dbData.length} services`);
        }

        // 3. 下载服务详细信息
        for (const service of servicesToProcess) {
            try {
                console.log(`\nProcessing service: ${service.name}`);
                
                const serviceDir = path.join(baseDir, `${service.id}_${service.slug || service.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
                if (!fs.existsSync(serviceDir)) {
                    fs.mkdirSync(serviceDir, { recursive: true });
                }

                // 3.1 获取服务详情
                const detailsResponse = await nodeFetch(
                    `https://${API_URL}/services/v2/${service.id}.json`
                );

                if (detailsResponse.ok) {
                    const detailsData = await detailsResponse.json() as ServiceDetails;
                    
                    // 保存服务详情
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

                    // 3.2 下载每个评分点的详细信息
                    if (detailsData.points) {
                        const pointsDir = path.join(serviceDir, 'points');
                        if (!fs.existsSync(pointsDir)) {
                            fs.mkdirSync(pointsDir);
                        }

                        for (const point of detailsData.points) {
                            const pointResponse = await nodeFetch(
                                `https://${API_URL}/points/v2/${point.id}.json`
                            );
                            if (pointResponse.ok) {
                                const pointData = await pointResponse.json();
                                fs.writeFileSync(
                                    path.join(pointsDir, `${point.id}.json`),
                                    JSON.stringify(pointData, null, 2)
                                );
                            }
                            await sleep(500);
                        }
                    }

                    // 3.3 下载每个 case 的详细信息
                    if (detailsData.cases) {
                        const casesDir = path.join(serviceDir, 'cases');
                        if (!fs.existsSync(casesDir)) {
                            fs.mkdirSync(casesDir);
                        }

                        for (const case_ of detailsData.cases) {
                            const caseResponse = await nodeFetch(
                                `https://${API_URL}/cases/v2/${case_.id}.json`
                            );
                            if (caseResponse.ok) {
                                const caseData = await caseResponse.json();
                                fs.writeFileSync(
                                    path.join(casesDir, `${case_.id}.json`),
                                    JSON.stringify(caseData, null, 2)
                                );
                            }
                            await sleep(500);
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

    } catch (error) {
        console.error('Error downloading data:', error);
    }
}

// 执行下载
downloadDatabase();