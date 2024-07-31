const mysql = require('mysql2/promise');
const puppeteer = require('puppeteer');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '050504',
    database: 'category_and_domains'
};

async function scrapeWebsite() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

        const [rows] = await connection.execute("SELECT domains FROM categories_and_scraped_data WHERE scraped_data IS NULL");

        const browser = await puppeteer.launch({
            headless: false, 
            defaultViewport:null
        });

        for (const row of rows) {
            const url = row.domains.trim().replace(/^[^\w]+|[^\w]+$/g, '');
            console.log(`Scraping URL: ${url}`);

            const page = await browser.newPage();
            try {
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
                await page.waitForSelector('body');
                await page.waitForSelector('a[href]');

                // await waitForSelector('a')
                const visibleText = await page.evaluate(() => {
                    document.querySelectorAll('script, style').forEach(el => el.remove());
                    return document.body.innerText.trim();
                });
                const cleanedText = visibleText.split(/\s+/).join(' ');
                const [title, h1, href, description, keywords] = await Promise.all([
                    page.title(),
                    page.evaluate(() => {
                        const h1Element = document.querySelector('h1');
                        return h1Element ? h1Element.innerText : null;
                    }),
                    page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('a'));
                        return links.map(link => link.href);
                    }),
                    page.evaluate(() => {
                        const metaDescription = document.querySelector('meta[name="description"]');
                        return metaDescription ? metaDescription.getAttribute('content') : null;
                    }),
                    
                    page.evaluate(() => {
                        const metaKeywords = document.querySelector('meta[name="keywords"]');
                        return metaKeywords ? metaKeywords.getAttribute('content') : null;
                    })
                ]);
                // console.log(`URL: ${url}`);
                // console.log(`Title: ${title}`);
                // console.log(`Scraped Data: ${cleanedText}`);
                // console.log(`hreftags,${href}`) 


                const updateQuery = `
                UPDATE categories_and_scraped_data
                SET scraped_data = ?, title = ?, h1_tag = ?, href = ?, description = ?, keywords = ?
                WHERE domains = ?
                `;
                await connection.execute(updateQuery, [cleanedText, title, h1, JSON.stringify(href), description, keywords, url]);

            } catch (e) {
                console.error(`Error processing URL ${url}: ${e.message}`);
            } finally {
                await page.close();
            }
        }

        await browser.close();
    } catch (e) {
        console.error(`Error: ${e.message}`);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

scrapeWebsite().catch(console.error);
