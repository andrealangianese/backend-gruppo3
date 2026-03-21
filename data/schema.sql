CREATE DATABASE IF NOT EXISTS whisky_shop;
USE whisky_shop;

DROP TABLE IF EXISTS orders_product;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;

CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(8,2) NOT NULL,
    alcol DECIMAL(4,1),
    origin VARCHAR(100),
    img VARCHAR(255),
    age INT,
    discount INT DEFAULT 0,
    liters DECIMAL(3,1),
    slug VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_name VARCHAR(100),
    customer_surname VARCHAR(100),
    customer_email VARCHAR(150),
    shipping_address TEXT,
    billing_address TEXT,
    customer_phone VARCHAR(20),
    total_price DECIMAL(10,2),
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders_product (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT,
    order_id INT,
    quantity INT,
    unitary_price DECIMAL(8,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

INSERT INTO categories (name) VALUES ('Bourbon'), ('Irish'), ('Japanese'), ('Scotch');

-- INSERT PRODUCTS CORRETTA PER MYSQL
INSERT INTO products (category_id, name, description, price, alcol, origin, img, age, discount, liters, slug, created_at)
VALUES
(1, 'Blanton''s Gold Edition', 'Bourbon premium del Kentucky prodotto dalla Buffalo Trace Distillery.', 210, 51.5, 'USA', 'bourbon/blantons-gold-edition.jpg', 8, 0, 0.7, 'blantons-gold-edition', '2024-01-01'),
(1, 'Blanton''s Straight From The Barrel', 'Versione cask strength del celebre Blantons.', 240, 64.0, 'USA', 'bourbon/blantons-straight-from-the-barrel.jpg', 8, 0, 0.7, 'blantons-straight-from-the-barrel', '2026-01-01'),
(1, 'Kentucky Owl Batch #8 Straight Bourbon', 'Bourbon di alta gamma noto per la sua complessità aromatica.', 320, 50.0, 'USA', 'bourbon/kentucky-owl-batch-8.jpg', 10, 0, 0.7, 'kentucky-owl-batch-8', '2024-01-01'),
(1, 'Michter''s 10 Years Old Kentucky Straight Rye', 'Rye whiskey americano invecchiato 10 anni.', 280, 46.4, 'USA', 'bourbon/michters-10-years-old-rye.jpg', 10, 0, 0.7, 'michters-10-years-old-rye', '2024-01-01'),
(1, 'WhistlePig 15 Years Old Rye Whiskey', 'Rye whiskey invecchiato 15 anni.', 350, 46.0, 'USA', 'bourbon/whistlepig-15-years-old.jpg', 15, 10, 0.7, 'whistlepig-15-years-old', '2024-01-01'),
(2, 'Bushmills 21 Years Old', 'Irish whiskey tripla distillazione.', 220, 40, 'Ireland', 'irish/bushmills-21-years-old.jpg', 21, 0, 0.7, 'bushmills-21-years-old', '2024-01-01'),
(2, 'Connemara 22 Years Old', 'Raro Irish whiskey torbato.', 290, 46, 'Ireland', 'irish/connemara-22-years-old.jpg', 22, 0, 0.7, 'connemara-22-years-old', '2024-01-01'),
(2, 'Midleton Dair Ghaelach Virgin Oak', 'Edizione speciale Midleton.', 260, 56, 'Ireland', 'irish/midleton-dair-ghaelach-tree7.jpg', 15, 10, 0.7, 'midleton-dair-ghaelach-tree7', '2024-01-01'),
(2, 'Midleton Very Rare 2019', 'Edizione annuale limitata.', 240, 40, 'Ireland', 'irish/midleton-very-rare-2019.jpg', 12, 0, 0.7, 'midleton-very-rare-2019', '2024-01-01'),
(2, 'Teeling Rising Reserve 21 Years Old', 'Single malt irlandese invecchiato 21 anni.', 300, 46, 'Ireland', 'irish/teeling-rising-reserve-21.jpg', 21, 0, 0.7, 'teeling-rising-reserve-21', '2026-01-01'),
(3, 'Miyagikyo Peated', 'Edizione limitata della distilleria Miyagikyo.', 210, 48, 'Japan', 'japanese/miyagikyo-peated.jpg', 10, 0, 0.7, 'miyagikyo-peated', '2024-01-01'),
(3, 'Shizuoka Contact S Japanese Whisky', 'Blended malt della giovane distilleria Shizuoka.', 160, 55, 'Japan', 'japanese/shizuoka-contact-s.jpg', 5, 0, 0.7, 'shizuoka-contact-s', '2024-01-01'),
(3, 'Shizuoka Pot Still K First Edition', 'Prima edizione distillata con l''alambicco Pot Still K.', 450, 55, 'Japan', 'japanese/shizuoka-pot-still-k.jpg', 3, 0, 0.7, 'shizuoka-pot-still-k', '2024-01-01'),
(3, 'Taketsuru 21 Years Old', 'Blended malt dedicato al fondatore di Nikka.', 500, 43, 'Japan', 'japanese/taketsuru-21-years-old.jpg', 21, 15, 0.7, 'taketsuru-21-years-old', '2026-01-01'),
(3, 'Yamazaki 12 Years Old', 'Uno dei single malt giapponesi più iconici.', 190, 43, 'Japan', 'japanese/yamazaki-12-years-old.jpg', 12, 0, 0.7, 'yamazaki-12-years-old', '2024-01-01'),
(4, 'Glenglassaugh 47 Years Old 1968', 'Single malt estremamente raro.', 9500, 42, 'Scotland', 'scotch/glenglassaugh-47-years-old.jpg', 47, 10, 0.7, 'glenglassaugh-47-years-old', '2024-01-01'),
(4, 'Lagavulin 21 Years Old', 'Edizione speciale del celebre distillato di Islay.', 800, 56, 'Scotland', 'scotch/lagavulin-21yo.jpg', 21, 0, 0.7, 'lagavulin-21yo', '2026-01-01'),
(4, 'Lagavulin 26 Years Old', 'Single malt invecchiato 26 anni.', 1800, 44, 'Scotland', 'scotch/lagavulin-26yo.jpg', 26, 0, 0.7, 'lagavulin-26yo', '2024-01-01'),
(4, 'Laphroaig 34 Years Old', 'Edizione ultra limitata della serie Ian Hunter.', 2200, 46, 'Scotland', 'scotch/laphroaig-34yo.jpg', 34, 0, 0.7, 'laphroaig-34yo', '2024-01-01'),
(4, 'Port Ellen 36 Years Old 1983', 'Rarissimo single malt da collezione.', 3500, 50, 'Scotland', 'scotch/port-ellen-36-years-old.jpg', 36, 0, 0.7, 'port-ellen-36-years-old', '2024-01-01');