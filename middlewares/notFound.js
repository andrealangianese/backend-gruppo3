function notFound(req, res, next) {
    // forziano il code di risposta corretto
    res.status(404)
    //   gestimoa l'err andando a dare una risposta un pò più articolata
    res.json({
        error: "Not Found",
        message: "404 Page Not Found"
    });
};

module.exports = notFound;