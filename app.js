// import di express e utilizzo su porta 3000

const express = require('express');
const app = express();
const port = process.env.PORT;

// import dei middlewares per gestione notFound e errorsHandler(status 500)

const notFound = require('./middlewares/notFound')

const errorsHandler = require('./middlewares/errorsHandler')

// attivazione cartella public per utilizzo file statici

app.use(express.static('public'));

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