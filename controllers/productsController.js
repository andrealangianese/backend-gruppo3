const connection = require("../data/db");

// INDEX: Recupera i prodotti con filtri e ordinamento
function index(req, res) {
    const { searchTerm, category, promo, sort } = req.query;

    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (searchTerm) {
        sql += ' AND name LIKE ?';
        params.push(`%${searchTerm}%`);
    }

    if (category) {
        sql += ' AND category_id = ?';
        params.push(category);
    }

    if (promo == 'true') {
        sql += ' AND discount > 0';
    }

    if (sort) {
        switch (sort) {
            case 'price-asc': sql += ' ORDER BY price ASC'; break;
            case 'price-desc': sql += ' ORDER BY price DESC'; break;
            case 'name-asc': sql += ' ORDER BY name ASC'; break;
            case 'name-desc': sql += ' ORDER BY name DESC'; break;
            case 'recent': sql += ' ORDER BY created_at DESC'; break;
        }
    }

    connection.query(sql, params, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database query failed' });
        }

        // Calcolo prezzo scontato anche se non c'è promo
        const products = results.map(product => {
            const discountedPrice = product.discount > 0
                ? product.price - (product.price * product.discount / 100)
                : product.price;

            return {
                ...product,
                image: req.imagePath + product.img,
                discountedPrice
            };
        });

        res.json(products);
    });
}

// SHOW: Recupera il singolo prodotto tramite slug
function show(req, res) {
    const slug = req.params.slug;
    const productSql = 'SELECT * FROM products WHERE slug = ?';

    connection.query(productSql, [slug], (err, productResults) => {
        if (err) return res.status(500).json({ error: 'Database query failed' });
        if (productResults.length === 0) return res.status(404).json({ error: 'Product not found' });

        const product = productResults[0];

        // Calcolo prezzo scontato anche se non c'è promo
        product.discountedPrice = product.discount > 0
            ? product.price - (product.price * product.discount / 100)
            : product.price;

        // Aggiorno immagine
        product.image = req.imagePath + product.img;

        res.json(product);
    });
}

// STORE: Salva l'ordine del cliente
function store(req, res) {
    const {
        customer_name, customer_surname, customer_email,
        shipping_address, billing_address, customer_phone,
        whiskies // Array di prodotti dal carrello
    } = req.body;

    // Inseriamo l'ordine
    const orderSql = `INSERT INTO orders (customer_name, customer_surname, customer_email, shipping_address, billing_address, customer_phone, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`;

    connection.query(orderSql, [customer_name, customer_surname, customer_email, shipping_address, billing_address, customer_phone], (err, results) => {
        if (err) return res.status(500).json({ error: "Errore inserimento ordine" });

        const orderId = results.insertId;

        // Prepariamo l'inserimento dei prodotti (tabella pivot)
        const values = whiskies.map(item => [orderId, item.whisky_id, item.quantity, item.unitary_price]);
        const pivotSql = `INSERT INTO orders_product (order_id, product_id, quantity, unitary_price) VALUES ?`;

        connection.query(pivotSql, [values], (err) => {
            if (err) return res.status(500).json({ error: "Errore salvataggio dettagli ordine" });

            res.status(201).json({ message: "Ordine completato!", orderId });
        });
    });
}

// GET CATEGORIES: Recupera tutte le categorie per popolare la select nel front-end
function getCategories(req, res) {
    const sql = "SELECT * FROM categories ORDER BY name ASC";

    connection.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Database query failed" });
        }
        res.json(results);
    });
}

// Esporta tutte le funzioni, inclusa la nuova getCategories
module.exports = { index, show, store, getCategories };