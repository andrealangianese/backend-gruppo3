// import di express e utilizzo su porta 3000

const express = require('express');
const app = express();
const port = process.env.PORT;


// importiamo middleware cors
const cors = require("cors");


// middleware per il CORS
app.use(cors({
    origin: 'http://localhost:5173'
}));

// Import router

const productsRouter = require('./routers/productsRouter');

// import dei middlewares per gestione notFound e errorsHandler(status 500)

const notFound = require('./middlewares/notFound')

const errorsHandler = require('./middlewares/errorsHandler')

const imagePath = require('./middlewares/imagePath');

// attivazione cartella public per utilizzo file statici

app.use(express.static('public'));

// abilito il parsing JSON 

app.use(express.json());

app.use(imagePath);

app.use('/api/products', productsRouter);

// creo rotta home dell'app

app.get('/api', (req, res) => {
    res.send('presto sarai la nostra rotta home dei whiskey')
})

//  registro middleware per rotta notFound

app.use(notFound)

// registro middleware per gestione errori

app.use(errorsHandler)

// creo rotta per la porta in ascolto

app.listen(port, () => {
    console.log(`sono in ascolto della porta ${port}`)
})