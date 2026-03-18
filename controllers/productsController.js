const connection = require("../data/db");
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');

// CONFIGURAZIONE MAIL FISSA
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/* INDEX: Recupera l'elenco dei prodotti dal database */
function index(req, res) {
    const { searchTerm, category, promo, sort } = req.query;

    // Query base dei prodotti con calcolo del prezzo scontato per l'ordinamento
    let sql = 'SELECT *, (price - (price * discount / 100)) AS discounted_price FROM products WHERE 1=1';
    const params = [];

    // Filtro di ricerca testuale
    if (searchTerm) {
        sql += ' AND (name LIKE ? OR description LIKE ?)';
        const nameDescSearch = `%${searchTerm}%`;
        params.push(nameDescSearch, nameDescSearch);
    }

    // Filtro per ID categoria
    if (category) {
        sql += ' AND category_id = ?';
        params.push(category);
    }

    // Filtro per prodotti scontati
    if (promo == 'true') {
        sql += ' AND discount > 0';
    }

    // Gestione dell'ordinamento
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

/* SHOW: Recupera i dettagli di un singolo prodotto tramite slug */
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

/* STORE: Gestisce la creazione dell'ordine */
function store(req, res) {
    const {
        customer_name, customer_surname, customer_email,
        shipping_address, billing_address, customer_phone,
        whiskies, termsAccepted
    } = req.body;

    // Log dei dati ricevuti per debug
    console.log("BODY:", req.body);

    // Se l'indirizzo di fatturazione è vuoto, usiamo quello di spedizione
    const finalBillingAddress = billing_address || shipping_address;

    // Validazione dati
    const errors = [];
    if (!customer_name || customer_name.trim().length < 4) errors.push("Nome non valido");
    if (!customer_surname || customer_surname.trim().length < 4) errors.push("Cognome non valido");
    if (!customer_email || !customer_email.includes('@')) errors.push("Email non valida");
    if (!shipping_address || shipping_address.trim().length < 8) errors.push("Indirizzo spedizione incompleto");
    if (!customer_phone || customer_phone.trim().length < 7) errors.push("Telefono non valido");
    if (!termsAccepted) errors.push("Accetta i termini e condizioni");
    if (!whiskies || whiskies.length === 0) return res.status(400).json({ error: "Carrello vuoto" });

    whiskies.forEach(item => {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
            errors.push("Quantità prodotto non valida");
        }
    });

    // Se ci sono errori, li restituiamo al client
    if (errors.length > 0) {
        console.log("ERRORI:", errors);
        return res.status(400).json({ success: false, errors });
    }

    // Creazione record ordine 
    const orderSql = `
        INSERT INTO orders 
        (customer_name, customer_surname, customer_email, shipping_address, billing_address, customer_phone, status) 
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `;
    // Log della query e dei parametri per debug
    connection.query(
        orderSql,
        [
            customer_name,
            customer_surname,
            customer_email,
            shipping_address,
            finalBillingAddress,
            customer_phone
        ],
        (err, results) => {
            if (err) {
                console.error("ERRORE ORDINE:", err);
                return res.status(500).json({ error: "Errore inserimento ordine" });
            }

            const orderId = results.insertId;
            const ids = whiskies.map(w => w.whisky_id);

            // Recupero prezzi reali dal DB
            connection.query(`SELECT id, price, discount, name FROM products WHERE id IN (?)`, [ids], (err, products) => {
                if (err) return res.status(500).json({ error: "Errore recupero prodotti" });

                let totalPrice = 0;
                const stripeItems = [];
                const pivotValues = [];

                // Calcolo totale ordine, preparazione dati per Stripe e tabella pivot
                whiskies.forEach(item => {
                    const product = products.find(p => p.id === item.whisky_id);

                    if (!product) {
                        return res.status(400).json({ error: "Prodotto non trovato" });
                    }

                    // Calcolo prezzo unitario considerando eventuali sconti
                    const unitary_price = product.discount > 0
                        ? product.price - (product.price * product.discount / 100)
                        : product.price;

                    // Calcolo totale parziale
                    totalPrice += unitary_price * item.quantity;

                    // Dati per Stripe
                    stripeItems.push({
                        price_data: {
                            currency: 'eur',
                            product_data: { name: product.name },
                            unit_amount: Math.round(unitary_price * 100),
                        },
                        quantity: item.quantity,
                    });

                    // Dati per tabella pivot orders_product
                    pivotValues.push([orderId, item.whisky_id, item.quantity, unitary_price]);
                });

                // Calcolo Spedizione 
                const SHIPPING_COST = 100.00;
                const FREE_SHIPPING_THRESHOLD = 1000.00;
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

                // Salvataggio Prodotti Ordinati (Pivot)
                connection.query(
                    `INSERT INTO orders_product (order_id, product_id, quantity, unitary_price) VALUES ?`,
                    [pivotValues],
                    (err) => {
                        if (err) return res.status(500).json({ error: "Errore salvataggio dettagli prodotti" });

                        // Aggiornamento Totale Finale nell'Ordine 
                        connection.query(
                            `UPDATE orders SET total_price = ? WHERE id = ?`,
                            [finalOrderTotal, orderId],
                            async (err) => {
                                if (err) return res.status(500).json({ error: "Errore aggiornamento totale" });

                                try {
                                    // Log degli items preparati per Stripe
                                    console.log("STRIPE ITEMS:", stripeItems);

                                    // Creazione Sessione Stripe
                                    const session = await stripe.checkout.sessions.create({
                                        payment_method_types: ['card'],
                                        line_items: stripeItems,
                                        mode: 'payment',
                                        success_url: `http://localhost:3000/api/products/orders/confirm?order_id=${orderId}`,
                                        cancel_url: 'http://localhost:5173/cart',
                                    });

                                    res.status(201).json({ url: session.url, orderId });

                                } catch (error) {
                                    console.error("ERRORE STRIPE:", error); // 🔥 FIX
                                    res.status(500).json({ error: "Errore Stripe" });
                                }
                            });
                    });
            });
        });
}

/* CONFIRM ORDER: Chiamata da Stripe dopo il successo.
  Aggiorna lo stato in 'paid' e invia le email a cliente e venditore */
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
            return res.redirect(`http://localhost:5173/success?order_id=${order_id}`);
        }

        try {
            // Segna come pagato nel database
            connection.query(`UPDATE orders SET status = 'paid' WHERE id = ?`, [order_id]);

            // Costruzione tabella prodotti per Email
            let itemsHtml = "";
            results.forEach(item => {
                const rowTotal = item.unitary_price * item.quantity;
                itemsHtml += `<tr><td>${item.product_name}</td><td>x${item.quantity}</td><td>${rowTotal.toFixed(2)}€</td></tr>`;
            });

            // Definiamo le mail
            const mailCliente = {
                from: '"Heritage Whisky" <shop@heritagewhisky.it>',
                to: order.customer_email,
                subject: `Conferma Ordine #${order_id}`,
                html: `
                        <h1>Grazie ${order.customer_name}!</h1>
                        <p>Pagamento ricevuto.</p>
                        <h3>Indirizzo di spedizione:</h3>
                        <p>${order.shipping_address}</p>
                        <h3>Indirizzo di fatturazione:</h3>
                        <p>${order.billing_address}</p>
                        <table border="1">${itemsHtml}</table>
                        <p>Totale: ${order.total_price}€</p>
                    `};

            const mailVenditore = {
                from: '"Sistema Shop" <bot@heritagewhisky.it>',
                to: 'admin@heritagewhisky.it',
                subject: `Nuovo Ordine #${order_id}`,
                html: `
                        <h1>Nuovo ordine da ${order.customer_name}</h1>
                        <p><strong>Email:</strong> ${order.customer_email}</p>
                        <h3>Indirizzo di spedizione:</h3>
                        <p>${order.shipping_address}</p>
                        <h3>Indirizzo di fatturazione:</h3>
                        <p>${order.billing_address}</p>
                        <table border="1">${itemsHtml}</table>
                        <p>Totale: ${order.total_price}€</p>
                    `};

            // Invio effettivo
            let infoC = await transporter.sendMail(mailCliente);
            let infoV = await transporter.sendMail(mailVenditore);

            // Generiamo i link per i bottoni di debug (funzionano con Ethereal)
            const previewC = nodemailer.getTestMessageUrl(infoC);
            const previewV = nodemailer.getTestMessageUrl(infoV);

            // Redirect con i link
            res.redirect(`http://localhost:5173/success?order_id=${order_id}&url_c=${encodeURIComponent(previewC)}&url_v=${encodeURIComponent(previewV)}`);

        } catch (error) {
            console.error("Errore invio mail:", error);
            res.redirect(`http://localhost:5173/success?order_id=${order_id}&mail_error=true`);
        }
    });
}

/* Funzione che recupera l'elenco delle categorie per i filtri del front-end */
function getCategories(req, res) {
    connection.query("SELECT * FROM categories ORDER BY name ASC", (err, results) => {
        if (err) return res.status(500).json({ error: "Database query failed" });
        res.json(results);
    });
}

module.exports = { index, show, store, getCategories, confirmOrder };