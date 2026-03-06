// import di express e utilizzo su porta 3000

const express = require('express');
const app = express();
const port = 3000;


// attivazione cartella public per utilizzo file statici

app.use(express.static('public'));