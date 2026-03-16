const connection = require("../data/db");

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const nodemailer = require('nodemailer');

// INDEX: Recupera i prodotti con filtri e ordinamento
function index(req, res) {
    const { searchTerm, category, promo, sort } = req.query;

    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    // ricerca  per nome e descrizione
    if (searchTerm) {
        sql += ' AND (name LIKE ? OR description LIKE ?)';
        const nameDescSearch = `%${searchTerm}%`;
        params.push(nameDescSearch, nameDescSearch);
    }

    // filtro per categoria
    if (category) {
        sql += ' AND category_id = ?';
        params.push(category);
    }

    // filtro per promozione
    if (promo == 'true') {
        sql += ' AND discount > 0';
    }

    // ordinamento secondo preferenze
    const sortMapping ={
        'price-asc': 'price ASC',
        'price-desc': 'price DESC',
        'name-asc': 'name ASC',
        'name-desc': 'name DESC',
        'recent': 'created_at DESC'
    }
    if (sort && sortMapping[sort]) {
        sql += ` ORDER BY ${sortMapping[sort]}`;
    } else {
        // ordinamento di default se non specificato o non valido
        sql += ' ORDER BY id ASC';
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
        whiskies,
        termsAccepted
    } = req.body;

    // validazioni tutti dati be

    const errors = [];
    if (!customer_name || customer_name.trim().length < 4) {
        errors.push("Il nome è obbligatorio e deve avere almeno 4 caratteri");
    }
    if (!customer_surname || customer_surname.trim().length < 4) {
        errors.push("Il cognome è obbligatorio e deve avere almeno 4 caratteri");
    }
    if (!customer_email || !customer_email.includes('@')) {
        errors.push("L'email è obbligatoria e deve essere valida");
    }
    if (!shipping_address || shipping_address.trim().length < 8) {
        errors.push("L'indirizzo di spedizione è obbligatorio e deve avere almeno 8 caratteri");
    }
    if (!billing_address || billing_address.trim().length < 8) {
        errors.push("L'indirizzo di fatturazione è obbligatorio e deve avere almeno 8 caratteri");
    }
    if (!customer_phone || customer_phone.trim().length < 7) {
        errors.push("Il numero di telefono è obbligatorio, deve avere almeno 7 caratteri e deve essere valido");
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            errors: errors
        });
    }
    // Controllo carrello vuoto
    if (!whiskies || whiskies.length === 0) {
        return res.status(400).json({ error: "Il carrello è vuoto" });
    }

    // Controllo termini accettati
    if (!termsAccepted) {
        return res.status(400).json({ error: "Accetta i termini e condizioni per procedere con l'ordine" });
    }

    // Variabile per il prezzo totale
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
                                    // url punta al backend, non al frontend
                                    success_url: `http://localhost:3000/api/products/orders/confirm?order_id=${orderId}`,
                                    cancel_url: 'http://localhost:5173/cart',
                                });

                                // l'invio della mail avverrà dopo la funzione confirmOrder

                                return res.status(201).json({
                                    message: "Ordine salvato, email inviata e sessione Stripe creata!",
                                    url: session.url,
                                    orderId: orderId,
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

async function confirmOrder(req, res) {
    const { order_id } = req.query;

    if (!order_id) return res.status(400).send("ID ordine mancante");

    // 1. QUERY CON JOIN: Recuperiamo ordine e dettagli prodotti in un colpo solo
    const sql = `
        SELECT o.*, op.quantity, op.unitary_price, p.name as product_name
        FROM orders o
        JOIN orders_product op ON o.id = op.order_id
        JOIN products p ON op.product_id = p.id
        WHERE o.id = ?
    `;

    connection.query(sql, [order_id], async (err, results) => {
        if (err || results.length === 0) return res.status(404).send("Ordine non trovato");

        const order = results[0];

        // 2. COSTRUZIONE RIGHE TABELLA PRODOTTI (HTML)
        let itemsHtml = "";
        results.forEach(item => {
            itemsHtml += `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.product_name}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">x${item.quantity}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${(item.unitary_price * item.quantity).toFixed(2)} €</td>
                </tr>
            `;
        });

        // Controllo per evitare doppie operazioni se l'utente ricarica la pagina
        if (order.status === 'paid') {
            return res.redirect(`http://localhost:5173/success?order_id=${order_id}`);
        }

        try {
            // Aggiorna lo stato nel DB
            connection.query(`UPDATE orders SET status = 'paid' WHERE id = ?`, [order_id]);

            // Configurazione mail di test
            let testAccount = await nodemailer.createTestAccount();
            let transporter = nodemailer.createTransport({
                host: "smtp.ethereal.email",
                port: 587,
                secure: false,
                auth: { user: testAccount.user, pass: testAccount.pass },
            });

            // --- 3. MAIL PER IL CLIENTE ---
            const customerMailOptions = {
                from: '"Heritage Whisky Reserve" <shop@heritagewhisky.it>',
                to: order.customer_email,
                subject: `Conferma Pagamento Ordine #${order_id}`,
                html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                    <div style="background-color: #1a1a1a; color: #d4af37; padding: 20px; text-align: center;">
                        <h1 style="margin: 0; font-size: 24px; text-transform: uppercase;">Heritage Whisky</h1>
                    </div>
                    <div style="padding: 20px; color: #333;">
                        <h2>Grazie per il tuo acquisto, ${order.customer_name}!</h2>
                        <p>Il pagamento per l'ordine <strong>#${order_id}</strong> è stato ricevuto.</p>
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                            <thead>
                                <tr style="background-color: #f8f8f8;">
                                    <th style="text-align: left; padding: 10px;">Whisky</th>
                                    <th style="text-align: center; padding: 10px;">Q.tà</th>
                                    <th style="text-align: right; padding: 10px;">Prezzo</th>
                                </tr>
                            </thead>
                            <tbody>${itemsHtml}</tbody>
                            <tfoot>
                                <tr>
                                    <td colspan="2" style="padding: 10px; text-align: right;"><strong>Totale:</strong></td>
                                    <td style="padding: 10px; text-align: right; font-weight: bold; color: #d4af37;">${order.total_price} €</td>
                                </tr>
                            </tfoot>
                        </table>
                        <p>Spediremo a: <strong>${order.shipping_address}</strong></p>
                    </div>
                </div>`
            };

            // --- 4. MAIL PER IL VENDITORE ---
            const vendorMailOptions = {
                from: '"Sistema Heritage" <system@heritagewhisky.it>',
                to: "admin@heritagewhisky.it", 
                subject: `💰 Vendita Effettuata! Ordine #${order_id}`,
                html: `
                <div style="font-family: sans-serif; padding: 20px; border: 2px solid #28a745; border-radius: 10px;">
                    <h2 style="color: #28a745;">Nuovo ordine pronto per la spedizione</h2>
                    <p><strong>Cliente:</strong> ${order.customer_name} ${order.customer_surname}</p>
                    <table style="width: 100%; margin: 15px 0; border-top: 1px solid #ccc;">
                        ${itemsHtml}
                    </table>
                    <p><strong>Incasso totale:</strong> ${order.total_price} €</p>
                    <p><strong>Destinazione:</strong> ${order.shipping_address}</p>
                    <p><strong>Telefono:</strong> ${order.customer_phone}</p>
                </div>`
            };

            // Esecuzione invii
            let infoCliente = await transporter.sendMail(customerMailOptions);
            let infoVenditore = await transporter.sendMail(vendorMailOptions);

            // Recupero link anteprima
            const previewC = nodemailer.getTestMessageUrl(infoCliente);
            const previewV = nodemailer.getTestMessageUrl(infoVenditore);

            console.log("Link Cliente:", previewC);
            console.log("Link Venditore:", previewV);

            // 5. REDIRECT AL FRONTEND: Passiamo entrambi i link nell'URL
            res.redirect(`http://localhost:5173/success?order_id=${order_id}&url_c=${encodeURIComponent(previewC)}&url_v=${encodeURIComponent(previewV)}`);

        } catch (error) {
            console.error("Errore nel processo di conferma:", error);
            res.redirect(`http://localhost:5173/success?order_id=${order_id}&mail_error=true`);
        }
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

// Esporta tutte le funzioni
module.exports = { index, show, store, getCategories , confirmOrder };