// import express e router

const express = require('express');

const router = express.Router();

// import controller da usare 

const productsController = require('../controllers/productsController')

// setto rotte

// rotta categories
router.get("/categories", productsController.getCategories);

// rotta index

router.get('/', productsController.index)


// rotta show

router.get('/:slug', productsController.show)

// rotta store 

router.post('/orders', productsController.store)


module.exports = router

