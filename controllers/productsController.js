const connection = require("../data/db");

// funzione di index
function index(req, res) {

    const sql = 'SELECT * FROM products';

    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database query failed' });

        const products = results.map(product => {
            return {
                ...product,
                image: req.imagePath + product.image
            }
        });

        res.json(products);
    });

}

// SHOW
function show(req, res) {

    const id = parseInt(req.params.id);

    const productSql = 'SELECT * FROM products WHERE id = ?';

    connection.query(productSql, [id], (err, productResults) => {

        if (err) return res.status(500).json({ error: 'Database query failed' });

        if (productResults.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = productResults[0];

        product.image = req.imagePath + product.image;

        res.json(product);

    });
}

module.exports = { index, show };