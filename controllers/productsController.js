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
                id: product.id,
                slug: product.slug,
                name: product.name,
                description: product.description,
                category: product.category,
                age: product.age,
                liters: product.liters,
                alcol: product.alcol,
                price: product.price,
                discount: product.discount,
                image: req.imagePath + product.img,
                discountedPrice,
                unitary_price: discountedPrice
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

        // Calcolo prezzo scontato
        const discountedPrice = product.discount > 0
            ? product.price - (product.price * product.discount / 100)
            : product.price;

        const unitary_price = discountedPrice;

        // Costruisco l'oggetto finale da restituire
        const productData = {
            id: product.id,
            slug: product.slug,
            name: product.name,
            description: product.description,
            category: product.category,
            age: product.age,
            liters: product.liters,
            alcol: product.alcol,
            price: product.price,
            discount: product.discount,
            discountedPrice,
            unitary_price,
            image: req.imagePath + product.img
        };

        res.json(productData);
    });
}

// STORE: Salva l'ordine del cliente
function store(req, res) {
    const {
        customer_name,
        customer_surname,
        customer_email,
        shipping_address,
        billing_address,
        customer_phone,
        whiskies // array che contiene id e quantità dal frontend
    } = req.body;

    if (!whiskies || whiskies.length === 0) {
        return res.status(400).json({ error: "Il carrello è vuoto" });
    }

    // Inseriamo l'ordine nel DB
    const orderSql = `
        INSERT INTO orders 
        (customer_name, customer_surname, customer_email, shipping_address, billing_address, customer_phone, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `;

    connection.query(
        orderSql,
        [customer_name, customer_surname, customer_email, shipping_address, billing_address, customer_phone],
        (err, results) => {
            if (err) return res.status(500).json({ error: "Errore inserimento ordine" });

            const orderId = results.insertId;

            // Recuperiamo dal DB i prodotti per calcolare i prezzi
            const ids = whiskies.map(w => w.whisky_id);
            connection.query(
                `SELECT id, price, discount, name FROM products WHERE id IN (?)`,
                [ids],
                async (err, products) => {
                (err, products) => {
                    if (err) return res.status(500).json({ error: "Errore recupero prodotti" });

                    let total = 0;
                    // array per stripe
                    const stripeItems = [];

                    // Costruiamo array di oggetti chiari per ogni prodotto ordinato
                    const items = whiskies.map(item => {
                        const product = products.find(p => p.id === item.whisky_id);
                        const unitary_price = product.discount > 0
                            ? product.price - (product.price * product.discount / 100)
                            : product.price;

                        total += unitary_price * item.quantity;
                        
                        // prepariamo anche i dati per Stripe
                        stripeItems.push({
                            price_data: {
                                currency: 'eur',
                                product_data: {
                                    name: product.name,
                                },
                                unit_amount: Math.round(unitary_price * 100), // in centesimi
                            },
                            quantity: item.quantity,
                        });

                        return {
                            product_id: item.whisky_id,
                            quantity: item.quantity,
                            unitary_price
                        };
                    });

                    // Prepariamo i valori da inserire nella tabella pivot
                    const pivotValues = items.map(i => [orderId, i.product_id, i.quantity, i.unitary_price]);

                    // Salviamo i prodotti ordinati nella tabella pivot
                    connection.query(
                        `INSERT INTO orders_product (order_id, product_id, quantity, unitary_price) VALUES ?`,
                        [pivotValues],
                        async (err) => {
                            if (err) return res.status(500).json({ error: "Errore salvataggio dettagli ordine" });

                            // creiamo la sessione di pagamento con Stripe 
                            const session = await stripe.checkout.sessions.create({
                                payment_method_types: ['card'],
                                line_items: stripeItems,
                                mode: 'payment',
                                success_url: 'http://localhost:5173/success?session_id={CHECKOUT_SESSION_ID}',
                                cancel_url: 'http://localhost:5173/cart',
                            });
                            // Restituiamo al frontend totale e dettagli
                            res.status(201).json({
                                message: "Ordine completato!",
                                orderId,
                                total,
                                items
                            });
                        }
                    );
                }
            );
        }
    );
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