const mysql = require('mysql2/promise');
const { timeout } = require('puppeteer');
const puppeteer = require('puppeteer');
const { Cluster } = require('puppeteer-cluster');
//
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

        const cluster = await Cluster.launch({ 

            concurrency: Cluster.CONCURRENCY_CONTEXT,
           // monitor: true,
            maxConcurrency: 3,
            puppeteerOptions: {headless: false}
        });
         
        await cluster.task(async ({ page, data: url }) => {
            console.log(`Scraping URL: ${url}`);
            try {
                 await page.goto(url, { waitUntil:[ 'domcontentloaded', 'load', 'networkidle0' ]});
            
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
                        return links.length > 0 ? links.map(link => link.href) : [];
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

                const updateQuery = `
                    UPDATE categories_and_scraped_data
                    SET scraped_data = ?, title = ?, h1_tag = ?, href = ?, description = ?, keywords = ?
                    WHERE domains = ?`;
                await connection.execute(updateQuery, [ 
                    cleanedText, title, h1, JSON.stringify(href), description, keywords, url
                ]);

            } catch (e) {
                console.error(`Error processing URL ${url}: ${e.message}`);


            }
        });

        for (const row of rows) {
            cluster.queue(row.domains);
        }

        await cluster.idle();
        await cluster.close();
    } catch (e) {
        console.error(`Error: ${e.message}`);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

scrapeWebsite();
