

export function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    console.error(message);
    res.status(statusCode).json({ 
        error: {
            status: statusCode,
            message,
            ok: false
        }
    });
    next();
}
