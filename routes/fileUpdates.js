const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { formatISO, fromUnixTime, isBefore } = require('date-fns');

const symbolsFolder = path.join(path.resolve(__dirname, '../'), 'symbols'); // Ensure 'symbols' folder exists

// Ensure 'symbols' folder exists
if (!fs.existsSync(symbolsFolder)) {
    fs.mkdirSync(symbolsFolder);
}

// URLs for the files (you can update these dynamically)
const brokerUrls = {
    flattrade: [
        'https://flattrade.s3.ap-south-1.amazonaws.com/scripmaster/Nfo_Index_Derivatives.csv',
        'https://flattrade.s3.ap-south-1.amazonaws.com/scripmaster/Bfo_Index_Derivatives.csv',
    ],
    shoonya: [
        'https://api.shoonya.com/NFO_symbols.txt.zip',
        'https://api.shoonya.com/BFO_symbols.txt.zip'
    ]
};

// Function to check if file is outdated (older than 7 am)
function isFileOutdated(filePath) {
    if (!fs.existsSync(filePath)) return true;

    const stats = fs.statSync(filePath);
    const lastModifiedTime = formatISO(new Date(stats.mtime));
    const sevenAMToday = fromUnixTime((new Date().setUTCHours(1, 30)) / 1000);
    return isBefore(lastModifiedTime, sevenAMToday);
}

// Function to download a file and check headers from GET request (instead of HEAD)
async function downloadFile(url, customName = null) {
    try {
        // Make the GET request to fetch the file and headers
        const response = await axios.get(url, { responseType: 'stream' });

        // Extract filename from URL (or use custom name if provided)
        let fileName = customName || path.basename(url);

        // Check if Content-Disposition header exists for the filename
        if (!customName && response.headers['content-disposition']) {
            const contentDisposition = response.headers['content-disposition'];
            const matches = contentDisposition.match(/filename="(.+)"/);
            if (matches && matches[1]) {
                fileName = matches[1];
            }
        }

        const filePath = path.join(symbolsFolder, fileName);
        
        // Check if file is outdated, skip download if it's not.
        if (!isFileOutdated(filePath)) {
            console.log(`File ${fileName} is up-to-date, skipping download.`)
            return filePath
        } else {
            console.log(`File ${fileName} is downloading.`)
        }
        
        // Now download the file
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(filePath));
            writer.on('error', reject);
        });
    } catch (error) {
        console.error(`Error downloading file from ${url}:`, error);
        // throw error;
    }
}

// Function to handle downloading all files for a broker
async function downloadBrokerFiles(broker, customNames = []) {
    const urls = brokerUrls[broker];

    if (!urls) {
        console.log(`No URLs found for broker: ${broker}`);
        return;
    }

    const downloadPromises = urls.map((url, index) => {
        const customName = customNames[index] || null;
        return downloadFile(url, customName);
    });

    try {
        const downloadedFiles = await Promise.all(downloadPromises);
        // console.log(`${broker} files downloaded successfully:`, downloadedFiles);
    } catch (error) {
        console.error(`Error downloading files for ${broker}:`, error);
    }
}

// Check and update files for the broker
async function checkAndUpdateFiles(broker, customNames = []) {
    // console.log(`Checking files for ${broker}...`);

    try {
        // Download all files for the broker
        await downloadBrokerFiles(broker, customNames);
        console.log(`Files for ${broker} updated successfully.`);
    } catch (error) {
        console.error(`Error downloading files for ${broker}:`, error);
    }
}


// Check and update files on startup for both brokers
// (async () => {
//     await checkAndUpdateFiles('flattrade');
//     // await checkAndUpdateFiles('shoonya');
// })();

module.exports = {checkAndUpdateFiles};
