import mysql.connector
import asyncio
from pyppeteer import launch

conn = mysql.connector.connect(
    host='localhost', 
    user='root', 
    password='050504', 
    database='category_and_domains'
)

async def scrape_website():
    try:
        my_cursor = conn.cursor()
        my_cursor.execute("SELECT domains FROM categories_and_scraped_data WHERE scraped_data IS NULL")
        rows = my_cursor.fetchall()

        browser = await launch(
            headless=False, 
            executablePath=r'C:\Program Files\Google\Chrome\Application\chrome.exe'
        )

        for row in rows:
            url = row[0].strip("(),'")
            print(f"Scraping URL: {url}")
        
            page = await browser.newPage()
            try:
                await page.goto(url, options={'timeout': 90000})
                await page.waitForSelector('body')

                visible_text = await page.evaluate('''() => {
                    document.querySelectorAll('script, style').forEach(el => el.remove());
                    return document.body.innerText.trim();
                }''')
                cleaned_text = ' '.join(visible_text.strip().split())
                
                update_query = """
                UPDATE categories_and_scraped_data
                SET scraped_data = %s
                WHERE domains = %s LIMIT 1
                """
                my_cursor.execute(update_query, (cleaned_text, url))
                
                await page.waitForSelector('title')
                title = await page.title()

                description = await page.evaluate('''() => {
                    const metaDescription = document.querySelector('meta[name="description"]');
                    return metaDescription ? metaDescription.getAttribute('content') : null;
                }''')

                h1 = await page.evaluate('''() => {
                    const h1 = document.querySelector('h1');
                    return h1 ? h1.innerText : null;
                }''')

                href = await page.evaluate('''() => {
                    const links = Array.from(document.querySelectorAll('a'));
                    return links ? links.map(link => link.href) : null;
                }''')

                keywords = await page.evaluate('''() => {
                    const metaKeywords = document.querySelector('meta[name="keywords"]');
                    return metaKeywords ? metaKeywords.getAttribute('content') : null;
                }''')

                data = [title, h1, str(href), description, keywords, url]
                print(data)

                update_query1 = """
                UPDATE categories_and_scraped_data
                SET title = %s, h1_tag = %s, href = %s, description = %s, keywords = %s
                WHERE domains = %s
                """
                my_cursor.execute(update_query1, data)

                conn.commit()
            except Exception as e:
                print(f"Error processing URL {url}: {e}")
            finally:
                await page.close()

        await browser.close()
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if 'my_cursor' in locals():
            my_cursor.close()
        if conn.is_connected():
            conn.close()

asyncio.run(scrape_website())




