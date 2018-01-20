import * as bodyParser from 'body-parser';
import * as https from 'https';
import * as lodash from 'lodash';
import * as path from 'path';

import { ErrorMiddleware, Middleware, Request, Response } from './interfaces';
import FultonLog, { FultonLoggerOptions } from './fulton-log';
import { FultonLoggerLevel, FultonRouter, FultonService, defaultClassLoader } from './index';

import Env from './helpers/env-helpers';
import { FultonClassLoader } from './helpers/module-helpers';
import { Provider } from './helpers/type-helpers';

export class FultonAppOptions {
    // generate AuthClient collection
    // the client call have to have client authorisation token on auth
    // default is false
    oauthServerSupport: boolean;

    // generate api doc
    enabledApiDoc: boolean;

    // default is /api/docs
    apiDocPath: string;

    // for manage user, no default
    //userManager: IUserManager<IUser>

    // auth rotuers like google, facebook, password
    //authRouters: FultonAuthRouter[]

    // // default take token or cookie to User, router can overwrite
    // authenticates: FultonMiddleware[]

    // // check permission
    // defaultAuthorizes: FultonMiddleware[]

    //default is [FultonQueryStringParser]
    queryStringParsers: Middleware[]

    //default is [BodyParser]
    inputParsers: Middleware[]

    //for dot env path, default is ./.env
    dotenvPath: string;

    dbConnectionOptions: any;

    /**
     * behavior for "/" request, only one of three methods active at the same time.
     */
    index: {
        /**
         * if true, log every http request.
         * default is procces.env[`${appName}.options.index.enabled`] or true
         */
        enabled: boolean;

        /**
          * custom response function
          */
        handler?: Middleware;

        /**
         * response the index file, like index.html
         */
        filepath?: string;

        /**
         * response the static message
         */
        message?: string;
    }

    /**
     * default is using output to logger
     */
    errorHandler: ErrorMiddleware;

    providers: Provider[] = [];

    routers: Provider[] = [];

    services: Provider[] = [];

    /**
     * default is [bodyParser.json(), bodyParser.urlencoded({ extended: true })]
     */
    bodyParsers: Middleware[];

    /**
     * for automatic load modules, default is disabled, 
     * because we want to use Angular style, define types explicitly
     */
    loader: {
        /**
         * the directory of the app, the default router loader use the value ({appDir}/routers)
         * default is the folder of the executed file like if run "node ./src/main.js",
         * the value of appDir is the folder of main.js
         */
        appDir: string;

        /**
         * if true, Fulton will load routers based on routerDirs automaticly 
         */
        routerLoaderEnabled: boolean;

        /**
         * the folder that router-loader looks at, default value is ["routers"], 
         */
        routerDirs: string[];

        /**
         * the router loader, loads all routers under the folder of {appDir}/{routersDir}
         */
        routerLoader: FultonClassLoader<FultonRouter>

        /**
         * if true, Fulton will load services based on routerDirs automaticly 
         */
        serviceLoaderEnabled: boolean;

        /**
         * the folder that router-loader looks at, default value is ["services"], 
         */
        serviceDirs: string[];

        /**
         * the router loader, loads all routers under the folder of {appDir}/{routersDir}
         */
        serviceLoader: FultonClassLoader<FultonService>
    }

    logging: {
        defaultLevel?: FultonLoggerLevel;
        /**
         * if not null, reset winstion default logger with this value, the default value is null
         * @example
         * option.defaultLoggerOptions = {
         *      level: "debug",
         *      transports: []
         * }
         */
        defaultOptions?: FultonLoggerOptions;

        /**
         * is default log transport collorized
         * default is procces.env[`${appName}.options.logging.httpLogEnabled`] or true
         */
        defaultLoggerColorized: boolean;

        /**
         * if true, log every http request.
         * default is procces.env[`${appName}.options.logging.httpLogEnabled`] or false
         */
        httpLogEnabled: boolean;

        /**
         * the options for http logger, default is console
         * @example
         * option.httpLogOptions = {
         *      level: "debug",
         *      transports: []
         * }
         */
        httpLogOptions: FultonLoggerOptions;
    }

    staticFile: {
        enabled: boolean;
    }

    /**
     * the setting of http and https servers
     */
    server: {
        /**
         * default is procces.env[`${appName}.options.server.httpEnabled`] or true
         */
        httpEnabled: boolean,
        /**
         * default is procces.env[`${appName}.options.server.httpsEnabled`] or false
         */
        httpsEnabled: boolean,

        /**
         * default is procces.env[`${appName}.options.server.httpPort`] or 80
         */
        httpPort: number,

        /**
         * default is procces.env[`${appName}.options.server.httpsPort`] or 443
         */
        httpsPort: number,

        /**
         * have to provide if httpsEnabled is true.
         */
        sslOption?: https.ServerOptions,
    }

    constructor(private appName: string) {
        let prefix = `${this.appName}.options`;

        this.bodyParsers = [
            bodyParser.json({
                type: function (req) {
                    return lodash.includes(["application/json", "application/vnd.api+json"], req.headers['content-type'])
                }
            }),
            bodyParser.urlencoded({ extended: true })
        ];

        this.index = {
            enabled: Env.getBoolean(`${prefix}.index.enabled`, true)
        };

        this.logging = {
            defaultLevel: Env.get(`${prefix}.logging.defaultLevel`) as FultonLoggerLevel,
            defaultLoggerColorized: Env.getBoolean(`${prefix}.logging.defaultLoggerColorized`, true),
            httpLogEnabled: Env.getBoolean(`${prefix}.logging.httpLogEnabled`, false),
            httpLogOptions: null
        };

        this.errorHandler = defaultErrorHandler;

        this.loader = {
            appDir: path.dirname(process.mainModule.filename),
            routerDirs: ["routers"],
            routerLoaderEnabled: false,
            routerLoader: defaultClassLoader(FultonRouter),
            serviceDirs: ["services"],
            serviceLoaderEnabled: false,
            serviceLoader: defaultClassLoader(FultonService)
        };

        this.server = {
            httpEnabled: Env.getBoolean(`${prefix}.server.httpEnabled`, true),
            httpsEnabled: Env.getBoolean(`${prefix}.server.httpsEnabled`, false),
            httpPort: Env.getInt(`${prefix}.server.httpPort`, 80),
            httpsPort: Env.getInt(`${prefix}.server.httpsPort`, 443)
        }

        this.staticFile = {
            enabled : Env.getBoolean(`${prefix}.staticFile.enabled`, true)
        }
    }
}

let defaultErrorHandler: ErrorMiddleware = (err: any, req: Request, res: Response, next: Middleware) => {
    FultonLog.error(`${req.method} ${req.url}\nrequest: %O\nerror: %s`, { httpHeaders: req.headers, httpBody: req.body }, err.stack);

    res.sendStatus(500);
}