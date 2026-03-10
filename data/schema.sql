CREATE DATABASE IF NOT EXISTS whisky_shop;

USE whisky_shop;

-- eliminazione tabelle se esistono già
DROP TABLE IF EXISTS orders_product;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;


-- =========================
-- TABELLA CATEGORIES
-- =========================

CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);


-- =========================
-- TABELLA PRODUCTS
-- =========================

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


-- =========================
-- TABELLA ORDERS
-- =========================

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


-- =========================
-- TABELLA ORDERS_PRODUCT
-- =========================

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


-- =========================
-- INSERT CATEGORIES
-- =========================

INSERT INTO categories (name) VALUES
('Bourbon'),
('Irish'),
('Japanese'),
('Scotch');


-- =========================
-- INSERT PRODUCTS
-- =========================

INSERT INTO products (category_id, name, description, price, alcol, origin, img, age, discount, liters, slug, created_at)
VALUES
(1,"Blanton's Gold Edition","Bourbon premium del Kentucky prodotto dalla Buffalo Trace Distillery. Viene imbottigliato a mano selezionando singole botti provenienti dal famoso Warehouse H.",210,51.5,"USA","bourbon/blantons-gold-edition.jpg",8,0,0.7,"blantons-gold-edition",NOW()),

(1,"Blanton's Straight From The Barrel","Versione cask strength del celebre Blanton's. Non filtrato e imbottigliato direttamente dalla botte per offrire un profilo aromatico intenso e complesso.",240,64.0,"USA","bourbon/blantons-straight-from-the-barrel.jpg",8,0,0.7,"blantons-straight-from-the-barrel",NOW()),

(1,"Kentucky Owl Batch #8 Straight Bourbon","Bourbon di alta gamma noto per la sua complessità aromatica con note di caramello, spezie e quercia. Prodotto in piccoli lotti numerati.",320,50.0,"USA","bourbon/kentucky-owl-batch-8.jpg",10,0,0.7,"kentucky-owl-batch-8",NOW()),

(1,"Michter's 10 Years Old Kentucky Straight Rye","Rye whiskey americano invecchiato 10 anni con un profilo ricco di spezie, vaniglia e caramello. Uno dei prodotti più ricercati della distilleria Michter's.",280,46.4,"USA","bourbon/michters-10-years-old-rye.jpg",10,0,0.7,"michters-10-years-old-rye",NOW()),

(1,"WhistlePig 15 Years Old Rye Whiskey - Vermont Estate Oak","Rye whiskey invecchiato 15 anni e rifinito in botti di quercia del Vermont. Offre note di spezie, miele e legno tostato.",350,46.0,"USA","bourbon/whistlepig-15-years-old.jpg",15,0,0.7,"whistlepig-15-years-old",NOW());



INSERT INTO products (category_id, name, description, price, alcol, origin, img, age, discount, liters, slug, created_at)
VALUES
(2,"Bushmills 21 Years Old","Irish whiskey tripla distillazione invecchiato 21 anni e affinato in botti di Madeira. Elegante con note di frutta secca e miele.",220,40,"Ireland","irish/bushmills-21-years-old.jpg",21,0,0.7,"bushmills-21-years-old",NOW()),

(2,"Connemara 22 Years Old","Raro Irish whiskey torbato prodotto dalla Cooley Distillery. Invecchiato 22 anni con un profilo affumicato ed elegante.",290,46,"Ireland","irish/connemara-22-years-old.jpg",22,0,0.7,"connemara-22-years-old",NOW()),

(2,"Midleton Dair Ghaelach Virgin Oak - Tree 7","Edizione speciale Midleton maturata in botti di quercia irlandese vergine provenienti dalla foresta di Grinsell. Complesso e speziato.",260,56,"Ireland","irish/midleton-dair-ghaelach-tree7.jpg",15,0,0.7,"midleton-dair-ghaelach-tree7",NOW()),

(2,"Midleton Very Rare 2019","Edizione annuale limitata della Midleton Distillery. Irish whiskey elegante con note di vaniglia, frutta e spezie dolci.",240,40,"Ireland","irish/midleton-very-rare-2019.jpg",12,0,0.7,"midleton-very-rare-2019",NOW()),

(2,"Teeling Rising Reserve 21 Years Old","Single malt irlandese invecchiato 21 anni e affinato in botti di vino. Profilo aromatico ricco con note di frutta e spezie.",300,46,"Ireland","irish/teeling-rising-reserve-21.jpg",21,0,0.7,"teeling-rising-reserve-21",NOW());



INSERT INTO products (category_id, name, description, price, alcol, origin, img, age, discount, liters, slug, created_at)
VALUES
(3,"Miyagikyo Peated - Nikka Discovery (Release 2021)","Edizione limitata della distilleria Miyagikyo con un carattere torbato delicato. Parte della serie Nikka Discovery.",210,48,"Japan","japanese/miyagikyo-peated.jpg",10,0,0.7,"miyagikyo-peated",NOW()),

(3,"Shizuoka Contact S Japanese Whisky","Blended malt della giovane distilleria Shizuoka. Combina whisky giapponesi con whisky scozzesi per un profilo equilibrato.",160,55,"Japan","japanese/shizuoka-contact-s.jpg",5,0,0.7,"shizuoka-contact-s",NOW()),

(3,"Shizuoka Pot Still K First Edition Japanese Whisky","Prima edizione distillata con l'alambicco Pot Still K recuperato dalla distilleria Karuizawa.",450,55,"Japan","japanese/shizuoka-pot-still-k.jpg",3,0,0.7,"shizuoka-pot-still-k",NOW()),

(3,"Taketsuru 21 Years Old","Blended malt dedicato al fondatore di Nikka, Masataka Taketsuru. Elegante e complesso con note di frutta secca e torba.",500,43,"Japan","japanese/taketsuru-21-years-old.jpg",21,0,0.7,"taketsuru-21-years-old",NOW()),

(3,"Yamazaki 12 Years Old","Uno dei single malt giapponesi più iconici prodotto dalla Suntory. Morbido con note di miele, frutta e quercia.",190,43,"Japan","japanese/yamazaki-12-years-old.jpg",12,0,0.7,"yamazaki-12-years-old",NOW());



INSERT INTO products (category_id, name, description, price, alcol, origin, img, age, discount, liters, slug, created_at)
VALUES
(4,"Glenglassaugh 47 Years Old 1968 - Rare Cask Batch 3","Single malt estremamente raro distillato nel 1968 e imbottigliato dopo 47 anni di maturazione.",9500,42,"Scotland","scotch/glenglassaugh-47-years-old.jpg",47,0,0.7,"glenglassaugh-47-years-old",NOW()),

(4,"Lagavulin 21 Years Old","Edizione speciale del celebre distillato di Islay con note torbate intense e grande complessità.",800,56,"Scotland","scotch/lagavulin-21yo.jpg",21,0,0.7,"lagavulin-21yo",NOW()),

(4,"Lagavulin 26 Years Old Special Release 2021","Single malt invecchiato 26 anni della serie Diageo Special Release. Ricco e profondamente torbato.",1800,44,"Scotland","scotch/lagavulin-26yo.jpg",26,0,0.7,"lagavulin-26yo",NOW()),

(4,"Laphroaig 34 Years Old Ian Hunter Book 5","Edizione ultra limitata della serie Ian Hunter. Torbato elegante con lunghissimo invecchiamento.",2200,46,"Scotland","scotch/laphroaig-34yo.jpg",34,0,0.7,"laphroaig-34yo",NOW()),

(4,"Port Ellen 36 Years Old 1983 Eidolon - Hunter Laing","Rarissimo single malt proveniente dalla chiusa distilleria Port Ellen. Un whisky da collezione.",3500,50,"Scotland","scotch/port-ellen-36-years-old.jpg",36,0,0.7,"port-ellen-36-years-old",NOW());