function imagePath(req, res, next) {
    // creo nuova proprietà da aggiungere a req per path img
    req.imagePath = `https://${req.get('host')}/image/`;
    // procedi con la risposta
    next();
}

module.exports = imagePath;