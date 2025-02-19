import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';

const API_URL = 'api.tosdr.org';
const API_KEY = 'Y29uZ3JhdHMgb24gZ2V0dGluZyB0aGUga2V5IDpQ';

// 更新接口定义以匹配实际数据结构
interface ServiceData {
    id: number;
    is_comprehensively_reviewed: boolean;
    urls: string[];
    name: string;
    slug: string;
    rating: string;
    updated_at: string;
    created_at: string;
    url: string;  // 添加这个字段用于主数据库的数据结构
}

interface APIResponse {
    services: ServiceData[];
}

interface DatabaseEntry extends ServiceData {
    url: string;
}

async function downloadDatabase() {
    try {
        const dbPath = path.join(__dirname, '../../data');
        if (!fs.existsSync(dbPath)) {
            fs.mkdirSync(dbPath, { recursive: true });
        }

        // 1. 下载主数据库
        console.log('Downloading main database...');
        const dbResponse = await fetch(`https://${API_URL}/appdb/version/v2`, {
            headers: {
                'apikey': Buffer.from(API_KEY, 'base64').toString()
            }
        });

        if (!dbResponse.ok) {
            throw new Error(`Failed to fetch database: ${dbResponse.status}`);
        }

        const dbData = await dbResponse.json() as DatabaseEntry[];
        
        // 保存主数据库
        fs.writeFileSync(
            path.join(dbPath, 'database.json'), 
            JSON.stringify(dbData, null, 2)
        );
        console.log(`Database saved with ${dbData.length} services`);

        // 2. 获取所有服务的搜索结果
        console.log('Downloading search results...');
        const searchResults = new Map<string, APIResponse>();
        const batchSize = 10;
        
        for (let i = 0; i < dbData.length; i += batchSize) {
            const batch = dbData.slice(i, i + batchSize);
            console.log(`Processing batch ${i/batchSize + 1}/${Math.ceil(dbData.length/batchSize)}`);
            
            await Promise.all(batch.map(async (service: DatabaseEntry) => {
                try {
                    // 为每个 URL 都获取搜索结果
                    const urls = service.url.split(',');
                    for (const url of urls) {
                        if (!searchResults.has(url)) {
                            const searchResponse = await fetch(
                                `https://${API_URL}/search/v5/?query=${url}`
                            );

                            if (searchResponse.ok) {
                                const searchData = await searchResponse.json() as APIResponse;
                                searchResults.set(url, searchData);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching details for service ${service.id}:`, error);
                }
            }));

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 保存搜索结果
        fs.writeFileSync(
            path.join(dbPath, 'search-results.json'),
            JSON.stringify(Object.fromEntries(searchResults), null, 2)
        );
        console.log(`Search results saved for ${searchResults.size} URLs`);

    } catch (error) {
        console.error('Error downloading data:', error);
    }
}

// 执行下载
downloadDatabase();