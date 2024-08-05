CREATE TABLE `categories_and_scraped_data` (
  `categories` text,
  `domains` text,
  `scraped_data` text,
  `title` varchar(200) DEFAULT NULL,
  `h1_tag` varchar(200) DEFAULT NULL,
  `description` text,
  `href` text,
  `keywords` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
