const connection = require("../data/db");
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');

/*
  INDEX: Recupera l'elenco dei prodotti dal database.
  Supporta filtri per nome/descrizione, categoria, promozioni e ordinamento.
 */
function index(req, res) {
    const { searchTerm, category, promo, sort } = req.query;

    // Query base dei prodotti con calcolo del prezzo scontato per l'ordinamento
    let sql = 'SELECT *, (price - (price * discount / 100)) AS discounted_price FROM products WHERE 1=1';
    const params = [];

    // Filtro di ricerca testuale (Nome o Descrizione)
    if (searchTerm) {
        sql += ' AND (name LIKE ? OR description LIKE ?)';
        const nameDescSearch = `%${searchTerm}%`;
        params.push(nameDescSearch, nameDescSearch);
    }

    // Filtro per ID Categoria
    if (category) {
        sql += ' AND category_id = ?';
        params.push(category);
    }

    // Filtro per prodotti scontati
    if (promo == 'true') {
        sql += ' AND discount > 0';
    }

    // Gestione dell'ordinamento tramite mappatura sicura (evita SQL Injection)
    const sortMapping = {
        'price-asc': 'discounted_price ASC',
        'price-desc': 'discounted_price DESC',
        'name-asc': 'name ASC',
        'name-desc': 'name DESC',
        'recent': 'created_at DESC'
    };

    if (sort && sortMapping[sort]) {
        sql += ` ORDER BY ${sortMapping[sort]}`;
    } else {
        sql += ' ORDER BY id ASC'; // Ordinamento di default
    }

    connection.query(sql, params, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database query failed' });
        }

        // Mappatura dei risultati per aggiungere il calcolo del prezzo scontato lato server
        const products = results.map(product => {
            const discountedPrice = product.discount > 0
                ? product.price - (product.price * product.discount / 100)
                : product.price;

            return {
                ...product,
                image: req.imagePath + product.img, // Costruisce l'URL completo dell'immagine
                discountedPrice,
                unitary_price: discountedPrice
            };
        });

        res.json(products);
    });
}

/*
  SHOW: Recupera i dettagli di un singolo prodotto tramite il suo "slug" (URL friendly).
 */
function show(req, res) {
    const slug = req.params.slug;
    const productSql = 'SELECT * FROM products WHERE slug = ?';

    connection.query(productSql, [slug], (err, productResults) => {
        if (err) return res.status(500).json({ error: 'Database query failed' });
        if (productResults.length === 0) return res.status(404).json({ error: 'Product not found' });

        const product = productResults[0];
        const discountedPrice = product.discount > 0
            ? product.price - (product.price * product.discount / 100)
            : product.price;

        res.json({
            ...product,
            discountedPrice,
            unitary_price: discountedPrice,
            image: req.imagePath + product.img
        });
    });
}

/*
  STORE: Gestisce la creazione dell'ordine.
  1. Valida i dati. 2. Salva l'ordine. 3. Salva i prodotti nel dettaglio (pivot). 
  4. Calcola spedizione e totale. 5. Crea la sessione di pagamento Stripe.
 */
function store(req, res) {
    const {
        customer_name, customer_surname, customer_email,
        shipping_address, billing_address, customer_phone,
        whiskies, termsAccepted
    } = req.body;

    // --- Validazione Dati ---
    const errors = [];
    if (!customer_name || customer_name.trim().length < 4) errors.push("Nome non valido");
    if (!customer_surname || customer_surname.trim().length < 4) errors.push("Cognome non valido");
    if (!customer_email || !customer_email.includes('@')) errors.push("Email non valida");
    if (!shipping_address || shipping_address.trim().length < 8) errors.push("Indirizzo spedizione incompleto");
    if (!customer_phone || customer_phone.trim().length < 7) errors.push("Telefono non valido");
    if (!termsAccepted) errors.push("Accetta i termini e condizioni");
    if (!whiskies || whiskies.length === 0) return res.status(400).json({ error: "Carrello vuoto" });

    if (errors.length > 0) return res.status(400).json({ success: false, errors });

    // --- 1. Creazione record Ordine ---
    const orderSql = `INSERT INTO orders (customer_name, customer_surname, customer_email, shipping_address, billing_address, customer_phone, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`;

    connection.query(orderSql, [customer_name, customer_surname, customer_email, shipping_address, billing_address, customer_phone], (err, results) => {
        if (err) return res.status(500).json({ error: "Errore inserimento ordine" });

        const orderId = results.insertId;
        const ids = whiskies.map(w => w.whisky_id);

        // --- 2. Recupero prezzi reali dal DB (Sicurezza: non ci fidiamo del prezzo inviato dal front-end) ---
        connection.query(`SELECT id, price, discount, name FROM products WHERE id IN (?)`, [ids], (err, products) => {
            if (err) return res.status(500).json({ error: "Errore recupero prodotti" });

            let totalPrice = 0;
            const stripeItems = [];
            const pivotValues = [];

            whiskies.forEach(item => {
                const product = products.find(p => p.id === item.whisky_id);
                const unitary_price = product.discount > 0
                    ? product.price - (product.price * product.discount / 100)
                    : product.price;

                totalPrice += unitary_price * item.quantity;

                // Dati per Stripe
                stripeItems.push({
                    price_data: {
                        currency: 'eur',
                        product_data: { name: product.name },
                        unit_amount: Math.round(unitary_price * 100), // Stripe usa i centesimi
                    },
                    quantity: item.quantity,
                });

                // Dati per tabella pivot orders_product
                pivotValues.push([orderId, item.whisky_id, item.quantity, unitary_price]);
            });

            // --- 3. Calcolo Spedizione ---
            const SHIPPING_COST = 100.00; // Esempio 100€
            const FREE_SHIPPING_THRESHOLD = 1000.00; // Gratis sopra i 1000€
            let shippingFee = totalPrice >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
            const finalOrderTotal = totalPrice + shippingFee;

            if (shippingFee > 0) {
                stripeItems.push({
                    price_data: {
                        currency: 'eur',
                        product_data: { name: 'Spese di spedizione' },
                        unit_amount: Math.round(shippingFee * 100),
                    },
                    quantity: 1,
                });
            }

            // --- 4. Salvataggio Prodotti Ordinati (Pivot) ---
            connection.query(`INSERT INTO orders_product (order_id, product_id, quantity, unitary_price) VALUES ?`, [pivotValues], (err) => {
                if (err) return res.status(500).json({ error: "Errore salvataggio dettagli prodotti" });

                // --- 5. Aggiornamento Totale Finale nell'Ordine ---
                connection.query(`UPDATE orders SET total_price = ? WHERE id = ?`, [finalOrderTotal, orderId], async (err) => {
                    if (err) return res.status(500).json({ error: "Errore aggiornamento totale" });

                    try {
                        // --- 6. Creazione Sessione Stripe ---
                        const session = await stripe.checkout.sessions.create({
                            payment_method_types: ['card'],
                            line_items: stripeItems,
                            mode: 'payment',
                            success_url: `http://localhost:3000/api/products/orders/confirm?order_id=${orderId}`,
                            cancel_url: 'http://localhost:5173/cart',
                        });

                        res.status(201).json({ url: session.url, orderId });
                    } catch (error) {
                        res.status(500).json({ error: "Errore Stripe" });
                    }
                });
            });
        });
    });
}

/*
  CONFIRM ORDER: Chiamata da Stripe dopo il successo.
  Aggiorna lo stato in 'paid' e invia le email a cliente e venditore.
 */
async function confirmOrder(req, res) {
    const { order_id } = req.query;
    if (!order_id) return res.status(400).send("ID ordine mancante");

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

        // Se l'ordine è già pagato (es. refresh pagina), redirect diretto
        if (order.status === 'paid') {
            res.redirect(`http://localhost:5173/success?order_id=${order_id}&url_c=${encodeURIComponent(previewC)}&url_v=${encodeURIComponent(previewV)}`);
        }

        try {
            // Segna come pagato nel database
            connection.query(`UPDATE orders SET status = 'paid' WHERE id = ?`, [order_id]);

            // Setup Mail (Ethereal per test)
            let testAccount = await nodemailer.createTestAccount();
            let transporter = nodemailer.createTransport({
                host: "smtp.ethereal.email", port: 587, secure: false,
                auth: { user: testAccount.user, pass: testAccount.pass },
            });

            // Costruzione tabella prodotti per Email
            let subtotalProducts = 0;
            let itemsHtml = "";
            results.forEach(item => {
                const rowTotal = item.unitary_price * item.quantity;
                subtotalProducts += rowTotal;
                itemsHtml += `<tr><td>${item.product_name}</td><td>x${item.quantity}</td><td>${rowTotal.toFixed(2)}€</td></tr>`;
            });

            const shippingFee = order.total_price - subtotalProducts;

            // --- 1. EMAIL PER IL CLIENTE ---
            const mailCliente = {
                from: '"Heritage Whisky" <shop@heritagewhisky.it>',
                to: order.customer_email,
                subject: `Conferma Ordine #${order_id}`,
                html: `<h1>Grazie ${order.customer_name}!</h1><p>Pagamento ricevuto per l'ordine #${order_id}.</p><table border="1">${itemsHtml}</table><p>Totale pagato: ${order.total_price}€</p>`
            };

            // --- 2. EMAIL PER IL VENDITORE ---
            const mailVenditore = {
                from: '"Sistema Shop" <bot@heritagewhisky.it>',
                to: 'admin@heritagewhisky.it', // Email del titolare
                subject: `Nuovo Ordine Ricevuto! #${order_id}`,
                html: `<h1>Nuovo ordine da ${order.customer_name} ${order.customer_surname}</h1><p>Indirizzo: ${order.shipping_address}</p><table border="1">${itemsHtml}</table><p>Incasso totale: ${order.total_price}€</p>`
            };

            // Invio mail cliente
            let infoC = await transporter.sendMail(mailCliente);
            const previewC = nodemailer.getTestMessageUrl(infoC);

            // Invio mail venditore (Mancava questo!)
            let infoV = await transporter.sendMail(mailVenditore);
            const previewV = nodemailer.getTestMessageUrl(infoV);

            // Redirect al front-end con link anteprima mail
            res.redirect(`http://localhost:5173/success?order_id=${order_id}&url_c=${encodeURIComponent(previewC)}&url_v=${encodeURIComponent(previewV)}`);
        } catch (error) {
            res.redirect(`http://localhost:5173/success?order_id=${order_id}&mail_error=true`);
        }
    });
}

/*
  GET CATEGORIES: Recupera l'elenco delle categorie per i filtri del front-end.
 */
function getCategories(req, res) {
    connection.query("SELECT * FROM categories ORDER BY name ASC", (err, results) => {
        if (err) return res.status(500).json({ error: "Database query failed" });
        res.json(results);
    });
}

module.exports = { index, show, store, getCategories, confirmOrder };