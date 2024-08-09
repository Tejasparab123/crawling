const mysql = require("mysql2/promise");
const { Cluster } = require("puppeteer-cluster");
const dbConfig = {
  host: "localhost",
  user: "root",
  password: "050504",
  database: "category_and_domains",
};

async function scrapeWebsite() {
  let connection;

  connection = await mysql.createConnection(dbConfig);
  const [rows] = await connection.execute(
    "SELECT domains FROM categories_and_scraped_data WHERE scraped_data IS NULL"
  );

  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    monitor: true,
    maxConcurrency: 14,
    puppeteerOptions: { headless: 'new' }
  });

  await cluster.task(async ({ page, data: url }) => {
    try {
      await page.goto(url, { waitUntil: ["load"], timeout: 60000 });
    } catch (error) {
      console.log(`Error navigating to ${url}: ${error.message}`);
      await page.waitForSelector("body");
    }
    // await page.waitForSelector("body", { timeout: 50000 }); 
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    );
    try {
      const visibleText = await page.evaluate(() => {
        document.querySelectorAll("script, style").forEach((el) => el.remove());
        return document.body.innerText.trim();
      });
      if (visibleText.startsWith("This site can't be reached ")) {
        visibleText = "NULL";
      }
      const cleanedText = visibleText.split(/\s+/).join(" ");

      const [title, h1, href, description, keywords] = await Promise.all([
        page.title(),
        await page.evaluate(() => {
          const h1Elements = document.querySelectorAll("h1");
          return h1Elements ? Array.from(h1Elements).map(h1 => h1.innerText).filter(h1=>h1) : [];
        }),
        page.evaluate(() => {
          const links = Array.from(document.querySelectorAll("a"));
         
            return links ? links
              .map((link) => link.href)
              .filter((href) => href && !href.startsWith("javascript:")).filter(href=>href):[];
          
        }),
        page.evaluate(() => {
          const metaDescription = document.querySelector(
            'meta[name="description"]'
          );
          return metaDescription
            ? metaDescription.getAttribute("content")
            : null;
        }),
        page.evaluate(() => {
          const keywordsTags = Array.from(
            document.querySelectorAll('meta[name="keywords"]')
          );
          return keywordsTags
            ? keywordsTags.map((tag) => tag.getAttribute("content")).join(", ")
            : null;
        }),
      ]);

      const updateQuery = `
            UPDATE categories_and_scraped_data
            SET scraped_data = ?, title = ?, h1_tag = ?, href = ?, description = ?, keywords = ?
            WHERE domains = ?`;
      await connection.execute(updateQuery, [
        cleanedText,
        title,
        h1,
        JSON.stringify(href),
        description,
        keywords,
        url,
      ]);
    } catch (error) {
      console.log(`Error processing ${url}: ${error.message}`);
    }
  });

  for (const row of rows) {
    cluster.queue(row.domains);
  }
  try {
    await cluster.idle();
    await cluster.close();
  } catch (error) {
    console.log(`Error closing cluster or connection: ${error.message}`);
  }
}

scrapeWebsite();
