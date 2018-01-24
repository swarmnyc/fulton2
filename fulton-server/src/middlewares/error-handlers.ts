import FultonLog from "../fulton-log";
import { Request, Response, Middleware, NextFunction } from "../interfaces";
import { FultonApp } from "../index";

export function defaultErrorHandler(err: any, req: Request, res: Response, next: NextFunction) {
    FultonLog.error(`${req.method} ${req.url}\nrequest: %O\nerror: %s`, { httpHeaders: req.headers, httpBody: req.body }, err.stack);
    res.sendStatus(500).end();
}

export function default404ErrorHandler(req: Request, res: Response, next: NextFunction) {
    let fulton = res.app.locals.fulton as FultonApp;

    if (!fulton.options.logging.httpLoggerEnabled) {
        FultonLog.warn(`${req.method} ${req.url} 404`);
    }

    res.sendStatus(404);
}