// import express e router

const express = require('express');

const router = express.Router();

// import controller da usare 

const productsController = require('../controllers/productsController')

// setto rotte

// rotta index

router.get('/', productsController.index)

// rotta show

router.get('/:id', productsController.show)

// rotta store 

router.post('/customers', productsController.store)

module.exports = router

