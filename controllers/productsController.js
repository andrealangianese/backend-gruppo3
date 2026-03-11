const connection = require("../data/db");

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

    // Usiamo == 'true' per essere più flessibili
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

    // LOG DI DEBUG: Controlla il terminale di VS Code quando fai la chiamata!
    console.log("Query eseguita:", sql);
    console.log("Parametri:", params);

    connection.query(sql, params, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database query failed' });
        }

        const products = results.map(product => {
            const discountedPrice = product.discount > 0
                ? product.price - (product.price * product.discount / 100)
                : product.price;

            return {
                ...product,
                image: req.imagePath + product.img, // Corretto: product.img
                discountedPrice
            };
        });

        res.json(products);
    });
}

function show(req, res) {
    const slug = req.params.slug;
    const productSql = 'SELECT * FROM products WHERE slug = ?';

    connection.query(productSql, [slug], (err, productResults) => {
        if (err) return res.status(500).json({ error: 'Database query failed' });
        if (productResults.length === 0) return res.status(404).json({ error: 'Product not found' });

        const product = productResults[0];
        // CORRETTO: product.img (non product.imag o product.image)
        product.image = req.imagePath + product.img;

        res.json(product);
    });
}

// store dei nostri clienti

function store(req, res) {

    const { customer_name, customer_surname, customer_email, shipping_address, billing_address, customer_phone } = req.body

    const sql = `
        INSERT INTO orders
        (customer_name, customer_surname, customer_email, shipping_address, billing_address, customer_phone)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    connection.query(sql,
        [
            customer_name,
            customer_surname,
            customer_email,
            shipping_address,
            billing_address,
            customer_phone
        ],
        (err, results) => {

            if (err) {
                return res.status(500).json({
                    error: "Database insert failed"
                });
            }

            res.status(201).json({
                message: "Order created",
                id: results.insertId
            });

        }
    );
}


module.exports = { index, show, store };