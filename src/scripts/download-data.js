// Import necessary modules
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

// Function to read JSON file
function readJSONFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Function to create a directory if it doesn't exist
function createDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// Function to download a file with error handling
async function downloadFile(url, filePath) {
    try {
        const response = await axios.get(url, { responseType: 'stream' });
        response.data.pipe(fs.createWriteStream(filePath));
        return new Promise((resolve, reject) => {
            response.data.on('end', () => resolve());
            response.data.on('error', err => reject(err));
        });
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.error(`Error: Resource not found at ${url}`);
        } else {
            console.error(`Error downloading file from ${url}:`, error.message);
        }
    }
}

// Main function to download data
async function downloadData(all = false) {
    const services = readJSONFile('services-details.json');
    console.log(services.length + ' services found');
    const limit = all ? services.length : 5;
    console.log(limit + ' services will be downloaded');
    console.log('--------------------------------');

    for (let i = 0; i < limit; i++) {
        const service = services[i]["services"][0];

        console.log(JSON.stringify(service, null, 2));

        // Debugging: Check if service has a name
        if (!service.name) {
            console.error(`Service at index ${i} is missing a name.`);
            continue; // Skip this service
        }

        const serviceDir = path.join(__dirname, service.name);
        createDirectory(serviceDir);

        // Save service details
        fs.writeFileSync(path.join(serviceDir, 'details.json'), JSON.stringify(service, null, 2));

        // Download service page
        const serviceUrl = `https://tosdr.org/en/service/${service.id}`;
        const htmlFilePath = path.join(serviceDir, 'service.html');
        await downloadFile(serviceUrl, htmlFilePath);

        // Analyze HTML and download documents
        const htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
        const $ = cheerio.load(htmlContent);
        const documentLinks = $('.service-documents a').map((_, el) => $(el).attr('href')).get();

        const documentsDir = path.join(serviceDir, 'documents');
        createDirectory(documentsDir);

        for (const link of documentLinks) {
            const fileName = path.basename(link);
            const filePath = path.join(documentsDir, fileName);
            await downloadFile(link, filePath);
        }
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const all = args.includes('--all');

// Run the script
downloadData(all).then(() => {
    console.log('Download completed.');
}).catch(err => {
    console.error('Error downloading data:', err);
});
