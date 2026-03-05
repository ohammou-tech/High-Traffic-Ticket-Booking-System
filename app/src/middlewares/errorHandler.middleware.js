export function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    console.error(`[${statusCode}] ${message}`);

    res.status(statusCode).json({
        ok: false,
        error: { status: statusCode, message },
    });
}
