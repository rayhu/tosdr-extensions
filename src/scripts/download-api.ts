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
        
        // 保存完整数据库
        const dbPath = path.join(__dirname, '../../data');
        if (!fs.existsSync(dbPath)) {
            fs.mkdirSync(dbPath, { recursive: true });
        }
        
        fs.writeFileSync(
            path.join(dbPath, 'database.json'), 
            JSON.stringify(dbData, null, 2)
        );
        console.log(`Database saved with ${dbData.length} services`);

        // 2. 获取所有服务的详细信息
        console.log('Downloading service details...');
        const servicesDetails: APIResponse[] = [];
        const batchSize = 10; // 每批处理10个服务
        
        for (let i = 0; i < dbData.length; i += batchSize) {
            const batch = dbData.slice(i, i + batchSize);
            console.log(`Processing batch ${i/batchSize + 1}/${Math.ceil(dbData.length/batchSize)}`);
            
            await Promise.all(batch.map(async (service: DatabaseEntry) => {
                try {
                    const searchResponse = await fetch(
                        `https://${API_URL}/search/v5/?query=${service.url.split(',')[0]}`
                    );

                    if (searchResponse.ok) {
                        const searchData = await searchResponse.json() as APIResponse;
                        servicesDetails.push(searchData);
                    }
                } catch (error) {
                    console.error(`Error fetching details for service ${service.id}:`, error);
                }
            }));

            // 每批处理完后等待一秒
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 保存服务详情
        fs.writeFileSync(
            path.join(dbPath, 'services-details.json'),
            JSON.stringify(servicesDetails, null, 2)
        );
        console.log(`Service details saved for ${servicesDetails.length} services`);

    } catch (error) {
        console.error('Error downloading data:', error);
    }
}

// 执行下载
downloadDatabase();