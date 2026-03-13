const connection = require("../data/db");

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const nodemailer = require('nodemailer');

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
        whiskies
    } = req.body;

    if (!whiskies || whiskies.length === 0) {
        return res.status(400).json({ error: "Il carrello è vuoto" });
    }

    // --- NUOVA VARIABILE PER IL TOTALE ---
    let totalPrice = 0;

    // Salviamo l'intestazione dell'ordine
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
            const ids = whiskies.map(w => w.whisky_id);

            // Recuperiamo i prezzi reali dal database
            connection.query(
                `SELECT id, price, discount, name FROM products WHERE id IN (?)`,
                [ids],
                (err, products) => {
                    if (err) return res.status(500).json({ error: "Errore recupero prodotti" });

                    const stripeItems = [];
                    const items = whiskies.map(item => {
                        const product = products.find(p => p.id === item.whisky_id);
                        const unitary_price = product.discount > 0
                            ? product.price - (product.price * product.discount / 100)
                            : product.price;

                        // --- AGGIUNTO CALCOLO TOTALE ---
                        totalPrice += unitary_price * item.quantity;

                        // Prepariamo i dati per Stripe
                        stripeItems.push({
                            price_data: {
                                currency: 'eur',
                                product_data: { name: product.name },
                                unit_amount: Math.round(unitary_price * 100),
                            },
                            quantity: item.quantity,
                        });

                        return {
                            product_id: item.whisky_id,
                            quantity: item.quantity,
                            unitary_price
                        };
                    });

                    const pivotValues = items.map(i => [orderId, i.product_id, i.quantity, i.unitary_price]);

                    // Salviamo i dettagli nella tabella pivot
                    connection.query(
                        `INSERT INTO orders_product (order_id, product_id, quantity, unitary_price) VALUES ?`,
                        [pivotValues],
                        async (err) => {
                            if (err) return res.status(500).json({ error: "Errore salvataggio dettagli ordine" });

                            // --- AGGIUNTO UPDATE TOTAL_PRICE NELL'ORDINE ---
                            connection.query(
                                `UPDATE orders SET total_price = ? WHERE id = ?`,
                                [totalPrice, orderId],
                                (err) => {
                                    if (err) console.error("Errore aggiornamento total_price:", err);
                                }
                            );

                            try {
                                // Creiamo la sessione Stripe
                                const session = await stripe.checkout.sessions.create({
                                    payment_method_types: ['card'],
                                    line_items: stripeItems,
                                    mode: 'payment',
                                    success_url: `http://localhost:5173/success?order_id=${orderId}`,
                                    cancel_url: 'http://localhost:5173/cart',
                                });

                                // --- INVIO EMAIL ---
                                let testAccount = await nodemailer.createTestAccount();
                                let transporter = nodemailer.createTransport({
                                    host: "smtp.ethereal.email",
                                    port: 587,
                                    secure: false,
                                    auth: { user: testAccount.user, pass: testAccount.pass },
                                });

                                let mailOptions = {
                                    from: '"BoolShop Whisky" <shop@boolshop.it>',
                                    to: customer_email,
                                    subject: `Conferma Ordine #${orderId}`,
                                    text: `Ciao ${customer_name}, grazie per il tuo acquisto!`,
                                    html: `<div style="font-family: sans-serif; color: #333;">
                                            <h1>Grazie per il tuo ordine, ${customer_name}!</h1>
                                            <p>Siamo felici che tu abbia scelto i nostri prodotti.</p>
                                            <p><strong>Riepilogo Ordine:</strong> #${orderId}</p>
                                            <p>Appena il pagamento sarà confermato, spediremo a: <em>${shipping_address}</em></p>
                                        </div>`
                                };

                                let info = await transporter.sendMail(mailOptions);

                                let vendorMailOptions = {
                                    from: '"BoolShop Whisky" <shop@boolshop.it>',
                                    to: "venditore@boolshop.it",
                                    subject: `Nuovo ordine ricevuto #${orderId}`,
                                    html: `<div style="font-family:sans-serif;">
                                            <h2>Nuovo ordine ricevuto</h2>
                                            <p><strong>Ordine:</strong> #${orderId}</p>
                                            <h3>Dati cliente</h3>
                                            <p>${customer_name} ${customer_surname}</p>
                                            <p>Email: ${customer_email}</p>
                                            <p>Telefono: ${customer_phone}</p>
                                            <h3>Indirizzo spedizione</h3>
                                            <p>${shipping_address}</p>
                                            <p>Controlla il pannello admin per i dettagli.</p>
                                        </div>`
                                };

                                let vendorInfo = await transporter.sendMail(vendorMailOptions);

                                console.log("Email compratore inviata!: %s", nodemailer.getTestMessageUrl(info));
                                console.log("Email venditore inviata!: %s", nodemailer.getTestMessageUrl(vendorInfo));

                                return res.status(201).json({
                                    message: "Ordine salvato, email inviata e sessione Stripe creata!",
                                    url: session.url,
                                    orderId: orderId,
                                    previewEmail: nodemailer.getTestMessageUrl(info)
                                });

                            } catch (error) {
                                console.error("Errore finale (Stripe/Email):", error);
                                return res.status(500).json({ error: "Errore durante la finalizzazione dell'ordine" });
                            }
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